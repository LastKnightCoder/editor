"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const http = require("node:http");
const https = require("node:https");
const childProcess = require("node:child_process");
const { createRequire, syncBuiltinESMExports } = require("node:module");
const { app, session, shell, globalShortcut, ipcMain, net: electronNet } = require("electron");

const directory = process.env.TAU_CONTENT_PRODUCTION_DIRECTORY;
const application = process.env.TAU_CONTENT_PRODUCTION_APP;
const port = Number(process.env.TAU_CONTENT_PRODUCTION_PORT);
const collaborationUrl = process.env.TAU_COLLAB_DEV_SERVER_URL
  ? new URL(process.env.TAU_COLLAB_DEV_SERVER_URL)
  : undefined;
const collaborationPort = collaborationUrl ? Number(collaborationUrl.port) : undefined;
assert(directory && application && Number.isInteger(port) && port > 0 && port !== 24678);
if (collaborationUrl) {
  assert.equal(collaborationUrl.origin, `http://127.0.0.1:${collaborationPort}`);
  assert.equal(collaborationUrl.href, `${collaborationUrl.origin}/`);
  assert(collaborationPort > 0 && collaborationPort !== port && collaborationPort !== 24678);
}
assert.equal(process.env.HOME, path.join(directory, "home"));
assert.equal(process.env.TAU_TELEMETRY_DISABLED, "1");
const profile = path.join(directory, "user-data");
fs.mkdirSync(profile, { recursive: true });
app.setPath("userData", profile);
app.setPath("sessionData", path.join(directory, "session-data"));
app.setPath("home", process.env.HOME);
app.commandLine.appendSwitch("use-mock-keychain");
if (process.env.TAU_CONTENT_PRODUCTION_FOREGROUND_TIMING === "1") {
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
  app.commandLine.appendSwitch("disable-background-timer-throttling");
  app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
}

const audit = {
  entry: path.join(application, "dist-electron/main/index.js"),
  directory,
  port,
  listening: false,
  nodeRemaps: 0,
  rendererRemaps: 0,
  externalBlocked: 0,
  systemBlocked: 0,
  stages: [],
};
globalThis.__tauContentProductionAudit = audit;

// 仅在隔离测试中观察真实 SQLite 事务返回，应用代码尚未开始下一步会话日志写入。
const Sqlite = createRequire(path.join(application, "package.json"))("better-sqlite3");
const transaction = Sqlite.prototype.transaction;
Sqlite.prototype.transaction = function (...args) {
  const execute = transaction.apply(this, args);
  const database = this;
  return new Proxy(execute, {
    apply(run, receiver, parameters) {
      const fault = globalThis.__tauContentProductionBindingCrash;
      if (!fault || fault.database !== database.name || database.inTransaction)
        return Reflect.apply(run, receiver, parameters);
      assert.equal(path.dirname(database.name), path.join(directory, "home/.editor"));
      assert(["publish", "demote"].includes(fault.phase));
      const binding = database.prepare(
        "SELECT document_id FROM collaboration_bindings WHERE content_id=?"
      );
      const before = binding.get(fault.contentId)?.document_id;
      const result = Reflect.apply(run, receiver, parameters);
      const after = binding.get(fault.contentId)?.document_id;
      if (
        (fault.phase === "publish" && !before && after) ||
        (fault.phase === "demote" && before === fault.room && !after)
      ) {
        assert.equal(database.inTransaction, false);
        fs.writeFileSync(
          path.join(directory, `${fault.phase}-after-library-commit.json`),
          JSON.stringify({ phase: fault.phase, contentId: fault.contentId, before, after })
        );
        process.kill(process.pid, "SIGKILL");
      }
      return result;
    },
  });
};

ipcMain.on("perf-monitor:renderer-event", (_event, payload) => {
  if (!Array.isArray(payload?.events)) return;
  for (const event of payload.events)
    if (event.kind === "stage" && !audit.stages.includes(event.label))
      audit.stages.push(event.label);
});
const loopback = host => ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
const allowedPort = value => Number(value) === port || Number(value) === collaborationPort;
const denied = () => {
  audit.externalBlocked++;
  return new Error("CONTENT_PRODUCTION_TEST_NETWORK_BLOCKED");
};
function destination(input) {
  const value = new URL(typeof input === "string" ? input : (input.url ?? input.href));
  if (!loopback(value.hostname)) throw denied();
  if (Number(value.port) === 24678) {
    value.hostname = "127.0.0.1";
    value.port = String(port);
    audit.nodeRemaps++;
  }
  if (!allowedPort(value.port)) throw denied();
  return value;
}

