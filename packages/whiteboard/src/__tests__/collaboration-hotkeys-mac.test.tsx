import { expect, it, vi } from "vitest";
// is-hotkey 在模块加载时确定 mod 的平台含义。
vi.hoisted(() =>
  Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true })
);
import * as Y from "yjs";
import { WhiteboardModel } from "@tau/collaboration";
import Board from "../Board";
import { createInteractionExtension, createImageExtension } from "../extensions/builtins";
import { createWhiteboardBinding } from "../collaboration/binding";
import { prepareBuiltinWhiteboardTypes } from "../collaboration/builtins";

it("Mac 文档画布的 ⌘Z/⇧⌘Z 使用文档历史，并让位输入框", async () => {
  const doc = new Y.Doc();
  const model = new WhiteboardModel(doc);
  const builtins = await prepareBuiltinWhiteboardTypes();
  const pageId = model.submit([{ type: "create_page", title: "页" }], null).createdIds[0];
  const binding = createWhiteboardBinding(model, {
    pageId,
    types: builtins.types,
    preparedContracts: builtins.prepared,
  });
  const board = new Board(
    [],
    { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
    { selectedElements: [], selectArea: null }
  );
  board.installExtensions([createInteractionExtension(), createImageExtension()]);
  board.attachDocument(binding);
  try {
    board.apply({
      type: "insert_node",
      path: [0],
      node: {
        id: "image",
        type: "image",
        src: "https://example.com/image.png",
        x: 0,
        y: 0,
        width: 100,
        height: 80,
      },
    });
    expect(board.undos).toHaveLength(0);
    const press = (shiftKey = false, target?: EventTarget) => {
      const event = new KeyboardEvent("keydown", {
        key: "z",
        metaKey: true,
        shiftKey,
        cancelable: true,
      });
      if (target) Object.defineProperty(event, "target", { value: target });
      board.onKeyDown(event);
      return event;
    };
    expect(press(false, document.createElement("input")).defaultPrevented).toBe(false);
    expect(board.children).toHaveLength(1);
    expect(press().defaultPrevented).toBe(true);
    expect(model.read().pages[0].children).toHaveLength(0);
    expect(press().defaultPrevented).toBe(false);
    expect(press(true).defaultPrevented).toBe(true);
    expect(model.read().pages[0].children[0].id).toBe("image");
  } finally {
    board.destroy();
    model.dispose();
    doc.destroy();
  }
});
