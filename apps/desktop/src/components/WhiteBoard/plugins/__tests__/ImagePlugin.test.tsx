import { describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => ({
  invoke: vi.fn(() => Promise.resolve({})),
  send: vi.fn(),
  sendSync: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  platform: "web",
}));
vi.mock("@/electron", () => electronMocks);

vi.mock("../../components/ImageElement", () => ({
  default: () => null,
}));

import { ImagePlugin } from "../ImagePlugin";
import type { ContextMenuContext, PluginContextMenuItem } from "../../types";

vi.mock("@/hooks/useUploadResource", () => ({
  uploadResource: vi.fn(),
}));

vi.mock("@/utils/download", () => ({
  downloadFile: vi.fn(),
}));

vi.mock("@/utils", () => ({
  getImageInfo: vi.fn(),
}));

const createContext = (
  overrides: Partial<ContextMenuContext> = {},
): ContextMenuContext => {
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
  const menu = items.find((item) => item.key === "create-image");
  expect(menu).toBeTruthy();
  return menu!;
};

describe("ImagePlugin", () => {
  it("右键空白区域展示完整图片插入菜单", () => {
    const plugin = new ImagePlugin();
    const items = plugin.getContextMenu(createContext());
    const menu = getCreateImageMenu(items);

    expect(menu.children?.map((item) => item.label)).toEqual([
      "本地上传",
      "资源库",
      "输入 URL",
      "AI 图片生成",
    ]);
  });

  it("图片插入菜单应触发对应 action", () => {
    const plugin = new ImagePlugin();
    const ctx = createContext();
    const menu = getCreateImageMenu(plugin.getContextMenu(ctx));

    const expectedActions = [
      ["image-local", "local"],
      ["image-resource", "resource"],
      ["image-url", "url"],
      ["image-ai", "ai"],
    ];

    expectedActions.forEach(([key, action]) => {
      const item = menu.children?.find((child) => child.key === key);
      expect(item).toBeTruthy();
      item?.onSelect(ctx);
      expect(ctx.board.emit).toHaveBeenLastCalledWith(
        "context-menu:open-modal",
        {
          type: "image",
          action,
        },
      );
    });
  });
});
