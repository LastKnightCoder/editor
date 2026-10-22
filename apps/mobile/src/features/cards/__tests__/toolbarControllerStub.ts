import { vi } from "vitest";
import type { MobileEditorToolbarController } from "../editorToolbar/useMobileEditorToolbarController";

/** 配件栏 / Aa 面板测试共用的控制器桩：方法全为 mock，状态取默认值 */
export function createControllerStub(
  overrides: Partial<MobileEditorToolbarController> = {}
): MobileEditorToolbarController {
  return {
    isEditorFocused: true,
    isToolbarVisible: true,
    activePanel: null,
    panelSelection: null,
    hasExpandedSelection: false,
    canIndent: true,
    canOutdent: true,
    openPanel: vi.fn(),
    togglePanel: vi.fn(),
    closePanel: vi.fn(),
    exitEditing: vi.fn(),
    setExitEditingListener: vi.fn(),
    runInPanel: vi.fn(),
    indent: vi.fn(),
    outdent: vi.fn(),
    collapseSelectionToFocus: vi.fn(),
    isContentLinkPickerOpen: false,
    executeAction: vi.fn(),
    applyHeadingLevel: vi.fn(),
    handleSelectInsertItem: vi.fn(),
    handleInsertImage: vi.fn(),
    applyColorMark: vi.fn(),
    applyGradientMark: vi.fn(),
    applyHighlightMark: vi.fn(),
    applyUnderlineStyle: vi.fn(),
    isActionDisabled: vi.fn(() => false),
    isActionActive: vi.fn(() => false),
    getCurrentBlockKind: vi.fn(() => "paragraph" as const),
    getCurrentMarks: vi.fn(() => null),
    keepEditorFocus: vi.fn(),
    handleEditorFocus: vi.fn(),
    handleEditorBlur: vi.fn(),
    syncSelection: vi.fn(),
    handleCloseContentLinkPicker: vi.fn(),
    handleSelectContentLink: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    ...overrides,
  };
}
