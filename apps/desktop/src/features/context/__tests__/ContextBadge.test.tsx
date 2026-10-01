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
  projections: [{ ref: { kind: "project-item", id: 7 }, title: "渲染篇", meta: "前端体系" }],
  backlinks: [
    {
      source: { ref: { kind: "article", id: 3 }, title: "浏览器是怎样画出一页的", meta: "" },
      snippets: [{ before: "就会触发", label: "重排与重绘", after: "，代价更高。" }],
    },
  ],
  backlinkTotal: 2,
  questions: [{ id: 9, title: "为什么 transform 不触发重排？", status: "in_progress" }],
};

let container: HTMLDivElement;
let root: Root;

const render = () =>
  act(() => {
    root.render(<ContextBadge entity={{ kind: "card", id: 1 }} />);
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
    expect(contextCount(CONTEXT)).toBe(4);
    expect(contextCount(null)).toBe(0);
  });
});

describe("ContextBadge", () => {
  it("没有关联时不渲染", () => {
    render();
    expect(container.innerHTML).toBe("");
    mocks.context = { ...CONTEXT, projections: [], backlinks: [], backlinkTotal: 0, questions: [] };
    render();
    expect(container.innerHTML).toBe("");
  });

  it("显示关联数，点开后列出三个分区与片段", () => {
    mocks.context = CONTEXT;
    render();
    expect(container.textContent).toContain("4 处关联");
    click(findButton("处关联"));
    const text = document.body.textContent ?? "";
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
});
