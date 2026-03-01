import { promises as fs } from "node:fs";
import { extname, join } from "node:path";
import crypto from "node:crypto";
import PathUtil from "../utils/PathUtil";

const DEFAULT_CACHE_VERSION = "v1";
const DEFAULT_LIMIT_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

type CacheCategory = "audio" | "transcription" | "optimization";

interface CacheFileInfo {
  path: string;
  size: number;
  mtimeMs: number;
}

interface VibeLearningMediaCacheOptions {
  rootDir?: string;
  limitBytes?: number;
}

export interface AudioCacheKeyPayload {
  version: string;
  sourceStableId: string;
  mediaFingerprint: string;
}

export interface TranscriptionCacheKeyPayload {
  version: string;
  sourceStableId: string;
  mediaFingerprint: string;
  modelSize: string;
  language: string;
  sentenceLevel: boolean;
  useLLMOptimization: boolean;
}

export interface OptimizationCacheKeyPayload {
  version: string;
  transcriptionKey: string;
  llmProvider: string;
  llmModel: string;
  llmBaseUrl: string;
  promptHash: string;
  wordSegmentsHash: string;
}

export interface ClearCacheResult {
  removedFiles: number;
  removedBytes: number;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`,
  );
  return `{${entries.join(",")}}`;
}

export function hashString(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function hashPayload(payload: Record<string, unknown>): string {
  return hashString(stableStringify(payload));
}

function normalizeExtension(filePath: string): string {
  const ext = extname(filePath).replace(".", "").toLowerCase();
  if (!ext) return "bin";
  return ext.replace(/[^a-z0-9]/g, "") || "bin";
}

export class VibeLearningMediaCache {
  readonly version: string = DEFAULT_CACHE_VERSION;
  private readonly rootDir: string;
  private readonly limitBytes: number;
  private readonly audioDir: string;
  private readonly transcriptionDir: string;
  private readonly optimizationDir: string;

  constructor(options: VibeLearningMediaCacheOptions = {}) {
    this.rootDir =
      options.rootDir ||
      join(PathUtil.getAppDir(), "cache", "vibe-learning-media");
    this.limitBytes = options.limitBytes ?? DEFAULT_LIMIT_BYTES;
    this.audioDir = join(this.rootDir, "audio");
    this.transcriptionDir = join(this.rootDir, "transcription");
    this.optimizationDir = join(this.rootDir, "optimization");
  }

  buildAudioKey(payload: Omit<AudioCacheKeyPayload, "version">): string {
    return hashPayload({
      version: this.version,
      ...payload,
    });
  }

  buildTranscriptionKey(
    payload: Omit<TranscriptionCacheKeyPayload, "version">,
  ): string {
    return hashPayload({
      version: this.version,
      ...payload,
    });
  }

  buildOptimizationKey(
    payload: Omit<OptimizationCacheKeyPayload, "version">,
  ): string {
    return hashPayload({
      version: this.version,
      ...payload,
    });
  }

  async computeMediaFingerprint(
    localFilePath: string,
    sourceStableId: string,
  ): Promise<string> {
    if (sourceStableId.startsWith("remote:")) {
      return "remote-url-stable";
    }
    const stat = await fs.stat(localFilePath);
    return `${stat.size}:${Math.floor(stat.mtimeMs)}`;
  }

  async readTranscription<T>(cacheKey: string): Promise<T | null> {
    return this.readJsonCache<T>("transcription", cacheKey);
  }

  async writeTranscription<T>(cacheKey: string, payload: T): Promise<void> {
    await this.writeJsonCache("transcription", cacheKey, payload);
  }

  async readOptimization<T>(cacheKey: string): Promise<T | null> {
    return this.readJsonCache<T>("optimization", cacheKey);
  }

  async writeOptimization<T>(cacheKey: string, payload: T): Promise<void> {
    await this.writeJsonCache("optimization", cacheKey, payload);
  }

  async getAudioPath(cacheKey: string): Promise<string | null> {
    await this.ensureDir("audio");
    const prefix = `${cacheKey}.`;
    const files = await fs.readdir(this.audioDir);
    const matched = files.find((name) => name.startsWith(prefix));
    if (!matched) return null;

    const fullPath = join(this.audioDir, matched);
    try {
      await fs.access(fullPath);
      await this.touch(fullPath);
      return fullPath;
    } catch {
      return null;
    }
  }

  async cacheAudioFromFile(
    cacheKey: string,
    sourceAudioPath: string,
  ): Promise<string> {
    await this.ensureDir("audio");
    const ext = normalizeExtension(sourceAudioPath);
    const targetPath = join(this.audioDir, `${cacheKey}.${ext}`);
    try {
      await fs.access(targetPath);
      await this.touch(targetPath);
      return targetPath;
    } catch {
      // miss
    }

    await this.atomicCopyFile(sourceAudioPath, targetPath);
    await this.touch(targetPath);
    await this.enforceSizeLimit();
    return targetPath;
  }

  async clearAll(): Promise<ClearCacheResult> {
    const files = await this.collectCacheFiles();
    const removedFiles = files.length;
    const removedBytes = files.reduce((sum, file) => sum + file.size, 0);

    await fs.rm(this.rootDir, { recursive: true, force: true });
    await this.ensureAllDirs();

    return { removedFiles, removedBytes };
  }

  private async ensureAllDirs(): Promise<void> {
    await Promise.all([
      this.ensureDir("audio"),
      this.ensureDir("transcription"),
      this.ensureDir("optimization"),
    ]);
  }

  private async ensureDir(category: CacheCategory): Promise<string> {
    const target =
      category === "audio"
        ? this.audioDir
        : category === "transcription"
          ? this.transcriptionDir
          : this.optimizationDir;
    await fs.mkdir(target, { recursive: true });
    return target;
  }

  private getJsonPath(category: Exclude<CacheCategory, "audio">, key: string) {
    const dir =
      category === "transcription"
        ? this.transcriptionDir
        : this.optimizationDir;
    return join(dir, `${key}.json`);
  }

  private async readJsonCache<T>(
    category: Exclude<CacheCategory, "audio">,
    key: string,
  ): Promise<T | null> {
    await this.ensureDir(category);
    const filePath = this.getJsonPath(category, key);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(content) as T;
      await this.touch(filePath);
      return parsed;
    } catch {
      return null;
    }
  }

  private async writeJsonCache(
    category: Exclude<CacheCategory, "audio">,
    key: string,
    payload: unknown,
  ): Promise<void> {
    await this.ensureDir(category);
    const filePath = this.getJsonPath(category, key);
    await this.atomicWriteJson(filePath, payload);
    await this.touch(filePath);
    await this.enforceSizeLimit();
  }

  private async atomicWriteJson(filePath: string, payload: unknown) {
    const tempPath = `${filePath}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      await fs.writeFile(tempPath, JSON.stringify(payload), "utf-8");
      await fs.rename(tempPath, filePath);
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => {});
      throw error;
    }
  }

  private async atomicCopyFile(sourcePath: string, targetPath: string) {
    const tempPath = `${targetPath}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      await fs.copyFile(sourcePath, tempPath);
      await fs.rename(tempPath, targetPath);
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => {});
      throw error;
    }
  }

  private async touch(filePath: string): Promise<void> {
    const now = new Date();
    await fs.utimes(filePath, now, now).catch(() => {});
  }

  private async collectCacheFiles(): Promise<CacheFileInfo[]> {
    await this.ensureAllDirs();
    const roots = [this.audioDir, this.transcriptionDir, this.optimizationDir];
    const result: CacheFileInfo[] = [];

    const walk = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
          continue;
        }
        if (!entry.isFile()) continue;
        const stat = await fs.stat(fullPath);
        result.push({
          path: fullPath,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
        });
      }
    };

    for (const root of roots) {
      await walk(root);
    }

    return result;
  }

  private async enforceSizeLimit(): Promise<void> {
    const files = await this.collectCacheFiles();
    let totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize <= this.limitBytes) return;

    const sorted = files.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const file of sorted) {
      if (totalSize <= this.limitBytes) {
        break;
      }
      await fs.rm(file.path, { force: true }).catch(() => {});
      totalSize -= file.size;
    }
  }
}

const vibeLearningMediaCache = new VibeLearningMediaCache();
export default vibeLearningMediaCache;
