import { I18nRuntimeProvider } from "@tau/i18n/react";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import { insightsTranslator as tr } from "../i18n";
import { COMPOSE_INSIGHTS_COPY } from "@/features/compose/insights";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createEditor, Transforms, Element as SlateElement, type Descendant } from "slate";
import { Editable, Slate, withReact, ReactEditor } from "slate-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentInsights, ContentInsightsPhase } from "@/types/content-insights";

const mocks = vi.hoisted(() => ({
  insights: null as ContentInsights | null,
  phase: null as ContentInsightsPhase | null,
  copy: undefined as undefined | { label: string; title: string },
  analyze: vi.fn(),
  setStatus: vi.fn(),
  discuss: vi.fn(async (..._args: unknown[]) => true),
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
  useInsightsPhase: () => mocks.phase,
}));
vi.mock("@/features/context/queries", () => ({ useEntityContext: () => ({ data: null }) }));
vi.mock("@/page/PageProvider", () => ({
  useOverlayDismiss: (dismiss: () => void, active: boolean) => {
    mocks.dismiss = active ? dismiss : null;
  },
}));
vi.mock("@/services/insight-chat", () => ({ discussInsight: mocks.discuss }));
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

let editor: ReturnType<typeof createEditor>;
let observedView: ReturnType<typeof useInsightsView> | undefined;
let originalLocale: string;
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
    getEditor: () => (editorReachable ? instance : null),
    copy: mocks.copy,
  });
  observedView = view;
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
const renderHarness = () => (
  <I18nRuntimeProvider runtime={desktopI18n}>
    <Harness />
  </I18nRuntimeProvider>
);
const rerender = () => act(async () => root.render(renderHarness()));
const inPopover = (text: string) =>
  [...document.querySelectorAll("[data-insight-popover] button")].find(b =>
    b.textContent?.includes(text)
  );
const click = (el: Element | null | undefined) =>
  act(() => {
    (el as HTMLElement | undefined)?.click();
  });

beforeEach(async () => {
  originalLocale = desktopLocaleSource.getSnapshot();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
  } as never;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  mocks.insights = null;
  mocks.phase = null;
  mocks.copy = undefined;
  editorReachable = true;
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(renderHarness()));
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    desktopLocaleSource.setLocale(originalLocale);
  });
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

  it("矛盾「聊一聊」带上本文与对方开对话，发出后标为已处理；点正文退出视图", async () => {
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
    await act(async () => {
      click(inPopover("聊一聊"));
    });
    expect(mocks.discuss).toHaveBeenCalledTimes(1);
    const [prompt, notes] = mocks.discuss.mock.calls[0] as [string, unknown[]];
    expect(prompt).toContain("条件不同");
    expect(prompt).toContain("《掉帧排查》：会重绘");
    expect(notes).toEqual([{ ref: { kind: "article", id: 3 }, contentId: 1, title: "" }, target]);
    expect(mocks.setStatus).toHaveBeenCalledWith({ itemId: "m2", status: "linked" });
    down(document.querySelector('[data-slate-editor="true"] [data-slate-string]'));
    expect(byText("AI 洞见")).toBeTruthy();
    expect(document.querySelector("[data-insight-mark]")).toBeNull();
  });

  it("可以展开「去补写」收起洞见并标为已处理", async () => {
    mocks.insights = fixture();
    await rerender();
    click(byText("AI 洞见"));
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    click(document.querySelector('[data-insight-gap="m3"]'));
    down(document.querySelector('[data-insight-gap="m3"]'));
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    click(inPopover("去补写"));
    expect(mocks.setStatus).toHaveBeenCalledWith({ itemId: "m3", status: "linked" });
    expect(document.querySelector("[data-insight-gap]")).toBeNull();
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

it("已有宿主copy getter与进行中的阶段换语只刷新UI，不重分析或更换原编辑器", async () => {
  mocks.copy = COMPOSE_INSIGHTS_COPY;
  mocks.phase = { contentId: 1, phase: "candidates", notes: 12345, candidates: 2 };
  let complete: (() => void) | undefined;
  mocks.analyze.mockImplementation((_input: unknown, options: { onSuccess(): void }) => {
    complete = options.onSuccess;
  });
  await rerender();
  const trigger = byText(COMPOSE_INSIGHTS_COPY.label);
  if (!trigger) throw new Error("Host copy button missing");
  const currentEditor = editor,
    data = JSON.stringify(editor.children),
    editable = host.querySelector('[data-slate-editor="true"]');
  for (const locale of ["en-US", "zh-TW"]) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(trigger.textContent?.trim()).toBe(COMPOSE_INSIGHTS_COPY.label);
    expect(trigger.title).toBe(COMPOSE_INSIGHTS_COPY.title);
    expect(editor).toBe(currentEditor);
    expect(host.querySelector('[data-slate-editor="true"]')).toBe(editable);
    expect(mocks.analyze).not.toHaveBeenCalled();
  }
  await click(trigger);
  const progress = host.querySelector('[role="status"]');
  if (!progress) throw new Error("Reading phase missing");
  let previous = progress.textContent;
  for (const locale of ["en-US", "zh-CN"]) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(host.querySelector('[role="status"]')).toBe(progress);
    expect(progress.textContent).not.toBe(previous);
    previous = progress.textContent;
    expect(observedView?.view).toBe("reading");
    expect(editor).toBe(currentEditor);
    expect(JSON.stringify(editor.children)).toBe(data);
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
    expect(mocks.setStatus).not.toHaveBeenCalled();
  }
  if (!complete) throw new Error("Pending analysis callback missing");
  const finish = complete;
  await act(async () => {
    mocks.insights = fixture();
    finish();
  });
  expect(observedView?.view).toBe("on");
  expect(mocks.analyze).toHaveBeenCalledTimes(1);
});

