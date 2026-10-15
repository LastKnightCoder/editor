import { app, utilityProcess } from "electron";
import { EventEmitter } from "node:events";
import { startRestrictedProbe } from "./supervisor.mjs";

function launchUtility(workerPath) {
  const events = new EventEmitter();
  const child = utilityProcess.fork(workerPath, [], {
    serviceName: "Tau Restricted Probe",
    stdio: "ignore",
    env: {},
    execArgv: ["--max-old-space-size=64"],
  });
  let pid;
  let stopped = false;
  let closed = false;
  let escalation;
  events.connected = true;
  Object.defineProperty(events, "pid", { get: () => pid });
  function kill() {
    stopped = true;
    if (closed || !pid) return;
    child.kill();
    if (!escalation)
      escalation = setTimeout(() => {
        // 只针对仍归属于该 UtilityProcess 的存活 PID 升级终止。
        if (!closed && child.pid === pid) {
          try {
            process.kill(pid, "SIGKILL");
          } catch (error) {
            if (error.code !== "ESRCH") events.emit("error", error);
          }
        }
      }, 250);
  }
  events.kill = kill;
  events.send = (message, callback) => {
    try {
      if (closed || stopped) throw new Error("INSTANCE_REVOKED");
      child.postMessage(message);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  };
  child.once("spawn", () => {
    pid = child.pid;
    if (stopped) kill();
  });
  child.on("message", message => {
    if (!stopped) events.emit("message", message);
  });
  child.on("error", () => events.emit("error", new Error("PROCESS_FAILED")));
  child.once("exit", () => {
    closed = true;
    events.connected = false;
    clearTimeout(escalation);
    // Electron 的 exit 可能先于系统完成 PID 回收，等待有界的回收确认。
    const deadline = Date.now() + 2000;
    function confirmExit() {
      if (!pid) return events.emit("close");
      try {
        process.kill(pid, 0);
      } catch (error) {
        if (error.code === "ESRCH") return events.emit("close");
      }
      if (Date.now() < deadline) return setTimeout(confirmExit, 10);
      events.emit("close", new Error("PROCESS_FAILED"));
    }
    confirmExit();
  });
  return events;
}

export function createElectronProbeHost(workerPath) {
  const active = new Set();
  let disposed = false;
  let exiting = false;
  let quitPromise;

  async function stopAll() {
    const probes = [...active];
    for (const probe of probes) probe.revoke();
    await Promise.all(probes.map(probe => probe.result));
  }

  function beforeQuit(event) {
    if (exiting) return;
    event.preventDefault();
    disposed = true;
    if (!quitPromise)
      quitPromise = stopAll().finally(() => {
        exiting = true;
        app.removeListener("before-quit", beforeQuit);
        app.quit();
      });
  }
  app.on("before-quit", beforeQuit);

  return Object.freeze({
    start(options) {
      if (disposed) throw new Error("HOST_DISPOSED");
      if (!app.isReady()) throw new Error("HOST_NOT_READY");
      const probe = startRestrictedProbe(options, () => launchUtility(workerPath));
      active.add(probe);
      probe.result.finally(() => active.delete(probe));
      return probe;
    },
    async dispose() {
      disposed = true;
      await stopAll();
      app.removeListener("before-quit", beforeQuit);
    },
    get size() {
      return active.size;
    },
  });
}
