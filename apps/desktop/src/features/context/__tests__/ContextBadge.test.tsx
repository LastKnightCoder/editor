import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EntityContext } from "@/types/entity-context";

const mocks = vi.hoisted(() => ({
  context: null as EntityContext | null,
  openEntity: vi.fn(async () => {}),
  openPage: vi.fn(),
}));

vi.mock("../queries", () => ({
  useEntityContext: () => ({ data: mocks.context }),
}));
vi.mock("@/services/open-content", () => ({ openEntity: mocks.openEntity }));
vi.mock("@/services/page-navigation", () => ({ openPage: mocks.openPage }));

import { ContextBadge } from "../components/ContextBadge";
import { contextCount } from "../model";

const CONTEXT: EntityContext = {
  self: { ref: { kind: "card", id: 1 }, title: "重排与重绘", meta: "" },
  outlinks: [{ ref: { kind: "article", id: 8 }, title: "深度学习简介", meta: "" }],
  projections: [{ ref: { kind: "project-item", id: 7 }, title: "渲染篇", meta: "前端体系" }],
  backlinks: [
    {
      source: { ref: { kind: "article", id: 3 }, title: "浏览器是怎样画出一页的", meta: "" },
      snippets: [{ before: "就会触发", label: "重排与重绘", after: "，代价更高。" }],
    },
  ],
  backlinkTotal: 2,
  questions: [{ id: 9, title: "为什么 transform 不触发重排？", status: "in_progress" }],
  sources: [],
  derived: [],
  notebookProjections: [],
  usages: [],
};

/** 来源、衍生、被使用各一条，另有一条已删除的来源 */
const LINEAGE: Pick<EntityContext, "sources" | "derived" | "notebookProjections" | "usages"> = {
  sources: [
    {
      node: { kind: "chat-session", id: "s1" },
      relation: "saved_from",
      title: "层叠上下文",
      meta: "对话",
      missing: false,
      open: { page: "chat", id: "s1" },
    },
    {
      node: { kind: "vl-note", id: 4 },
      relation: "derived",
      title: "",
      meta: "Notebook 笔记",
      missing: true,
      open: null,
    },
  ],
  derived: [
    {
      node: { kind: "flashcard", id: 20 },
      relation: "derived",
      title: "什么是重排？",
      meta: "闪卡 · 前端",
      missing: false,
      open: { page: "review", deckId: 2 },
    },
  ],
  notebookProjections: [],
  usages: [
    {
      kind: "whiteboard",
      key: "whiteboard:3",
      title: "前端图",
      meta: "白板",
      open: { page: "whiteboard-detail", id: 3, pageId: 5 },
    },
    {
      kind: "todo",
      key: "todo:6",
      title: "整理笔记",
      completed: true,
      open: { page: "todos", selectedId: 6 },
    },
  ],
};

let container: HTMLDivElement;
let root: Root;

const render = (leading?: Parameters<typeof ContextBadge>[0]["leading"]) =>
  act(() => {
    root.render(<ContextBadge entity={{ kind: "card", id: 1 }} leading={leading} />);
  });
const click = (el: Element | null | undefined) =>
  act(() => {
    (el as HTMLElement).click();
  });
const findButton = (text: string) =>
  [...document.querySelectorAll("button")].find(b => b.textContent?.includes(text));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.context = null;
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

describe("contextCount", () => {
  it("引用来源总数 + 共用正文 + 问题", () => {
    expect(contextCount(CONTEXT)).toBe(5);
    expect(contextCount(CONTEXT, { hideOutlinks: true })).toBe(4);
    expect(contextCount(null)).toBe(0);
  });

  it("来源（含已删除）、衍生、被使用都计入", () => {
    expect(contextCount({ ...CONTEXT, ...LINEAGE })).toBe(10);
  });
});

