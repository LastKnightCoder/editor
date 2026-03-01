import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  VibeLearningMediaCache,
  hashString,
} from "../vibe-learning-media-cache";

async function collectFiles(dir: string): Promise<string[]> {
  const result: string[] = [];

  const walk = async (target: string) => {
    const entries = await fs.readdir(target, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(target, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        result.push(fullPath);
      }
    }
  };

  try {
    await walk(dir);
  } catch {
    // ignore missing dirs
  }

  return result;
}

async function totalSize(dir: string): Promise<number> {
  const files = await collectFiles(dir);
  let size = 0;
  for (const file of files) {
    const stat = await fs.stat(file);
    size += stat.size;
  }
  return size;
}

describe("vibe-learning-media-cache", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempRoots.map((root) => fs.rm(root, { recursive: true, force: true })),
    );
    tempRoots.length = 0;
  });

  it("缓存 key 应稳定且配置变化会失效", async () => {
    const rootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "vl-media-cache-key-"),
    );
    tempRoots.push(rootDir);
    const cache = new VibeLearningMediaCache({ rootDir });

    const keyA = cache.buildTranscriptionKey({
      sourceStableId: "local:/tmp/demo.mp4",
      mediaFingerprint: "100:200",
      modelSize: "base",
      language: "zh",
      sentenceLevel: false,
      useLLMOptimization: true,
    });

    const keyB = cache.buildTranscriptionKey({
      sourceStableId: "local:/tmp/demo.mp4",
      mediaFingerprint: "100:200",
      modelSize: "base",
      language: "zh",
      sentenceLevel: false,
      useLLMOptimization: true,
    });

    const keyC = cache.buildTranscriptionKey({
      sourceStableId: "local:/tmp/demo.mp4",
      mediaFingerprint: "100:200",
      modelSize: "small",
      language: "zh",
      sentenceLevel: false,
      useLLMOptimization: true,
    });

    expect(keyA).toBe(keyB);
    expect(keyA).not.toBe(keyC);

    const optKeyA = cache.buildOptimizationKey({
      transcriptionKey: keyA,
      llmProvider: "openai",
      llmModel: "gpt-4o",
      llmBaseUrl: "https://example.com",
      promptHash: hashString("prompt-a"),
      wordSegmentsHash: hashString("segments-a"),
    });
    const optKeyB = cache.buildOptimizationKey({
      transcriptionKey: keyA,
      llmProvider: "openai",
      llmModel: "gpt-4o-mini",
      llmBaseUrl: "https://example.com",
      promptHash: hashString("prompt-a"),
      wordSegmentsHash: hashString("segments-a"),
    });

    expect(optKeyA).not.toBe(optKeyB);
  });

  it("损坏 JSON 缓存应返回 miss 且不抛异常", async () => {
    const rootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "vl-media-cache-corrupt-"),
    );
    tempRoots.push(rootDir);
    const cache = new VibeLearningMediaCache({ rootDir });

    const key = cache.buildTranscriptionKey({
      sourceStableId: "local:/tmp/demo.mp4",
      mediaFingerprint: "100:200",
      modelSize: "base",
      language: "zh",
      sentenceLevel: true,
      useLLMOptimization: false,
    });

    await cache.writeTranscription(key, { text: "ok" });
    const brokenPath = path.join(rootDir, "transcription", `${key}.json`);
    await fs.writeFile(brokenPath, "{not-json", "utf-8");

    await expect(cache.readTranscription(key)).resolves.toBeNull();
  });

  it("写入缓存时应使用原子写，不保留临时文件", async () => {
    const rootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "vl-media-cache-atomic-"),
    );
    tempRoots.push(rootDir);
    const cache = new VibeLearningMediaCache({ rootDir });

    const key = cache.buildOptimizationKey({
      transcriptionKey: "t1",
      llmProvider: "openai",
      llmModel: "gpt-4o",
      llmBaseUrl: "",
      promptHash: hashString("prompt"),
      wordSegmentsHash: hashString("segments"),
    });

    await cache.writeOptimization(key, { segments: [{ text: "hello" }] });

    const files = await collectFiles(path.join(rootDir, "optimization"));
    expect(files.some((file) => file.includes(".tmp-"))).toBe(false);
    expect(files.some((file) => file.endsWith(`${key}.json`))).toBeTruthy();
  });

  it("超出容量时应按 LRU 清理并满足上限", async () => {
    const rootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "vl-media-cache-lru-"),
    );
    tempRoots.push(rootDir);
    const cache = new VibeLearningMediaCache({ rootDir, limitBytes: 500 });

    const key1 = cache.buildTranscriptionKey({
      sourceStableId: "local:/tmp/a.mp4",
      mediaFingerprint: "1:1",
      modelSize: "base",
      language: "zh",
      sentenceLevel: true,
      useLLMOptimization: false,
    });
    const key2 = cache.buildTranscriptionKey({
      sourceStableId: "local:/tmp/b.mp4",
      mediaFingerprint: "2:2",
      modelSize: "base",
      language: "zh",
      sentenceLevel: true,
      useLLMOptimization: false,
    });
    const key3 = cache.buildOptimizationKey({
      transcriptionKey: "key3",
      llmProvider: "openai",
      llmModel: "gpt-4o",
      llmBaseUrl: "",
      promptHash: hashString("prompt"),
      wordSegmentsHash: hashString("segments"),
    });

    await cache.writeTranscription(key1, { text: "a".repeat(180) });
    await cache.writeTranscription(key2, { text: "b".repeat(180) });

    const path1 = path.join(rootDir, "transcription", `${key1}.json`);
    const path2 = path.join(rootDir, "transcription", `${key2}.json`);

    const now = Date.now() / 1000;
    await fs.utimes(path1, now - 100, now - 100);
    await fs.utimes(path2, now - 50, now - 50);

    await cache.writeOptimization(key3, {
      segments: [{ text: "c".repeat(180) }],
    });

    const exists1 = await fs
      .access(path1)
      .then(() => true)
      .catch(() => false);
    const exists2 = await fs
      .access(path2)
      .then(() => true)
      .catch(() => false);
    const size = await totalSize(rootDir);

    expect(size).toBeLessThanOrEqual(500);
    expect(exists1).toBe(false);
    expect(exists2).toBe(true);
  });
});
