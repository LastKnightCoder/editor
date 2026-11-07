import { setImmediate as yieldTurn } from "node:timers/promises";
import type {
  AssistantMemory,
  MemorySearch,
  MemorySource,
  MemorySourceKind,
  PersonalMemoryModel,
} from "@/types/assistant-memory";
import type {
  MemoryDebugPhase,
  MemoryDebugReporter,
  MemoryDebugSource,
  MemoryWorkerDebug,
} from "@/types/assistant-memory-debug";
import {
  deterministicRecord,
  EXTRACT_SYSTEM,
  parseExtraction,
  parseSessionSummary,
  SESSION_SUMMARY_SYSTEM,
  CHAT_SUMMARY_ANCHOR,
  safeMemoryText,
  type MemoryCandidate,
  type MemoryPart,
} from "./extraction";
import { MEMORY_INGEST_KINDS as SOURCE_KINDS } from "@/types/assistant-memory";
import type { MemoryHead, MemorySnapshot, MemorySourcesPort } from "./sources";
import { MemoryStore, type MemoryProgress } from "./store";
import { resolveMemory } from "./retrieval";
import {
  isPersonalEpisode,
  isSelfDeclaration,
  RHYTHM_TOPIC,
  isRhythmModel,
  MERGE_SYSTEM,
  parseMerge,
  MEMORY_REVIEW_INTERVAL,
  parseReflection,
  REFLECT_SYSTEM,
} from "./reflection";
import {
  parseReconcile,
  RECONCILE_SYSTEM,
  reconcileInput,
  type ReconcileEntry,
  type ReconcileSubject,
} from "./reconcile";
import {
  parsePortrait,
  PORTRAIT_CHANGES_META,
  PORTRAIT_META,
  PORTRAIT_SYSTEM,
  portraitInput,
  readPortrait,
  PORTRAIT_CHANGES,
  PORTRAIT_INTERVAL,
  PORTRAIT_MIN_PROFILES,
} from "./portrait";

const PAGE = 48;
const QUIET_MS = 1800;
const MAX_PARTS = 8;
const GROUP_SOURCES = 6;
const INPUT_CHARS = 9000;
const SLICE_JOBS = 12;
const SLICE_MS = 1200;
const REFLECTION_RETRY_MS = 3_600_000;
const REFLECTION_QUIET_MS = 60_000;
const REFLECTION_INTERVAL_MS = 5 * 60_000;
const PROFILE_DECAY_MS = 60 * 86_400_000;
const RELATED_EACH = 4;
const RELATED_LIMIT = 24;
const REVIEW_CHUNK = 12;
const RHYTHM_INTERVAL_MS = 7 * 86_400_000;
const PROFILE_LIMIT = 60;
const STATE_LIMIT = 24;

type Scan = { phase: "discover" | "recheck"; cursor: string; repeat?: boolean };
type SourceWork = {
  job: MemoryProgress;
  head: MemoryHead;
  snapshot: MemorySnapshot;
  continuing: boolean;
  end: number;
  parts: MemoryPart[];
};
export interface ActivityRhythm {
  peakHours: number[]; // 最活跃的小时（0-23），最多 3 个
  weekdayRatio: number; // 工作日活跃量占比（0-1）
  activeDays: number; // 近 30 天的活跃天数
}

export interface MemoryWorkerOptions {
  store: MemoryStore;
  sources: MemorySourcesPort;
  complete: (
    system: string,
    input: string,
    signal: AbortSignal,
    purpose: "extract" | "reconcile" | "reflect" | "review"
  ) => Promise<string>;
  /** 整批语义召回相关经历，结果与查询一一对应；未提供或不可用时只用关键词检索。 */
  related?: (list: MemorySearch[]) => Promise<AssistantMemory[][]>;
  allowed: () => boolean;
  busy: () => boolean;
  queryRhythm?: () => ActivityRhythm | null;
  /** 依据仍成立的画像与近期状态，供用户总述使用。 */
  validModels?: (now: number) => PersonalMemoryModel[];
  now?: () => number;
  changed?: () => void;
  progressed?: MemoryDebugReporter;
}

