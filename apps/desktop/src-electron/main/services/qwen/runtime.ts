import { app } from "electron";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { waitForASR } from "@tau/asr";
import { streamToFile } from "../../utils/model-download";
import macBundle from "./bundle.json";
import windowsBundle from "./bundle-win32-x64.json";
import windowsGpuBundle from "./bundle-win32-x64-gpu.json";
import type { QwenDevice } from "../../../../shared/local-transcription";

const execute = promisify(execFile);
const windows = process.platform === "win32";
function bundleFor(device: QwenDevice) {
  if (!windows) return macBundle;
  return device === "gpu" ? windowsGpuBundle : windowsBundle;
}
const executable = windows ? "audiocpp_cli.exe" : "python/bin/python3.12";
const runtimeDir = (device: QwenDevice) =>
  path.join(
    app.getPath("userData"),
    "bin",
    (windows ? "qwen-" + device + "-" : "qwen-mlx-") + bundleFor(device).sha256
  );
export const qwenExecutable = (device: QwenDevice = "cpu") =>
  path.join(runtimeDir(device), executable);
export const qwenRuntimeReady = (device: QwenDevice) => fs.pathExists(qwenExecutable(device));
export const qwenSupported = () =>
  (windows && process.arch === "x64") ||
  (process.platform === "darwin" &&
    process.arch === "arm64" &&
    Number.parseInt(os.release()) >= 23);
export const qwenPlatformRequirement =
  "Qwen 本地转录支持 Windows x64 或 macOS 14 及以上的 Apple 芯片 Mac";

export const qwenRuntimeBytes = (device: QwenDevice) => bundleFor(device).bytes;
type Progress = (received: number, message: string) => void;
interface RuntimeInstallation {
  controller: AbortController;
  listeners: Set<Progress>;
  completion: Promise<void>;
}
const installations = new Map<string, RuntimeInstallation>();

export async function ensureQwenRuntime(
  signal: AbortSignal,
  progress: Progress,
  device: QwenDevice = "cpu"
) {
  if (!qwenSupported()) throw new Error(qwenPlatformRequirement);
  if (await qwenRuntimeReady(device)) return;
  signal.throwIfAborted();
  const key = bundleFor(device).sha256;
  let active = installations.get(key);
  if (!active || active.controller.signal.aborted) {
    const controller = new AbortController();
    const listeners = new Set<Progress>();
    const completion = install(device, controller.signal, (received, message) => {
      for (const report of listeners) report(received, message);
    }).finally(() => {
      if (installations.get(key)?.controller === controller) installations.delete(key);
    });
    active = { controller, listeners, completion };
    installations.set(key, active);
  }
  const current = active;
  current.listeners.add(progress);
  try {
    await waitForASR(current.completion, signal);
  } finally {
    current.listeners.delete(progress);
    if (!current.listeners.size) current.controller.abort();
  }
}

async function install(device: QwenDevice, signal: AbortSignal, progress: Progress) {
  const directory = runtimeDir(device);
  const bundle = bundleFor(device);
  await fs.ensureDir(path.dirname(directory));
  const staging = await fs.mkdtemp(directory + "-");
  try {
    const archive = path.join(staging, windows ? "runtime.zip" : "runtime.tar.gz");
    let lastPercent = -1;
    await streamToFile(bundle.url, archive, {
      signal,
      onBytes: received => {
        const percent = Math.min(100, Math.floor((100 * received) / bundle.bytes));
        if (percent === lastPercent) return;
        lastPercent = percent;
        progress(
          received,
          "正在下载 Qwen 运行包 " +
            Math.floor(received / 1e6) +
            " / " +
            Math.ceil(bundle.bytes / 1e6) +
            " MB"
        );
      },
    });
    progress(bundle.bytes, "正在校验 Qwen 运行包…");
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(archive, { signal })) hash.update(chunk);
    if ((await fs.stat(archive)).size !== bundle.bytes || hash.digest("hex") !== bundle.sha256)
      throw new Error("Qwen 运行包校验失败，请重新下载");
    const unpacked = path.join(staging, "unpacked");
    await fs.mkdir(unpacked);
    progress(bundle.bytes, "正在解压 Qwen 运行包…");
    if (windows) {
      const { sevenZipBinaryPath } = await import("../../utils/seven-zip");
      await execute(sevenZipBinaryPath, ["x", "-y", "-o" + unpacked, archive], {
        signal,
        windowsHide: true,
      });
      try {
        await execute(path.join(unpacked, executable), ["--version"], {
          signal,
          windowsHide: true,
        });
      } catch (error) {
        signal.throwIfAborted();
        if (device === "gpu")
          throw new Error("GPU 运行包无法启动，请更新显卡驱动或选择 CPU", { cause: error });
        throw error;
      }
    } else {
      await execute("/usr/bin/tar", ["-xzf", archive, "-C", unpacked], { signal });
      await execute(
        path.join(unpacked, executable),
        ["-I", "-B", "-c", "import mlx.core as mx, mlx_qwen3_asr; mx.eval(mx.ones(1))"],
        { signal }
      );
    }
    signal.throwIfAborted();
    await fs.move(unpacked, directory, { overwrite: true });
  } finally {
    await fs.remove(staging);
  }
}
