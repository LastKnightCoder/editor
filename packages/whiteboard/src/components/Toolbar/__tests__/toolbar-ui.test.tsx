/**
 * @vitest-environment jsdom
 */
import { createI18nRuntime, createLocaleStore, type I18nRuntime } from "@tau/i18n";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { whiteboardMessages } from "../../../messages";
import { standaloneWhiteboardI18n, whiteboardT } from "../../../i18n-runtime";
import { menuLabelReader, menuText } from "../../../menu-i18n";
import { geometryItems } from "../Geometry/config";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import Board from "../../../Board";
import Whiteboard from "../../../Whiteboard";
import {
  GEOMETRY_TOOL_ID,
  HAND_TOOL_ID,
  RICHTEXT_TOOL_ID,
  SELECT_TOOL_ID,
} from "../../../constants/tools";
import {
  createGeometryExtension,
  createInteractionExtension,
  createRichTextExtension,
} from "../../../extensions/builtins";
import {
  defineElement,
  defineWhiteboardExtension,
  type WhiteboardExtension,
  type WhiteboardExtensionError,
  type WhiteboardToolContribution,
} from "../../../extensions/api";
import { useBoard } from "../../../hooks/useBoard";
import type { BoardElement } from "../../../types";
import { useWhiteboardAPI } from "../../../extensions/context";

const viewport = { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 };
const roots: Root[] = [];
const runtimes: I18nRuntime[] = [];

/** 第三方测试扩展：创建型便签工具（带独立图标）与命令型动作工具 */
const StickyIcon = () => <i data-acme-sticky-icon />;
const acmeExtension = defineWhiteboardExtension({
  id: "acme.notes",
  name: "Acme 便签",
  elements: [
    defineElement({
      type: "acme.sticky",
      render: () => null,
      create: {
        gesture: "click",
        defaultSize: [160, 160],
        build: ctx =>
          ({
            type: "acme.sticky",
            x: ctx.rect.x,
            y: ctx.rect.y,
            width: ctx.rect.width,
            height: ctx.rect.height,
          }) as unknown as BoardElement,
      },
    }),
  ],
  create: () => ({
    tools: [
      {
        id: "acme.sticky.create",
        element: "acme.sticky",
        order: 5,
        group: "acme",
        label: "便签",
        icon: StickyIcon,
      },
    ],
  }),
});

/** 扩展工具弹层的浮层卡片（形状弹层等卡片常驻 DOM，按内容区分） */
const extToolsCard = () =>
  [...document.querySelectorAll<HTMLElement>("[data-float-card]")].find(card =>
    card.textContent?.includes("来自 Acme 便签")
  )!;

