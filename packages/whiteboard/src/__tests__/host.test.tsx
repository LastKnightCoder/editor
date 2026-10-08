import { describe, expect, it, vi } from "vitest";
import Board from "../Board";
import { ImagePlugin } from "../plugins/ImagePlugin";
import { VideoPlugin } from "../plugins/VideoPlugin";
import { AudioPlugin } from "../plugins/AudioPlugin";
import { CardPlugin } from "../plugins/CardPlugin";
import { WhiteBoardPlugin } from "../plugins/WhiteBoardPlugin";
import { ImageUtil } from "../utils/ImageUtil";
import { createRichTextContentId } from "../utils/RichTextContentUtil";
import type { WhiteboardServices } from "../host";
import { DEFAULT_PAGE_SKETCH } from "../types";

const viewport = { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 };
const createBoard = (services: Partial<WhiteboardServices> = {}) =>
  new Board(
    [],
    viewport,
    { selectedElements: [], selectArea: null },
    [],
    [],
    false,
    DEFAULT_PAGE_SKETCH,
    services
  );
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
};

describe("白板宿主能力与实例边界", () => {
  it.each([
    ["image", ImagePlugin],
    ["video", VideoPlugin],
    ["audio", AudioPlugin],
  ] as const)("%s 本地上传需要上传服务和选择器同时就绪", (type, Plugin) => {
    const board = createBoard({ uploadResource: async () => "uploaded" });
    board.initPlugins([new Plugin()]);
    const context = {
      clientX: 0,
      clientY: 0,
      viewPortPoint: { x: 0, y: 0 },
      selectedElements: [],
      hitElements: [],
      targetElements: [],
      isHitSelected: false,
    };
    const keys = () =>
      board
        .getContextMenu(context)
        .find(item => item.key === `create-${type}`)
        ?.children?.map(item => item.key);
    expect(keys()).not.toContain(`${type}-local`);
    expect(keys()).toContain(`${type}-url`);
    board.slots = { Layers: () => null };
    expect(keys()).toContain(`${type}-local`);
    board.destroy();
  });
  it("目标删除后即使撤销恢复，旧异步操作仍永久失效", () => {
    const board = createBoard();
    const element = { id: "target", type: "image", x: 0, y: 0, width: 100, height: 80 };
    board.apply({ type: "insert_node", path: [0], node: element });
    const canSubmit = board.captureSubmission(element);
    board.apply({ type: "remove_node", path: [0], node: element });
    board.apply({ type: "insert_node", path: [0], node: element });
    expect(canSubmit()).toBe(false);
    board.destroy();
  });
  it("无业务能力时只展示可用的图片入口，隐藏卡片与白板创建", () => {
    const board = createBoard();
    board.initPlugins([new ImagePlugin(), new CardPlugin(), new WhiteBoardPlugin()]);
    const items = board.getContextMenu({
      clientX: 0,
      clientY: 0,
      viewPortPoint: { x: 0, y: 0 },
      selectedElements: [],
      hitElements: [],
      targetElements: [],
      isHitSelected: false,
    });
    expect(
      items.find(item => item.key === "create-image")?.children?.map(item => item.key)
    ).toEqual(["image-url"]);
    expect(items.some(item => item.key === "create-card" || item.key === "create-whiteboard")).toBe(
      false
    );
    board.destroy();
  });

  it("两个实例的脑图临时主题互不影响，即使元素 ID 相同", () => {
    const first = createBoard(),
      second = createBoard();
    first.mindThemePreviewStore
      .getState()
      .setPreview("same-id", { themeId: "blue", themeStyle: "soft" });
    expect(second.mindThemePreviewStore.getState().previews).toEqual({});
    first.destroy();
    second.destroy();
  });

  it("上传期间只读切换后恢复编辑，旧结果仍不能插入", async () => {
    const upload = deferred<string>();
    const board = createBoard({
      getImageInfo: async () => ({ width: 100, height: 80 }),
      uploadResource: () => upload.promise,
    });
    const inserting = ImageUtil.insertImage(new File(["image"], "image.png"), board);
    await Promise.resolve();
    board.readonly = true;
    board.readonly = false;
    upload.resolve("uploaded.png");
    await inserting;
    expect(board.children).toEqual([]);
    board.destroy();
  });

  it("上传真实失败继续抛出，画布不增加占位元素", async () => {
    const board = createBoard({
      getImageInfo: async () => null,
      uploadResource: async () => {
        throw new Error("上传失败");
      },
    });
    await expect(ImageUtil.insertImage(new File(["image"], "image.png"), board)).rejects.toThrow(
      "上传失败"
    );
    expect(board.children).toEqual([]);
    board.destroy();
  });

  it("隐藏期间创建的正文会被回收，恢复后不会认领旧结果", async () => {
    const creation = deferred<number>();
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const board = createBoard({ createContent: () => creation.promise, deleteContent: cleanup });
    const creating = createRichTextContentId([], board);
    board.setActive(false);
    board.setActive(true);
    creation.resolve(7);
    expect(await creating).toBeUndefined();
    expect(cleanup).toHaveBeenCalledWith(7);
    board.destroy();
  });
});
