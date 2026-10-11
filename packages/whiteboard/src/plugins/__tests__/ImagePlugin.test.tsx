import { browserMediaInfo } from "../../extensions/media";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../components/ImageElement", () => ({
  default: () => null,
}));

import { ImagePlugin } from "../ImagePlugin";
import type { ContextMenuContext, PluginContextMenuItem } from "../../types";

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

const getCreateImageMenu = (items: PluginContextMenuItem[]) => {
  const menu = items.find(item => item.key === "create-image");
  expect(menu).toBeTruthy();
  return menu!;
};

describe("ImagePlugin", () => {
  it("右键空白区域展示完整图片插入菜单", () => {
    const plugin = new ImagePlugin({
      ...browserMediaInfo,
      actions: ["image-local", "image-url", "image-ai"],
    });
    const items = plugin.getContextMenu(createContext());
    const menu = getCreateImageMenu(items);

    expect(menu.children?.map(item => item.label)).toEqual(["本地上传", "输入 URL", "AI 图片生成"]);
  });

  it("图片插入菜单应触发对应 action", () => {
    const plugin = new ImagePlugin({
      ...browserMediaInfo,
      actions: ["image-local", "image-url", "image-ai"],
    });
    const ctx = createContext();
    const menu = getCreateImageMenu(plugin.getContextMenu(ctx));

    const expectedActions = [
      ["image-local", "local"],
      ["image-url", "url"],
      ["image-ai", "ai"],
    ];

    expectedActions.forEach(([key, action]) => {
      const item = menu.children?.find(child => child.key === key);
      expect(item).toBeTruthy();
      item?.onSelect(ctx);
      expect(ctx.board.emit).toHaveBeenLastCalledWith("tau.modal.open", {
        type: "image",
        action,
      });
    });
  });
});
