import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeInsightNode } from "@/types/knowledge-insights";

const mocks = vi.hoisted(() => ({
  data: null as KnowledgeInsightNode | null,
  review: vi.fn(),
  setStatus: vi.fn(),
  markSeen: vi.fn(),
  addChild: vi.fn(async () => [{ id: 11, children: [99] }, { id: 99 }]),
  publish: vi.fn(),
  capture: vi.fn(),
  openEntity: vi.fn(async () => {}),
  push: vi.fn(),
  dismiss: null as null | (() => void),
}));

vi.mock("../review/reviewQueries", () => ({
  useProjectReviewData: () => ({
    enabled: true,
    data: mocks.data,
    review: { mutate: mocks.review, isPending: false },
    setStatus: { mutate: mocks.setStatus },
    markSeen: mocks.markSeen,
  }),
}));
vi.mock("@/commands", () => ({ addChildProjectItem: mocks.addChild }));
vi.mock("@/utils", () => ({
  defaultProjectItemEventBus: { createEditor: () => ({ publishProjectItemEvent: mocks.publish }) },
}));
vi.mock("@/page/PageProvider", () => ({
  usePage: () => ({ navigator: { push: mocks.push } }),
  useOverlayDismiss: (dismiss: () => void, active: boolean) => {
    mocks.dismiss = active ? dismiss : null;
  },
}));
vi.mock("@/services/question-capture", () => ({ requestQuestionCapture: mocks.capture }));
vi.mock("@/services/open-content", () => ({ openEntity: mocks.openEntity }));

import { ProjectReviewContext, ProjectReviewSlot } from "../review/ProjectReviewContext";
import { useProjectReview } from "../review/useProjectReview";

const growth = (seenAt?: number): KnowledgeInsightNode => ({
  id: 4,
  scope: "project",
  parentId: null,
  projectId: 1,
  label: "浏览器渲染",
  topicId: null,
  model: "m",
  updateTime: 100,
  reviewKind: "growth",
  result: {
    lead: "最近长了 8 篇",
    marks: [
      {
        id: "p1",
        kind: "belong",
        why: "补上合成这一节",
        ends: [
          {
            ref: { kind: "card", id: 7 },
            contentId: 70,
            title: "合成层与 will-change",
            topic: "",
            heading: "",
            block: 0,
            excerpt: "提前提升为合成层",
          },
        ],
        under: 11,
        status: "open",
      },
      {
        id: "p2",
        kind: "thin",
        why: "只有一篇",
        ends: [],
        text: "这里还薄：只讲了工具",
        under: 12,
        status: "open",
      },
    ],
    asks: [],
    growth: [],
    candidates: 16,
    dismissed: [],
    outside: 2,
    ...(seenAt ? { seenAt } : {}),
  },
});

function Harness({ archived = false, autoOpen = false }) {
  const review = useProjectReview({ projectId: 1, projectTitle: "浏览器渲染", archived, autoOpen });
  return (
    <div>
      <ProjectReviewContext.Provider value={review.tree}>
        {review.tree.button}
        <ProjectReviewSlot itemId={11} />
        <ProjectReviewSlot itemId={12} />
      </ProjectReviewContext.Provider>
      {review.report}
      {review.popover}
    </div>
  );
}

let root: Root;
let host: HTMLDivElement;
const render = (props: { archived?: boolean; autoOpen?: boolean } = {}) =>
  act(() => root.render(<Harness {...props} />));
const button = (text: string) =>
  [...document.querySelectorAll("button")].find(b => b.textContent?.includes(text)) ?? null;
const click = (el: Element | null) =>
  act(async () => {
    el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.data = null;
  mocks.dismiss = null;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

describe("项目回顾", () => {
  it("没写过：点「回顾」立即写，写完展开并记为看过；树里长出虚线行与淡注", async () => {
    await render();
    expect(host.querySelector("[data-review-mark]")).toBeNull();
    mocks.review.mockImplementation(
      (_: unknown, options: { onSuccess(node: KnowledgeInsightNode): void }) => {
        mocks.data = growth();
        options.onSuccess(mocks.data);
      }
    );
    await click(button("回顾"));
    await render();
    expect(mocks.review).toHaveBeenCalledTimes(1);
    expect(mocks.markSeen).toHaveBeenCalledWith(4);
    expect(host.textContent).toContain("最近长了 8 篇");
    expect(
      host.querySelector('[data-review-slot="11"] [data-review-mark="p1"]')?.textContent
    ).toContain("合成层与 will-change");
    expect(host.querySelector('[data-review-slot="12"]')?.textContent).toContain("这里还薄");
  });

  it("引用到这里：在那一支下加引用型条目，状态记为已连接", async () => {
    mocks.data = growth(200);
    await render();
    await click(button("回顾"));
    expect(mocks.review).not.toHaveBeenCalled();
    expect(mocks.markSeen).not.toHaveBeenCalled();
    await click(host.querySelector('[data-review-mark="p1"]'));
    expect(document.body.textContent).toContain("补上合成这一节");
    await click(button("引用到这里"));
    expect(mocks.addChild).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ refType: "card", refId: 7, title: "合成层与 will-change" })
    );
    expect(mocks.publish).toHaveBeenCalledWith("project-item:updated", { id: 11, children: [99] });
    expect(mocks.setStatus).toHaveBeenCalledWith({ nodeId: 4, itemId: "p1", status: "linked" });
  });

  it("还薄记为问题（来源是项目）；Esc 先关气泡再收起", async () => {
    mocks.data = growth(200);
    await render();
    await click(button("回顾"));
    await click(host.querySelector('[data-review-mark="p2"]'));
    await click(button("记为问题"));
    expect(mocks.capture).toHaveBeenCalledWith({
      source: { kind: "none" },
      sourceLabel: "项目：浏览器渲染",
      defaultTitle: "只讲了工具",
    });
    await click(host.querySelector('[data-review-mark="p1"]'));
    await act(async () => mocks.dismiss?.());
    expect(document.querySelector("[data-review-popover]")).toBeNull();
    await act(async () => mocks.dismiss?.());
    expect(host.querySelector("[data-review-mark]")).toBeNull();
    expect(button("回顾")).not.toBeNull();
  });

  it("带参数打开时直接展开；刚归档、手里还是生长回顾时重新写成结项回顾", async () => {
    mocks.data = growth(200);
    await render({ autoOpen: true });
    expect(host.textContent).toContain("最近长了 8 篇");
    await act(() => root.unmount());
    root = createRoot(host);
    await render({ archived: true });
    expect(button("结项回顾")).not.toBeNull();
    await click(button("结项回顾"));
    expect(mocks.review).toHaveBeenCalledTimes(1);
  });
});
