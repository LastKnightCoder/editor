import type {
  AssistantMemory,
  MemorySearch,
  MemorySearchResult,
  PersonalMemoryModel,
} from "@/types/assistant-memory";
import { reciprocalRankFusion } from "../search-core/rrf";
import { DEFAULT_SEARCH_CORE_CONFIG, type SearchCandidate } from "../search-core/types";
import type { MemorySourcesPort } from "./sources";
import type { MemoryStore } from "./store";
import { isPersonalEpisode } from "./reflection";

export function resolveMemory(sources: MemorySourcesPort, item: AssistantMemory): AssistantMemory {
  const evidence = item.evidence.flatMap(ref => {
    try {
      const head = sources.head(ref);
      const resolved = head && sources.read(head).validate(ref);
      return resolved ? [resolved] : [];
    } catch {
      return [];
    }
  });
  return { ...item, evidence };
}

interface MemoryRetrievalOptions {
  store: MemoryStore;
  sources: MemorySourcesPort;
  vectors?: { search(params: MemorySearch): Promise<AssistantMemory[]> };
  now?: () => number;
}

const emptyResult = (): MemorySearchResult => ({
  models: [],
  memories: [],
  sources: [],
  nextBefore: null,
});

export class MemoryRetrieval {
  private disposed = false;
  private readonly now: () => number;

  constructor(private readonly options: MemoryRetrievalOptions) {
    this.now = options.now ?? Date.now;
  }

  close() {
    this.disposed = true;
  }

  get(id: number): AssistantMemory | null {
    if (this.disposed) return null;
    this.options.store.expire(this.now());
    const item = this.options.store.get(id);
    if (!item || !isPersonalEpisode(item)) return null;
    const resolved = resolveMemory(this.options.sources, item);
    return resolved.manual || resolved.evidence.length ? resolved : null;
  }

  search(params: MemorySearch, includeSources = false): MemorySearchResult {
    return this.collect(params, includeSources);
  }

  getModel(id: number) {
    if (this.disposed) return null;
    const model = this.options.store.getModel(id);
    if (!model || !this.validModel(model)) return null;
    return {
      model,
      episodes: model.episodeIds.flatMap(id => {
        const item = this.get(id);
        return item ? [item] : [];
      }),
    };
  }

  private validModel(model: PersonalMemoryModel) {
    if (model.expiresAt !== null && model.expiresAt <= this.now()) return false;
    const supported =
      model.episodeIds.length > 0 &&
      model.episodeIds.every(id => {
        const item = this.get(id);
        return item && (model.layer !== "profile" || item.state !== "history");
      });
    const current = this.options.store.getModel(model.id);
    return supported && current?.text === model.text && current.observedAt === model.observedAt;
  }

  brief(query?: string): {
    profile: PersonalMemoryModel[];
    recent: PersonalMemoryModel[];
    recentSessions: Array<{ topic: string; text: string; observedAt: number }>;
    currentMood: { text: string; observedAt: number } | null;
  } {
    if (this.disposed) return { profile: [], recent: [], recentSessions: [], currentMood: null };
    const now = this.now();
    // dirty-at 比最后一次 reflection 新超过 5 分钟，说明有新 episode 待归纳，state model 可能过时
    const dirtyAt = Number(this.options.store.meta("dirty-at") ?? 0);
    const reflectedAt = Number(this.options.store.meta("reflected-at") ?? 0);
    const stateStale = dirtyAt > reflectedAt && now - reflectedAt > 5 * 60_000;
    const select = (layer: "profile" | "state", budget: number) => {
      let remaining = budget;
      // 有 query 时按相关性排序（searchModels 内部用 instr 打分），无 query 时退回 observed_at DESC
      return (
        this.options.store
          .searchModels({ layer, limit: 20, query }, now)
          .filter(model => this.validModel(model))
          .filter(model => layer !== "profile" || model.confidence !== "observation")
          // state model 在 reflection 尚未追上新数据时不注入，避免向 AI 提供过时状态
          .filter(() => layer !== "state" || !stateStale)
          .filter(model => {
            const size = model.topic.length + model.text.length;
            if (size > remaining) return false;
            remaining -= size;
            return true;
          })
          .slice(0, 6)
      );
    };
    // 最近 3 条对话摘要（kind=event，topic 以"对话摘要："开头）
    const recentSessions = this.options.store
      .search({ query: "对话摘要：", kind: "event", state: "current", limit: 6 }, false)
      .filter(item => item.topic.startsWith("对话摘要："))
      .sort((a, b) => b.observedAt - a.observedAt)
      .slice(0, 3)
      .map(({ topic, text, observedAt }) => ({ topic, text, observedAt }));
    // 当天有效的当下状态（4小时内，kind=event，topic="当下状态"）
    const currentMoodItem = this.options.store
      .search({ kind: "event", state: "current", limit: 6 }, false)
      .find(item => item.topic === "当下状态" && now - item.observedAt < 4 * 3_600_000);
    const currentMood = currentMoodItem
      ? { text: currentMoodItem.text, observedAt: currentMoodItem.observedAt }
      : null;
    return {
      profile: select("profile", 1200),
      recent: select("state", 1400),
      recentSessions,
      currentMood,
    };
  }

