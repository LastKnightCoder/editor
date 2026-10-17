/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import Board from "../../Board";
import StatusBar from "../StatusBar";
import DocumentSetter from "../AttributeSetter/DocumentSetter";
import { BoardContext } from "../../context";
import { WhiteboardAPIProvider } from "../../extensions/context";
import { createDocumentExtension, createInteractionExtension } from "../../extensions/builtins";
import { restoreHotkeyPlatform, stubHotkeyPlatform } from "../../__tests__/hotkey-platform-stub";
import type { BoardElement } from "../../types";

const viewport = { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 };
const roots: Root[] = [];
const boards: Board[] = [];
const documentElement = {
  id: "doc",
  type: "document",
  entityRef: { kind: "article", id: 3 },
  x: 0,
  y: 0,
  width: 280,
  height: 360,
} as BoardElement;

function mount(render: (board: Board) => React.ReactNode) {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
  const board = new Board([], { ...viewport }, { selectedElements: [], selectArea: null });
  boards.push(board);
  board.installExtensions([createDocumentExtension({}), createInteractionExtension()]);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => {
    root.render(
      <BoardContext.Provider value={board}>
        <WhiteboardAPIProvider value={board.extensions!.api}>{render(board)}</WhiteboardAPIProvider>
      </BoardContext.Provider>
    );
  });
  return host;
}

const mountStatusBar = () =>
  mount(() => (
    <StatusBar
      zoom={1}
      sequences={[]}
      onGridVisibleChange={() => {}}
      onZoomIn={() => {}}
      onZoomOut={() => {}}
      onZoomTo={() => {}}
      onFitAll={() => {}}
      onFitSelection={() => {}}
      onStartPresentation={() => {}}
      onEditSequence={() => {}}
      onDeleteSequence={() => {}}
    />
  ));

/** 按钮提示（ChromeButton 的 kbd 渲染在 Tooltip portal）与菜单 chip 都落在 body */
const kbdTexts = () => Array.from(document.body.querySelectorAll("kbd")).map(k => k.textContent);
/** 全部菜单（MenuSurface 常驻渲染、视图与画风菜单并存；快捷键 chip 是 span，按文本断言） */
const menusText = () =>
  Array.from(document.querySelectorAll('[role="menu"]'))
    .map(menu => menu.textContent ?? "")
    .join("\n");

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  boards.splice(0).forEach(board => board.destroy());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  restoreHotkeyPlatform();
  document.body.replaceChildren();
});

describe("状态栏快捷键文字", () => {
  it("mac：缩放与全览按钮提示显示 ⌘− / ⌘+ / Z", () => {
    stubHotkeyPlatform("mac");
    mountStatusBar();
    expect(kbdTexts()).toEqual(expect.arrayContaining(["⌘−", "⌘+", "Z"]));
  });

  it("other：缩放与全览按钮提示显示 Ctrl+− / Ctrl++ / Z", () => {
    stubHotkeyPlatform("other");
    mountStatusBar();
    expect(kbdTexts()).toEqual(expect.arrayContaining(["Ctrl+−", "Ctrl++", "Z"]));
  });

  it("mac：视图菜单内显示 ⇧1 / ⇧2 / ⇧0", async () => {
    stubHotkeyPlatform("mac");
    const host = mountStatusBar();
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>('button[aria-label="视图"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(menusText()).toContain("适应全部");
    expect(menusText()).toContain("⇧1");
    expect(menusText()).toContain("⇧2");
    expect(menusText()).toContain("⇧0");
  });

  it("other：视图菜单内显示 Shift+1 / Shift+2 / Shift+0", async () => {
    stubHotkeyPlatform("other");
    const host = mountStatusBar();
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>('button[aria-label="视图"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(menusText()).toContain("Shift+1");
    expect(menusText()).toContain("Shift+2");
    expect(menusText()).toContain("Shift+0");
  });
});

describe("文档卡展开按钮快捷键文字", () => {
  it("mac：显示 ↵", () => {
    stubHotkeyPlatform("mac");
    mount(() => <DocumentSetter element={documentElement} onChange={() => {}} />);
    expect(kbdTexts()).toEqual(["↵"]);
  });

  it("other：显示 Enter", () => {
    stubHotkeyPlatform("other");
    mount(() => <DocumentSetter element={documentElement} onChange={() => {}} />);
    expect(kbdTexts()).toEqual(["Enter"]);
  });
});
