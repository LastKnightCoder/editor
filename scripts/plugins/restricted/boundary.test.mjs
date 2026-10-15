import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { createServer as createTcpServer, connect } from "node:net";
import { once } from "node:events";
import { LIMITS } from "./limits.mjs";
import { sourceDigest, startRestrictedProbe } from "./supervisor.mjs";

function options(source, overrides = {}) {
  const identity = { installationId: "local-a", workspaceId: "workspace-a", generation: 1 };
  return {
    source,
    identity,
    declared: ["probe.read"],
    grant: { ...identity, digest: sourceDigest(source), permissions: ["probe.read"] },
    read: binding => `${binding.installationId}/${binding.workspaceId}`,
    ...overrides,
  };
}

async function run(source, overrides) {
  return startRestrictedProbe(options(source, overrides)).result;
}

const readSource = 'return JSON.parse(await hostCall(\'{"operation":"probe.read"}\'));';

test("默认环境没有 Node、DOM、网络或通用 IPC，构造器仍留在客体", async () => {
  const names = [
    "process",
    "require",
    "module",
    "Buffer",
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "RTCPeerConnection",
    "WebTransport",
    "Worker",
    "SharedWorker",
    "navigator",
    "document",
    "window",
    "electron",
    "Deno",
    "Bun",
    "std",
    "os",
  ];
  const result = await run(`
    return {
      globals: ${JSON.stringify(names)}.map(name => typeof globalThis[name]),
      escaped: hostCall.constructor("return typeof process")(),
      asyncEscaped: await (async () => {}).constructor("return typeof process")(),
    };
  `);
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.value.globals,
    names.map(() => "undefined")
  );
  assert.equal(result.value.escaped, "undefined");
  assert.equal(result.value.asyncEscaped, "undefined");
});

test("未获准、摘要或身份变化，在创建进程前拒绝", () => {
  const base = options(readSource);
  for (const change of [
    { permissions: [] },
    { digest: "0".repeat(64) },
    { installationId: "other" },
    { workspaceId: "other" },
    { generation: 2 },
  ]) {
    assert.throws(
      () =>
        startRestrictedProbe({
          ...base,
          grant: { ...base.grant, ...change },
        }),
      /PERMISSION_DENIED/
    );
  }
  assert.throws(
    () =>
      startRestrictedProbe({
        ...base,
        declared: ["filesystem"],
      }),
    /INVALID_PERMISSIONS/
  );
});

test("合法读取按宿主身份执行，调用方修改配置不能改变在途绑定", async () => {
  const config = options(readSource);
  const probe = startRestrictedProbe(config);
  config.identity.workspaceId = "other";
  config.grant.permissions.length = 0;
  const result = await probe.result;
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { ok: true, value: "local-a/workspace-a" });
  assert.notEqual(result.pid, process.pid);
  assert.throws(() => process.kill(result.pid, 0), { code: "ESRCH" });
});

test("未声明的能力不能因授权集合含有该项而使用", async () => {
  let reads = 0;
  const result = await run(readSource, {
    declared: [],
    read: () => {
      reads++;
      return "secret";
    },
  });
  assert.deepEqual(result.value, { ok: false, code: "PERMISSION_DENIED" });
  assert.equal(reads, 0);
});

test("伪造身份、未知操作及无效消息不触达服务", async () => {
  let reads = 0;
  const requests = [
    { operation: "probe.read", workspaceId: "other" },
    { operation: "probe.read", installationId: "other", generation: 2 },
    { operation: "fetch", url: "http://127.0.0.1" },
    { operation: "probe.read", payload: null },
    null,
    [],
  ];
  const result = await run(
    `
    const results = [];
    for (const value of ${JSON.stringify(requests)}) {
      results.push(JSON.parse(await hostCall(JSON.stringify(value))));
    }
    results.push(JSON.parse(await hostCall("{")));
    return results;
  `,
    {
      read: () => {
        reads++;
        return "secret";
      },
    }
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, Array(7).fill({ ok: false, code: "INVALID_REQUEST" }));
  assert.equal(reads, 0);
});

test("两个实例只读取各自工作区，不共享客体全局或进程", async () => {
  const first = startRestrictedProbe(options('globalThis.marker = "a"; ' + readSource));
  const config = options('if (typeof marker !== "undefined") throw Error(); ' + readSource);
  config.identity.installationId = config.grant.installationId = "local-b";
  config.identity.workspaceId = config.grant.workspaceId = "workspace-b";
  const second = startRestrictedProbe(config);
  const [a, b] = await Promise.all([first.result, second.result]);
  assert.equal(a.value.value, "local-a/workspace-a");
  assert.equal(b.value.value, "local-b/workspace-b");
  assert.notEqual(a.pid, b.pid);
});

test("撤权终止旧代，异步服务的迟到结果不能返回新代", async () => {
  let release;
  let entered;
  let signal;
  const started = new Promise(resolve => {
    entered = resolve;
  });
  const pending = new Promise(resolve => {
    release = resolve;
  });
  const old = startRestrictedProbe(
    options(readSource, {
      read: (_binding, currentSignal) => {
        signal = currentSignal;
        entered();
        return pending;
      },
    })
  );
  await started;
  old.revoke();
  const oldResult = await old.result;
  assert.equal(signal.aborted, true);
  assert.equal(oldResult.code, "INSTANCE_REVOKED");
  release("old-secret");
  const current = options(readSource);
  current.identity.generation = current.grant.generation = 2;
  const next = await startRestrictedProbe(current).result;
  assert.equal(next.value.value, "local-a/workspace-a");
  old.revoke();
});