// 仅隔离固定 RPC 端口，业务服务器、模块与 IPC 仍使用真实实现。
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  const options = args[0];
  if (typeof options === "object" && options !== null && Number(options.port) === 24678) {
    assert(loopback(options.host ?? "127.0.0.1"));
    args[0] = { ...options, port, host: "127.0.0.1" };
    this.once("listening", () => {
      audit.listening = this.address().port === port;
    });
  } else if (Number(options) === 24678) {
    assert(typeof args[1] === "string" && loopback(args[1]));
    args[0] = port;
    args[1] = "127.0.0.1";
    this.once("listening", () => {
      audit.listening = this.address().port === port;
    });
  }
  return listen.apply(this, args);
};
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const normalized = Array.isArray(args[0]);
  const values = normalized ? [...args[0]] : args;
  const first = values[0];
  if (first && typeof first === "object") {
    if (first.path) {
      assert(String(first.path).startsWith(directory), "禁止连接非测试 Unix Socket");
    } else {
      const host = first.host ?? first.hostname ?? "localhost";
      if (!loopback(host)) throw denied();
      if (Number(first.port) === 24678) {
        values[0] = { ...first, host: "127.0.0.1", port };
        audit.nodeRemaps++;
      } else if (!allowedPort(first.port)) throw denied();
    }
  } else if (typeof first === "number" || /^\d+$/.test(String(first))) {
    const host = typeof values[1] === "string" ? values[1] : "localhost";
    if (!loopback(host)) throw denied();
    if (Number(first) === 24678) {
      values[0] = port;
      if (typeof values[1] === "string") values[1] = "127.0.0.1";
      audit.nodeRemaps++;
    } else if (!allowedPort(first)) throw denied();
  } else throw denied();
  return connect.apply(this, values);
};
for (const module of [http, https]) {
  for (const method of ["request", "get"]) {
    const original = module[method];
    module[method] = function (input, ...args) {
      if (typeof input === "string" || input instanceof URL)
        return original.call(this, destination(input), ...args);
      const options = { ...input };
      const host = options.hostname ?? options.host ?? "localhost";
      if (!loopback(host)) throw denied();
      if (Number(options.port) === 24678) {
        options.port = port;
        options.hostname = "127.0.0.1";
        audit.nodeRemaps++;
      } else if (!allowedPort(options.port)) throw denied();
      return original.call(this, options, ...args);
    };
  }
}
const fetch = globalThis.fetch;
globalThis.fetch = async (input, options) => fetch(destination(input), options);
const nativeFetch = electronNet.fetch.bind(electronNet);
electronNet.fetch = async (input, options) => nativeFetch(destination(input).href, options);
const nativeRequest = electronNet.request.bind(electronNet);
electronNet.request = input =>
  nativeRequest(
    typeof input === "string" ? destination(input).href : { ...input, url: destination(input).href }
  );
for (const method of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"])
  childProcess[method] = () => {
    audit.systemBlocked++;
    throw new Error("CONTENT_PRODUCTION_TEST_CHILD_PROCESS_BLOCKED");
  };
syncBuiltinESMExports();

const guarded = new WeakSet();
const networkPreload = path.join(directory, "network-preload.cjs");
fs.writeFileSync(
  networkPreload,
  `require("electron").contextBridge.executeInMainWorld({
    args: [${port}],
    func: (port) => {
      const NativeWebSocket = globalThis.WebSocket;
      globalThis.WebSocket = class extends NativeWebSocket {
        constructor(url, ...options) {
          const target = new URL(String(url));
          if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(target.hostname) && Number(target.port) === 24678) {
            target.hostname = "127.0.0.1";
            target.port = String(port);
          }
          super(target.href, ...options);
        }
      };
    }
  });`
);
function guardSession(value) {
  if (guarded.has(value)) return;
  guarded.add(value);
  value.registerPreloadScript({ type: "frame", filePath: networkPreload });
  value.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
    (details, callback) => {
      const url = new URL(details.url);
      if (loopback(url.hostname) && Number(url.port) === 24678) {
        if (url.protocol === "ws:" || url.protocol === "wss:") {
          audit.externalBlocked++;
          callback({ cancel: true });
          return;
        }
        url.hostname = "127.0.0.1";
        url.port = String(port);
        audit.rendererRemaps++;
        callback({ redirectURL: url.href });
      } else if (loopback(url.hostname) && allowedPort(url.port)) callback({});
      else {
        audit.externalBlocked++;
        callback({ cancel: true });
      }
    }
  );
}
app.on("session-created", guardSession);
app.whenReady().then(() => guardSession(session.defaultSession));
for (const method of ["setAsDefaultProtocolClient", "removeAsDefaultProtocolClient"])
  app[method] = () => {
    audit.systemBlocked++;
    return false;
  };
app.getLoginItemSettings = () => ({ openAtLogin: false, wasOpenedAtLogin: false });
app.setLoginItemSettings = () => {
  audit.systemBlocked++;
  throw new Error("CONTENT_PRODUCTION_TEST_LOGIN_ITEM_BLOCKED");
};
globalShortcut.register = () => {
  audit.systemBlocked++;
  return false;
};
globalShortcut.unregisterAll = () => {};
shell.openExternal = async () => {
  audit.systemBlocked++;
  throw new Error("CONTENT_PRODUCTION_TEST_EXTERNAL_APPLICATION_BLOCKED");
};

assert(fs.statSync(audit.entry).isFile());
require(audit.entry);
