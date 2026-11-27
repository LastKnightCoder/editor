import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzip as gzipCallback, gunzip as gunzipCallback } from "node:zlib";
import type { PerfIncident } from "../../../shared/perf-diagnostics";

const gzip = promisify(gzipCallback),
  gunzip = promisify(gunzipCallback);
const filePattern = /^incident-[A-Za-z0-9-]+\.json\.gz$/;

interface Options {
  maxFiles?: number;
  maxBytes?: number;
  retentionMs?: number;
  now?: () => number;
}

/** 单个写队列与原子替换：采集中的片段也可跨崩溃保留。 */
export class PerfIncidentStore {
  private tail: Promise<void> = Promise.resolve();
  private pendingWrites = 0;
  failures = 0;
  private now: () => number;

  constructor(
    readonly directory: string,
    private options: Options = {}
  ) {
    this.now = options.now ?? Date.now;
  }

  save(incident: PerfIncident): Promise<void> {
    if (this.pendingWrites >= 4) {
      this.failures++;
      return Promise.reject(new Error("诊断写入队列已满"));
    }
    this.pendingWrites++;
    const value = structuredClone(incident);
    const save = this.tail
      .then(async () => {
        await fs.mkdir(this.directory, { recursive: true });
        const name = `incident-${value.sessionId}-${value.id}.json.gz`;
        if (!filePattern.test(name)) throw new Error("无效的诊断片段身份");
        const file = path.join(this.directory, name),
          temporary = `${file}.tmp`;
        try {
          await fs.writeFile(temporary, await gzip(JSON.stringify(value)));
          await fs.rename(temporary, file);
        } finally {
          await fs.rm(temporary, { force: true });
        }
        await this.pruneFiles();
      })
      .finally(() => {
        this.pendingWrites--;
      });
    this.tail = save.catch(() => {
      this.failures++;
    });
    return save;
  }

  prune(): Promise<void> {
    const prune = this.tail.then(() => this.pruneFiles());
    this.tail = prune.catch(() => {
      this.failures++;
    });
    return prune;
  }

  private async pruneFiles(): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });
    for (const name of await fs.readdir(this.directory))
      if (name.endsWith(".tmp") && filePattern.test(name.slice(0, -4)))
        await fs.rm(path.join(this.directory, name), { force: true });
    const rows = await this.files();
    let bytes = 0,
      kept = 0;
    for (const row of rows) {
      if (
        this.now() - row.time > (this.options.retentionMs ?? 7 * 86_400_000) ||
        kept >= (this.options.maxFiles ?? 10) ||
        bytes + row.bytes > (this.options.maxBytes ?? 32 * 1024 * 1024)
      ) {
        await fs.rm(row.file, { force: true });
      } else {
        kept++;
        bytes += row.bytes;
      }
    }
  }

  private async files() {
    const names = await fs.readdir(this.directory).catch(error => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    });
    const rows = await Promise.all(
      names
        .filter(name => filePattern.test(name))
        .map(async name => {
          const file = path.join(this.directory, name),
            stat = await fs.stat(file);
          return { file, bytes: stat.size, time: stat.mtimeMs };
        })
    );
    return rows.sort((a, b) => b.time - a.time || b.file.localeCompare(a.file));
  }

  async readRecent(sessionId: string, maxBytes = 4 * 1024 * 1024) {
    await this.tail;
    const incidents: PerfIncident[] = [];
    let bytes = 0,
      omitted = 0;
    const rows = await this.files();
    for (const row of rows) {
      if (incidents.length >= 3 || row.bytes > maxBytes) {
        omitted++;
        continue;
      }
      try {
        const data = await gunzip(await fs.readFile(row.file), { maxOutputLength: maxBytes });
        if (bytes + data.length > maxBytes) {
          omitted++;
          continue;
        }
        const value: PerfIncident = JSON.parse(data.toString("utf8"));
        if (
          !value ||
          typeof value.id !== "string" ||
          !Array.isArray(value.events) ||
          !value.summary ||
          !Array.isArray(value.reasons)
        )
          throw new Error("诊断片段损坏");
        if (value.status === "recording" && value.sessionId !== sessionId)
          value.status = "interrupted";
        if (value.cpu?.status === "recording" && value.sessionId !== sessionId)
          value.cpu.status = "interrupted";
        incidents.push(value);
        bytes += data.length;
      } catch {
        omitted++;
      }
    }
    return { incidents, omitted };
  }

  flush() {
    return this.tail;
  }
}
