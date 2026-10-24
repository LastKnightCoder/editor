import { afterEach, expect, it, vi } from "vitest";
import { toast } from "@tau/ui";
import Board from "../Board";
import { bindTextContent } from "../extensions/textBinding";
import { createFileImportExtension } from "../extensions/builtins";
import { createServiceRegistry } from "../extensions";
import { IResourceService } from "@tau/shared/host-services";
import { IMediaInfoService } from "@tau/shared/media-services";

const boards: Board[] = [];
const create = () => {
  const board = new Board(
    [{ id: "text", type: "richtext", content: [] }],
    { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
    { selectedElements: [], selectArea: null }
  );
  boards.push(board);
  return board;
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
};
afterEach(() => {
  boards.splice(0).forEach(board => board.destroy());
  vi.restoreAllMocks();
});

it("正文创建期间元素删除并恢复，也释放新正文而不认领旧请求", async () => {
  const board = create();
  board.installExtensions([]);
  const gate = deferred<number>();
  const release = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn();
  const pending = bindTextContent(
    board.extensions!.api,
    "text",
    {
      create: () => gate.promise,
      update,
      release,
    },
    () => []
  );
  const node = board.children[0];
  board.apply({ type: "remove_node", path: [0], node });
  board.apply({ type: "insert_node", path: [0], node });
  gate.resolve(42);
  expect(await pending).toBeUndefined();
  expect(release).toHaveBeenCalledExactlyOnceWith(42);
  expect(update).not.toHaveBeenCalled();
  expect(board.children[0].contentId).toBeUndefined();
});

it("正文初始化写入失败时释放新引用并传播错误", async () => {
  const board = create();
  board.installExtensions([]);
  const release = vi.fn().mockResolvedValue(undefined);
  await expect(
    bindTextContent(
      board.extensions!.api,
      "text",
      {
        create: async () => 42,
        update: async () => {
          throw new Error("写入失败");
        },
        release,
      },
      () => []
    )
  ).rejects.toThrow("写入失败");
  expect(release).toHaveBeenCalledExactlyOnceWith(42);
  expect(board.children[0].contentId).toBeUndefined();
});

it("并发关联已有正文时保留最新绑定并释放多余正文", async () => {
  const board = create();
  board.installExtensions([]);
  const gate = deferred<number>();
  const release = vi.fn().mockResolvedValue(undefined);
  const pending = bindTextContent(
    board.extensions!.api,
    "text",
    { create: () => gate.promise, release },
    () => []
  );
  board.extensions!.api.updateElement("text", { contentId: 7 });
  gate.resolve(42);
  expect(await pending).toBe(7);
  expect(release).toHaveBeenCalledExactlyOnceWith(42);
  expect(board.children[0].contentId).toBe(7);
});

it("媒体粘贴只上传一次，隐藏恢复后丢弃旧结果并关闭加载提示", async () => {
  const board = create();
  const gate = deferred<string>();
  const upload = vi.fn(() => gate.promise);
  const dismiss = vi.spyOn(toast, "dismiss");
  board.installExtensions(
    [createFileImportExtension()],
    undefined,
    createServiceRegistry(
      register => register(IResourceService, { upload: async () => upload() }),
      register =>
        register(IMediaInfoService, {
          imageInfo: async () => ({ width: 100, height: 80 }),
          videoInfo: async () => null,
        })
    )
  );
  const event = new Event("paste", { cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: {
      items: [
        {
          type: "image/png",
          getAsFile: () => new File(["image"], "test.png", { type: "image/png" }),
        },
      ],
      getData: () => "",
    },
  });
  board.onPaste(event);
  await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce());
  board.setActive(false);
  board.setActive(true);
  gate.resolve("resource.png");
  await vi.waitFor(() => expect(dismiss).toHaveBeenCalled());
  expect(board.children.map(node => node.type)).toEqual(["richtext"]);
});

it("白板正文创建使用宿主提供的扩展统计器", async () => {
  const board = create();
  board.installExtensions([]);
  const content = [{ type: "example.source", source: "正文", children: [{ text: "" }] }] as never;
  const createContent = vi.fn(async () => 42);
  const { createContentMetrics } = await import("@tau/db-schema/content-metrics");
  const metrics = createContentMetrics([{ type: "example.source", textFields: ["source"] }]);
  await bindTextContent(
    board.extensions!.api,
    "text",
    {
      create: createContent,
      countWords: metrics.count,
    },
    () => content
  );
  expect(createContent).toHaveBeenCalledWith(content, 2);
});