const sameSource = (a: MemorySource, b: MemorySource) => a.kind === b.kind && a.id === b.id;
const sameHead = (a: MemoryHead, b: MemoryHead | null) =>
  b !== null && a.modifiedAt === b.modifiedAt && a.row.create_time === b.row.create_time;

export class MemoryWorker {
  private active?: { sources?: MemorySource[]; controller: AbortController };
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private ticking?: Promise<void>;
  private turns = 0;
  private reflectionRetryAt = 0;
  private readonly now: () => number;
  private phase: MemoryDebugPhase = "idle";
  private phaseStartedAt: number | null = null;
  private currentSources: MemoryDebugSource[] = [];

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

  debugState(): MemoryWorkerDebug {
    const now = this.now();
    const finite = (value: number) => (Number.isFinite(value) ? value : null);
    const { store } = this.options;
    return {
      phase: this.phase,
      startedAt: this.phaseStartedAt,
      sources: [...this.currentSources],
      scanning: this.scanning,
      running: this.running,
      nextSourceAt: store.nextDue(),
      nextReflectionAt: finite(this.reflectionDue(now)),
      nextReviewAt: finite(this.reviewDue(now)),
      lastReflectionAt: Number(store.meta("reflected-at")) || null,
      lastReviewAt: Number(store.meta("review-at")) || null,
      reviewCursor: store.meta("review-cursor") ? Number(store.meta("review-cursor")) : null,
    };
  }

  private report(
    message: string,
    contentChanged = false,
    level: "info" | "error" = "info",
    source?: MemoryDebugSource
  ) {
    this.options.progressed?.(
      { at: this.now(), area: "worker", level, message, source },
      contentChanged
    );
  }

  private progress(phase: MemoryDebugPhase, sources: MemoryDebugSource[] = [], message?: string) {
    if (phase === this.phase && !message && !sources.length && !this.currentSources.length) return;
    if (phase !== this.phase) this.phaseStartedAt = phase === "idle" ? null : this.now();
    this.phase = phase;
    this.currentSources = sources;
    this.report(message ?? "本批处理结束，等待下一次工作");
  }

