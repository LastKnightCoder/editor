import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { MemoryEvidence, MemorySource, MemorySourceKind } from "@/types/assistant-memory";
import { parseExtraction, type MemoryCandidate, type MemoryPart } from "../extraction";
import type { MemoryHead, MemorySnapshot, MemorySourcesPort } from "../sources";
import { MemoryStore, openMemoryStoreForLibrary } from "../store";
import { MemoryWorker, type MemoryWorkerOptions } from "../worker";
import { MemoryRetrieval } from "../retrieval";
import { MemoryVectorIndex, type MemoryVectorOptions } from "../vectors";
import type { ResolvedEmbeddingConfig } from "../../../utils/embedding-config";

function present<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("缺少测试资料");
  return value;
}

const START = Date.UTC(2026, 10, 6, 12);
const key = (source: MemorySource) => source.kind + ":" + source.id;

class Sources implements MemorySourcesPort {
  private data = new Map<string, { head: MemoryHead; parts: MemoryPart[] }>();
  maxPage = 0;
  reads = 0;

  put(kind: MemorySourceKind, id: string, at: number, texts: string[]) {
    const source = { kind, id };
    const head: MemoryHead = {
      ...source,
      modifiedAt: at,
      row: { id, create_time: START, update_time: at },
    };
    const parts = texts.map((text, index): MemoryPart => ({
      ...source,
      text,
      quote: "",
      anchor: "段" + index + ":0",
      next: "段" + index + ":0",
      observedAt: at,
      role:
        kind === "todo" || kind === "calendar"
          ? "record"
          : kind === "chat"
            ? "user"
            : kind === "activity"
              ? "activity"
              : "document",
      title: text,
      current: kind === "todo" ? "待办" : undefined,
    }));
    this.data.set(key(source), { head, parts });
    return source;
  }
  drop(source: MemorySource) {
    this.data.delete(key(source));
  }
  list(kind: MemorySourceKind, after: string, limit: number) {
    this.maxPage = Math.max(this.maxPage, limit);
    const start = Number(after || 0);
    const rows: MemoryHead[] = [];
    for (let id = start + 1; rows.length < limit && id <= 25_000; id++) {
      const head = this.data.get(kind + ":" + id)?.head;
      if (head) rows.push(head);
    }
    return rows;
  }
  recent(kind: MemorySourceKind, limit: number) {
    return [...this.data.values()]
      .filter(item => item.head.kind === kind)
      .slice(-limit)
      .map(item => item.head);
  }
  head(source: MemorySource) {
    return this.data.get(key(source))?.head ?? null;
  }
  read(head: MemoryHead): MemorySnapshot {
    this.reads++;
    const parts = present(this.data.get(key(head))).parts;
    return {
      parts,
      validate: (ref: MemoryEvidence) =>
        parts.some(part => part.anchor === ref.anchor && part.text.includes(ref.quote))
          ? { ...ref, title: parts[0]?.title }
          : null,
    };
  }
  invalidate() {
    /* 测试来源没有缓存。 */
  }
}

function extraction(input: string) {
  const parsed = JSON.parse(input) as {
    parts: Array<{ part: number; role: string; text: string }>;
  };
  return JSON.stringify(
    parsed.parts.map(({ part, role, text }) => ({
      subject: "user",
      temporal: "current",
      part,
      kind: role === "user" ? "preference" : "fact",
      topic: text,
      text,
      quote: text,
      certainty: "explicit",
    }))
  );
}

function setup() {
  const temp = mkdtempSync(join(tmpdir(), "tau-assistant-memory-"));
  const file = join(temp, "memory.sqlite");
  const sources = new Sources();
  let store = new MemoryStore(file);
  let now = START;
  let busy = false;
  let calls = 0;
  let maxInput = 0;
  let complete: MemoryWorkerOptions["complete"] = async (_system, input, _signal, purpose) => {
    if (purpose !== "extract") return JSON.stringify({ models: [], merge: [], retire: [] });
    calls++;
    maxInput = Math.max(maxInput, input.length);
    return extraction(input);
  };
  function createWorker() {
    return new MemoryWorker({
      sources,
      store,
      now: () => now,
      allowed: () => true,
      busy: () => busy,
      complete: (...args) => complete(...args),
    });
  }
  let worker = createWorker();
  let retrieval = new MemoryRetrieval({ store, sources, now: () => now });
  return {
    sources,
    get store() {
      return store;
    },
    get worker() {
      return worker;
    },
    get retrieval() {
      return retrieval;
    },
    get calls() {
      return calls;
    },
    get maxInput() {
      return maxInput;
    },
    advance(ms: number) {
      now += ms;
    },
    complete(fn: MemoryWorkerOptions["complete"]) {
      complete = fn;
    },
    busy(value: boolean) {
      busy = value;
      if (value) worker.interrupt();
    },
    async drain() {
      for (let turns = 0; turns < 800 && (worker.scanning || store.next(now)); turns++)
        await worker.runBatch(160);
      expect(worker.scanning).toBe(false);
      expect(store.next(now)).toBeUndefined();
    },
    reopen() {
      worker.close();
      retrieval.close();
      store.close();
      store = new MemoryStore(file);
      worker = createWorker();
      retrieval = new MemoryRetrieval({ store, sources, now: () => now });
    },
    close() {
      worker.close();
      retrieval.close();
      store.close();
      rmSync(temp, { recursive: true, force: true });
    },
  };
}

