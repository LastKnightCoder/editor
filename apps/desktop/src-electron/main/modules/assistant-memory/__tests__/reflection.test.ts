import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AssistantMemory, MemorySource, MemorySourceKind } from "@/types/assistant-memory";
import { parseExtraction, type MemoryPart } from "../extraction";
import { parseReflection, MEMORY_REVIEW_INTERVAL } from "../reflection";
import { MemoryRetrieval } from "../retrieval";
import type { MemoryHead, MemorySourcesPort } from "../sources";
import { MemoryStore } from "../store";
import { MemoryWorker, type MemoryWorkerOptions } from "../worker";

const START = Date.UTC(2026, 10, 6, 12);
const DAY = 86_400_000;
const key = (source: MemorySource) => `${source.kind}:${source.id}`;
const output = (models: unknown[] = []) => JSON.stringify({ models, merge: [], retire: [] });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "tau-personal-models-"));
  const file = join(directory, "memory.sqlite");
  const data = new Map<string, { head: MemoryHead; part: MemoryPart }>();
  const unavailable = new Set<string>();
  let now = START;
  let busy = false;
  let nextId = 0;
  let store = new MemoryStore(file);
  let complete: MemoryWorkerOptions["complete"] = async () => output();
  const sources: MemorySourcesPort = {
    list: (kind, after, limit) =>
      [...data.values()]
        .map(item => item.head)
        .filter(item => item.kind === kind && item.id > after)
        .slice(0, limit),
    recent: (kind, limit) =>
      [...data.values()]
        .map(item => item.head)
        .filter(item => item.kind === kind)
        .slice(-limit),
    head: source => {
      if (unavailable.has(key(source))) throw new Error("来源暂时未就绪");
      return data.get(key(source))?.head ?? null;
    },
    read: head => {
      const part = data.get(key(head))?.part;
      if (!part) throw new Error("缺少测试来源");
      return {
        parts: [part],
        validate: ref => (ref.anchor === part.anchor && part.text.includes(ref.quote) ? ref : null),
      };
    },
    invalidate() {
      /* 测试来源没有缓存。 */
    },
  };
  const createWorker = () =>
    new MemoryWorker({
      store,
      sources,
      now: () => now,
      allowed: () => true,
      busy: () => busy,
      complete: (...args) => complete(...args),
    });
  let worker = createWorker();
  let retrieval = new MemoryRetrieval({ store, sources, now: () => now });
  return {
    sources,
    unavailable,
    get store() {
      return store;
    },
    get worker() {
      return worker;
    },
    get retrieval() {
      return retrieval;
    },
    get now() {
      return now;
    },
    advance(ms: number) {
      now += ms;
    },
    busy(value: boolean) {
      busy = value;
      if (value) worker.interrupt();
    },
    respond(fn: MemoryWorkerOptions["complete"]) {
      complete = fn;
    },
    add(
      text: string,
      options: {
        source?: MemorySourceKind;
        at?: number;
        kind?: AssistantMemory["kind"];
        state?: AssistantMemory["state"];
        topic?: string;
        profile?: boolean;
      } = {}
    ) {
      const source = { kind: options.source ?? "chat", id: String(++nextId) };
      const at = options.at ?? now;
      const part: MemoryPart = {
        ...source,
        anchor: source.id + ":0",
        next: source.id + ":0",
        quote: text,
        text,
        role:
          source.kind === "chat" ? "user" : source.kind === "activity" ? "activity" : "document",
        observedAt: at,
      };
      data.set(key(source), {
        head: {
          ...source,
          modifiedAt: at,
          row: { id: source.id, create_time: at, update_time: at },
        },
        part,
      });
      store.apply(
        [
          {
            kind: options.kind ?? "preference",
            state: options.state ?? "current",
            topic: options.topic ?? "表达方式",
            text,
            observedAt: at,
            evidence: [{ ...source, anchor: part.anchor, quote: text }],
            profile: options.profile,
          },
        ],
        now
      );
      store.setMeta("dirty-at", String(now));
      return store.search({ state: "all", limit: 1 })[0];
    },
    drop(source: MemorySource) {
      data.delete(key(source));
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
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

describe("个人理解的准入与自动维护", () => {
  it("文档知识和助手回答不能入库，明确自述才可形成稳定偏好", () => {
    const part: MemoryPart = {
      kind: "chat",
      id: "1",
      anchor: "m:0",
      next: "m:0",
      quote: "",
      text: "我一直喜欢可运行的例子",
      role: "user",
      observedAt: START,
    };
    const candidate = {
      subject: "user",
      horizon: "stable",
      temporal: "current",
      kind: "preference",
      topic: "学习方式",
      text: part.text,
      quote: part.text,
      certainty: "explicit",
    };
    expect(parseExtraction(JSON.stringify([candidate]), part, [])[0]?.profile).toBe(true);
    expect(
      parseExtraction(JSON.stringify([{ ...candidate, subject: "knowledge" }]), part, [])
    ).toEqual([]);
    expect(parseExtraction(JSON.stringify([candidate]), { ...part, role: "document" }, [])).toEqual(
      []
    );
    expect(
      parseExtraction(JSON.stringify([candidate]), { ...part, role: "assistant" }, [])
    ).toEqual([]);
    expect(
      parseExtraction(JSON.stringify([{ ...candidate, temporal: "past" }]), part, [])[0]?.state
    ).toBe("history");
    expect(
      parseExtraction(JSON.stringify([{ ...candidate, temporal: "past" }]), part, [])[0]?.profile
    ).toBe(false);
    const temporary = { ...candidate, text: "这次请给例子", quote: "这次请给例子" };
    expect(
      parseExtraction(JSON.stringify([temporary]), { ...part, text: temporary.quote }, [])[0]
        ?.profile
    ).toBe(false);
  });

  it("概览只暴露有依据的模型，新偏好即时替换旧理解，忘记会连带失效", async () => {
    const f = fixture();
    try {
      const old = f.add("我一直喜欢简短回应", { profile: true });
      f.store.correct(
        old.id,
        { kind: "preference", state: "current", topic: old.topic, text: "我偏好先看结论" },
        f.now
      );
      f.advance(1000);
      const current = f.add("我现在更喜欢详细解释", { profile: true });
      expect(f.retrieval.brief().profile.map(item => item.text)).toEqual([current.text]);
      const overview = await f.retrieval.recall({ query: "回应方式" });
      expect(overview.models[0]?.text).toBe(current.text);
      expect(overview.memories).toEqual([]);
      expect(overview.episodeHints?.some(item => item.id === current.id)).toBe(true);
      expect(overview.sources).toEqual([]);
      const details = f.retrieval.getModel(overview.models[0].id);
      expect(details?.episodes.map(item => item.id)).toEqual([current.id]);
      f.store.forget(current.id);
      expect(f.retrieval.brief().profile).toEqual([]);
      expect(f.store.searchModels({}, f.now)).toEqual([]);
    } finally {
      f.close();
    }
  });

  it("日记的明确观点可形成画像，当天情绪按归属日到期且不能被归纳续期", () => {
    const part: MemoryPart = {
      kind: "diary",
      id: "1",
      anchor: "day:block:0",
      next: "day:block:0",
      quote: "",
      text: "我一直重视自主安排时间",
      role: "diary",
      observedAt: START,
    };
    const candidate = {
      subject: "user",
      horizon: "stable",
      temporal: "current",
      kind: "fact",
      topic: "自主性",
      text: "用户重视自主安排时间",
      quote: part.text,
      certainty: "explicit",
    };
    const extracted = parseExtraction(JSON.stringify([candidate]), part, []);
    expect(extracted[0]?.profile).toBe(true);
    const episode: AssistantMemory = {
      ...extracted[0],
      id: 1,
      manual: false,
      expiresAt: null,
    };
    const model = {
      layer: "profile",
      kind: "fact",
      topic: candidate.topic,
      text: candidate.text,
      confidence: "explicit",
      episodeIds: [1],
    };
    expect(parseReflection(output([model]), [episode], [], START).models[0]).toMatchObject({
      confidence: "explicit",
      text: candidate.text,
    });
    const mood = {
      ...candidate,
      horizon: "recent",
      kind: "event",
      topic: "当下状态",
      text: "今天有些难过",
      quote: "今天有些难过",
      expiresAt: START + 30 * DAY,
    };
    const emotion = parseExtraction(JSON.stringify([mood]), { ...part, text: mood.quote }, [])[0];
    const end = new Date(START);
    end.setHours(24, 0, 0, 0);
    expect(emotion.profile).toBe(false);
    expect(emotion.expiresAt).toBe(end.getTime());
    const recent = parseReflection(
      output([{ ...model, layer: "state", kind: "event", topic: mood.topic, text: mood.text }]),
      [{ ...emotion, id: 1, manual: false, expiresAt: emotion.expiresAt ?? null }],
      [],
      START
    );
    expect(recent.models[0]?.expiresAt).toBe(end.getTime());
    expect(
      parseReflection(output([model]), [{ ...episode, state: "history" }], [], START).models
    ).toEqual([]);
  });

  it("编辑行为不能升格为爱好，近期状态须跨日且采用客观措辞", () => {
    const f = fixture();
    try {
      const first = f.add("编辑了 Rust 资料", {
        source: "activity",
        kind: "event",
        at: START - DAY,
      });
      const second = f.add("再次编辑 Rust 资料", { source: "activity", kind: "event" });
      const proposed = (layer: string) => ({
        layer,
        kind: layer === "profile" ? "interest" : "event",
        topic: "Rust",
        text: "用户喜欢 Rust 并已掌握所有权",
        confidence: "supported",
        episodeIds: [first.id, second.id],
      });
      expect(
        parseReflection(output([proposed("profile")]), [first, second], [], f.now).models
      ).toEqual([]);
      expect(parseReflection(output([proposed("state")]), [second], [], f.now).models).toEqual([]);
      const reflection = parseReflection(output([proposed("state")]), [first, second], [], f.now);
      expect(reflection.models[0]?.text).toBe("近期多次整理「Rust」相关资料。");
      f.store.applyModels(
        reflection.models,
        new Map([
          [first.id, first],
          [second.id, second],
        ]),
        f.now
      );
      expect(f.retrieval.brief().recent).toHaveLength(1);
      f.advance(31 * DAY);
      expect(f.retrieval.brief().recent).toEqual([]);
    } finally {
      f.close();
    }
  });

  it("推断画像需要三天独立用户证据，旧候选不能覆盖新的明确自述", () => {
    const f = fixture();
    try {
      const episodes = [2, 1, 0].map(day =>
        f.add("我更容易理解具体示例 " + day, { at: START - day * DAY, state: "observation" })
      );
      const proposed = {
        layer: "profile",
        kind: "preference",
        topic: "表达方式",
        text: "倾向通过实例理解",
        confidence: "supported",
        episodeIds: episodes.map(item => item.id),
      };
      expect(parseReflection(output([proposed]), episodes.slice(1), [], f.now).models).toEqual([]);
      const reflection = parseReflection(output([proposed]), episodes, [], f.now);
      expect(reflection.models).toHaveLength(1);
      f.store.applyModels(reflection.models, new Map(episodes.map(item => [item.id, item])), f.now);
      expect(f.retrieval.brief().profile[0]?.confidence).toBe("supported");
      f.advance(1000);
      const latest = f.add("我现在偏好先看原理", { profile: true });
      f.store.applyModels(reflection.models, new Map(episodes.map(item => [item.id, item])), f.now);
      expect(f.retrieval.brief().profile[0]?.text).toBe(latest.text);
      f.advance(3 * DAY);
      const inferred = [2, 1, 0].map(day =>
        f.add("反复讨论具体例子 " + day, { at: f.now - day * DAY, state: "observation" })
      );
      const newer = parseReflection(
        output([{ ...proposed, episodeIds: inferred.map(item => item.id) }]),
        inferred,
        [],
        f.now
      );
      f.store.applyModels(newer.models, new Map(inferred.map(item => [item.id, item])), f.now);
      expect(f.retrieval.brief().profile[0]?.text).toBe(latest.text);
    } finally {
      f.close();
    }
  });

  it("全面复核分页断点可重启续跑，每 14 天补做且前台忙碌时暂停", async () => {
    const f = fixture();
    try {
      for (let index = 0; index < 60; index++)
        f.add("我偏好实例 " + index, { topic: "主题" + index });
      f.advance(60_001);
      await f.worker.runBatch(1);
      expect(Number(f.store.meta("review-cursor"))).toBeGreaterThan(0);
      f.reopen();
      await f.worker.runBatch(2);
      const reviewed = f.store.meta("review-at");
      expect(reviewed).toBe(String(f.now));
      expect(f.store.meta("review-cursor")).toBe("");
      f.advance(MEMORY_REVIEW_INTERVAL + 1);
      f.busy(true);
      await f.worker.runBatch(8);
      expect(f.store.meta("review-at")).toBe(reviewed);
      f.busy(false);
      await f.worker.runBatch(8);
      expect(f.store.meta("review-at")).toBe(String(f.now));
    } finally {
      f.close();
    }
  });

  it("来源暂时不可用只隐藏，来源删除后定期复核清除依赖", async () => {
    const f = fixture();
    try {
      const item = f.add("我偏好中文解释", { profile: true });
      const source = item.evidence[0];
      f.unavailable.add(key(source));
      f.advance(60_001);
      await f.worker.runBatch(4);
      expect(f.store.get(item.id)).not.toBeNull();
      expect(f.retrieval.brief().profile).toEqual([]);
      f.unavailable.clear();
      expect(f.retrieval.brief().profile).toHaveLength(1);
      f.drop(source);
      f.advance(MEMORY_REVIEW_INTERVAL + 1);
      await f.worker.runBatch(4);
      expect(f.store.get(item.id)).toBeNull();
      expect(f.store.searchModels({}, f.now)).toEqual([]);
    } finally {
      f.close();
    }
  });

  it("等待归纳期间更正经历，迟到的画像不能写回", async () => {
    const f = fixture();
    try {
      const item = f.add("我以前喜欢简短回应");
      f.advance(60_001);
      let release: ((value: string) => void) | undefined;
      f.respond(
        async () =>
          new Promise(resolve => {
            release = resolve;
          })
      );
      const running = f.worker.runBatch(1);
      expect(release).toBeDefined();
      f.store.correct(
        item.id,
        { kind: "preference", state: "current", topic: item.topic, text: "我现在偏好完整论证" },
        f.now
      );
      f.worker.interrupt();
      if (!release) throw new Error("归纳未开始");
      release(
        output([
          {
            layer: "profile",
            kind: "preference",
            topic: item.topic,
            text: item.text,
            confidence: "explicit",
            episodeIds: [item.id],
          },
        ])
      );
      await running;
      expect(f.retrieval.brief().profile[0]?.text).toBe("我现在偏好完整论证");
      expect(f.store.meta("review-at")).toBeNull();
    } finally {
      f.close();
    }
  });
});
