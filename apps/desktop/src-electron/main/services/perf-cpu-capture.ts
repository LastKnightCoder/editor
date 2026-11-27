import { app, webContents } from "electron";
import { url as inspectorUrl } from "node:inspector";
import { Worker } from "node:worker_threads";
import path from "node:path";
import { CPU_DURATION_MS, CPU_INTERVAL_US, type CpuProfile } from "../../../shared/perf-cpu";
import type { PerfSource } from "../../../shared/perf-diagnostics";
import type { prepareCpuProfile } from "./perf-cpu-profile";
import { startupCpuProfile } from "../startup-cpu-profile";

type Result = ReturnType<typeof prepareCpuProfile>;
type Reply = { type: "started" } | { type: "failed" } | { type: "complete"; result: Result };

export function runCpuWorker(signal: AbortSignal, profile?: CpuProfile): Promise<Result> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(path.join(__dirname, "perf-cpu-worker.js"), {
      workerData: { appRoot: app.getAppPath(), profile },
      resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 },
    });
    let settled = false;
    const finish = (error?: Error, value?: Result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (signal.aborted) {
        worker.postMessage("cancel");
        setTimeout(() => void worker.terminate(), 250).unref();
      } else void worker.terminate();
      if (value) resolve(value);
      else reject(error ?? new Error("worker-failed"));
    };
    const abort = () => finish(new Error("cancelled"));
    const timer = setTimeout(() => finish(new Error("worker-timeout")), 12_000);
    signal.addEventListener("abort", abort, { once: true });
    worker.on("message", (reply: Reply) => {
      if (reply.type === "complete") finish(undefined, reply.result);
      else if (reply.type === "failed") finish(new Error("worker-failed"));
    });
    worker.once("error", () => finish(new Error("worker-failed")));
    worker.once("exit", () => finish(new Error("worker-exited")));
  });
}

async function rendererProfile(source: PerfSource, signal: AbortSignal): Promise<Result> {
  const contents =
    source.webContentsId === undefined ? undefined : webContents.fromId(source.webContentsId);
  if (!contents || contents.isDestroyed() || contents.getOSProcessId() !== source.pid)
    throw new Error("target-gone");
  const debuggerApi = contents.debugger;
  if (debuggerApi.isAttached() || contents.isDevToolsOpened()) throw new Error("debugger-busy");
  signal.throwIfAborted();
  debuggerApi.attach("1.3");
  let cleanup: (() => void) | undefined;
  let owned = true;
  let raw: CpuProfile;
  const assertOwner = () => {
    signal.throwIfAborted();
    if (!owned || !debuggerApi.isAttached()) throw new Error("target-detached");
  };
  try {
    raw = await new Promise<CpuProfile>((resolve, reject) => {
      const abort = () => reject(new Error("cancelled"));
      const detached = () => {
        owned = false;
        reject(new Error("target-detached"));
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = setTimeout(() => reject(new Error("renderer-timeout")), 10_000);
      cleanup = () => {
        signal.removeEventListener("abort", abort);
        debuggerApi.removeListener("detach", detached);
        clearTimeout(timer);
        clearTimeout(deadline);
      };
      signal.addEventListener("abort", abort, { once: true });
      debuggerApi.once("detach", detached);
      void (async () => {
        assertOwner();
        await debuggerApi.sendCommand("Profiler.enable");
        assertOwner();
        await debuggerApi.sendCommand("Profiler.setSamplingInterval", {
          interval: CPU_INTERVAL_US,
        });
        assertOwner();
        await debuggerApi.sendCommand("Profiler.start");
        assertOwner();
        await new Promise<void>(done => {
          timer = setTimeout(done, CPU_DURATION_MS);
        });
        assertOwner();
        const result: { profile: CpuProfile } = await debuggerApi.sendCommand("Profiler.stop");
        resolve(result.profile);
      })().catch(() => reject(new Error("renderer-command-failed")));
    });
  } finally {
    cleanup?.();
    if (owned && debuggerApi.isAttached()) debuggerApi.detach();
    owned = false;
  }
  return runCpuWorker(signal, raw);
}

export async function captureCpu(source: PerfSource, signal: AbortSignal): Promise<Result> {
  if (source.type === "main") {
    if (startupCpuProfile.status === "recording" || inspectorUrl())
      throw new Error("inspector-busy");
    return runCpuWorker(signal);
  }
  return rendererProfile(source, signal);
}
