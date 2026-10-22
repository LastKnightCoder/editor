import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphOverlayApi } from "@/components/LinkGraph";
import type {
  KnowledgeEndpoint,
  KnowledgeInsightNode,
  KnowledgeInsightsPayload,
} from "@/types/knowledge-insights";

const mocks = vi.hoisted(() => ({
  data: null as KnowledgeInsightsPayload | null,
  analyze: vi.fn(),
  setStatus: vi.fn(),
  discuss: vi.fn(async (..._args: unknown[]) => true),
  link: vi.fn(async () => true),
  setRemoteStatus: vi.fn(async () => true),
  focus: vi.fn(),
  writeCard: vi.fn(async () => {}),
  openEntity: vi.fn(async () => {}),
  dismiss: null as null | (() => void),
  preview: vi.fn(),
}));

vi.mock("../insightsQueries", () => ({
  useKnowledgeInsights: () => ({
    enabled: true,
    data: mocks.data,
    analyze: { mutate: mocks.analyze },
    setStatus: {
      mutate: (input: { nodeId: number; itemId: string; status: string }) => {
        mocks.setStatus(input);
        const patch = (node: KnowledgeInsightNode | null) =>
          node && node.id === input.nodeId
            ? {
                ...node,
                result: {
                  ...node.result,
                  marks: node.result.marks.map(mark =>
                    mark.id === input.itemId ? { ...mark, status: input.status as never } : mark
                  ),
                },
              }
            : node;
        if (mocks.data)
          mocks.data = {
            ...mocks.data,
            global: patch(mocks.data.global),
            topics: mocks.data.topics.map(topic => patch(topic)!),
          };
      },
    },
  }),
  useKnowledgeInsightsPhase: () => null,
}));
vi.mock("@/page/PageProvider", () => ({
  useOverlayDismiss: (dismiss: () => void, active: boolean) => {
    mocks.dismiss = active ? dismiss : null;
  },
}));
vi.mock("@/services/insight-chat", () => ({ discussInsight: mocks.discuss }));
vi.mock("@/services/open-content", () => ({ openEntity: mocks.openEntity }));
vi.mock("@/commands/knowledge-insights", () => ({
  linkCardsMutually: mocks.link,
  setKnowledgeInsightStatus: mocks.setRemoteStatus,
}));
vi.mock("@/services/insight-focus", () => ({ requestInsightFocus: mocks.focus }));
vi.mock("@/services/pattern-card", () => ({ startPatternCard: mocks.writeCard }));

import { useMapInsights } from "../insights/useMapInsights";

const end = (kind: "card" | "article", id: number): KnowledgeEndpoint => ({
  ref: { kind, id },
  contentId: id,
  title: `${kind}-${id}`,
  topic: "学习方法",
  heading: "",
  block: 3,
  excerpt: "要点",
});
const node = (
  id: number,
  scope: "global" | "topic",
  marks: KnowledgeInsightNode["result"]["marks"],
  topicId: number | null = null
): KnowledgeInsightNode => ({
  id,
  scope,
  parentId: null,
  projectId: null,
  label: scope === "topic" ? "JavaScript" : "",
  topicId,
  model: "m",
  updateTime: 1,
  result: {
    lead: scope === "global" ? "版图两三句" : "主题两三句",
    marks,
    asks: [],
    growth: [1, 2, 3],
    candidates: 4,
    dismissed: [],
  },
});
const fixture = (): KnowledgeInsightsPayload => ({
  configured: true,
  running: false,
  coverage: 1,
  projects: [],
  global: node(1, "global", [
    {
      id: "g1",
      kind: "bridge",
      why: "两边都在说提取练习",
      text: "主动回想比重读记得牢",
      ends: [end("card", 1), end("card", 2)],
      status: "open",
    },
    {
      id: "g2",
      kind: "asked",
      why: "问了三次",
      text: "组播地址怎么分配",
      ends: [],
      prompts: [{ sessionId: "s1", messageId: "a", text: "组播是什么", time: 1 }],
      topicLabel: "JavaScript",
      status: "open",
    },
  ]),
  topics: [
    node(
      2,
      "topic",
      [
        {
          id: "t1",
          kind: "dup",
          why: "说的是同一件事",
          ends: [end("card", 1), end("article", 3)],
          status: "open",
        },
        {
          id: "t2",
          kind: "pattern",
          why: "三处都先画状态机",
          text: "先画状态机再写代码",
          ends: [end("card", 1), end("card", 2)],
          status: "open",
        },
      ],
      5
    ),
  ],
});

const view = { scale: 1 };
const api: GraphOverlayApi = {
  subscribeFrame: () => () => undefined,
  // 节点半径随缩放：基础半径 6
  project: key => {
    const at = (
      {
        "card:1": { x: 10, y: 10 },
        "card:2": { x: 200, y: 10 },
        "article:3": { x: 60, y: 90 },
      } as Record<string, { x: number; y: number }>
    )[key];
    return at ? { ...at, r: 6 * view.scale } : null;
  },
  topicShape: topicId => (topicId === 5 ? { x: 100, y: 100, radius: 60 } : null),
  subtopicCenter: () => null,
  scale: () => view.scale,
  subtopicLabelScale: 1.3,
  nodeLabelScale: 2.4,
  flyToTopic: vi.fn(),
  flyToAll: vi.fn(),
  flyToItems: vi.fn(),
};