describe("ContextBadge", () => {
  it("没有关联时不渲染", () => {
    render();
    expect(container.innerHTML).toBe("");
    mocks.context = {
      ...CONTEXT,
      outlinks: [],
      projections: [],
      backlinks: [],
      backlinkTotal: 0,
      questions: [],
    };
    render();
    expect(container.innerHTML).toBe("");
  });

  it("显示关联数，点开后列出三个分区与片段", () => {
    mocks.context = CONTEXT;
    render();
    expect(container.textContent).toContain("5 处关联");
    click(findButton("处关联"));
    const text = document.body.textContent ?? "";
    expect(text).toContain("引用了");
    expect(text).toContain("被引用");
    expect(text).toContain("也出现在");
    expect(text).toContain("相关问题");
    expect(text).toContain("还有 1 处未列出");
    expect(text).toContain("探究中");
    expect(document.querySelector("mark")?.textContent).toBe("重排与重绘");
  });

  it("点击来源打开实体，点击问题跳到问题页，并关闭浮层", () => {
    mocks.context = CONTEXT;
    render();
    click(findButton("处关联"));
    click(findButton("浏览器是怎样画出一页的"));
    expect(mocks.openEntity).toHaveBeenCalledWith({ kind: "article", id: 3 });
    // 关闭有退场动画，以触发器状态判断
    expect(findButton("处关联")?.getAttribute("aria-expanded")).toBe("false");

    click(findButton("处关联"));
    click(findButton("为什么 transform"));
    expect(mocks.openPage).toHaveBeenCalledWith("questions", { selectedId: 9 });
  });

  it("前置分区计入数量并排在最前；只有前置分区时也显示入口", () => {
    const onPick = vi.fn();
    const leading = {
      count: 2,
      render: (close: () => void) => (
        <button
          onClick={() => {
            close();
            onPick();
          }}
        >
          连接分区
        </button>
      ),
    };
    render(leading);
    expect(container.textContent).toContain("2 处关联");
    mocks.context = CONTEXT;
    render(leading);
    expect(container.textContent).toContain("7 处关联");
    click(findButton("处关联"));
    const text = document.body.textContent ?? "";
    expect(text.indexOf("连接分区")).toBeLessThan(text.indexOf("被引用"));
    click(findButton("连接分区"));
    expect(onPick).toHaveBeenCalled();
    expect(findButton("处关联")?.getAttribute("aria-expanded")).toBe("false");
  });

  it("前置分区数量为 0 时不渲染该分区", () => {
    mocks.context = CONTEXT;
    render({ count: 0, render: () => <span>连接分区</span> });
    click(findButton("处关联"));
    expect(document.body.textContent).not.toContain("连接分区");
  });

  it("来源置顶，已删除的来源不可点；衍生与被使用打开各自页面", () => {
    mocks.context = { ...CONTEXT, ...LINEAGE };
    render();
    click(findButton("处关联"));
    const text = document.body.textContent ?? "";
    expect(text.indexOf("来源")).toBeLessThan(text.indexOf("引用了"));
    expect(text.indexOf("也出现在")).toBeLessThan(text.indexOf("衍生"));
    expect(text.indexOf("衍生")).toBeLessThan(text.indexOf("被使用"));
    expect(text.indexOf("被使用")).toBeLessThan(text.indexOf("相关问题"));
    expect(text).toContain("Notebook 笔记已删除");
    expect(findButton("Notebook 笔记已删除")).toBeUndefined();
    expect(text).toContain("待办 · 已完成");

    click(findButton("层叠上下文"));
    expect(mocks.openPage).toHaveBeenCalledWith("chat", { id: "s1" });
    click(findButton("处关联"));
    click(findButton("什么是重排？"));
    expect(mocks.openPage).toHaveBeenCalledWith("review", { deckId: 2 });
    click(findButton("处关联"));
    click(findButton("前端图"));
    expect(mocks.openPage).toHaveBeenCalledWith("whiteboard-detail", { id: 3, page: 5 });
  });

  it("来源带打开位置时按位置打开（日记定位到那一条）", () => {
    mocks.context = {
      ...CONTEXT,
      backlinks: [
        {
          source: {
            ref: { kind: "diary", id: 4 },
            title: "2025-11-13",
            meta: "日记",
            open: { page: "diary", date: "2025-11-13", momentId: 12 },
          },
          snippets: [],
        },
      ],
    };
    render();
    click(findButton("处关联"));
    click(findButton("2025-11-13"));
    expect(mocks.openPage).toHaveBeenCalledWith("diary", { date: "2025-11-13", moment: "12" });
    expect(mocks.openEntity).not.toHaveBeenCalled();
  });

  it("hideOutlinks 时不显示也不计入「引用了」", () => {
    mocks.context = CONTEXT;
    act(() => {
      root.render(<ContextBadge entity={{ kind: "card", id: 1 }} hideOutlinks />);
    });
    expect(container.textContent).toContain("4 处关联");
    click(findButton("处关联"));
    expect(document.body.textContent).not.toContain("引用了");
  });
});
