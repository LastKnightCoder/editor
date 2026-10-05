/**
 * 共享元素形变（morph.ts，D-106）单测：挂名时序（旧画面只挂源、新画面只挂目标、结束摘净）、
 * 退化路径（不支持 / 减少动效 / 目标不在视口 / 嵌套）与后退配对（两页同 key 才转场）。
 * jsdom 无 View Transitions：startViewTransition 以同序语义的桩代替，记录新旧画面的挂名。
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { definePage } from "../definePage";
import { PageProvider, usePage, type Navigator } from "../PageProvider";
import { PageHost } from "../PageHost";
import { morph, startPageTransition } from "../morph";

interface TransitionRun {
  before: string[];
  after: string[];
}

const VISIBLE_RECT = { width: 100, height: 80, top: 10, left: 10, bottom: 90, right: 110 };

function namedIds() {
  return [...document.body.querySelectorAll<HTMLElement>("[id]")]
    .filter(el => el.style.viewTransitionName === "page-morph")
    .map(el => el.id);
}

/** 桩：调用时记录旧画面挂名，更新回调完成后记录新画面挂名，随即结束 */
function installViewTransition() {
  const runs: TransitionRun[] = [];
  const start = vi.fn((update: () => Promise<void> | void) => {
    const run: TransitionRun = { before: namedIds(), after: [] };
    runs.push(run);
    const updateCallbackDone = Promise.resolve()
      .then(update)
      .then(() => {
        run.after = namedIds();
      });
    return {
      updateCallbackDone,
      ready: updateCallbackDone,
      finished: updateCallbackDone,
      skipTransition: vi.fn(),
      types: new Set<string>(),
    };
  });
  Object.defineProperty(document, "startViewTransition", {
    value: start,
    configurable: true,
    writable: true,
  });
  return { start, runs };
}

function element(id: string, rect: Partial<DOMRect> = VISIBLE_RECT) {
  const el = document.createElement("div");
  el.id = id;
  el.getBoundingClientRect = () => rect as DOMRect;
  document.body.appendChild(el);
  return el;
}

let reduceMotion = false;

beforeEach(() => {
  reduceMotion = false;
  window.matchMedia = vi.fn(() => ({ matches: reduceMotion }) as MediaQueryList);
});

afterEach(() => {
  delete (document as { startViewTransition?: unknown }).startViewTransition;
  delete document.documentElement.dataset.morph;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("morph", () => {
  it("旧画面只给源元素挂名，更新后改挂目标；结束后摘净名字与根标记", async () => {
    const { runs } = installViewTransition();
    const from = element("from");
    let target: HTMLElement | null = null;
    const update = vi.fn(() => {
      target = element("to");
    });

    morph({ from, update, to: () => target });
    expect(document.documentElement.dataset.morph).toBe("");

    await vi.waitFor(() => expect(runs[0]?.after).toEqual(["to"]));
    expect(runs[0].before).toEqual(["from"]);
    expect(update).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(namedIds()).toEqual([]));
    expect(document.documentElement.dataset.morph).toBeUndefined();
  });

  it("目标不在视口时不挂目标名，只让源元素淡出", async () => {
    const { runs } = installViewTransition();
    const from = element("from");
    const offscreen = element("to", { width: 100, height: 80, top: -500, bottom: -420 });

    morph({ from, update: vi.fn(), to: () => offscreen });

    await vi.waitFor(() => expect(runs).toHaveLength(1));
    await vi.waitFor(() => expect(namedIds()).toEqual([]));
    expect(runs[0].before).toEqual(["from"]);
    expect(runs[0].after).toEqual([]);
  });

  it("不支持、减少动效或源元素缺失时直接执行更新，不挂名", () => {
    const update = vi.fn();
    morph({ from: element("from"), update, to: () => null });
    expect(update).toHaveBeenCalledTimes(1);

    const { start } = installViewTransition();
    reduceMotion = true;
    morph({ from: element("from-2"), update, to: () => null });
    reduceMotion = false;
    morph({ from: null, update, to: () => null });

    expect(update).toHaveBeenCalledTimes(3);
    expect(start).not.toHaveBeenCalled();
    expect(namedIds()).toEqual([]);
  });

  it("转场更新里嵌套发起的形变直接执行，不另起转场", async () => {
    const { start } = installViewTransition();
    const inner = vi.fn();
    startPageTransition(() => morph({ from: element("inner"), update: inner, to: () => null }));

    await vi.waitFor(() => expect(inner).toHaveBeenCalledOnce());
    expect(start).toHaveBeenCalledTimes(1);
  });
});

/* —— 后退配对：PageProvider 只在两页声明同一 key 时转场 —— */

function MorphListPage() {
  return <div id="list-card" data-morph-key="card-1" />;
}
function MorphDetailPage() {
  return <div id="detail-paper" data-morph-key="card-1" />;
}
function MorphPlainPage() {
  return <div id="plain" />;
}
definePage({ key: "morph-list", label: "列表", params: {}, component: MorphListPage });
definePage({ key: "morph-detail", label: "详情", params: {}, component: MorphDetailPage });
definePage({ key: "morph-plain", label: "无共享", params: {}, component: MorphPlainPage });

function NavBridge({ apiRef }: { apiRef: { current: Navigator | null } }) {
  apiRef.current = usePage().navigator;
  return null;
}
function PageHostHarness() {
  const { state } = usePage();
  return <PageHost state={state} />;
}

describe("后退 / 前进的形变配对", () => {
  let root: Root | undefined;
  const api: { current: Navigator | null } = { current: null };

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      VISIBLE_RECT as DOMRect
    );
  });

  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = undefined;
  });

  function render(initialKey: string) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <PageProvider initialKey={initialKey}>
          <NavBridge apiRef={api} />
          <PageHostHarness />
        </PageProvider>
      );
    });
  }

  it("源页与保活目标页声明同一 key：后退走形变，详情的纸缩回列表的卡", async () => {
    render("morph-list");
    await act(async () => api.current!.push("morph-detail"));
    const { start, runs } = installViewTransition();

    await act(async () => {
      api.current!.back();
      await vi.waitFor(() => expect(runs[0]?.after).toEqual(["list-card"]));
    });

    expect(start).toHaveBeenCalledOnce();
    expect(runs[0].before).toEqual(["detail-paper"]);
    expect(api.current!.current()?.key).toBe("morph-list");
  });

  it("目标页没有同 key 元素：照旧即时切换", async () => {
    render("morph-plain");
    await act(async () => api.current!.push("morph-detail"));
    const { start } = installViewTransition();

    await act(async () => api.current!.back());

    expect(start).not.toHaveBeenCalled();
    expect(api.current!.current()?.key).toBe("morph-plain");
  });
});