test("启动期间撤销不调用服务", async () => {
  let reads = 0;
  const probe = startRestrictedProbe(
    options(readSource, {
      read: () => {
        reads++;
        return "x";
      },
    })
  );
  probe.revoke();
  assert.equal((await probe.result).code, "INSTANCE_REVOKED");
  assert.equal(reads, 0);
});

test("宿主服务异常不泄漏原始错误与路径", async () => {
  const result = await run(readSource, {
    read: () => {
      throw new Error("/private/secret");
    },
  });
  assert.deepEqual(result.value, { ok: false, code: "SERVICE_FAILED" });
});

test("HTTP/TCP 探针有正对照，直接联网和模块导入均无请求", async t => {
  let httpHits = 0;
  let tcpHits = 0;
  const http = createServer((_req, res) => {
    httpHits++;
    res.end("control");
  });
  const tcp = createTcpServer(socket => {
    tcpHits++;
    socket.end();
  });
  t.after(() => {
    http.closeAllConnections();
    http.close();
    tcp.close();
  });
  http.listen(0, "127.0.0.1");
  tcp.listen(0, "127.0.0.1");
  await Promise.all([once(http, "listening"), once(tcp, "listening")]);
  const url = `http://127.0.0.1:${http.address().port}/`;
  await (await fetch(url)).text();
  const socket = connect(tcp.address().port, "127.0.0.1");
  await once(socket, "end");
  socket.destroy();
  assert.deepEqual([httpHits, tcpHits], [1, 1]);
  const result = await run(`
    const attempts = [
      () => fetch(${JSON.stringify(url)}),
      () => new WebSocket("ws://127.0.0.1:${tcp.address().port}"),
      () => new RTCPeerConnection({iceServers: [{urls: "turn:127.0.0.1:${tcp.address().port}?transport=tcp"}]}),
      () => import(${JSON.stringify(url)}),
      () => import("node:fs"), () => import("file:///etc/hosts"),
      () => require("node:net"),
    ];
    const denied = [];
    for (const attempt of attempts) {
      try { await attempt(); denied.push(false); } catch { denied.push(true); }
    }
    return denied;
  `);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, Array(7).fill(true));
  assert.deepEqual([httpHits, tcpHits], [1, 1]);
});

test("同步死循环被终止，另一实例继续成功", async () => {
  const [loop, healthy] = await Promise.all([run("while (true) {}"), run("return 42;")]);
  assert.equal(loop.ok, false);
  assert.ok(["EXECUTION_FAILED", "TIMEOUT"].includes(loop.code));
  assert.equal(healthy.value, 42);
  assert.throws(() => process.kill(loop.pid, 0), { code: "ESRCH" });
});

test("永不解决的 Promise 由外部期限回收", async () => {
  const result = await run("await new Promise(() => {}); return 1;");
  assert.equal(result.code, "TIMEOUT");
});

test("内存、调用并发、消息和输出预算受到限制", async () => {
  const withinBudget = await run("return new ArrayBuffer(1024 * 1024).byteLength;");
  assert.equal(withinBudget.ok, true);
  assert.equal(withinBudget.value, 1024 * 1024);
  for (const source of [
    "return new ArrayBuffer(16 * 1024 * 1024).byteLength;",
    `return await hostCall("x".repeat(${LIMITS.messageBytes + 1}));`,
    'return await Promise.all(Array.from({length: 9}, () => hostCall(\'{"operation":"probe.read"}\')));',
    `return "x".repeat(${LIMITS.messageBytes + 1});`,
    "return await hostCall({operation: 'probe.read'});",
  ]) {
    const result = await run(source);
    assert.equal(result.ok, false, source);
    assert.ok(["EXECUTION_FAILED", "LIMIT_EXCEEDED"].includes(result.code), result.code);
  }
  assert.throws(
    () => startRestrictedProbe(options("x".repeat(LIMITS.sourceBytes + 1))),
    /INVALID_SOURCE/
  );
});

test("微任务自循环和序列化死循环同样不能占住宿主", async () => {
  for (const source of [
    "await new Promise(() => { function next() { Promise.resolve().then(next); } next(); });",
    "return { toJSON() { while(true) {} } };",
    "function recurse() { return recurse(); } return recurse();",
  ]) {
    const result = await run(source);
    assert.equal(result.ok, false);
    assert.ok(["EXECUTION_FAILED", "TIMEOUT"].includes(result.code));
  }
});

test("累计调用上限与宿主返回值上限不可由客体放宽", async () => {
  const flood = await run(
    'for(let i=0; i<65; i++) await hostCall(\'{"operation":"probe.read"}\'); return true;'
  );
  assert.equal(flood.code, "LIMIT_EXCEEDED");
  const large = await run(readSource, { read: () => "x".repeat(LIMITS.messageBytes) });
  assert.equal(large.code, "LIMIT_EXCEEDED");
});
