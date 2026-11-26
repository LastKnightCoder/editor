// @vitest-environment node
import { EventEmitter } from "node:events";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
const bus = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  listeners: new Set<(event: unknown, value: unknown) => void>(),
  sender: null as unknown,
}));
vi.mock("electron", () => ({
  app: { getPath: () => os.tmpdir(), getAppPath: () => os.tmpdir(), on: () => undefined },
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => unknown) =>
      bus.handlers.set(name, handler),
  },
}));
vi.mock("../database", () => ({ default: { onDatabaseChange: () => undefined } }));
vi.mock("@/commands/module-init", () => ({ ensureModule: async () => undefined }));
vi.mock("@/electron", () => ({
  invoke: (name: string, ...args: unknown[]) =>
    bus.handlers.get(name)?.({ sender: bus.sender }, ...args),
  on: (_name: string, listener: (event: unknown, value: unknown) => void) =>
    bus.listeners.add(listener),
  off: (_name: string, listener: (event: unknown, value: unknown) => void) =>
    bus.listeners.delete(listener),
}));
import module from "../transcription";
import { transcribeAudio } from "@/commands/transcription";
import type { TranscriptionProgress } from "../../../../shared/media-progress";
let directory = "";
afterEach(async () => {
  bus.handlers.clear();
  bus.listeners.clear();
  if (directory) await rm(directory, { recursive: true, force: true });
});

it("无message原生进度经ASR任务与IPC只交付一次，数值与opaque字段原样到命令回调", async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "tau-progress-"));
  const file = path.join(directory, "raw.wav");
  await writeFile(file, "raw audio");
  const original = {
    text: "字幕原文",
    language: "ja",
    duration: 1,
    processingTime: 0,
    segments: [{ text: "字幕原文", start: 0, end: 1000 }],
  };
  const progress: TranscriptionProgress = {
    stage: "uploading",
    fraction: 0.29,
    code: "transcription.recognizing",
    params: { percent: 29, flag: true, null: null },
  };
  const transcribe = vi.fn(
    async (_file: string, _options: unknown, report?: (value: TranscriptionProgress) => void) => {
      report?.(progress);
      return original;
    }
  );
  Object.assign(module, { service: { transcribe } });
  const sender = Object.assign(new EventEmitter(), {
    id: 73,
    isDestroyed: () => false,
    send: (name: string, value: unknown) => {
      if (name === "transcription-progress")
        for (const listener of bus.listeners) listener({}, structuredClone(value));
    },
  });
  bus.sender = sender;
  await module.init();
  const receiver = vi.fn();
  const result = await transcribeAudio(file, { language: "ja" }, { onProgress: receiver });
  expect(receiver).toHaveBeenCalledTimes(1);
  expect(receiver).toHaveBeenCalledWith(progress);
  expect(transcribe).toHaveBeenCalledTimes(1);
  expect(transcribe).toHaveBeenCalledWith(
    file,
    { language: "ja" },
    expect.any(Function),
    expect.any(AbortSignal)
  );
  expect(result).toMatchObject({ success: true, data: original });
  expect(bus.listeners.size).toBe(0);
});