  reconcile(kinds: readonly MemorySourceKind[] = SOURCE_KINDS, repeat = false, seed = false) {
    if (this.disposed) return;
    const { store, sources } = this.options;
    store.atomic(() => {
      for (const kind of kinds) {
        if (kind === "content") continue;
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
    this.report("已安排来源对账");
    this.wake();
  }

  changed(source: MemorySource, resetHistory = false) {
    if (this.disposed || source.kind === "content") return;
    this.options.sources.invalidate(source);
    this.options.store.mark(
      source,
      this.now() + (source.kind === "activity" || source.kind === "diary" ? QUIET_MS : 0),
      3
    );
    this.options.store.setMeta("dirty-at", String(this.now()));
    if (resetHistory) this.options.store.resetHistory(source);
    if (
      this.active &&
      (!this.active.sources || this.active.sources.some(item => sameSource(item, source)))
    )
      this.active.controller.abort();
    this.report("来源发生变化，已进入处理队列", true, "info", source);
    this.wake();
  }

  interrupt() {
    this.active?.controller.abort();
    this.clearTimer();
    if (this.active) this.report("后台任务已中断，等待恢复");
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
    const next = Math.min(
      pending ?? Infinity,
      expiry ?? Infinity,
      mayScan ? now : Infinity,
      this.reflectionDue(now),
      this.reviewDue(now),
      this.rhythmDue(now),
      this.portraitDue(now)
    );
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
      this.progress("idle");
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
      if (expiry !== null && expiry <= now) {
        store.expire(now);
        store.decayModels(now, PROFILE_DECAY_MS);
        this.report("已更新到期经历及依赖模型", true);
      }
      if (this.scanning && store.pendingCount(PAGE * 2) < PAGE * 2) this.scanPage();
      const historical = ++this.turns % 6 === 0;
      const jobs = store.due(now, Math.min(GROUP_SOURCES, maxJobs - index), historical);
      if (this.reviewDue(now) <= now && (!jobs.length || historical)) {
        await this.review(now);
        index++;
      } else if (this.reflectionDue(now) <= now && (!jobs.length || historical)) {
        await this.reflect(now, "reflect");
        index++;
      } else if (this.rhythmDue(now) <= now && (!jobs.length || historical)) {
        this.analyzeRhythm(now);
        index++;
      } else if (this.portraitDue(now) <= now && (!jobs.length || historical)) {
        await this.writePortrait(now);
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
    this.progress("scanning", [], `分页对账：${kind}`);
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
      this.report("来源已删除，已清理关联经历", true, "info", job);
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
    this.progress("reading", jobs, "正在读取来源片段");
    try {
      for (const job of jobs) {
        if (available < 3600 || input.length >= MAX_PARTS) break;
        visited++;
        try {
          const item = this.prepare(job, available, MAX_PARTS - input.length);
          if (!item) continue;
          work.push(item);
          const modeled = item.parts.filter(part => part.role === "user" || part.role === "diary");
          input.push(...modeled);
          available -= modeled.reduce((sum, part) => sum + part.text.length, 0);
        } catch {
          store.fail(job, this.now());
          this.report("读取来源失败，已安排自动重试", false, "error", job);
        }
      }
      this.active = { sources: work.map(item => item.job), controller };
      this.currentSources = work.map(item => ({
        kind: item.job.kind,
        id: item.job.id,
        title: safeMemoryText(item.parts[0]?.title ?? item.head.row.title, 90) ?? undefined,
      }));
      // 明确的事项状态独立提交，不受同批模型失败影响。
      for (const item of work) {
        if (
          item.job.kind === "todo" ||
          item.job.kind === "calendar" ||
          item.job.kind === "activity"
        )
          this.commit(
            item,
            item.parts
              .flatMap(part => deterministicRecord(part, this.now()))
              .map(candidate => ({ candidate, op: "add" as const }))
          );
      }
      const candidates = await this.extract(input, controller.signal);
      if (!this.canRun() || controller.signal.aborted) return Math.max(1, visited);
      const entries = await this.reconcileCandidates(candidates, controller.signal);
      if (!this.canRun() || controller.signal.aborted) return Math.max(1, visited);
      for (const item of work) {
        if (
          item.job.kind === "todo" ||
          item.job.kind === "calendar" ||
          item.job.kind === "activity"
        )
          continue;
        if (!sameHead(item.head, sources.head(item.job))) {
          this.changed(item.job);
          continue;
        }
        this.commit(
          item,
          entries.filter(entry => entry.candidate.evidence.some(ref => sameSource(ref, item.job)))
        );
        // chat 来源全部处理完毕时，生成或更新对话摘要
        if (
          item.job.kind === "chat" &&
          item.end >= item.snapshot.parts.length &&
          item.snapshot.parts.filter(p => p.role === "user").length >= 3
        )
          await this.summarizeChat(item, controller.signal);
      }
    } catch {
      if (this.canRun() && !controller.signal.aborted) {
        this.report("提炼模型调用或输出校验失败，已安排自动重试", false, "error");
        for (const item of work) {
          if (
            item.job.kind !== "todo" &&
            item.job.kind !== "calendar" &&
            item.job.kind !== "activity" &&
            store.progress(item.job)?.dueAt !== null
          )
            store.fail(item.job, this.now());
        }
      }
    } finally {
      if (this.active?.controller === controller) this.active = undefined;
      this.progress("idle");
    }
    return Math.max(1, visited);
  }

  private commit(item: SourceWork, candidates: ReconcileEntry[]) {
    const { store } = this.options;
    const { job, head, snapshot, continuing, end } = item;
    store.atomic(() => {
      if (!continuing) store.pruneEvidence(job, ref => snapshot.validate(ref) !== null);
      store.reconcile(candidates, this.now());
      store.checkpoint(
        job,
        head.modifiedAt,
        snapshot.parts[end - 1]?.next ?? null,
        end >= snapshot.parts.length,
        this.now()
      );
      if (candidates.length) store.setMeta("dirty-at", String(this.now()));
    });
    this.report(`已核对来源（${candidates.length} 条候选）`, true, "info", {
      kind: job.kind,
      id: job.id,
      title: safeMemoryText(item.parts[0]?.title ?? head.row.title, 90) ?? undefined,
    });
  }

  private async summarizeChat(item: SourceWork, signal: AbortSignal) {
    const { store } = this.options;
    const { job, snapshot, head } = item;
    if (!this.canRun() || signal.aborted) return;
    this.progress("extracting", [{ kind: job.kind, id: job.id }], "正在生成对话摘要");
    try {
      // 取最后 12 条用户+助手消息，控制 token 开销
      const messageParts = snapshot.parts
        .filter(p => p.role === "user" || p.role === "assistant")
        .slice(-12);
      const before = store.chatSummary(job);
      const pending = before.filter(item => item.kind === "intention" && item.state === "current");
      const input = JSON.stringify({
        previous: pending.map(({ id, text }) => ({ id, text })),
        messages: messageParts.map(p => ({
          role: p.role,
          text: p.text.slice(0, 600),
          date: new Date(p.observedAt).toISOString(),
        })),
      });
      const text = await this.options.complete(SESSION_SUMMARY_SYSTEM, input, signal, "extract");
      if (!this.canRun() || signal.aborted) return;
      const result = parseSessionSummary(
        text,
        pending.map(item => item.id)
      );
      if (!result) return;
      const now = this.now();
      const sessionTitle = safeMemoryText(head.row.title, 40) ?? "对话";
      const evidence = [
        { kind: job.kind, id: job.id, anchor: CHAT_SUMMARY_ANCHOR, quote: result.summary },
      ];
      const candidates: MemoryCandidate[] = [
        {
          kind: "event",
          topic: `对话摘要：${sessionTitle}`,
          text: result.summary,
          state: "current",
          observedAt: now,
          expiresAt: now + 90 * 86_400_000,
          evidence,
        },
        ...result.pendingItems.map(item => ({
          kind: "intention" as const,
          topic: `遗留：${item.slice(0, 60)}`,
          text: item,
          state: "current" as const,
          observedAt: now,
          expiresAt: now + 30 * 86_400_000,
          evidence,
        })),
      ];
      store.atomic(() => {
        // 同一对话只保留最新一版摘要；遗留事项按模型判定关闭，其余原样保留或强化。
        for (const item of before)
          if (item.kind === "event")
            store.removeEvidence(item.id, { kind: job.kind, id: job.id }, CHAT_SUMMARY_ANCHOR);
        for (const id of result.resolved) store.closeIntention(id, "done", now);
        for (const id of result.dropped) store.closeIntention(id, "dropped", now);
        store.apply(candidates, now);
        store.setMeta("dirty-at", String(now));
      });
      this.report(`已生成对话摘要（${result.pendingItems.length} 条遗留事项）`, true, "info", {
        kind: job.kind,
        id: job.id,
      });
    } catch {
      // 摘要生成失败不影响主流程
    }
  }

  private async extract(parts: MemoryPart[], signal: AbortSignal): Promise<MemoryCandidate[]> {
    if (!parts.length) return [];
    this.progress("extracting", this.currentSources, "正在调用模型提炼个人经历");
    const text = await this.options.complete(
      EXTRACT_SYSTEM + "\n每项加 part 字段，填写证据所在片段的数字编号。",
      JSON.stringify({
        parts: parts.map((part, index) => ({
          part: index,
          source: part.kind,
          role: part.role,
          text: part.text,
          date:
            part.kind === "diary"
              ? new Date(part.observedAt).toLocaleString("zh-CN")
              : new Date(part.observedAt).toISOString(),
        })),
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
      return part ? parseExtraction(JSON.stringify([item]), part) : [];
    });
    if (output.length && !candidates.length) throw new Error("记忆整理没有返回可核对的原文引用");
    return candidates;
  }

  /** 为每条候选分别召回相关经历（关键词 + 语义），按名次轮转合并，避免前几条候选占满名额。 */
  private async relatedTo(subjects: ReconcileSubject[], signal: AbortSignal) {
    const { store } = this.options;
    const queries = subjects.map(subject => ({
      query: `${subject.topic} ${subject.text}`.slice(0, 200),
      kind: subject.kind,
      state: "all" as const,
      limit: RELATED_EACH,
    }));
    let semantic: AssistantMemory[][] = [];
    try {
      semantic = (await this.options.related?.(queries)) ?? [];
    } catch {
      // 语义召回不可用时仍按关键词对账。
    }
    if (signal.aborted) return { memories: [], models: [] };
    // 本人自述可能关闭任意类别的目标，额外召回相关的未完成意图供 fulfill 判定。
    const ranked = subjects.map((subject, index) =>
      [
        ...store.related(queries[index].query, subject.kind, RELATED_EACH + 1),
        ...(semantic[index] ?? []),
        ...(subject.kind !== "intention" && subject.state === "current"
          ? store.openIntentions(queries[index].query, 2)
          : []),
      ].filter(item => item.id !== subject.id)
    );
    const found = new Map<number, AssistantMemory>();
    const depth = Math.max(0, ...ranked.map(list => list.length));
    for (let rank = 0; rank < depth && found.size < RELATED_LIMIT; rank++)
      for (const list of ranked) {
        const item = list[rank];
        if (item && found.size < RELATED_LIMIT) found.set(item.id, item);
      }
    const models = new Map<number, PersonalMemoryModel>();
    for (const { query } of queries)
      for (const model of store.searchModels({ layer: "all", query, limit: 2 }, this.now()))
        if (models.size < 8) models.set(model.id, model);
    return { memories: [...found.values()], models: [...models.values()] };
  }

  private async decide(subjects: ReconcileSubject[], signal: AbortSignal) {
    const { memories, models } = await this.relatedTo(subjects, signal);
    if (!memories.length || signal.aborted) return subjects.map(() => ({ op: "add" as const }));
    const text = await this.options.complete(
      RECONCILE_SYSTEM,
      reconcileInput(subjects, memories, models),
      signal,
      "reconcile"
    );
    return parseReconcile(text, subjects, memories);
  }

  private async reconcileCandidates(
    candidates: MemoryCandidate[],
    signal: AbortSignal
  ): Promise<ReconcileEntry[]> {
    if (!candidates.length) return [];
    this.progress("reconciling", this.currentSources, "正在与已有经历对账");
    const decisions = await this.decide(candidates, signal);
    return candidates.map((candidate, index) => ({ candidate, ...decisions[index] }));
  }

  /** 复核页内的经历与已有经历对账，归并重复、退役被推翻的认识；失败时不推进断点。 */
  private async reviewReconcile(page: AssistantMemory[], now: number): Promise<boolean> {
    const { store } = this.options;
    const subjects = page.flatMap(item => {
      const current = store.get(item.id);
      return current && !current.manual ? [current] : [];
    });
    if (!subjects.length) return true;
    const controller = new AbortController();
    this.active = { controller };
    this.progress("reconciling", [], `复核对账 ${subjects.length} 条经历`);
    try {
      for (let start = 0; start < subjects.length; start += REVIEW_CHUNK) {
        const chunk = subjects.slice(start, start + REVIEW_CHUNK);
        const decisions = await this.decide(chunk, controller.signal);
        if (!this.canRun() || controller.signal.aborted) return false;
        store.reconcileEpisodes(
          chunk.map((subject, index) => ({ subject, ...decisions[index] })),
          now
        );
      }
      store.setMeta("dirty-at", String(now));
      this.report(`复核对账完成（${subjects.length} 条经历）`, true);
      return true;
    } catch {
      if (!controller.signal.aborted) {
        this.reflectionRetryAt = now + REFLECTION_RETRY_MS;
        this.report("复核对账失败，将在约一小时后重试", false, "error");
      }
      return false;
    } finally {
      if (this.active?.controller === controller) this.active = undefined;
    }
  }

  private reflectionDue(now: number): number {
    const { store } = this.options;
    if (!store.hasMemories()) return Infinity;
    const dirtyAt = Number(store.meta("dirty-at") ?? 0);
    const last = Number(store.meta("reflected-at") ?? 0);
    if (!dirtyAt || dirtyAt <= last) return Infinity;
    return Math.max(
      dirtyAt + REFLECTION_QUIET_MS,
      last ? last + REFLECTION_INTERVAL_MS : 0,
      this.reflectionRetryAt,
      now
    );
  }

  private reviewDue(now: number): number {
    const { store } = this.options;
    if (!store.hasMemories()) return Infinity;
    if (store.meta("review-cursor")) return Math.max(now, this.reflectionRetryAt);
    const last = Number(store.meta("review-at") ?? 0);
    const dirtyAt = Number(store.meta("dirty-at") ?? 0);
    const due = last
      ? last + MEMORY_REVIEW_INTERVAL
      : dirtyAt
        ? dirtyAt + REFLECTION_QUIET_MS
        : Infinity;
    return Math.max(due, this.reflectionRetryAt);
  }

  private rhythmDue(now: number): number {
    if (!this.options.queryRhythm) return Infinity;
    const last = Number(this.options.store.meta("rhythm-at") ?? 0);
    return last ? last + RHYTHM_INTERVAL_MS : now;
  }

  private analyzeRhythm(now: number) {
    const { store } = this.options;
    const rhythm = this.options.queryRhythm?.();
    if (!rhythm) return;
    const peakDesc = rhythm.peakHours.length
      ? rhythm.peakHours
          .map(h => (h < 12 ? `上午${h}点` : h < 18 ? `下午${h - 12}点` : `晚上${h - 12}点`))
          .join("、")
      : null;
    const sessionDesc =
      rhythm.weekdayRatio > 0.8
        ? "主要在工作日活跃"
        : rhythm.weekdayRatio < 0.4
          ? "主要在周末活跃"
          : "工作日和周末都会使用";
    const text = [
      peakDesc ? `通常在 ${peakDesc} 最活跃` : null,
      sessionDesc,
      rhythm.activeDays > 0 ? `近30天有 ${rhythm.activeDays} 天使用记录` : null,
    ]
      .filter(Boolean)
      .join("，");
    if (!text) return;
    store.atomic(() => {
      store.upsertRhythmModel(RHYTHM_TOPIC, text, now, now + RHYTHM_INTERVAL_MS * 2);
      store.setMeta("rhythm-at", String(now));
    });
    this.report("节律分析完成", true);
  }

  private async review(now: number) {
    const { store, sources } = this.options;
    const cursor = Number(store.meta("review-cursor") || 0);
    this.progress("reviewing", [], `全面复核经历，当前断点 ${cursor}`);
    store.setMeta("review-cursor", String(cursor));
    const page = store.reviewPage(cursor, PAGE);
    store.atomic(() => {
      for (const item of page)
        store.pruneMemory(item.id, ref => {
          try {
            const head = sources.head(ref);
            return head !== null && sources.read(head).validate(ref) !== null;
          } catch {
            // 暂时未同步到的来源不等于已删除，召回时仍会隐藏不可核对的条目。
            return true;
          }
        });
      store.expire(now);
      store.expireModels(now);
    });
    if (!(await this.reviewReconcile(page, now))) return;
    if (page.length === PAGE) store.setMeta("review-cursor", String(page[page.length - 1].id));
    this.report(`已复核 ${page.length} 条经历`, true);
    if (
      page.length < PAGE &&
      (await this.reflect(now, "review")) &&
      (await this.mergeProfiles(now))
    ) {
      store.atomic(() => {
        store.setMeta("review-at", String(now));
        store.setMeta("review-cursor", "");
      });
      await this.writePortrait(now, true);
    }
  }

  /** 复核时合并换了说法的同一画像；失败不推进复核完成时间。 */
  private async mergeProfiles(now: number): Promise<boolean> {
    const { store } = this.options;
    const models = store.listModels(now, PROFILE_LIMIT, 0).filter(model => !isRhythmModel(model));
    if (models.length < 2) return true;
    const controller = new AbortController();
    this.active = { controller };
    this.progress("reviewing", [], `合并重复画像（${models.length} 条）`);
    try {
      const text = await this.options.complete(
        MERGE_SYSTEM,
        JSON.stringify({
          models: models.map(({ id, kind, topic, text, confidence }) => ({
            id,
            kind,
            topic,
            text,
            confidence,
          })),
        }),
        controller.signal,
        "review"
      );
      if (!this.canRun() || controller.signal.aborted) return false;
      // 等待期间被改写的画像不参与合并。
      const groups = parseMerge(text, models).filter(group =>
        [group.keep, ...group.merge].every(id => {
          const before = models.find(model => model.id === id);
          return before && store.getModel(id)?.text === before.text;
        })
      );
      const merged = store.mergeModels(groups);
      if (merged) this.report(`已合并 ${merged} 条重复画像`, true);
      return true;
    } catch {
      if (!controller.signal.aborted) {
        this.reflectionRetryAt = now + REFLECTION_RETRY_MS;
        this.report("画像合并失败，将在约一小时后重试", false, "error");
      }
      return false;
    } finally {
      if (this.active?.controller === controller) this.active = undefined;
    }
  }

  private portraitDue(now: number): number {
    const { store } = this.options;
    const stored = readPortrait(store.meta(PORTRAIT_META));
    const last = stored?.generatedAt ?? 0;
    const changes = Number(store.meta(PORTRAIT_CHANGES_META) ?? 0);
    if (changes < (stored ? PORTRAIT_CHANGES : 1)) return Infinity;
    return Math.max(last + (stored ? PORTRAIT_INTERVAL : 0), this.reflectionRetryAt, now);
  }

  /** 基于有效画像与近期状态生成用户总述；画像过少时清除旧总述。 */
  private async writePortrait(now: number, force = false): Promise<void> {
    const { store } = this.options;
    if (!force && this.portraitDue(now) > now) return;
    const models =
      this.options.validModels?.(now) ??
      store.listModels(now, PROFILE_LIMIT, STATE_LIMIT).filter(model => !isRhythmModel(model));
    if (models.filter(model => model.layer === "profile").length < PORTRAIT_MIN_PROFILES) {
      store.atomic(() => {
        store.setMeta(PORTRAIT_META, "");
        store.setMeta(PORTRAIT_CHANGES_META, "0");
      });
      return;
    }
    const controller = new AbortController();
    this.active = { controller };
    this.progress("reflecting", [], "正在生成用户总述");
    try {
      const text = await this.options.complete(
        PORTRAIT_SYSTEM,
        portraitInput(models),
        controller.signal,
        "reflect"
      );
      if (!this.canRun() || controller.signal.aborted) return;
      const portrait = parsePortrait(text, models, now);
      store.atomic(() => {
        if (portrait) store.setMeta(PORTRAIT_META, JSON.stringify(portrait));
        store.setMeta(PORTRAIT_CHANGES_META, "0");
      });
      this.report(portrait ? "用户总述已更新" : "用户总述依据不足，保留原版", true);
    } catch {
      if (!controller.signal.aborted) {
        this.reflectionRetryAt = now + REFLECTION_RETRY_MS;
        this.report("用户总述生成失败，将在约一小时后重试", false, "error");
      }
    } finally {
      if (this.active?.controller === controller) this.active = undefined;
      this.progress("idle");
    }
  }

  private async reflect(now: number, purpose: "reflect" | "review"): Promise<boolean> {
    const { store, sources } = this.options;
    const controller = new AbortController();
    this.active = { controller };
    this.progress(
      purpose === "review" ? "reviewing" : "reflecting",
      [],
      purpose === "review" ? "复核后重新归纳个人理解" : "正在归纳近期状态和长期画像"
    );
    try {
      let size = 0;
      const episodes = store
        .reflectionEpisodes()
        .map(item => resolveMemory(sources, item))
        .filter(item => isPersonalEpisode(item) && (item.manual || item.evidence.length))
        .filter(item => {
          const length = item.text.length + item.topic.length + 200;
          if (size + length > 20_000) return false;
          size += length;
          return true;
        });
      const previous = store
        .listModels(now, PROFILE_LIMIT, STATE_LIMIT)
        .filter(model => !isRhythmModel(model));
      if (!episodes.length) {
        store.expireModels(now);
        store.setMeta("reflected-at", String(now));
        this.report("归纳检查完成，目前没有可用的个人经历", true);
        return true;
      }
      const text = await this.options.complete(
        REFLECT_SYSTEM,
        JSON.stringify({
          now: new Date(now).toISOString(),
          previous,
          episodes: episodes.map(item => ({
            id: item.id,
            kind: item.kind,
            topic: item.topic,
            text: item.text,
            state: item.state,
            observedAt: item.observedAt,
            basis: isSelfDeclaration(item)
              ? "self-declaration"
              : item.evidence.every(ref => ref.kind === "activity")
                ? "activity"
                : "observation",
          })),
        }),
        controller.signal,
        purpose
      );
      if (!this.canRun() || controller.signal.aborted) return false;
      const reflection = parseReflection(text, episodes, previous, now);
      const valid = episodes.filter(item => {
        const current = store.get(item.id);
        return (
          current &&
          current.kind === item.kind &&
          current.topic === item.topic &&
          current.text === item.text &&
          current.state === item.state &&
          current.observedAt === item.observedAt &&
          (current.manual || resolveMemory(sources, current).evidence.length)
        );
      });
      const allowed = new Set(valid.map(item => item.id));
      store.atomic(() => {
        store.retireModels(
          reflection.retire
            .filter(item => {
              const before = previous.find(model => model.id === item.id);
              const current = store.getModel(item.id);
              return (
                before &&
                current &&
                before.text === current.text &&
                before.observedAt === current.observedAt &&
                item.episodeIds.every(id => allowed.has(id))
              );
            })
            .map(item => item.id)
        );
        store.applyModels(
          reflection.models.filter(item => item.episodeIds.every(id => allowed.has(id))),
          new Map(episodes.map(item => [item.id, item])),
          now
        );
        store.expireModels(now);
        store.setMeta("reflected-at", String(now));
      });
      this.reflectionRetryAt = 0;
      this.report("个人理解归纳检查完成", true);
      return true;
    } catch {
      if (!controller.signal.aborted) {
        this.reflectionRetryAt = now + REFLECTION_RETRY_MS;
        this.report("归纳模型调用或输出校验失败，将在约一小时后重试", false, "error");
      }
      return false;
    } finally {
      if (this.active?.controller === controller) this.active = undefined;
      this.progress("idle");
    }
  }
}
