import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { MemoryEvidence, MemorySource, MemorySourceKind } from "@/types/assistant-memory";
import { parseExtraction, type MemoryPart } from "../extraction";
import type { MemoryHead, MemorySnapshot, MemorySourcesPort } from "../sources";
import { MemoryStore, openMemoryStoreForLibrary } from "../store";
import { MemoryWorker, type MemoryWorkerOptions } from "../worker";

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
        kind === "todo" || kind === "calendar" ? "record" : kind === "chat" ? "user" : "document",
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
  fallback(query: string, limit: number, allow: (source: MemorySource) => boolean) {
    return [...this.data.values()]
      .filter(item => allow(item.head))
      .flatMap(item =>
        item.parts
          .filter(part => part.text.includes(query))
          .map(part => ({ ...part, quote: part.text }))
      )
      .slice(0, limit);
  }
}

function extraction(input: string) {
  const parsed = JSON.parse(input) as {
    parts: Array<{ part: number; role: string; text: string }>;
  };
  return JSON.stringify(
    parsed.parts.map(({ part, role, text }) => ({
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
    if (purpose === "dream") return "[]";
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
  return {
    sources,
    get store() {
      return store;
    },
    get worker() {
      return worker;
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
      store.close();
      store = new MemoryStore(file);
      worker = createWorker();
    },
    close() {
      worker.close();
      store.close();
      rmSync(temp, { recursive: true, force: true });
    },
  };
}

describe("个人助手记忆", () => {
  it("分页补录 23,000 个来源，重启续跑且对账不重复调用模型", async () => {
    const f = setup();
    const started = performance.now();
    try {
      const count = 23_000;
      for (let id = 1; id <= count; id++)
        f.sources.put(
          id <= 20_000 ? "content" : id <= 22_000 ? "chat" : "todo",
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
      expect(f.worker.search({ query: "12937", limit: 5 }, false).memories[0]?.text).toBe(
        "项目条目 12937 已确认"
      );

      f.worker.reconcile(undefined, false, true);
      await f.drain();
      expect(f.calls).toBe(initialCalls);
      for (let id = 1; id <= 700; id++) {
        const ref = f.sources.put("content", String(id), START + 20, [`文档修订 ${id} 已确认`]);
        f.worker.changed(ref);
        f.worker.changed(ref);
      }
      f.advance(2000);
      await f.drain();
      expect(f.calls - initialCalls).toBeLessThan(130);
      expect(
        f.worker.search({ query: "文档修订 37", limit: 8 }, false).memories.length
      ).toBeGreaterThan(0);
      expect(f.store.counts()).toEqual({ checked: count, pending: 0, failed: 0 });
      console.log(
        `[assistant-memory] 23000 个来源 + 1400 次编辑通知，${(performance.now() - started).toFixed(0)} ms，${f.calls} 次模型桩调用`
      );
    } finally {
      f.close();
    }
  }, 120_000);

  it("正文变化、前台忙碌和删除都能阻断迟到提交", async () => {
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
      const source = f.sources.put("content", "1", START, ["旧稿：周五评审"]);
      f.worker.changed(source);
      f.advance(2000);
      const run = f.worker.runBatch(1);
      expect(pendingInput).toContain("周五");
      f.sources.put("content", "1", START + 1, ["新稿：周二评审"]);
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
      const memory = f.worker.search({ query: "周二" }, false).memories[0];
      expect(memory?.text).toContain("周二");
      expect(memory?.evidence[0].quote).toContain("周二");

      f.complete(async (_system, input) => {
        pendingInput = input;
        return new Promise(resolve => {
          release = resolve;
        });
      });
      f.sources.put("content", "1", START + 2, ["第三稿：周三评审"]);
      f.worker.changed(source);
      f.advance(2000);
      const deleting = f.worker.runBatch(1);
      f.sources.drop(source);
      f.worker.changed(source);
      release(extraction(pendingInput));
      await deleting;
      f.advance(2000);
      await f.drain();
      expect(f.worker.get(memory.id)).toBeNull();
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
      const item = f.worker.search({ query: "结构图" }, true).memories[0];
      expect(item.text).toBe("我更喜欢结构图");
      f.store.correct(
        item.id,
        { kind: "preference", state: "current", topic: "图示", text: "评审时更喜欢流程图" },
        START + 5
      );
      expect(f.worker.get(item.id)?.manual).toBe(true);
      expect(f.store.forget(item.id)).toBe(true);
      f.reopen();
      f.worker.changed(source, true);
      await f.drain();
      expect(f.worker.search({ query: "结构图" }, true)).toMatchObject({
        memories: [],
        sources: [],
      });

      f.sources.put("chat", "1", START + 2, [initial[0], "我喜欢文字清单"]);
      f.worker.changed(source, true);
      await f.drain();
      expect(f.worker.search({ query: "文字清单" }, false).memories[0]?.text).toBe(
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
      f.advance(2000);
      f.complete(async (_system, _input, _signal, purpose) => {
        expect(purpose).toBe("dream");
        return JSON.stringify([{ keep: latest.id, merge: [older.id] }]);
      });
      await f.worker.runBatch();
      const result = f.worker.get(latest.id);
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

  it("模型失败只重试三次，恢复后可以继续", async () => {
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
      expect(f.store.counts()).toEqual({ checked: 0, pending: 0, failed: 1 });
      expect(f.worker.search({ query: "评审" }, false).memories).toEqual([]);
      f.complete(async (_system, input) => extraction(input));
      f.store.retry(START + 300_000);
      await f.drain();
      expect(f.store.counts()).toEqual({ checked: 1, pending: 0, failed: 0 });
      expect(f.worker.search({ query: "评审" }, false).memories[0]?.text).toContain("评审清单");
    } finally {
      f.close();
    }
  });
});
