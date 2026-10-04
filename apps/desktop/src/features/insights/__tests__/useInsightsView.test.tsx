import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createEditor, Element as SlateElement, type Descendant } from "slate";
import { Editable, Slate, withReact } from "slate-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentInsights } from "@/types/content-insights";

const mocks = vi.hoisted(() => ({
  insights: null as ContentInsights | null,
  analyze: vi.fn(),
  setStatus: vi.fn(),
  capture: vi.fn(),
  openEntity: vi.fn(async () => {}),
  dismiss: null as null | (() => void),
}));

vi.mock("../queries", () => ({
  useContentInsights: () => ({
    enabled: true,
    insights: mocks.insights,
    analyze: { mutate: mocks.analyze },
    setStatus: {
      mutate: (input: { itemId: string; status: string }) => {
        mocks.setStatus(input);
        if (!mocks.insights) return;
        mocks.insights = {
          ...mocks.insights,
          result: {
            ...mocks.insights.result,
            marks: mocks.insights.result.marks.map(m =>
              m.id === input.itemId ? { ...m, status: input.status as never } : m
            ),
          },
        };
      },
    },
  }),
  useInsightsPhase: () => null,
}));
vi.mock("@/features/context/queries", () => ({ useEntityContext: () => ({ data: null }) }));
vi.mock("@/page/PageProvider", () => ({
  useOverlayDismiss: (dismiss: () => void, active: boolean) => {
    mocks.dismiss = active ? dismiss : null;
  },
}));
vi.mock("@/services/question-capture", () => ({ requestQuestionCapture: mocks.capture }));
vi.mock("@/services/open-content", () => ({ openEntity: mocks.openEntity }));

import { requestInsightFocus } from "@/services/insight-focus";
import { InsightLeaf } from "../components/InsightLeaf";
import { useInsightsView } from "../useInsightsView";

const value: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "读 offsetTop 时会触发强制同步布局，代价很高。" }],
  },
  { type: "paragraph", children: [{ type: "formatted", text: "只改 transform 时只走合成。" }] },
] as unknown as Descendant[];

const target = {
  ref: { kind: "card" as const, id: 7 },
  contentId: 70,
  title: "掉帧排查",
  heading: "",
  block: 0,
  excerpt: "滚动回调里读 offsetTop",
};
const fixture = (): ContentInsights => ({
  contentId: 1,
  model: "p/m",
  analyzedAt: 1,
  stale: false,
  result: {
    lead: "这是渲染主题里的一篇。",
    candidates: 12,
    asks: [{ id: "q1", text: "为什么只走合成？", status: "open" }],
    marks: [
      {
        id: "m1",
        kind: "link",
        block: 0,
        anchor: "强制同步布局",
        text: "",
        why: "那张卡是真实案例",
        target,
        status: "open",
      },
      {
        id: "m2",
        kind: "conflict",
        block: 1,
        anchor: "只走合成",
        text: "",
        why: "条件不同",
        target,
        mine: "只走合成",
        theirs: "会重绘",
        status: "open",
      },
      {
        id: "m3",
        kind: "gap",
        block: 1,
        anchor: "",
        text: "合成层怎么划分",
        why: "没写",
        status: "open",
      },
    ],
  },
});

let editor: ReturnType<typeof withReact>;
/** 编辑器实例暂不可取（如外部 ref 在提交期间短暂为空）时，装饰也不能依赖它 */
let editorReachable = true;
function Harness() {
  const [instance] = useState(() => {
    const e = withReact(createEditor());
    const { isInline } = e;
    e.isInline = el => (el as { type?: string }).type === "content-link" || isInline(el);
    editor = e;
    return e;
  });
  const view = useInsightsView({
    ref: { kind: "article", id: 3 },
    contentId: 1,
    sourceLabel: "文章：渲染",
    getEditor: () => (editorReachable ? instance : null),
  });
  return (
    <div>
      {view.button}
      {view.report}
      {view.frame(
        <Slate editor={instance} initialValue={value}>
          <Editable
            decorate={view.editorProps.decorate}
            renderLeaf={props => (
              <span {...props.attributes}>
                <InsightLeaf leaf={props.leaf}>{props.children}</InsightLeaf>
              </span>
            )}
          />
        </Slate>
      )}
    </div>
  );
}

let host: HTMLDivElement;
let root: Root;
const buttons = () => [...document.querySelectorAll("button")];
const byText = (text: string) => buttons().find(b => b.textContent?.includes(text));
const down = (el: Element | null | undefined) =>
  act(() => {
    el?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  });
const rerender = () => act(async () => root.render(<Harness />));
const inPopover = (text: string) =>
  [...document.querySelectorAll("[data-insight-popover] button")].find(b =>
    b.textContent?.includes(text)
  );