let root: Root;
let container: HTMLDivElement;

function Harness() {
  const insights = useMapInsights(
    [{ id: 5, parent: -1, label: "JavaScript", colorSlot: 0, size: 3 }],
    undefined,
    {
      preview: mocks.preview,
      placeOf: end => (end.ref.kind === "card" ? "卡片" : "项目文档 · 战斗细胞"),
    }
  );
  return (
    <div>
      {insights.button}
      {insights.report}
      <div ref={() => insights.overlayRef(api)}>{insights.overlay}</div>
      {insights.floating}
    </div>
  );
}

const render = () => act(() => root.render(<Harness />));
const click = (el: Element | null) =>
  act(() => {
    el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
const buttonByText = (text: string) =>
  [...document.querySelectorAll("button")].find(button => button.textContent?.includes(text)) ??
  null;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.data = null;
  mocks.dismiss = null;
  view.scale = 1;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("知识地图的洞见视图", () => {
  it("第一次：读 → 点亮，画出呼应与问了没写，报告卡带共同的道理", async () => {
    await render();
    mocks.analyze.mockImplementation((_: unknown, options: { onSuccess(): void }) => {
      mocks.data = fixture();
      options.onSuccess();
    });
    await click(buttonByText("AI 洞见"));
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
    await render();
    expect(container.textContent).toContain("版图两三句");
    expect(container.querySelectorAll("[data-map-mark]")).toHaveLength(2);
    expect(container.querySelector('[data-map-topic="5"]')).not.toBeNull();

    // 点呼应：气泡里有共同的道理；涉及的两篇在地图上标出标题、镜头让它们进入视口，其余标记降淡
    await click(container.querySelector('[data-map-mark="g1"]'));
    expect(document.body.textContent).toContain("主动回想比重读记得牢");
    expect(container.querySelector('[data-map-involved="card:1"]')?.textContent).toBe("card-1");
    expect(container.querySelector('[data-map-involved="card:2"]')).not.toBeNull();
    expect(api.flyToItems).toHaveBeenCalledWith(["card:1", "card:2"]);
    expect(container.querySelector('[data-map-mark="g2"]')?.getAttribute("class")).toContain(
      "opacity-20"
    );
    // 放大地图：圈随节点变大；地图自己画标题时不再重复标题签
    const ringOf = () =>
      Number(
        container.querySelector("svg > circle[stroke='var(--tau-accent)']")?.getAttribute("r")
      );
    expect(ringOf()).toBe(10);
    view.scale = 6;
    await render();
    expect(ringOf()).toBe(40);
    expect(container.querySelector("[data-map-involved]")).toBeNull();
    view.scale = 1;
    await render();

    // 关闭按钮与 Esc 第一层一样收起气泡；再点开继续
    await click(document.querySelector('[data-map-insight-popover] button[aria-label="关闭"]'));
    expect(document.querySelector("[data-map-insight-popover]")).toBeNull();
    await click(container.querySelector('[data-map-mark="g1"]'));
    // 呼应跨主题：在哪之后加上大主题
    expect(document.querySelector("[data-end-place]")?.textContent).toBe("卡片 · 学习方法");
    // 点气泡里的笔记：交给地图页预览，不跳转
    await click(buttonByText("《card-2》"));
    expect(mocks.preview).toHaveBeenCalledWith(
      expect.objectContaining({ ref: { kind: "card", id: 2 } })
    );
    expect(mocks.openEntity).not.toHaveBeenCalled();
    // 两端都是卡片 → 直接连
    await act(async () => {
      buttonByText("连接")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mocks.link).toHaveBeenCalledWith(1, 2);
    expect(mocks.setStatus).toHaveBeenCalledWith({ nodeId: 1, itemId: "g1", status: "linked" });
  });

  it("分析过就直接点亮；问了没写是写成卡片", async () => {
    mocks.data = fixture();
    await render();
    await click(buttonByText("AI 洞见"));
    expect(mocks.analyze).not.toHaveBeenCalled();
    await click(container.querySelector('[data-map-mark="g2"]'));
    expect(buttonByText("记为问题")).toBeNull();
    await click(buttonByText("写成卡片"));
    expect(mocks.writeCard).toHaveBeenCalledWith(1, expect.objectContaining({ id: "g2" }));
  });

  it("点主题名飞进去画主题层；长文一端的重复是去那篇连；Esc 按层退出", async () => {
    mocks.data = fixture();
    await render();
    await click(buttonByText("AI 洞见"));
    await click(container.querySelector('[data-map-topic="5"]'));
    expect(api.flyToTopic).toHaveBeenCalledWith(5);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(container.textContent).toContain("主题两三句");
    expect(container.textContent).toContain("全部主题");
    expect(container.querySelector('[data-map-mark="t1"]')).not.toBeNull();

    // 长文一端没有核对过的原文片段：只能打开看看，不登记
    await click(container.querySelector('[data-map-mark="t1"]'));
    // 重复两端在同一主题：顶部只写各自在哪，不重复主题名
    expect(
      [...document.querySelectorAll("[data-end-place]")].map(place => place.textContent)
    ).toEqual(["卡片", "项目文档 · 战斗细胞"]);
    await click(buttonByText("打开看看"));
    expect(mocks.openEntity).toHaveBeenCalledWith({ kind: "article", id: 3 }, { at: { block: 3 } });
    expect(mocks.focus).not.toHaveBeenCalled();
    expect(mocks.link).not.toHaveBeenCalled();

    // 同一思路：主按钮「写成卡片」，状态由建卡一并记下，不记问题、没有「知道了」
    await click(container.querySelector('[data-map-mark="t2"]'));
    expect(buttonByText("知道了")).toBeNull();
    const statusCalls = mocks.setStatus.mock.calls.length;
    await click(buttonByText("写成卡片"));
    expect(mocks.writeCard).toHaveBeenCalledWith(2, expect.objectContaining({ id: "t2" }));
    expect(mocks.setStatus.mock.calls.length).toBe(statusCalls);
    expect(mocks.discuss).not.toHaveBeenCalled();
    expect(document.querySelector("[data-map-insight-popover]")).toBeNull();

    // Esc：先关气泡，再回到全局，再退出
    await click(container.querySelector('[data-map-mark="t1"]'));
    await act(async () => mocks.dismiss?.());
    expect(document.querySelector("[data-map-insight-popover]")).toBeNull();
    await act(async () => {
      mocks.dismiss?.();
      vi.advanceTimersByTime(500);
    });
    expect(api.flyToAll).toHaveBeenCalled();
    expect(container.textContent).toContain("版图两三句");
    await act(async () => mocks.dismiss?.());
    expect(container.textContent).not.toContain("版图两三句");
    expect(buttonByText("AI 洞见")).not.toBeNull();
  });

  it("有发现的主题用菜单切换：按还剩几处排序，主题层顶部的主题名也能直接换", async () => {
    const data = fixture();
    const other = node(
      3,
      "topic",
      [
        { id: "u1", kind: "gap", why: "缺", text: "还缺：A", ends: [], status: "open" },
        { id: "u2", kind: "gap", why: "缺", text: "还缺：B", ends: [], status: "open" },
        { id: "u3", kind: "gap", why: "缺", text: "还缺：C", ends: [], status: "open" },
      ],
      6
    );
    mocks.data = { ...data, topics: [...data.topics, { ...other, label: "Python" }] };
    await render();
    await click(buttonByText("AI 洞见"));

    await click(buttonByText("有发现的主题 2"));
    const options = [...document.querySelectorAll("[data-map-topic-option]")];
    expect(options.map(option => option.textContent)).toEqual(["Python3", "JavaScript2"]);
    await click(options[1]);
    expect(api.flyToTopic).toHaveBeenCalledWith(5);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(container.textContent).toContain("主题两三句");

    await click(container.querySelector('button[title="切换到其他有发现的主题"]'));
    await click(document.querySelector('[data-map-topic-option="6"]'));
    expect(api.flyToTopic).toHaveBeenLastCalledWith(6);
  });

  it("逐条看：↓ 切换、⌫ 不相关、Esc 结束", async () => {
    mocks.data = fixture();
    await render();
    await click(buttonByText("AI 洞见"));
    await click(buttonByText("逐条看"));
    expect(document.body.textContent).toContain("1 / 2");
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    });
    expect(document.body.textContent).toContain("2 / 2");
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
    });
    expect(mocks.setStatus).toHaveBeenCalledWith({ nodeId: 1, itemId: "g2", status: "dismissed" });
    await act(async () => mocks.dismiss?.());
    expect(document.body.textContent).not.toContain("↑↓ 切换");
  });

  it("去连接：长文一端有原文片段时登记这一处，处理结果回写到地图那一条", async () => {
    const data = fixture();
    data.topics[0].result.marks[0].ends[1] = { ...end("article", 3), anchor: "词法环境" };
    mocks.data = data;
    await render();
    await click(buttonByText("AI 洞见"));
    await click(container.querySelector('[data-map-topic="5"]'));
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    await click(container.querySelector('[data-map-mark="t1"]'));
    await click(buttonByText("去连接"));
    expect(mocks.focus).toHaveBeenCalledTimes(1);
    const focus = mocks.focus.mock.calls[0][0];
    expect(focus.ref).toEqual({ kind: "article", id: 3 });
    expect(focus.mark).toMatchObject({
      kind: "dup",
      block: 3,
      anchor: "词法环境",
      target: { ref: { kind: "card", id: 1 } },
    });
    expect(mocks.openEntity).toHaveBeenCalledWith({ kind: "article", id: 3 }, { at: { block: 3 } });
    focus.onResolved("linked");
    expect(mocks.setRemoteStatus).toHaveBeenCalledWith(2, "t1", "linked");
  });
});