async function mountBoard(extensions: readonly WhiteboardExtension[], runtime?: I18nRuntime) {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
  let board!: Board;
  function Capture() {
    board = useBoard();
    return null;
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      <I18nRuntimeProvider runtime={runtime ?? standaloneWhiteboardI18n}>
        <Whiteboard
          extensions={[
            ...extensions,
            defineWhiteboardExtension({
              id: "test.capture",
              create: () => ({
                layers: [{ id: "test.capture.layer", position: "canvas", component: Capture }],
              }),
            }),
          ]}
          initData={[]}
          initViewPort={viewport}
          showAttributeSetter={false}
          showStatusBar={false}
        />
      </I18nRuntimeProvider>
    );
  });
  return { board, host, root };
}

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  for (const runtime of runtimes.splice(0)) runtime.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("「扩展工具」入口", () => {
  it("参数面板先选择再执行，返回和关闭不激活工具，重新打开从列表开始", async () => {
    const localeSource = createLocaleStore("zh-CN");
    const runtime = createI18nRuntime({ localeSource });
    runtimes.push(runtime);
    let delayedRun: ((payload?: unknown) => void) | undefined;
    const panelExtension = defineWhiteboardExtension({
      ...acmeExtension,
      create: api => ({
        tools: acmeExtension.create(api).tools!.map(tool => ({
          ...tool,
          panel: function TestPanel({ run }) {
            delayedRun = run;
            const scoped = useWhiteboardAPI();
            return (
              <>
                <input defaultValue="插件默认值" />
                <button
                  onClick={() => run({ pose: "wave", sameBoard: scoped.children.length === 0 })}
                >
                  选择挥手
                </button>
              </>
            );
          },
        })),
      }),
    });
    const { board, host } = await mountBoard(
      [createInteractionExtension(), panelExtension],
      runtime
    );
    const click = async (button: HTMLButtonElement) =>
      act(async () => {
        button.click();
      });
    const entry = host.querySelector<HTMLButtonElement>('button[aria-label="扩展工具"]')!;
    const pickTool = () =>
      [...extToolsCard().querySelectorAll("button")].find(b => b.textContent?.includes("便签"))!;
    const back = () =>
      document.querySelector<HTMLButtonElement>('button[aria-label="返回扩展工具"]')!;
    await click(entry);
    await click(pickTool());
    const closedRun = delayedRun!;
    const input = document.querySelector("input");
    if (!input) throw new Error("插件参数输入未挂载");
    input.value = "用户插件草稿";
    input.focus();
    input.setSelectionRange(1, 3);
    const extensions = board.extensions;
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => localeSource.setLocale(locale));
      expect(document.querySelector("input")).toBe(input);
      expect(input.value).toBe("用户插件草稿");
      expect(document.activeElement).toBe(input);
      expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
      expect(board.extensions).toBe(extensions);
      expect(board.activeTool).toBe(SELECT_TOOL_ID);
    }
    await act(async () => localeSource.setLocale("zh-CN"));
    expect(board.activeTool).toBe("tau.select");
    await click(back());
    await act(async () => closedRun({ pose: "stale" }));
    expect(board.activeTool).toBe("tau.select");
    await click(pickTool());
    await click(entry);
    await click(entry);
    expect(back()).toBeNull();
    await click(pickTool());
    await click([...document.querySelectorAll("button")].find(b => b.textContent === "选择挥手")!);
    expect(board.activeTool).toBe("acme.sticky.create");
    expect(board.activeToolOptions).toEqual({ pose: "wave", sameBoard: true });
    expect(back()).toBeNull();
  });
  it("面板抛错后保留返回入口，不执行工具", async () => {
    const localeSource = createLocaleStore("zh-CN");
    const runtime = createI18nRuntime({ localeSource });
    runtimes.push(runtime);
    let attempts = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = defineWhiteboardExtension({
      ...acmeExtension,
      create: api => ({
        tools: acmeExtension.create(api).tools!.map(tool => ({
          ...tool,
          panel: () => {
            attempts++;
            throw new Error("面板错误");
          },
        })),
      }),
    });
    const { board, host } = await mountBoard([createInteractionExtension(), broken], runtime);
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="扩展工具"]')!.click()
    );
    await act(async () =>
      [...extToolsCard().querySelectorAll("button")]
        .find(b => b.textContent?.includes("便签"))!
        .click()
    );
    const alert = document.querySelector('[role="alert"]');
    if (!alert) throw new Error("面板失败状态未显示");
    const failedAttempts = attempts;
    const label = alert.textContent;
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => localeSource.setLocale(locale));
      expect(document.querySelector('[role="alert"]')).toBe(alert);
      expect(attempts).toBe(failedAttempts);
      expect(board.activeTool).toBe(SELECT_TOOL_ID);
    }
    expect(alert.textContent).not.toBe(label);
    await act(async () => localeSource.setLocale("zh-CN"));
    expect(board.activeTool).toBe("tau.select");
    await act(async () =>
      document.querySelector<HTMLButtonElement>('button[aria-label="返回扩展工具"]')!.click()
    );
    expect(extToolsCard()).toBeTruthy();
  });
  it("第三方工具不直接出现在工具栏上，弹层中显示 label 与「来自 {name}」", async () => {
    const { board, host } = await mountBoard([
      createInteractionExtension(),
      createGeometryExtension(),
      acmeExtension,
    ]);

    // 工具栏上没有第三方工具的槽位，也不渲染它的 component
    expect(host.querySelector('[data-tool-id="acme.sticky.create"]')).toBeNull();
    for (const slot of host.querySelectorAll<HTMLElement>("[data-tool-id]")) {
      expect(slot.dataset.toolId).toMatch(/^tau\./);
    }
    expect(board.extensions!.tools.map(tool => tool.id)).toContain("acme.sticky.create");

    const entry = host.querySelector<HTMLButtonElement>('button[aria-label="扩展工具"]')!;
    expect(entry).toBeTruthy();
    await act(async () => {
      entry.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // 画布上可能有多个浮层卡片（形状弹层等常驻 DOM），按内容定位扩展工具弹层
    const card = extToolsCard();
    expect(card.getAttribute("data-open")).toBe("true");
    expect(card.textContent).toContain("扩展工具");
    expect(card.textContent).toContain("便签");
    expect(card.textContent).toContain("来自 Acme 便签");
  });

  it("没有第三方工具时不渲染扩展工具按钮", async () => {
    const { host } = await mountBoard([createInteractionExtension(), createGeometryExtension()]);
    expect(host.querySelector('button[aria-label="扩展工具"]')).toBeNull();
  });

  it("弹层中选中第三方工具：activeTool 改变、入口激活、图标更换、弹层关闭", async () => {
    const { board, host } = await mountBoard([
      createInteractionExtension(),
      createGeometryExtension(),
      acmeExtension,
    ]);
    const entry = host.querySelector<HTMLButtonElement>('button[aria-label="扩展工具"]')!;
    await act(async () => {
      entry.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const item = [...extToolsCard().querySelectorAll("button")].find(button =>
      button.textContent?.includes("便签")
    )!;
    expect(item.getAttribute("aria-pressed")).toBe("false");
    await act(async () => {
      item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(board.activeTool).toBe("acme.sticky.create");
    expect(entry.getAttribute("aria-pressed")).toBe("true");
    // 图标换成最近用过的扩展工具图标
    expect(entry.querySelector("[data-acme-sticky-icon]")).toBeTruthy();
    expect(extToolsCard().getAttribute("data-open")).toBe("false");
  });
});

it("箭头只展开模式菜单，选中后主按钮能从绘图工具切回该模式", async () => {
  const { board, host } = await mountBoard([
    createInteractionExtension(),
    createRichTextExtension(),
    createGeometryExtension(),
  ]);
  const arrow = host.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  if (!arrow) throw new Error("缺少模式菜单入口");
  await act(async () => arrow.click());
  expect(board.activeTool).toBe(SELECT_TOOL_ID);
  const menu = document.querySelector('[role="menu"][data-open="true"]');
  const textMode = [...(menu?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])].find(
    item => item.textContent === "文本"
  );
  if (!textMode) throw new Error("缺少文本模式选项");
  await act(async () => textMode.click());
  expect(board.activeTool).toBe(RICHTEXT_TOOL_ID);
  expect(arrow.getAttribute("aria-expanded")).toBe("false");

  await act(async () => {
    board.setActiveTool(GEOMETRY_TOOL_ID);
  });
  const main = host.querySelector<HTMLButtonElement>('button[aria-label="文本"]');
  if (!main) throw new Error("主按钮未保留文本模式");
  expect(main.getAttribute("aria-pressed")).toBe("false");
  await act(async () => main.click());
  expect(board.activeTool).toBe(RICHTEXT_TOOL_ID);
  await act(async () => main.click());
  expect(board.activeTool).toBe(RICHTEXT_TOOL_ID);

  await act(async () => {
    board.setActiveTool(HAND_TOOL_ID);
  });
  expect(main.getAttribute("aria-label")).toBe("抓手");
  expect(main.getAttribute("aria-pressed")).toBe("true");
});

describe("滑动激活指示块", () => {
  it("激活不同工具时指示块 left 随之变化（jsdom 下 mock offsetLeft）", async () => {
    const { board, host } = await mountBoard([
      createInteractionExtension(),
      createGeometryExtension(),
    ]);
    const selectSpan = host.querySelector<HTMLElement>('[data-tool-id="tau.select"]')!;
    const geometrySpan = host.querySelector<HTMLElement>(`[data-tool-id="${GEOMETRY_TOOL_ID}"]`)!;
    expect(selectSpan).toBeTruthy();
    expect(geometrySpan).toBeTruthy();
    Object.defineProperty(selectSpan, "offsetLeft", { value: 0, configurable: true });
    Object.defineProperty(selectSpan, "offsetWidth", { value: 30, configurable: true });
    Object.defineProperty(geometrySpan, "offsetLeft", { value: 42, configurable: true });
    Object.defineProperty(geometrySpan, "offsetWidth", { value: 30, configurable: true });

    const indicator = host.querySelector<HTMLElement>(".bg-accent-soft")!;
    expect(indicator.getAttribute("aria-hidden")).toBe("true");
    expect(indicator.style.left).toBe("0px");

    await act(async () => {
      board.setActiveTool(GEOMETRY_TOOL_ID, { geometryType: "circle", paths: [] });
    });
    expect(indicator.style.left).toBe("42px");
    expect(indicator.style.width).toBe("30px");
    expect(indicator.style.opacity).toBe("1");
  });
});

describe("工具元数据装配校验", () => {
  it("工具缺 label 或缺 icon 时扩展被拒（invalid-definition）", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const errors: WhiteboardExtensionError[] = [];
    const board = new Board([], viewport, { selectedElements: [], selectArea: null });
    board.installExtensions(
      [
        defineWhiteboardExtension({
          id: "acme.nolabel",
          create: () => ({
            commands: [{ id: "acme.nolabel.run", execute: () => {} }],
            tools: [
              {
                id: "acme.nolabel.tool",
                command: "acme.nolabel.run",
                order: 1,
                group: "acme",
                label: "",
                icon: () => null,
              },
            ],
          }),
        }),
        defineWhiteboardExtension({
          id: "acme.noicon",
          create: () => ({
            commands: [{ id: "acme.noicon.run", execute: () => {} }],
            tools: [
              // 故意缺 icon：按协议应被拒绝装配（类型上以 as 模拟第三方漏写）
              {
                id: "acme.noicon.tool",
                command: "acme.noicon.run",
                order: 1,
                group: "acme",
                label: "测试",
              } as unknown as WhiteboardToolContribution,
            ],
          }),
        }),
      ],
      error => errors.push(error)
    );
    board.destroy();
    expect(errors.map(error => error.reason)).toEqual(["invalid-definition", "invalid-definition"]);
    expect(errors[0].message).toContain("label");
    expect(errors[1].message).toContain("icon");
  });
});

it("继承语言变化保留打开的形状菜单、同一扩展与原始创建参数", async () => {
  const localeSource = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource });
  runtimes.push(runtime);
  const { t } = runtime.get(whiteboardMessages);
  const { board, host } = await mountBoard(
    [createInteractionExtension(), createGeometryExtension()],
    runtime
  );
  const extensions = board.extensions;
  const selection = board.selection;
  const children = board.children;
  const open = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${t("toolbar.geometry")}"]`
  );
  if (!open) throw new Error("形状工具未挂载");
  await act(async () => open.click());
  const shape = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    button => button.textContent === t("shape.rectangle")
  );
  if (!shape) throw new Error("形状选项未挂载");
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => localeSource.setLocale(locale));
    expect(board.extensions).toBe(extensions);
    expect(board.selection).toBe(selection);
    expect(board.children).toBe(children);
    expect(board.isDestroyed).toBe(false);
    expect(
      [...document.querySelectorAll("button")].find(
        button => button.textContent === t("shape.rectangle")
      )
    ).toBe(shape);
    expect(board.activeTool).toBe(SELECT_TOOL_ID);
  }
  await act(async () => shape.click());
  expect(board.activeTool).toBe(GEOMETRY_TOOL_ID);
  expect(board.activeToolOptions).toMatchObject(geometryItems[0]);
});