const vectorConfig: ResolvedEmbeddingConfig = {
  provider: "local",
  model: "memory-test",
  dimensions: 3,
  distance: 0.4,
  devicePolicy: "cpu",
  batchSize: 8,
  fingerprint: "memory-model-a",
};

function remember(
  fixture: ReturnType<typeof setup>,
  id: string,
  text: string,
  fields: Partial<Pick<MemoryCandidate, "state" | "kind" | "expiresAt">> = {}
) {
  const source = fixture.sources.put("chat", id, START, [text]);
  const part = fixture.sources.read(present(fixture.sources.head(source))).parts[0];
  fixture.store.apply(
    [
      {
        kind: "preference",
        state: "current",
        topic: text,
        text,
        observedAt: START,
        evidence: [{ ...source, anchor: part.anchor, quote: text }],
        ...fields,
      },
    ],
    START
  );
  return present(fixture.store.search({ state: "all", limit: 1 })[0]);
}

function createVectors(
  fixture: ReturnType<typeof setup>,
  embed: MemoryVectorOptions["embed"] = async (_config, texts) =>
    texts.map(text => (/写作|创作|通知/.test(text) ? [1, 0, 0] : [0, 1, 0]))
) {
  const vectors = new MemoryVectorIndex({
    store: fixture.store,
    allowed: () => true,
    busy: () => false,
    ready: () => true,
    embed,
  });
  vectors.configure(vectorConfig);
  return vectors;
}

