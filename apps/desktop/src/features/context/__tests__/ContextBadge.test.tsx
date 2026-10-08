import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContextRelated, EntityContext } from "@/types/entity-context";

const mocks = vi.hoisted(() => ({
  context: null as EntityContext | null,
  related: [] as ContextRelated[],
  relatedEnabled: false,
  refetchRelated: vi.fn(),
  openEntity: vi.fn(async () => {}),
  openPage: vi.fn(),
  addLink: vi.fn(),
  removeLink: vi.fn(),
  /** addContentLink 的返回值（已连接/同正文时为 false）；mock 忠实传递给 onSuccess */
  addLinkResult: true as boolean,
  toastInfo: vi.fn(),
}));

vi.mock("../queries", () => ({
  useEntityContext: () => ({ data: mocks.context }),
  useEntityRelated: (_ref: unknown, enabled: boolean) => {
    mocks.relatedEnabled = enabled;
    return { data: enabled ? mocks.related : undefined, refetch: mocks.refetchRelated };
  },
  useAddContentLink: () => ({
    mutate: (_input: unknown, options?: { onSuccess?: (linked: boolean) => void }) => {
      mocks.addLink(_input);
      options?.onSuccess?.(mocks.addLinkResult);
    },
  }),
  useRemoveContentLink: () => ({
    mutate: (_input: unknown, options?: { onSuccess?: () => void }) => {
      mocks.removeLink(_input);
      options?.onSuccess?.();
    },
  }),
}));
vi.mock("@/services/open-content", () => ({ openEntity: mocks.openEntity }));
vi.mock("@/services/page-navigation", () => ({ openPage: mocks.openPage }));
vi.mock("@/components/ContentSelectorModal", () => ({
  default: ({ open, onSelect }: { open: boolean; onSelect: (item: unknown) => void }) =>
    open ? (
      <div>
        内容选择器
        <button type="button" onClick={() => onSelect({ id: 21, type: "card" })}>
          选择目标
        </button>
      </div>
    ) : null,
}));
vi.mock("@tau/ui", async importOriginal => {
  const actual = await importOriginal<typeof import("@tau/ui")>();
  return { ...actual, toast: { ...actual.toast, info: mocks.toastInfo } };
});

import { ContextBadge } from "../components/ContextBadge";
import { contextCount } from "../model";

const CONTEXT: EntityContext = {
  self: { ref: { kind: "card", id: 1 }, title: "重排与重绘", meta: "" },
  selfContentIds: [101],
  links: [
    {
      entity: { ref: { kind: "article", id: 8 }, title: "深度学习简介", meta: "" },
      inlineOnly: false,
      contentId: 108,
    },
  ],
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
  mocks.related = [];
  mocks.relatedEnabled = false;
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

describe("contextCount", () => {
  it("连接 + 引用来源总数 + 共用正文 + 问题", () => {
    expect(contextCount(CONTEXT)).toBe(5);
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
      links: [],
      projections: [],
      backlinks: [],
      backlinkTotal: 0,
      questions: [],
    };
    render();
    expect(container.innerHTML).toBe("");
  });

  it("显示关联数，点开后列出连接与其余分区与片段", () => {
    mocks.context = CONTEXT;
    render();
    expect(container.textContent).toContain("5 处关联");
    click(findButton("处关联"));
    const text = document.body.textContent ?? "";
    expect(text).toContain("连接");
    expect(text).toContain("深度学习简介");
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

  it("连接分区常驻（空连接也有添加入口），排在被引用之前；解除走 removeLink", () => {
    mocks.context = { ...CONTEXT, links: [] };
    render();
    click(findButton("处关联"));
    const text = document.body.textContent ?? "";
    expect(text.indexOf("连接")).toBeLessThan(text.indexOf("被引用"));
    expect(text).toContain("添加连接");
    click(findButton("添加连接"));
    expect(document.body.textContent).toContain("内容选择器");
  });

  it("选择器选中已连接/同正文目标（返回 false）时提示无需重复连接", () => {
    mocks.context = CONTEXT;
    mocks.addLinkResult = false;
    render();
    click(findButton("处关联"));
    click(findButton("添加连接"));
    click(findButton("选择目标"));
    expect(mocks.addLink).toHaveBeenCalledWith({
      from: { kind: "card", id: 1 },
      to: { kind: "card", id: 21 },
    });
    expect(mocks.toastInfo).toHaveBeenCalledWith("已连接或同一正文，无需重复连接");
  });

  it("解除显式连接（内联条目不给解除动作）", () => {
    mocks.context = {
      ...CONTEXT,
      links: [
        ...CONTEXT.links,
        {
          entity: { ref: { kind: "card", id: 12 }, title: "合成层", meta: "" },
          inlineOnly: true,
          contentId: null,
        },
      ],
    };
    render();
    click(findButton("处关联"));
    const unlinkButtons = document.querySelectorAll('button[aria-label="解除连接"]');
    expect(unlinkButtons).toHaveLength(1);
    click(unlinkButtons[0]);
    expect(mocks.removeLink).toHaveBeenCalledWith({
      from: { kind: "card", id: 1 },
      to: { kind: "article", id: 8 },
    });
  });

  it("来源置顶，已删除的来源不可点；衍生与被使用打开各自页面", () => {
    mocks.context = { ...CONTEXT, ...LINEAGE };
    render();
    click(findButton("处关联"));
    const text = document.body.textContent ?? "";
    expect(text.indexOf("来源")).toBeLessThan(text.indexOf("连接"));
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

  it("「相关」只在浮层打开时取，排在末尾、不计入关联数；内容行可直接添加连接", async () => {
    mocks.context = CONTEXT;
    mocks.related = [
      {
        entity: { ref: { kind: "card", id: 21 }, title: "合成层与 GPU", meta: "" },
        summary: "transform 走合成层，不触发重排",
      },
      { entity: { ref: { kind: "article", id: 22 }, title: "渲染流水线", meta: "" }, summary: "" },
    ];
    render();
    expect(mocks.relatedEnabled).toBe(false);
    expect(findButton("处关联")?.textContent).toContain("5 处关联");
    click(findButton("处关联"));
    expect(mocks.relatedEnabled).toBe(true);
    const headings = [...document.querySelectorAll("h5")].map(h => h.textContent);
    expect(headings[headings.length - 1]).toBe("相关");
    expect(document.body.textContent).toContain("transform 走合成层，不触发重排");
    expect(document.body.textContent).not.toMatch(/0\.\d{2}/);
    // 卡片与文章行都有添加连接动作（四种内容实体通用）
    const connectButtons = document.querySelectorAll('button[title="添加连接"]');
    expect(connectButtons.length).toBeGreaterThanOrEqual(2);
    await act(async () => {
      (connectButtons[connectButtons.length - 1] as HTMLElement).click();
    });
    expect(mocks.addLink).toHaveBeenCalledWith({
      from: { kind: "card", id: 1 },
      to: { kind: "article", id: 22 },
    });
    expect(mocks.refetchRelated).toHaveBeenCalled();
  });
});