it("菜单换语不重跑菜单工厂或失效动作，消息参数固定且各画布运行时互不串用", async () => {
  const localeSource = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource });
  const otherRuntime = createI18nRuntime({ localeSource: createLocaleStore("en-US") });
  runtimes.push(runtime, otherRuntime);
  const { t } = runtime.get(whiteboardMessages);
  const { board } = await mountBoard(
    [createInteractionExtension(), createGeometryExtension()],
    runtime
  );
  const other = await mountBoard([createInteractionExtension()], otherRuntime);
  const standalone = await mountBoard([createInteractionExtension()]);
  const getContextMenu = vi.spyOn(board, "getContextMenu");
  const context = {
    clientX: 10,
    clientY: 10,
    viewPortPoint: { x: 10, y: 10 },
    selectedElements: [],
    hitElements: [],
    targetElements: [],
    isHitSelected: false,
  };
  await act(async () => board.emit("internal:context-menu", context));
  expect(getContextMenu).toHaveBeenCalledTimes(1);
  const menu = document.querySelector('[role="menu"][data-open="true"]');
  if (!menu) throw new Error("上下文菜单未打开");
  const firstLabel = menu.textContent;
  const items = getContextMenu.mock.results[0].value as ReturnType<Board["getContextMenu"]>;
  const action = items
    .find(item => item.key === "create-geometry")
    ?.children?.find(item => item.key === "create-geometry-rectangle");
  if (!action || !board.extensions) throw new Error("形状菜单动作未注册");
  const values = { name: "打开时的值" };
  const [bound] = board.extensions.registerMenu("geometry", [
    {
      key: "parameter",
      ...menuText(board, "toolbar.from", values),
      priority: 0,
      onSelect: () => undefined,
    },
  ]);
  const read = menuLabelReader(board, bound);
  values.name = "之后的值";
  await act(async () => localeSource.setLocale("zh-TW"));
  expect(whiteboardT(board, "toolbar.geometry")).toBe(t("toolbar.geometry"));
  expect(whiteboardT(other.board, "toolbar.geometry")).toBe(
    otherRuntime.get(whiteboardMessages).t("toolbar.geometry")
  );
  expect(whiteboardT(standalone.board, "toolbar.geometry")).toBe(
    standaloneWhiteboardI18n.get(whiteboardMessages).t("toolbar.geometry")
  );
  await act(async () => localeSource.setLocale("en-US"));
  expect(document.querySelector('[role="menu"][data-open="true"]')).toBe(menu);
  expect(menu.textContent).not.toBe(firstLabel);
  expect(getContextMenu).toHaveBeenCalledTimes(1);
  expect(read()).toBe(t("toolbar.from", { name: "打开时的值" }));
  await act(async () => action.onSelect({ ...context, board }));
  expect(board.activeTool).toBe(GEOMETRY_TOOL_ID);
  expect(board.activeToolOptions).toMatchObject(geometryItems[0]);
});
