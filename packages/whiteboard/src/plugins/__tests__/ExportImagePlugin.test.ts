import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { toast } from "@tau/ui";
import Board from "../../Board";
import { bindWhiteboardI18n } from "../../i18n-runtime";
import type { WhiteboardDocumentBinding } from "../../document";
import { describe, expect, it, vi } from "vitest";
import { ExportImagePlugin } from "../ExportImagePlugin";
import type { ContextMenuContext } from "../../types";

const createContext = (overrides: Partial<ContextMenuContext> = {}): ContextMenuContext => {
  return {
    clientX: 0,
    clientY: 0,
    viewPortPoint: { x: 0, y: 0 },
    selectedElements: [],
    hitElements: [],
    targetElements: [],
    isHitSelected: false,
    board: {
      emit: vi.fn(),
    } as any,
    ...overrides,
  };
};

describe("ExportImagePlugin", () => {
  it("始终展示导出白板菜单", () => {
    const plugin = new ExportImagePlugin();
    const items = plugin.getContextMenu(createContext());

    expect(items.some(item => item.key === "export-board-image")).toBe(true);
  });

  it("命中任意元素时展示导出元素菜单", () => {
    const plugin = new ExportImagePlugin();

    const itemsWithoutTarget = plugin.getContextMenu(
      createContext({
        isHitSelected: false,
        targetElements: [],
      })
    );
    expect(itemsWithoutTarget.some(item => item.key === "export-selection-image")).toBe(false);

    const itemsWithTarget = plugin.getContextMenu(
      createContext({
        isHitSelected: false,
        targetElements: [{ id: "a", type: "rect" } as any],
      })
    );
    expect(itemsWithTarget.some(item => item.key === "export-selection-image")).toBe(true);
  });

  it("导出选中元素菜单应携带 action 和 selectedElementIds", () => {
    const plugin = new ExportImagePlugin();
    const ctx = createContext({
      isHitSelected: true,
      targetElements: [{ id: "a", type: "rect" } as any, { id: "b", type: "image" } as any],
    });

    const item = plugin
      .getContextMenu(ctx)
      .find(menuItem => menuItem.key === "export-selection-image");

    expect(item).toBeTruthy();
    item?.onSelect(ctx);

    expect(ctx.board.emit).toHaveBeenCalledWith("tau.modal.open", {
      type: "export-image",
      action: "selection",
      selectedElementIds: ["a", "b"],
    });
  });
});

it("导入失败换语只更新已有反馈，保留抛错时预算并透传未知诊断", async () => {
  const source = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: source });
  const board = new Board(
    [],
    { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
    { selectedElements: [], selectArea: null }
  );
  bindWhiteboardI18n(board, runtime);
  const importing = vi.fn().mockResolvedValue([]);
  board.document = {
    exportFile: async () => new Blob(),
    importTransfer: importing,
  } as unknown as WhiteboardDocumentBinding;
  const nativeCreate = document.createElement.bind(document);
  let input: HTMLInputElement | undefined;
  const picker = vi.spyOn(document, "createElement").mockImplementation((name, options) => {
    const element = nativeCreate(name, options);
    if (name === "input") {
      input = element as HTMLInputElement;
      input.click = () => undefined;
    }
    return element;
  });
  const errors = vi.spyOn(toast, "error");
  const context = createContext({ board });
  const action = new ExportImagePlugin()
    .getContextMenu(context)
    .find(item => item.key === "import-whiteboard-data");
  if (!action) throw new Error("导入动作未生成");
  let sizeReads = 0;
  try {
    action.onSelect(context);
    if (!input) throw new Error("原生文件选择器未创建");
    expect(input.accept).toBe(".json,application/json");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [
        {
          get size() {
            sizeReads++;
            return 33 * 1024 * 1024;
          },
        },
      ],
    });
    input.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(errors).toHaveBeenCalledTimes(1));
    const readFeedback = toast
      .items()
      .find(item => item.id === errors.mock.results[0].value)?.getMessage;
    if (!readFeedback) throw new Error("自产错误没有稳定翻译反馈");
    const original = readFeedback(),
      capturedReads = sizeReads;
    for (const locale of ["zh-TW", "en-US"]) {
      source.setLocale(locale);
      readFeedback();
      expect(sizeReads).toBe(capturedReads);
      expect(errors).toHaveBeenCalledTimes(1);
      expect(importing).not.toHaveBeenCalled();
    }
    expect(readFeedback()).not.toBe(original);
    action.onSelect(context);
    if (!input) throw new Error("第二次文件选择器未创建");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [
        {
          size: 1,
          text: async () => {
            throw new Error("外部解析诊断");
          },
        },
      ],
    });
    input.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(errors).toHaveBeenCalledTimes(2));
    expect(errors.mock.calls[1][0]).toBe("外部解析诊断");
  } finally {
    for (const result of errors.mock.results)
      if (typeof result.value === "number") toast.dismiss(result.value);
    picker.mockRestore();
    errors.mockRestore();
    board.destroy();
    runtime.dispose();
  }
});