it("换语入口标签不重渲染正文，未同步的原生反向拖选保留原节点和选区", async () => {
  const currentEditor = editor,
    editable = host.querySelector<HTMLElement>('[data-slate-editor="true"]');
  if (!editable) throw new Error("Editor missing");
  const [text] = ReactEditor.toDOMPoint(editor, { path: [0, 0], offset: 0 });
  const selection = window.getSelection();
  if (!selection) throw new Error("Native selection missing");
  const data = JSON.stringify(editor.children);
  for (const locale of ["en-US", "zh-TW"]) {
    await act(async () => {
      editable.focus();
      Transforms.select(editor, { path: [0, 0], offset: 0 });
    });
    await act(async () => {
      selection.setBaseAndExtent(text, 8, text, 2);
      desktopLocaleSource.setLocale(locale);
    });
    expect(selection.toString()).toBe("offset");
    expect(selection.anchorNode).toBe(text);
    expect([selection.anchorOffset, selection.focusOffset]).toEqual([8, 2]);
    expect(host.querySelector('[data-slate-editor="true"]')).toBe(editable);
    expect(editor).toBe(currentEditor);
    expect(JSON.stringify(editor.children)).toBe(data);
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.setStatus).not.toHaveBeenCalled();
  }
});

it("逐条看换语保留同标记/气泡和装饰器，主动作仍按原kind发送原AI提问与目标", async () => {
  mocks.insights = fixture();
  await rerender();
  await click(byText(tr.t("insights.title")));
  await act(async () => vi.advanceTimersByTime(20));
  await click(byText(tr.t("insights.walk")));
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" })));
  await act(async () => vi.advanceTimersByTime(20));
  const popover = document.querySelector("[data-insight-popover]"),
    mark = host.querySelector('[data-insight-mark="m2"]'),
    currentEditor = editor,
    decorate = observedView?.editorProps.decorate,
    data = JSON.stringify(editor.children);
  if (!popover || !mark) throw new Error("Active conflict missing");
  for (const locale of ["en-US", "zh-TW"]) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(document.querySelector("[data-insight-popover]")).toBe(popover);
    expect(host.querySelector('[data-insight-mark="m2"]')).toBe(mark);
    expect(observedView?.current).toBe("m2");
    expect(observedView?.editorProps.decorate).toBe(decorate);
    expect(editor).toBe(currentEditor);
    expect(JSON.stringify(editor.children)).toBe(data);
    expect(popover.textContent).toContain("条件不同");
    expect(mocks.discuss).not.toHaveBeenCalled();
    expect(mocks.setStatus).not.toHaveBeenCalled();
  }
  await click(inPopover(tr.t("insights.discuss")));
  expect(mocks.discuss).toHaveBeenCalledExactlyOnceWith(
    "这两处说法不一致：条件不同\n这篇：只走合成\n《掉帧排查》：会重绘\n帮我想想哪个对，或者各自成立的条件。",
    [{ ref: { kind: "article", id: 3 }, contentId: 1, title: "" }, target]
  );
  expect(mocks.setStatus).toHaveBeenCalledExactlyOnceWith({ itemId: "m2", status: "linked" });
});