describe("个人助手记忆", () => {
  it("真实向量跨措辞召回并去重，状态、类型、时间和原文证据仍限制结果", async () => {
    const f = setup();
    const current = remember(f, "1", "写作时关闭所有通知");
    remember(f, "2", "使用中文标题");
    remember(f, "3", "创作期间不接收消息", { state: "history" });
    remember(f, "4", "创作计划已经确定", { kind: "fact" });
    remember(f, "5", "创作休息时间", { expiresAt: START - 1 });
    const vectors = createVectors(f);
    const retrieval = new MemoryRetrieval({
      store: f.store,
      sources: f.sources,
      vectors,
      now: () => START,
    });
    try {
      await vectors.runBatch();
      const query = {
        query: "专注创作",
        state: "current",
        kind: "preference",
        layer: "episode",
      } as const;
      expect(f.retrieval.search(query).memories).toEqual([]);
      expect((await retrieval.recall(query)).memories.map(item => item.id)).toEqual([current.id]);
      expect(
        (await retrieval.recall({ ...query, query: "通知" })).memories.map(item => item.id)
      ).toEqual([current.id]);
      expect((await retrieval.recall({ ...query, from: START + 1 })).memories).toEqual([]);
      expect((await retrieval.recall({ ...query, to: START - 1 })).memories).toEqual([]);
      f.sources.drop({ kind: "chat", id: "1" });
      expect((await retrieval.recall(query)).memories).toEqual([]);
    } finally {
      retrieval.close();
      vectors.close();
      f.close();
    }
  });

  it("更正和遗忘使旧向量失效，重启保留可用向量，换模型只重建派生索引", () => {
    const f = setup();
    try {
      const item = remember(f, "1", "写作时关闭所有通知");
      f.store.prepareEmbeddings("a", 3);
      const original = f.store.pendingEmbeddings(8);
      f.store.writeEmbeddings(original, [[1, 0, 0]], "a", 3);
      expect(f.store.searchEmbeddings([1, 0, 0], {}, "a", 0.4)).toHaveLength(1);
      f.store.correct(
        item.id,
        {
          kind: "preference",
          topic: "写作",
          text: "写作时保留重要通知",
          state: "current",
        },
        START + 1
      );
      f.store.writeEmbeddings(original, [[1, 0, 0]], "a", 3);
      expect(f.store.searchEmbeddings([1, 0, 0], {}, "a", 0.4)).toEqual([]);
      f.store.writeEmbeddings(f.store.pendingEmbeddings(8), [[1, 0, 0]], "a", 3);
      f.reopen();
      f.store.prepareEmbeddings("a", 3);
      expect(f.store.pendingEmbeddings(1)).toEqual([]);
      expect(f.store.searchEmbeddings([1, 0, 0], {}, "a", 0.4)[0]?.text).toBe("写作时保留重要通知");
      f.reopen();
      expect(f.store.forget(item.id)).toBe(true);
      f.store.prepareEmbeddings("a", 3);
      expect(f.store.searchEmbeddings([1, 0, 0], {}, "a", 0.4)).toEqual([]);
      const next = remember(f, "2", "使用中文标题");
      f.store.writeEmbeddings(f.store.pendingEmbeddings(8), [[0, 1, 0]], "a", 3);
      f.store.prepareEmbeddings("b", 4);
      expect(f.store.get(next.id)?.text).toBe(next.text);
      expect(f.store.hasEmbeddings("a")).toBe(false);
      expect(f.store.pendingEmbeddings(8).map(document => document.id)).toEqual([next.id]);
      f.store.writeEmbeddings(f.store.pendingEmbeddings(8), [[0, 1, 0]], "a", 3);
      expect(f.store.hasEmbeddings("b")).toBe(false);
      f.store.writeEmbeddings(f.store.pendingEmbeddings(8), [[0, 1, 0, 0]], "b", 4);
      expect(f.store.searchEmbeddings([0, 1, 0, 0], {}, "b", 0.4)[0]?.id).toBe(next.id);
    } finally {
      f.close();
    }
  });

  it("后台嵌入等待期间换模型或关闭资料库，不接收迟到结果", async () => {
    const f = setup();
    remember(f, "1", "写作时关闭所有通知");
    let release: ((vectors: number[][]) => void) | undefined;
    let blocked = true;
    const vectors = createVectors(f, async (_config, texts) =>
      blocked
        ? new Promise(resolve => {
            release = resolve;
          })
        : texts.map(() => [1, 0, 0])
    );
    try {
      const indexing = vectors.runBatch();
      vectors.configure({ ...vectorConfig, fingerprint: "memory-model-b" });
      present(release)([[1, 0, 0]]);
      await indexing;
      expect(f.store.hasEmbeddings(vectorConfig.fingerprint)).toBe(false);
      blocked = false;
      await vectors.runBatch();
      expect(f.store.hasEmbeddings("memory-model-b")).toBe(true);
      remember(f, "2", "写作使用中文标题");
      blocked = true;
      const closing = vectors.runBatch();
      vectors.close();
      f.reopen();
      present(release)([[1, 0, 0]]);
      await closing;
      expect(f.store.pendingEmbeddings(8)).toHaveLength(1);
    } finally {
      vectors.close();
      f.close();
    }
  });

  it("语义查询超时仍返回关键词结果，关闭的召回不再读取旧资料库", async () => {
    const f = setup();
    const item = remember(f, "1", "写作时关闭所有通知");
    let release: ((vectors: number[][]) => void) | undefined;
    const vectors = createVectors(f, async (_config, texts, interactive) =>
      interactive
        ? new Promise(resolve => {
            release = resolve;
          })
        : texts.map(() => [1, 0, 0])
    );
    const retrieval = new MemoryRetrieval({
      store: f.store,
      sources: f.sources,
      vectors,
      now: () => START,
    });
    try {
      await vectors.runBatch();
      expect(
        (await retrieval.recall({ query: "写作", state: "current", layer: "episode" })).memories[0]
          ?.id
      ).toBe(item.id);
      const closing = retrieval.recall({ query: "写作" });
      retrieval.close();
      vectors.close();
      f.reopen();
      present(release)([[1, 0, 0]]);
      expect(await closing).toEqual({ models: [], memories: [], sources: [], nextBefore: null });
    } finally {
      retrieval.close();
      vectors.close();
      f.close();
    }
  });

  it("分页补录 23,000 个来源，重启续跑且对账不重复调用模型", async () => {
    const f = setup();
    const started = performance.now();
    try {
      const count = 23_000;
      for (let id = 1; id <= count; id++)
        f.sources.put(
          id <= 20_000 ? "chat" : id <= 22_000 ? "activity" : "todo",
          String(id),
          START,
          [`项目条目 ${id} 已确认`]
        );
      f.worker.reconcile(undefined, false, true);
      await f.worker.runBatch(80);
      const partial = f.store.counts().checked;
      expect(partial).toBeGreaterThan(0);
      expect(partial).toBeLessThan(count);
      f.reopen();
      await f.drain();
      expect(f.store.counts()).toEqual({ checked: count, pending: 0, failed: 0 });
      const initialCalls = f.calls;
      expect(initialCalls).toBeLessThan(5_000);
      expect(f.sources.maxPage).toBeLessThanOrEqual(48);
      expect(f.maxInput).toBeLessThan(15_000);
      expect(f.retrieval.search({ query: "12937", limit: 5 }, false).memories[0]?.text).toBe(
        "项目条目 12937 已确认"
      );

      f.worker.reconcile(undefined, false, true);
      await f.drain();
      expect(f.calls).toBe(initialCalls);
      for (let id = 1; id <= 700; id++) {
        const ref = f.sources.put("chat", String(id), START + 20, [`文档修订 ${id} 已确认`]);
        f.worker.changed(ref);
        f.worker.changed(ref);
      }
      f.advance(2000);
      await f.drain();
      expect(f.calls - initialCalls).toBeLessThan(130);
      expect(
        f.retrieval.search({ query: "文档修订 37", limit: 8 }, false).memories.length
      ).toBeGreaterThan(0);
      expect(f.store.counts()).toEqual({ checked: count, pending: 0, failed: 0 });
      console.log(
        `[assistant-memory] 23000 个来源 + 1400 次编辑通知，${(performance.now() - started).toFixed(0)} ms，${f.calls} 次模型桩调用`
      );
    } finally {
      f.close();
    }
  }, 120_000);

  it("来源变化、前台忙碌和删除都能阻断迟到提交", async () => {
    const f = setup();
    try {
      let release!: (text: string) => void;
      let pendingInput = "";
      f.complete(async (_system, input) => {
        pendingInput = input;
        return new Promise(resolve => {
          release = resolve;
        });
      });
      const source = f.sources.put("chat", "1", START, ["旧稿：周五评审"]);
      f.worker.changed(source);
      f.advance(2000);
      const run = f.worker.runBatch(1);
      expect(pendingInput).toContain("周五");
      f.sources.put("chat", "1", START + 1, ["新稿：周二评审"]);
      f.worker.changed(source);
      release(extraction(pendingInput));
      await run;
      expect(f.store.search({})).toEqual([]);
      f.complete(async (_system, input) => extraction(input));
      f.advance(2000);
      f.busy(true);
      await f.worker.runBatch();
      expect(f.store.counts().pending).toBe(1);
      f.busy(false);
      await f.drain();
      const memory = f.retrieval.search({ query: "周二" }, false).memories[0];
      expect(memory?.text).toContain("周二");
      expect(memory?.evidence[0].quote).toContain("周二");

      f.complete(async (_system, input) => {
        pendingInput = input;
        return new Promise(resolve => {
          release = resolve;
        });
      });
      f.sources.put("chat", "1", START + 2, ["第三稿：周三评审"]);
      f.worker.changed(source);
      f.advance(2000);
      const deleting = f.worker.runBatch(1);
      f.sources.drop(source);
      f.worker.changed(source);
      release(extraction(pendingInput));
      await deleting;
      f.advance(2000);
      await f.drain();
      expect(f.retrieval.get(memory.id)).toBeNull();
      expect(f.store.search({})).toEqual([]);
    } finally {
      f.close();
    }
  });

  it("长会话断点、追加、更正、分支和遗忘在重启后仍一致", async () => {
    const f = setup();
    try {
      const initial = Array.from({ length: 19 }, (_, index) => `我在评审场合有明确偏好 ${index}`);
      const source = f.sources.put("chat", "1", START, initial);
      f.worker.changed(source);
      await f.worker.runBatch(1);
      expect(f.store.progress(source)?.cursor).toBe("段7:0");
      f.reopen();
      await f.drain();
      expect(f.calls).toBe(3);
      expect(f.store.progress(source)?.checkedCursor).toBe("段18:0");

      f.sources.put("chat", "1", START + 1, [...initial, "我更喜欢结构图"]);
      f.worker.changed(source);
      await f.drain();
      expect(f.calls).toBe(4);
      const item = f.retrieval.search({ query: "结构图" }, true).memories[0];
      expect(item.text).toBe("我更喜欢结构图");
      f.store.correct(
        item.id,
        { kind: "preference", state: "current", topic: "图示", text: "评审时更喜欢流程图" },
        START + 5
      );
      expect(f.retrieval.get(item.id)?.manual).toBe(true);
      expect(f.store.forget(item.id)).toBe(true);
      f.reopen();
      f.worker.changed(source, true);
      await f.drain();
      expect(f.retrieval.search({ query: "结构图" }, true)).toMatchObject({
        memories: [],
        sources: [],
      });

      f.sources.put("chat", "1", START + 2, [initial[0], "我喜欢文字清单"]);
      f.worker.changed(source, true);
      await f.drain();
      expect(f.retrieval.search({ query: "文字清单" }, false).memories[0]?.text).toBe(
        "我喜欢文字清单"
      );
      expect(f.store.search({})).toHaveLength(2);
    } finally {
      f.close();
    }
  });

  it("拒绝伪造引用和助手输出推断的用户偏好，梦境仅合并重复且保留证据", async () => {
    const f = setup();
    try {
      const first = f.sources.put("chat", "1", START, ["我喜欢简洁答复"]);
      const part = f.sources.read(present(f.sources.head(first))).parts[0];
      const candidate = {
        subject: "user",
        temporal: "current",
        kind: "preference",
        topic: "交流",
        text: "用户喜欢简洁答复",
        certainty: "explicit",
        quote: part.text,
      };
      expect(parseExtraction(JSON.stringify([{ ...candidate, quote: "编造" }]), part, [])).toEqual(
        []
      );
      expect(
        parseExtraction(JSON.stringify([candidate]), { ...part, role: "assistant" }, [])
      ).toEqual([]);
      const second = f.sources.put("chat", "2", START, ["我喜欢简短回应"]);
      const other = f.sources.read(present(f.sources.head(second))).parts[0];
      f.store.apply(
        [
          ...parseExtraction(JSON.stringify([candidate]), part, []),
          ...parseExtraction(
            JSON.stringify([{ ...candidate, text: "用户偏好简短回应", quote: other.text }]),
            other,
            []
          ),
        ],
        START
      );
      const [latest, older] = f.store.search({});
      f.store.setMeta("dirty-at", String(START));
      f.advance(60_001);
      f.complete(async (_system, _input, _signal, purpose) => {
        expect(purpose).toBe("review");
        return JSON.stringify({
          models: [],
          merge: [{ keep: latest.id, merge: [older.id] }],
          retire: [],
        });
      });
      await f.worker.runBatch();
      const result = f.retrieval.get(latest.id);
      expect(result?.evidence).toHaveLength(2);
      expect(f.store.get(older.id)).toBeNull();
    } finally {
      f.close();
    }
  });
  it("同名库替换后隔离记录，同源重新打开后保留记录", () => {
    const temp = mkdtempSync(join(tmpdir(), "tau-memory-libraries-"));
    try {
      let store = openMemoryStoreForLibrary(temp, "notes.db", "", "first-file");
      store.setMeta("test-record", "个人库");
      store.close();
      store = openMemoryStoreForLibrary(temp, "notes.db", "original-source", "first-file");
      expect(store.meta("test-record")).toBe("个人库");
      store.close();
      store = openMemoryStoreForLibrary(temp, "notes.db", "different-source", "second-file");
      expect(store.meta("test-record")).toBeNull();
      store.setMeta("test-record", "另一库");
      store.close();
      store = openMemoryStoreForLibrary(
        temp,
        "notes.db",
        "different-source",
        "new-file-same-source"
      );
      expect(store.meta("test-record")).toBe("另一库");
      store.close();
      store = openMemoryStoreForLibrary(
        temp,
        "notes.db",
        "original-source",
        "restored-original-file"
      );
      expect(store.meta("test-record")).toBe("个人库");
      store.close();
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("模型连续失败退避一小时后自动恢复", async () => {
    const f = setup();
    try {
      const source = f.sources.put("chat", "1", START, ["我偏好简洁的评审清单"]);
      f.complete(async () => {
        throw new Error("模型连接断开");
      });
      f.worker.changed(source);
      for (let attempt = 0; attempt < 3; attempt++) {
        await f.worker.runBatch(1);
        f.advance(100_000);
      }
      expect(f.store.counts()).toEqual({ checked: 0, pending: 1, failed: 1 });
      expect(f.retrieval.search({ query: "评审" }, false).memories).toEqual([]);
      f.complete(async (_system, input) => extraction(input));
      f.advance(3_600_000);
      await f.drain();
      expect(f.store.counts()).toEqual({ checked: 1, pending: 0, failed: 0 });
      expect(f.retrieval.search({ query: "评审" }, false).memories[0]?.text).toContain("评审清单");
    } finally {
      f.close();
    }
  });
});
