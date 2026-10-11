import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyPastePlugin } from "../CopyPastePlugin";
import { restoreHotkeyPlatform, stubHotkeyPlatform } from "../../__tests__/hotkey-platform-stub";
import type { BoardElement, ContextMenuContext } from "../../types";

afterEach(() => {
  restoreHotkeyPlatform();
  vi.restoreAllMocks();
});

const createElement = (id: string): BoardElement =>
  ({ id, type: "geometry", x: 0, y: 0, width: 120, height: 80 }) as BoardElement;

/** 无扩展运行时的 board stub（删除项文字走 formatHotkey 兜底） */
const createBoardStub = (extensions?: { api: { getShortcut(commandId: string): string | null } }) =>
  ({
    children: [],
    readonly: false,
    selection: { selectedElements: [], selectArea: null },
    presentationManager: { isPresentationMode: false, isCreatingSequence: false },
    capabilityService: { shouldReverseChildren: () => true, requiresRelayout: () => false },
    apply: vi.fn(),
    extensions,
  }) as any;

const createContext = (board: any, targetElements: BoardElement[]): ContextMenuContext => ({
  clientX: 0,
  clientY: 0,
  viewPortPoint: { x: 0, y: 0 },
  selectedElements: targetElements,
  hitElements: targetElements,
  targetElements,
  isHitSelected: targetElements.length > 0,
  board,
});

describe("CopyPastePlugin 右键菜单快捷键文字", () => {
  it("mac：复制显示 ⌘C（展示专用，不走 hotkeys 仲裁），删除显示 ⌫", () => {
    stubHotkeyPlatform("mac");
    const items = new CopyPastePlugin().getContextMenu(
      createContext(createBoardStub(), [createElement("a")])
    );
    expect(items.find(item => item.key === "copy")?.shortcut).toBe("⌘C");
    expect(items.find(item => item.key === "delete")?.shortcut).toBe("⌫");
  });

  it("other：复制显示 Ctrl+C，删除显示 Delete", () => {
    stubHotkeyPlatform("other");
    const items = new CopyPastePlugin().getContextMenu(
      createContext(createBoardStub(), [createElement("a")])
    );
    expect(items.find(item => item.key === "copy")?.shortcut).toBe("Ctrl+C");
    expect(items.find(item => item.key === "delete")?.shortcut).toBe("Delete");
  });

  it("无选中时禁用的复制项仍显示平台文字", () => {
    stubHotkeyPlatform("mac");
    const items = new CopyPastePlugin().getContextMenu(createContext(createBoardStub(), []));
    const copy = items.find(item => item.key === "copy");
    expect(copy?.disabled).toBe(true);
    expect(copy?.shortcut).toBe("⌘C");
  });

  it("删除项优先取扩展运行时的绑定文字（getShortcut），复制不经过它", () => {
    stubHotkeyPlatform("mac");
    const getShortcut = vi.fn(() => "覆盖文字");
    const items = new CopyPastePlugin().getContextMenu(
      createContext(createBoardStub({ api: { getShortcut } }), [createElement("a")])
    );
    expect(items.find(item => item.key === "delete")?.shortcut).toBe("覆盖文字");
    expect(items.find(item => item.key === "copy")?.shortcut).toBe("⌘C");
    expect(getShortcut).toHaveBeenCalledWith("tau.selection.delete");
  });
});
