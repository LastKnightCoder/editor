import { setImmediate as yieldTurn } from "node:timers/promises";
import type {
  AssistantMemory,
  MemorySearch,
  MemorySearchResult,
  MemorySource,
  MemorySourceKind,
} from "@/types/assistant-memory";
import {
  deterministicRecord,
  DREAM_SYSTEM,
  EXTRACT_SYSTEM,
  parseDream,
  parseExtraction,
  safeMemoryText,
  type MemoryCandidate,
  type MemoryPart,
} from "./extraction";
import { MEMORY_SOURCE_KINDS as SOURCE_KINDS } from "@/types/assistant-memory";
import type { MemoryHead, MemorySnapshot, MemorySourcesPort } from "./sources";
import { MemoryStore, type MemoryProgress } from "./store";

const PAGE = 48;
const QUIET_MS = 1800;
const MAX_PARTS = 8;
const GROUP_SOURCES = 6;
const INPUT_CHARS = 9000;
const SLICE_JOBS = 12;
const SLICE_MS = 1200;
const DAY = 86_400_000;
const DREAM_RETRY_MS = 3_600_000;

type Scan = { phase: "discover" | "recheck"; cursor: string; repeat?: boolean };
type SourceWork = {
  job: MemoryProgress;
  head: MemoryHead;
  snapshot: MemorySnapshot;
  continuing: boolean;
  end: number;
  parts: MemoryPart[];
};
export interface MemoryWorkerOptions {
  store: MemoryStore;
  sources: MemorySourcesPort;
  complete: (
    system: string,
    input: string,
    signal: AbortSignal,
    purpose: "extract" | "dream"
  ) => Promise<string>;
  allowed: () => boolean;
  busy: () => boolean;
  now?: () => number;
  changed?: () => void;
}

const sameSource = (a: MemorySource, b: MemorySource) => a.kind === b.kind && a.id === b.id;
const sameHead = (a: MemoryHead, b: MemoryHead | null) =>
  b !== null && a.modifiedAt === b.modifiedAt && a.row.create_time === b.row.create_time;
const today = (time: number) => new Date(time).toLocaleDateString("en-CA");

export class MemoryWorker {
  private active?: { sources?: MemorySource[]; controller: AbortController };
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private ticking?: Promise<void>;
  private turns = 0;
  private dreamRetryAt = 0;
  private readonly now: () => number;

  constructor(private readonly options: MemoryWorkerOptions) {
    this.now = options.now ?? Date.now;
  }
  get running() {
    return this.ticking !== undefined;
  }

  private scan(kind: MemorySourceKind): Scan | null {
    const raw = this.options.store.meta("scan:" + kind);
    return raw ? (JSON.parse(raw) as Scan) : null;
  }

  get scanning() {
    return SOURCE_KINDS.some(kind => this.scan(kind));
  }

  reconcile(kinds: readonly MemorySourceKind[] = SOURCE_KINDS, repeat = false, seed = false) {
    if (this.disposed) return;
    const { store, sources } = this.options;
    store.atomic(() => {
      for (const kind of kinds) {
        const existing = this.scan(kind);
        if (!existing || (repeat && !existing.repeat))
          store.setMeta(
            "scan:" + kind,
            JSON.stringify(
              existing ? { ...existing, repeat: true } : { phase: "discover", cursor: "" }
            )
          );
        if (seed)
          for (const source of sources.recent(kind, 10))
            store.observe(source, source.modifiedAt, this.now(), 2);
      }
    });
    this.wake();
  }

  changed(source: MemorySource, resetHistory = false) {
    if (this.disposed) return;
    this.options.sources.invalidate(source);
    this.options.store.mark(source, this.now() + (source.kind === "content" ? QUIET_MS : 0), 3);
    if (resetHistory) this.options.store.resetHistory(source);
    if (this.active?.sources?.some(item => sameSource(item, source)))
      this.active.controller.abort();
    this.wake();
  }

  interrupt() {
    this.active?.controller.abort();
    this.clearTimer();
  }

