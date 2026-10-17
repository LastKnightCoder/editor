import path from "node:path";
import os from "node:os";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import ffprobe from "@ffprobe-installer/ffprobe";
import FfmpegService from "../utils/FfmpegService";
import { toUnpackedAsarPath } from "../utils/asarPath";
import { runCompilerWorker, runMediaProcess, waitForCompiler } from "./compiler-process";
import type { CompilerFile, CompilerRequest } from "../../../src/types/plugin-services";
import type { MediaInfo } from "@tau/plugins";
import themeCss from "@tau/themes/tailwind.css?raw";

export function taskFileName(name: string): string {
  if (
    !name ||
    name.includes("\\") ||
    name.includes(":") ||
    name.includes("\0") ||
    name.startsWith("/") ||
    name.split("/").some(part => !part || part === "." || part === "..")
  )
    throw new Error("任务文件名必须是不含 .. 的相对路径");
  return name;
}

export async function executePluginCompiler(
  request: CompilerRequest,
  signal: AbortSignal,
  progress: (time: number) => void
): Promise<unknown> {
  signal.throwIfAborted();
  if (request.kind === "tailwind" && !request.source.trim()) return { css: "" };
  const directory = await mkdtemp(path.join(os.tmpdir(), "tau-plugin-service-"));
  try {
    if (request.kind === "tailwind") {
      return await runCompilerWorker(
        path.join(__dirname, "workers/tailwind-runtime-worker.js"),
        {
          id: 1,
          content: request.source,
          extension: request.language,
          themeCss,
          tempDir: directory,
        },
        signal
      );
    }
    const files: CompilerFile[] = request.kind === "probe" ? [request.file] : request.files;
    const names = new Set<string>();
    for (const file of files) {
      signal.throwIfAborted();
      const name = taskFileName(file.name);
      if (names.has(name)) throw new Error(`任务文件名重复：${name}`);
      names.add(name);
      const destination = path.join(directory, name);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, file.bytes);
    }
    if (request.kind === "typst") {
      return await runCompilerWorker(
        path.join(__dirname, "plugin-typst-worker.js"),
        { source: request.source, inputs: request.inputs, workspace: directory },
        signal
      );
    }
    if (request.kind === "probe") {
      const { stdout } = await runMediaProcess(
        toUnpackedAsarPath(ffprobe.path),
        [
          "-v",
          "error",
          "-show_format",
          "-show_streams",
          "-of",
          "json",
          path.join(directory, request.file.name),
        ],
        directory,
        signal
      );
      const info = JSON.parse(stdout);
      const number = (value: unknown): number | null =>
        value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
      return {
        format: {
          name: info.format?.format_name ?? "",
          duration: number(info.format?.duration),
          size: number(info.format?.size),
        },
        streams: (info.streams ?? []).map((stream: Record<string, unknown>) => ({
          index: stream.index,
          type: stream.codec_type ?? "unknown",
          codec: stream.codec_name ?? "unknown",
          width: stream.width,
          height: stream.height,
          sampleRate: number(stream.sample_rate) ?? undefined,
          channels: stream.channels,
        })),
      } as MediaInfo;
    }
    for (const output of request.outputs) {
      const name = taskFileName(output.name);
      if (names.has(name)) throw new Error(`输入输出文件名重复：${name}`);
      names.add(name);
      await mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    }
    const binary = await waitForCompiler(() => FfmpegService.ensureBinary(), signal);
    signal.throwIfAborted();
    const { log } = await runMediaProcess(
      binary,
      ["-nostdin", "-y", "-progress", "pipe:1", "-nostats", ...request.args],
      directory,
      signal,
      progress
    );
    const outputs = [];
    for (const file of request.outputs) {
      signal.throwIfAborted();
      outputs.push({
        ...file,
        bytes: new Uint8Array(await readFile(path.join(directory, file.name))),
      });
    }
    return { files: outputs, log };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
