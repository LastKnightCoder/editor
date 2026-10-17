/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import Board from "../../../Board";
import WhiteBoard from "../../../WhiteBoard";
import { GEOMETRY_TOOL_ID } from "../../../constants/tools";
import { createGeometryExtension, createInteractionExtension } from "../../../extensions/builtins";
import {
  defineElement,
  defineWhiteboardExtension,
  type WhiteboardExtension,
  type WhiteboardExtensionError,
  type WhiteboardToolContribution,
} from "../../../extensions/api";
import { useBoard } from "../../../hooks/useBoard";
import { ChromeButton, ToolbarContext } from "../../../chrome";
import type { BoardElement } from "../../../types";

const viewport = { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 };
const roots: Root[] = [];

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

async function mountBoard(extensions: readonly WhiteboardExtension[]) {
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
      <WhiteBoard
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
    );
  });
  return { board, host, root };
}

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("「扩展工具」入口", () => {
  it("第三方工具不直接出现在工具栏上，弹层中显示 label 与「来自 {name}」", async () => {
    const { board, host } = await mountBoard([
      createInteractionExtension(),
      createGeometryExtension(),
      acmeExtension,
    ]);

    // 工具栏上没有第三方工具的槽位，也不渲染它的 component
    expect(host.querySelector('[data-tool-id="acme.sticky.create"]')).toBeNull();
    expect(host.querySelectorAll("[data-tool-id]")).toHaveLength(2); // 选择 + 形状
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

describe("工具栏激活态与属性条激活态的样式分工", () => {
  it("工具栏内激活按钮只改文字色，不带 bg-accent-soft", async () => {
    const { host } = await mountBoard([createInteractionExtension()]);
    const selectButton = host.querySelector<HTMLButtonElement>('button[aria-label="选择"]')!;
    expect(selectButton.getAttribute("aria-pressed")).toBe("true");
    expect(selectButton.className).toContain("text-accent-text");
    expect(selectButton.className).not.toContain("bg-accent-soft");
  });

  it("工具栏外的 ChromeButton 激活态仍带 bg-accent-soft", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => {
      root.render(
        <>
          <ChromeButton label="属性条按钮" active>
            <i />
          </ChromeButton>
          <ToolbarContext value={true}>
            <ChromeButton label="工具栏按钮" active>
              <i />
            </ChromeButton>
          </ToolbarContext>
        </>
      );
    });
    const [attrButton, toolButton] = [...host.querySelectorAll("button")];
    expect(attrButton.className).toContain("bg-accent-soft");
    expect(toolButton.className).not.toContain("bg-accent-soft");
    expect(toolButton.className).toContain("text-accent-text");
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