  close() {
    this.disposed = true;
    this.interrupt();
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private canRun() {
    return !this.disposed && this.options.allowed() && !this.options.busy();
  }

  wake() {
    this.clearTimer();
    if (!this.canRun() || this.ticking) return;
    const { store } = this.options;
    const now = this.now();
    const expiry = store.nextExpiry();
    const pending = store.nextDue();
    const mayScan = this.scanning && store.pendingCount(PAGE * 2) < PAGE * 2;
    const dream = this.dreamDue(now);
    const next = Math.min(pending ?? Infinity, expiry ?? Infinity, mayScan ? now : Infinity, dream);
    if (!Number.isFinite(next)) return;
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        void this.runBatch().catch(() => {
          // 连接关闭等临时状态留给宿主的下一次唤醒。
        });
      },
      Math.min(2_147_000_000, Math.max(20, next - now))
    );
    this.timer.unref();
  }

  runBatch(maxJobs = SLICE_JOBS): Promise<void> {
    if (this.ticking) return this.ticking;
    if (!this.canRun()) return Promise.resolve();
    this.clearTimer();
    this.ticking = this.run(maxJobs).finally(() => {
      this.ticking = undefined;
      if (!this.disposed) {
        this.options.changed?.();
        this.wake();
      }
    });
    return this.ticking;
  }

  private async run(maxJobs: number) {
    const started = performance.now();
    for (let index = 0; index < maxJobs && this.canRun();) {
      if (index && performance.now() - started > SLICE_MS) break;
      const now = this.now();
      const { store } = this.options;
      const expiry = store.nextExpiry();
      if (expiry !== null && expiry <= now) store.expire(now);
      if (this.scanning && store.pendingCount(PAGE * 2) < PAGE * 2) this.scanPage();
      const historical = ++this.turns % 6 === 0;
      const jobs = store.due(now, Math.min(GROUP_SOURCES, maxJobs - index), historical);
      if (this.dreamDue(now) <= now && (!jobs.length || historical)) {
        await this.dream(now);
        index++;
      } else if (jobs.length) {
        index += await this.process(jobs);
      } else {
        if (!this.scanning || store.pendingCount(PAGE * 2) >= PAGE * 2) break;
        index++;
      }
      await yieldTurn();
    }
  }

  private scanPage() {
    const { store, sources } = this.options;
    const kind = SOURCE_KINDS.find(type => this.scan(type));
    if (!kind) return;
    const scan = this.scan(kind);
    if (!scan) return;
    store.atomic(() => {
      const page =
        scan.phase === "discover"
          ? sources.list(kind, scan.cursor, PAGE)
          : store.listTracked(kind, scan.cursor, PAGE);
      const now = this.now();
      for (const source of page) {
        if ("modifiedAt" in source) store.observe(source, source.modifiedAt, now);
        else {
          try {
            if (!sources.head(source)) store.removeSource(source);
          } catch {
            // 同步暂缺正文或会话不等于删除。
          }
        }
      }
      const next: Scan | null =
        page.length === PAGE
          ? { ...scan, cursor: page[page.length - 1].id }
          : scan.phase === "discover"
            ? { ...scan, phase: "recheck", cursor: "" }
            : scan.repeat
              ? { phase: "discover", cursor: "" }
              : null;
      store.setMeta("scan:" + kind, next ? JSON.stringify(next) : "");
    });
  }

  private prepare(job: MemoryProgress, available: number, maxParts: number): SourceWork | null {
    const { sources, store } = this.options;
    const head = sources.head(job);
    if (!head) {
      store.atomic(() => store.removeSource(job));
      return null;
    }
    const snapshot = sources.read(head);
    const continuing = job.readingAt === head.modifiedAt;
    const after = continuing
      ? job.cursor
      : job.kind === "chat"
        ? (job.cursor ?? job.checkedCursor)
        : null;
    const start = after ? snapshot.parts.findIndex(part => part.next === after) + 1 : 0;
    const parts: MemoryPart[] = [];
    let end = start;
    let chars = 0;
    while (end < snapshot.parts.length && end - start < maxParts) {
      const part = snapshot.parts[end];
      if (chars + part.text.length > available) break;
      end++;
      if (
        store.hiddenAnchor(job, part.anchor) ||
        !safeMemoryText(part.text, 6000) ||
        part.text.length < 4
      )
        continue;
      parts.push(part);
      chars += part.text.length;
    }
    return { job, head, snapshot, continuing, end, parts };
  }

  private async process(jobs: MemoryProgress[]) {
    const { store, sources } = this.options;
    const controller = new AbortController();
    const work: SourceWork[] = [];
    const input: MemoryPart[] = [];
    let available = INPUT_CHARS;
    let visited = 0;
    try {
      for (const job of jobs) {
        if (available < 3600 || input.length >= MAX_PARTS) break;
        visited++;
        try {
          const item = this.prepare(job, available, MAX_PARTS - input.length);
          if (!item) continue;
          work.push(item);
          const modeled = item.parts.filter(part => part.role !== "record");
          input.push(...modeled);
          available -= modeled.reduce((sum, part) => sum + part.text.length, 0);
        } catch {
          store.fail(job, this.now());
        }
      }
      this.active = { sources: work.map(item => item.job), controller };
      // 明确的事项状态独立提交，不受同批模型失败影响。
      for (const item of work) {
        if (item.job.kind === "todo" || item.job.kind === "calendar")
          this.commit(
            item,
            item.parts.flatMap(part => deterministicRecord(part, this.now()))
          );
      }
      const candidates = await this.extract(input, controller.signal);
      if (!this.canRun() || controller.signal.aborted) return Math.max(1, visited);
      for (const item of work) {
        if (item.job.kind === "todo" || item.job.kind === "calendar") continue;
        if (!sameHead(item.head, sources.head(item.job))) {
          this.changed(item.job);
          continue;
        }
        this.commit(
          item,
          candidates.filter(candidate => candidate.evidence.some(ref => sameSource(ref, item.job)))
        );
      }
    } catch {
      if (this.canRun() && !controller.signal.aborted) {
        for (const item of work) {
          if (
            item.job.kind !== "todo" &&
            item.job.kind !== "calendar" &&
            store.progress(item.job)?.dueAt !== null
          )
            store.fail(item.job, this.now());
        }
      }
    } finally {
      if (this.active?.controller === controller) this.active = undefined;
    }
    return Math.max(1, visited);
  }

  private commit(item: SourceWork, candidates: MemoryCandidate[]) {
    const { store } = this.options;
    const { job, head, snapshot, continuing, end } = item;
    store.atomic(() => {
      if (!continuing) store.pruneEvidence(job, ref => snapshot.validate(ref) !== null);
      store.apply(candidates, this.now());
      store.checkpoint(
        job,
        head.modifiedAt,
        snapshot.parts[end - 1]?.next ?? null,
        end >= snapshot.parts.length,
        this.now()
      );
      if (candidates.length) store.setMeta("dirty-at", String(this.now()));
    });
  }

  private async extract(parts: MemoryPart[], signal: AbortSignal): Promise<MemoryCandidate[]> {
    if (!parts.length) return [];
    const { store } = this.options;
    const related = store.search({
      query: parts
        .map(part => part.text.slice(0, 130))
        .join(" ")
        .slice(0, 440),
      state: "current",
      limit: 8,
    });
    const text = await this.options.complete(
      EXTRACT_SYSTEM + "\n每项加 part 字段，填写证据所在片段的数字编号。",
      JSON.stringify({
        parts: parts.map((part, index) => ({
          part: index,
          role: part.role,
          text: part.text,
          date: new Date(part.observedAt).toISOString(),
        })),
        related: related.map(({ id, kind, topic, text }) => ({ id, kind, topic, text })),
      }),
      signal,
      "extract"
    );
    const output: unknown = JSON.parse(
      text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
    );
    if (!Array.isArray(output)) throw new Error("记忆整理输出不是数组");
    const candidates = output.slice(0, 8).flatMap(item => {
      const part =
        item && Number.isInteger(item.part)
          ? parts[item.part]
          : parts.length === 1
            ? parts[0]
            : undefined;
      return part ? parseExtraction(JSON.stringify([item]), part, related) : [];
    });
    if (output.length && !candidates.length) throw new Error("记忆整理没有返回可核对的原文引用");
    return candidates;
  }

  private dreamDue(now: number): number {
    const { store } = this.options;
    const dirtyAt = Number(store.meta("dirty-at") ?? 0);
    const last = Number(store.meta("dream-at") ?? 0);
    if (!dirtyAt || last >= dirtyAt) return Infinity;
    if (last && today(last) === today(now)) {
      const next = new Date(now);
      next.setHours(24, 0, 0, 0);
      return next.getTime();
    }
    return Math.max(dirtyAt + QUIET_MS, this.dreamRetryAt);
  }

  private async dream(now: number) {
    const { store } = this.options;
    const controller = new AbortController();
    this.active = { controller };
    try {
      const items = store
        .dreamCandidates(Math.max(Number(store.meta("dream-at") ?? 0), now - 7 * DAY))
        .map(item => this.resolveMemory(item))
        .filter(item => !item.manual && item.evidence.length);
      const groups =
        items.length > 1
          ? parseDream(
              await this.options.complete(
                DREAM_SYSTEM,
                JSON.stringify(
                  items.map(({ id, kind, topic, text, state, observedAt }) => ({
                    id,
                    kind,
                    topic,
                    text,
                    state,
                    observedAt,
                  }))
                ),
                controller.signal,
                "dream"
              )
            )
          : [];
      if (this.canRun() && !controller.signal.aborted)
        store.atomic(() => {
          store.applyDream(groups, new Set(items.map(item => item.id)), now);
          store.setMeta("dream-at", String(now));
        });
    } catch {
      if (!controller.signal.aborted) this.dreamRetryAt = now + DREAM_RETRY_MS;
    } finally {
      if (this.active?.controller === controller) this.active = undefined;
    }
  }

  private resolveMemory(item: AssistantMemory): AssistantMemory {
    const evidence = item.evidence.flatMap(ref => {
      try {
        const head = this.options.sources.head(ref);
        const resolved = head && this.options.sources.read(head).validate(ref);
        return resolved ? [resolved] : [];
      } catch {
        return [];
      }
    });
    return { ...item, evidence };
  }

  get(id: number): AssistantMemory | null {
    this.options.store.expire(this.now());
    const item = this.options.store.get(id);
    if (!item) return null;
    const resolved = this.resolveMemory(item);
    return resolved.manual || resolved.evidence.length ? resolved : null;
  }

  search(params: MemorySearch, includeSources: boolean): MemorySearchResult {
    const { store, sources } = this.options;
    store.expire(this.now());
    const limit = params.limit ?? 12;
    const rows = store.search({ ...params, limit: Math.min(limit * 2, 100) }, includeSources);
    const memories: AssistantMemory[] = [];
    let scanned = 0;
    for (const row of rows) {
      scanned++;
      const item = this.resolveMemory(row);
      if (item.manual || item.evidence.length) memories.push(item);
      if (memories.length >= limit) break;
    }
    const nextBefore =
      scanned > 0 && (scanned < rows.length || rows.length >= Math.min(limit * 2, 100))
        ? rows[scanned - 1].id
        : null;
    return {
      memories,
      sources:
        includeSources && params.query?.trim()
          ? sources
              .fallback(params.query, Math.min(6, limit), source => !store.hiddenSource(source))
              .filter(
                ref =>
                  (params.from === undefined || (ref.observedAt ?? 0) >= params.from) &&
                  (params.to === undefined || (ref.observedAt ?? Infinity) <= params.to)
              )
          : [],
      nextBefore,
    };
  }
}
