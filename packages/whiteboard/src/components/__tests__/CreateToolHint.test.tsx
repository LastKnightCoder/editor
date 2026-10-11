/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type Board from "../../Board";
import WhiteBoard from "../../WhiteBoard";
import { SELECT_TOOL_ID, GEOMETRY_TOOL_ID, HANDWRITE_TOOL_ID } from "../../constants/tools";
import {
  createGeometryExtension,
  createHandwriteExtension,
  createInteractionExtension,
} from "../../extensions/builtins";
import {
  defineElement,
  defineWhiteboardExtension,
  type WhiteboardExtension,
} from "../../extensions/api";
import { useBoard } from "../../hooks/useBoard";
import type { BoardElement } from "../../types";

const viewport = { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 };
const roots: Root[] = [];

/** 第三方 click 工具（不带 hint，走缺省文案兜底） */
const stickyExtension = defineWhiteboardExtension({
  id: "acme.notes",
  name: "Acme 便签",
  create: () => ({
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
    tools: [
      {
        id: "acme.sticky.create",
        element: "acme.sticky",
        order: 5,
        group: "acme",
        label: "便签",
        icon: () => null,
      },
    ],
  }),
});

interface HintBoard {
  board: Board;
  host: HTMLDivElement;
  hint: () => HTMLElement | null;
  fire: (type: "pointerdown" | "pointermove" | "pointerup", x: number, y: number) => Promise<void>;
  press: (key: string) => Promise<void>;
}

async function mountHintBoard(
  extensions: readonly WhiteboardExtension[],
  options: { readonly?: boolean } = {}
): Promise<HintBoard> {
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
        readonly={options.readonly}
      />
    );
  });
  const canvas = host.querySelector("svg[data-whiteboard-canvas]")!;
  const fire = async (type: "pointerdown" | "pointermove" | "pointerup", x: number, y: number) => {
    await act(async () => {
      canvas.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
          clientX: x,
          clientY: y,
        })
      );
    });
  };
  const press = async (key: string) => {
    await act(async () => {
      (document.activeElement ?? document).dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key, cancelable: true })
      );
    });
  };
  return {
    board,
    host,
    hint: () => host.querySelector<HTMLElement>('[role="status"]'),
    fire,
    press,
  };
}

const shown = (hint: HTMLElement | null) => !!hint && hint.className.includes("opacity-100");

afterEach(async () => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("提示胶囊显示时序", () => {
  it("激活创建型工具后延迟 250ms 显示；期间切换工具重新计时", async () => {
    vi.useFakeTimers();
    const wb = await mountHintBoard([
      createInteractionExtension(),
      createGeometryExtension(),
      createHandwriteExtension(),
    ]);

    await act(async () => {
      wb.board.setActiveTool(GEOMETRY_TOOL_ID, { geometryType: "circle", paths: [] });
    });
    expect(shown(wb.hint())).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(249);
    });
    expect(shown(wb.hint())).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(shown(wb.hint())).toBe(true);

    // 期间切换工具：隐藏并重新计时
    await act(async () => {
      wb.board.setActiveTool(HANDWRITE_TOOL_ID);
    });
    expect(shown(wb.hint())).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(249);
    });
    expect(shown(wb.hint())).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(shown(wb.hint())).toBe(true);
  });

  it("创建手势开始即隐藏；Esc 取消后延迟 250ms 重新显示", async () => {
    vi.useFakeTimers();
    const wb = await mountHintBoard([createInteractionExtension(), createGeometryExtension()]);
    await act(async () => {
      wb.board.setActiveTool(GEOMETRY_TOOL_ID, { geometryType: "circle", paths: [] });
    });
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(shown(wb.hint())).toBe(true);

    await wb.fire("pointerdown", 100, 100);
    expect(shown(wb.hint())).toBe(false);

    await wb.fire("pointermove", 200, 160);
    await wb.press("Escape");
    expect(shown(wb.hint())).toBe(false);
    expect(wb.board.activeTool).toBe(GEOMETRY_TOOL_ID);

    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(shown(wb.hint())).toBe(true);
  });

  it("手势正常完成且工具保持（画笔）时不再重新显示", async () => {
    vi.useFakeTimers();
    const wb = await mountHintBoard([createInteractionExtension(), createHandwriteExtension()]);
    await act(async () => {
      wb.board.setActiveTool(HANDWRITE_TOOL_ID);
    });
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(shown(wb.hint())).toBe(true);

    await wb.fire("pointerdown", 100, 100);
    await wb.fire("pointermove", 140, 120);
    await wb.fire("pointermove", 180, 150);
    await wb.fire("pointerup", 180, 150);
    expect(wb.board.children).toHaveLength(1);
    expect(wb.board.activeTool).toBe(HANDWRITE_TOOL_ID);

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(shown(wb.hint())).toBe(false);
  });

  it("回到选择工具后隐藏", async () => {
    vi.useFakeTimers();
    const wb = await mountHintBoard([createInteractionExtension(), createGeometryExtension()]);
    await act(async () => {
      wb.board.setActiveTool(GEOMETRY_TOOL_ID, { geometryType: "circle", paths: [] });
    });
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(shown(wb.hint())).toBe(true);

    await act(async () => {
      wb.board.setActiveTool(SELECT_TOOL_ID);
    });
    expect(shown(wb.hint())).toBe(false);
  });

  it("只读画布不渲染提示胶囊", async () => {
    const wb = await mountHintBoard([createInteractionExtension(), createGeometryExtension()], {
      readonly: true,
    });
    expect(wb.hint()).toBeNull();
    expect(() => wb.board.setActiveTool(GEOMETRY_TOOL_ID)).not.toThrow();
    expect(wb.hint()).toBeNull();
  });
});

describe("提示胶囊文案", () => {
  it("第一段为主提示：声明 hint 的工具按规格文案展示，末尾 Esc 退出", async () => {
    vi.useFakeTimers();
    const wb = await mountHintBoard([createInteractionExtension(), createGeometryExtension()]);
    await act(async () => {
      wb.board.setActiveTool(GEOMETRY_TOOL_ID, { geometryType: "circle", paths: [] });
    });
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    const hint = wb.hint()!;
    expect(hint.textContent).toContain("拖拽绘制圆形");
    expect(hint.textContent).toContain("Shift 等比");
    expect(hint.textContent).toContain("Alt 从中心");
    expect(hint.querySelector("kbd")?.textContent).toBe("Esc");
    expect(hint.textContent).toContain("退出");
  });

  it("未声明 hint 的工具按手势与 label 兜底（click = 点击放置）", async () => {
    vi.useFakeTimers();
    const wb = await mountHintBoard([
      createInteractionExtension(),
      createGeometryExtension(),
      stickyExtension,
    ]);
    await act(async () => {
      wb.board.setActiveTool("acme.sticky.create");
    });
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(wb.hint()!.textContent).toContain("点击放置便签");
  });
});