const click = (el: Element | null | undefined) =>
  act(() => {
    (el as HTMLElement | undefined)?.click();
  });

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
  } as never;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  mocks.insights = null;
  editorReachable = true;
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("洞见视图", () => {
  it("没分析过：点按钮进入「读」，分析完点亮：报告、两处画线、一条段尾淡注", async () => {
    mocks.analyze.mockImplementation((_: unknown, options: { onSuccess(): void }) => {
      mocks.insights = fixture();
      options.onSuccess();
    });
    click(byText("AI 洞见"));
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
    expect(byText("退出洞见")).toBeTruthy();
    expect(document.body.textContent).toContain("这是渲染主题里的一篇。");
    expect(document.body.textContent).toContain("读了 12 份候选，留下 3 处");
    expect(document.querySelectorAll('[data-insight-mark="m1"]').length).toBeGreaterThan(0);
    expect(document.querySelector('[data-insight-mark="m2"]')?.className).toContain(
      "decoration-wavy"
    );
    expect(document.querySelector('[data-insight-gap="m3"]')?.textContent).toContain(
      "合成层怎么划分"
    );
  });

  it("装饰只用 Slate 传入的块节点：取不到编辑器实例时照样画线，点「可连接」出气泡", async () => {
    mocks.insights = fixture();
    editorReachable = false;
    await rerender();
    click(byText("AI 洞见"));
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(document.querySelectorAll('[data-insight-mark="m1"]').length).toBeGreaterThan(0);
    click(byText("可连接"));
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(document.body.textContent).toContain("那张卡是真实案例");
  });

  it("点标记出气泡；连接后那几个字变成 content-link，状态记为已连接", async () => {
    mocks.insights = fixture();
    await rerender();
    click(byText("AI 洞见"));
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(mocks.analyze).not.toHaveBeenCalled();
    down(document.querySelector('[data-insight-mark="m1"]'));
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(document.body.textContent).toContain("那张卡是真实案例");
    click(inPopover("连接"));
    const link = (editor.children[0] as SlateElement).children.find(child =>
      SlateElement.isElement(child)
    ) as unknown as {
      type: string;
      contentId: number;
    };
    expect(link).toMatchObject({ type: "content-link", contentId: 70 });
    expect(mocks.setStatus).toHaveBeenCalledWith({ itemId: "m1", status: "linked" });
  });

  it("矛盾「记为问题」走命令面板，来源为本文；点正文退出视图", async () => {
    mocks.insights = fixture();
    await rerender();
    click(byText("AI 洞见"));
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    down(document.querySelector('[data-insight-mark="m2"]'));
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(document.body.textContent).toContain("会重绘");
    click(inPopover("记为问题"));
    expect(mocks.capture).toHaveBeenCalledWith({
      source: { kind: "material", target: { targetType: "article", targetId: 3 } },
      sourceLabel: "文章：渲染",
      defaultTitle: "条件不同",
    });
    down(document.querySelector('[data-slate-editor="true"] [data-slate-string]'));
    expect(byText("AI 洞见")).toBeTruthy();
    expect(document.querySelector("[data-insight-mark]")).toBeNull();
  });

  it("逐条看：按正文顺序，⌫ 不相关后跳到下一处；Esc 先结束逐条看再退出", async () => {
    mocks.insights = fixture();
    await rerender();
    click(byText("AI 洞见"));
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    click(byText("逐条看"));
    expect(document.body.textContent).toContain("1 / 3");
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
    });
    expect(mocks.setStatus).toHaveBeenCalledWith({ itemId: "m1", status: "dismissed" });
    await act(async () => mocks.dismiss?.());
    expect(document.body.textContent).not.toContain("↑↓ 切换");
    await act(async () => mocks.dismiss?.());
    expect(byText("AI 洞见")).toBeTruthy();
  });

  it("从知识地图去连接：只画带来的那一处、不显示报告卡，连接后回写到地图", async () => {
    mocks.insights = fixture();
    const onResolved = vi.fn();
    await act(async () => {
      requestInsightFocus({
        ref: { kind: "article", id: 3 },
        mark: { ...fixture().result.marks[0], id: "map-t1", why: "地图上的重复" },
        onResolved,
      });
    });
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(byText("退出洞见")).toBeTruthy();
    expect(document.body.textContent).not.toContain("这是渲染主题里的一篇。");
    expect(document.querySelectorAll('[data-insight-mark="map-t1"]').length).toBeGreaterThan(0);
    expect(document.querySelector('[data-insight-mark="m2"]')).toBeNull();
    expect(document.body.textContent).toContain("地图上的重复");
    click(inPopover("连接"));
    expect(onResolved).toHaveBeenCalledWith("linked");
    expect(mocks.setStatus).not.toHaveBeenCalled();
    expect(byText("AI 洞见")).toBeTruthy();
  });
});
