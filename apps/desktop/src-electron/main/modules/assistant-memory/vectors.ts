import type { AssistantMemory, MemorySearch } from "@/types/assistant-memory";
import type { ResolvedEmbeddingConfig } from "../../utils/embedding-config";
import type { MemoryStore } from "./store";
import type { MemoryDebugReporter, MemoryVectorDebug } from "@/types/assistant-memory-debug";

const BATCH_SIZE = 8;
const READY_RETRY_MS = 30_000;
const QUERY_TIMEOUT_MS = 3000;

export interface MemoryVectorOptions {
  progressed?: MemoryDebugReporter;
  store: MemoryStore;
  allowed: () => boolean;
  busy: () => boolean;
  ready: (config: ResolvedEmbeddingConfig) => boolean;
  embed: (
    config: ResolvedEmbeddingConfig,
    texts: string[],
    interactive: boolean,
    signal: AbortSignal
  ) => Promise<number[][]>;
}

export class MemoryVectorIndex {
  private config: ResolvedEmbeddingConfig | null = null;
  private prepared: string | null = null;
  private generation = 0;
  private disposed = false;
  private failures = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private indexing?: Promise<void>;
  private active?: AbortController;
  private queries = new Set<AbortController>();
  private startedAt: number | null = null;
  private retryAt: number | null = null;

  constructor(private readonly options: MemoryVectorOptions) {}

  debugState(): MemoryVectorDebug {
    let ready = false;
    try {
      ready = this.config !== null && this.options.ready(this.config);
    } catch {
      /* 模型未就绪不影响只读诊断。 */
    }
    return {
      configured: this.config !== null,
      model: this.config?.model ?? null,
      ready,
      running: this.indexing !== undefined,
      startedAt: this.startedAt,
      retryAt: this.retryAt,
      failures: this.failures,
    };
  }

  private report(message: string, contentChanged = false, level: "info" | "error" = "info") {
    this.options.progressed?.({ at: Date.now(), area: "vectors", level, message }, contentChanged);
  }

  configure(config: ResolvedEmbeddingConfig | null) {
    const next = config?.provider === "local" ? config : null;
    if (next?.fingerprint === this.config?.fingerprint) {
      this.wake();
      return;
    }
    this.interrupt();
    for (const query of this.queries) query.abort();
    this.generation++;
    this.config = next;
    this.prepared = null;
    this.report(next ? "本地向量配置已更新" : "未选用本地嵌入，保留关键词召回", true);
    this.wake();
  }

  interrupt() {
    this.clearTimer();
    this.active?.abort();
    if (this.active) this.report("后台嵌入已中断，等待恢复");
  }

  close() {
    this.disposed = true;
    this.generation++;
    this.interrupt();
    for (const query of this.queries) query.abort();
  }

  wake() {
    this.failures = 0;
    this.schedule();
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private allowed() {
    return !this.disposed && this.config !== null && this.options.allowed();
  }

  private schedule(delay = 20) {
    if (!this.allowed() || this.options.busy() || this.indexing) return;
    this.clearTimer();
    this.retryAt = delay > 20 ? Date.now() + delay : null;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.runBatch();
    }, delay);
    this.timer.unref();
  }

  private prepare(config: ResolvedEmbeddingConfig) {
    if (this.prepared === config.fingerprint) return;
    this.options.store.prepareEmbeddings(config.fingerprint, config.dimensions);
    this.prepared = config.fingerprint;
  }

  runBatch(): Promise<void> {
    if (this.indexing) return this.indexing;
    if (!this.allowed() || this.options.busy() || !this.config) return Promise.resolve();
    this.clearTimer();
    this.startedAt = Date.now();
    this.retryAt = null;
    this.report("正在准备本地向量索引");
    const config = this.config;
    const generation = this.generation;
    const controller = new AbortController();
    this.active = controller;
    let nextDelay: number | undefined;
    this.indexing = (async () => {
      try {
        if (!this.options.ready(config)) {
          nextDelay = READY_RETRY_MS;
          this.report("本地嵌入模型未就绪，等待后续重试");
          return;
        }
        this.prepare(config);
        const documents = this.options.store.pendingEmbeddings(BATCH_SIZE);
        if (!documents.length) return;
        this.report(`正在嵌入 ${documents.length} 条个人经历`);
        const embeddings = await this.options.embed(
          config,
          documents.map(document => document.input),
          false,
          controller.signal
        );
        if (
          controller.signal.aborted ||
          generation !== this.generation ||
          !this.allowed() ||
          this.options.busy()
        )
          return;
        this.options.store.writeEmbeddings(
          documents,
          embeddings,
          config.fingerprint,
          config.dimensions
        );
        this.failures = 0;
        this.report(`已核对 ${documents.length} 条经历的向量索引`, true);
        if (this.options.store.pendingEmbeddings(1).length) nextDelay = 20;
      } catch {
        if (!controller.signal.aborted)
          this.report("嵌入失败，正在退避或等待下次变化重试", false, "error");
        if (!controller.signal.aborted && ++this.failures < 3)
          nextDelay = 2000 * 2 ** this.failures;
      }
    })().finally(() => {
      this.indexing = undefined;
      this.startedAt = null;
      if (this.active === controller) this.active = undefined;
      if (controller.signal.aborted) this.schedule();
      else if (nextDelay !== undefined) this.schedule(nextDelay);
      this.report("本批向量任务结束");
    });
    return this.indexing;
  }

  async search(params: MemorySearch): Promise<AssistantMemory[]> {
    const query = params.query?.trim();
    const config = this.config;
    if (!query || !config || !this.allowed()) return [];
    const generation = this.generation;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    this.queries.add(controller);
    try {
      if (!this.options.ready(config)) return [];
      this.prepare(config);
      if (!this.options.store.hasEmbeddings(config.fingerprint)) return [];
      const embeddings = await Promise.race([
        this.options.embed(config, [query], true, controller.signal),
        new Promise<null>(resolve => {
          timer = setTimeout(() => resolve(null), QUERY_TIMEOUT_MS);
          timer.unref();
        }),
      ]);
      if (
        !embeddings ||
        controller.signal.aborted ||
        generation !== this.generation ||
        !this.allowed()
      )
        return [];
      const vector = embeddings[0];
      if (vector?.length !== config.dimensions || !vector.every(Number.isFinite)) return [];
      return this.options.store.searchEmbeddings(
        vector,
        params,
        config.fingerprint,
        config.distance
      );
    } catch {
      return [];
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort();
      this.queries.delete(controller);
    }
  }
}