  async recall(params: MemorySearch): Promise<MemorySearchResult> {
    if (this.disposed) return emptyResult();
    this.options.store.expire(this.now());
    let semantic: AssistantMemory[] = [];
    try {
      semantic =
        (await this.options.vectors?.search({
          ...params,
          limit: Math.min((params.limit ?? 12) * 2, 100),
        })) ?? [];
    } catch {
      // 语义召回不可用时，仍交付关键词和原文检索结果。
    }
    if (this.disposed) return emptyResult();
    const result = this.collect({ ...params, layer: params.layer ?? "overview" }, true, semantic);
    return result;
  }

  private collect(
    params: MemorySearch,
    includeSources: boolean,
    semantic: AssistantMemory[] = []
  ): MemorySearchResult {
    if (this.disposed) return emptyResult();
    const { store, sources } = this.options;
    store.expire(this.now());
    const limit = params.limit ?? 12;
    const candidateLimit = Math.min(limit * 2, 100);
    const lexical = store.search({ ...params, limit: candidateLimit }, includeSources);
    const candidate = (
      item: AssistantMemory,
      source: "fts" | "vec"
    ): SearchCandidate<AssistantMemory> => ({
      dedupeKey: String(item.id),
      source,
      payload: item,
      text: item.text,
    });
    const rows = semantic.length
      ? reciprocalRankFusion(
          [
            lexical.map(item => candidate(item, "fts")),
            semantic.map(item => candidate(item, "vec")),
          ],
          [1, 1],
          { k: DEFAULT_SEARCH_CORE_CONFIG.rrfK, topBonus: { top1: 0, top2To3: 0 } }
        ).map(item => item.payload)
      : lexical;
    const memories: AssistantMemory[] = [];
    let scanned = 0;
    for (const row of rows) {
      scanned++;
      const current = store.get(row.id);
      if (
        !current ||
        !isPersonalEpisode(current) ||
        current.kind !== row.kind ||
        current.topic !== row.topic ||
        current.text !== row.text ||
        (params.kind && current.kind !== params.kind) ||
        (params.state && params.state !== "all" && current.state !== params.state) ||
        (params.from !== undefined && current.observedAt < params.from) ||
        (params.to !== undefined && current.observedAt > params.to) ||
        (params.before !== undefined && current.id >= params.before)
      )
        continue;
      const item = resolveMemory(sources, current);
      if (item.manual || item.evidence.length) memories.push(item);
      if (memories.length >= limit) break;
    }
    const layer = params.layer ?? "episode";
    const exposeEpisodes = layer === "episode" || layer === "all";
    const models =
      layer === "episode"
        ? []
        : store
            .searchModels(
              params,
              this.now(),
              memories.map(item => item.id)
            )
            .filter(model => this.validModel(model));
    return {
      models,
      ...(!exposeEpisodes && memories.length
        ? {
            episodeHints: memories.map(({ id, kind, topic, observedAt }) => ({
              id,
              kind,
              topic,
              observedAt,
            })),
          }
        : {}),
      memories: exposeEpisodes ? memories : [],
      sources:
        includeSources && exposeEpisodes
          ? memories.flatMap(item => item.evidence).slice(0, Math.min(6, limit))
          : [],
      nextBefore:
        exposeEpisodes &&
        !semantic.length &&
        scanned > 0 &&
        (scanned < rows.length || rows.length >= candidateLimit)
          ? rows[scanned - 1].id
          : null,
    };
  }
}
