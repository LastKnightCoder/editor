import { app } from "electron";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createElectronProbeHost } from "./electron-supervisor.mjs";
import { sourceDigest } from "./supervisor.mjs";

const directory = process.env.TAU_RESTRICTED_TEST_DIRECTORY;
const phase = process.env.TAU_RESTRICTED_TEST_PHASE;
app.setPath("userData", path.join(directory, "profile-" + phase));
const reportPath = path.join(directory, phase + ".json");
const report = {
  status: "running",
  phase,
  packaged: app.isPackaged,
  versions: process.versions,
  platform: process.platform,
  arch: process.arch,
  cases: [],
  pids: [],
};
const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2));
save();
const root = app.isPackaged ? process.resourcesPath : path.dirname(fileURLToPath(import.meta.url));
const host = createElectronProbeHost(path.join(root, "restricted/worker.mjs"));
const source = 'return JSON.parse(await hostCall(\'{"operation":"probe.read"}\'));';
function options(
  code = source,
  workspaceId = "workspace-a",
  read = binding => binding.workspaceId
) {
  const identity = { installationId: "local-a", workspaceId, generation: 1 };
  return {
    source: code,
    identity,
    declared: ["probe.read"],
    grant: { ...identity, digest: sourceDigest(code), permissions: ["probe.read"] },
    read,
  };
}
async function pidOf(probe) {
  const end = Date.now() + 3000;
  while (!probe.pid && Date.now() < end) await delay(5);
  assert.ok(probe.pid);
  assert.notEqual(probe.pid, process.pid);
  report.pids.push(probe.pid);
  save();
  return probe.pid;
}
async function run(code = source, workspace = "workspace-a", read) {
  const probe = host.start(options(code, workspace, read));
  await pidOf(probe);
  const result = await probe.result;
  assert.throws(() => process.kill(result.pid, 0), { code: "ESRCH" });
  return result;
}
async function check(name, execute) {
  await execute();
  report.cases.push(name);
  save();
}

app
  .whenReady()
  .then(async () => {
    app.dock?.hide();
    assert.equal(app.isPackaged, phase !== "development");
    if (phase === "missing-wasm" || phase === "corrupt-wasm") {
      let reads = 0;
      const result = await run(source, "workspace-a", () => {
        reads++;
        return "secret";
      });
      assert.equal(result.ok, false);
      assert.equal(result.code, "PROCESS_FAILED");
      assert.equal(reads, 0);
      report.cases.push("WASM 不可用时拒绝执行且无开发依赖回退");
      await host.dispose();
      report.status = "passed";
      save();
      app.quit();
      return;
    }
    await check("授权前拒绝，合法读取与宿主身份绑定", async () => {
      const denied = options();
      denied.grant.permissions = [];
      assert.throws(() => host.start(denied), /PERMISSION_DENIED/);
      assert.equal(host.size, 0);
      assert.deepEqual((await run()).value, { ok: true, value: "workspace-a" });
    });
    await check("客体无 Node/DOM/网络，模块导入拒绝", async () => {
      const result = await run(`
      const names = ['process','require','fetch','WebSocket','RTCPeerConnection','document','electron'];
      let imported = false;
      try { await import('node:fs'); imported = true; } catch {}
      return { types: names.map(name => typeof globalThis[name]), imported,
        constructorType: hostCall.constructor('return typeof process')() };
    `);
      assert.equal(result.ok, true);
      assert.deepEqual(result.value.types, Array(7).fill("undefined"));
      assert.equal(result.value.imported, false);
      assert.equal(result.value.constructorType, "undefined");
    });
    await check("两工作区和进程隔离", async () => {
      const [a, b] = await Promise.all([run(source, "a"), run(source, "b")]);
      assert.equal(a.value.value, "a");
      assert.equal(b.value.value, "b");
      assert.notEqual(a.pid, b.pid);
    });
    await check("启动期间撤销最终回收进程", async () => {
      let reads = 0;
      const probe = host.start(
        options(source, "a", () => {
          reads++;
          return "x";
        })
      );
      probe.revoke();
      const result = await probe.result;
      assert.equal(result.code, "INSTANCE_REVOKED");
      assert.equal(reads, 0);
      if (result.pid) assert.throws(() => process.kill(result.pid, 0), { code: "ESRCH" });
    });
    await check("工作区宿主销毁撤销在途读取，旧结果不进入新代", async () => {
      const workspace = createElectronProbeHost(path.join(root, "restricted/worker.mjs"));
      let release;
      let enter;
      let signal;
      const entered = new Promise(resolve => {
        enter = resolve;
      });
      const pending = new Promise(resolve => {
        release = resolve;
      });
      const old = workspace.start(
        options(source, "old", (_binding, current) => {
          signal = current;
          enter();
          return pending;
        })
      );
      await pidOf(old);
      await entered;
      await workspace.dispose();
      assert.equal((await old.result).code, "INSTANCE_REVOKED");
      assert.equal(signal.aborted, true);
      assert.equal(workspace.size, 0);
      assert.throws(() => workspace.start(options()), /HOST_DISPOSED/);
      release("old-secret");
      assert.equal((await run(source, "new")).value.value, "new");
      await workspace.dispose();
    });
    await check("同步死循环与悬挂 Promise 可终止，其他实例可响应", async () => {
      const [loop, good] = await Promise.all([run("while(true) {}"), run("return 42;")]);
      assert.equal(loop.ok, false);
      assert.equal(good.value, 42);
      assert.equal((await run("await new Promise(() => {});")).code, "TIMEOUT");
    });
    await check("异常退出有归因，可启动下一实例", async () => {
      const probe = host.start(options("await new Promise(() => {});"));
      process.kill(await pidOf(probe), "SIGKILL");
      assert.equal((await probe.result).code, "PROCESS_FAILED");
      assert.equal((await run("return 7;")).value, 7);
    });
    await check("内存与消息限额", async () => {
      assert.equal((await run("return new ArrayBuffer(1024*1024).byteLength;")).value, 1024 * 1024);
      assert.equal((await run("return new ArrayBuffer(16*1024*1024).byteLength;")).ok, false);
      assert.equal((await run("return 'x'.repeat(20000);")).code, "LIMIT_EXCEEDED");
    });
    await check("重复运行释放活动实例和退出监听", async () => {
      const listeners = app.listenerCount("before-quit");
      for (let i = 0; i < 5; i++) assert.equal((await run("return 1;")).value, 1);
      assert.equal(host.size, 0);
      assert.equal(app.listenerCount("before-quit"), listeners);
    });
    const quitting = host.start(options("await new Promise(() => {});"));
    await pidOf(quitting);
    let quitResult;
    quitting.result.then(value => {
      quitResult = value;
    });
    app.once("will-quit", () => {
      assert.equal(quitResult.code, "INSTANCE_REVOKED");
      assert.equal(host.size, 0);
      assert.throws(() => process.kill(quitResult.pid, 0), { code: "ESRCH" });
      report.cases.push("app.quit 等待活动子进程回收后退出");
      report.status = "passed";
      save();
    });
    app.quit();
  })
  .catch(async error => {
    report.status = "failed";
    report.error = String(error.stack ?? error);
    save();
    await host.dispose();
    app.exit(1);
  });
