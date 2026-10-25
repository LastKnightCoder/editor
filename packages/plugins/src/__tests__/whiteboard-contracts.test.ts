import { expect, it, vi } from "vitest";
import { definePlugin } from "../index";
import { defineElement, defineWhiteboardExtension } from "../whiteboard";
import { ContentPluginRegistry } from "../content";
import {
  defineEditorExtension as defineExtension,
  defineEditorElement as editorElement,
} from "../editor";
const metadata = { id: "example.both", name: "两域", version: "1.0.0" };
const type = `${metadata.id}.node`;
it("同名编辑器/白板节点使用不同领域摘要与资源声明，静态准备不执行交互工厂", async () => {
  const create = vi.fn(() => ({}));
  const definition = definePlugin({
    ...metadata,
    editorExtensions: [
      defineExtension({
        id: metadata.id,
        elements: [
          editorElement({
            type,
            dataVersion: 1,
            kind: "block",
            resources: [{ path: "url", kind: "image" }],
            render: () => null,
          }),
        ],
      }),
    ],
    whiteboardExtensions: [
      defineWhiteboardExtension({
        id: metadata.id,
        elements: [
          defineElement({
            type,
            dataVersion: 1,
            collaboration: { textFields: ["source"] },
            resources: [{ path: "cover", kind: "image" }],
            render: () => null,
          }),
        ],
        create,
      }),
    ],
  });
  const registry = new ContentPluginRegistry();
  registry.install([definition]);
  const [editor, board] = await Promise.all([
    registry.prepareContracts(),
    registry.prepareWhiteboardContracts(),
  ]);
  expect(editor.current(type)?.id).not.toBe(board.current(type)?.id);
  expect(editor.current(type)?.contract.domain).toBe("editor-node");
  expect(board.current(type)?.contract.domain).toBe("whiteboard-element");
  expect(registry.resources[type]).toEqual([{ path: "url", kind: "image" }]);
  expect(board.current(type)?.contract.resources).toEqual([{ path: "cover", kind: "image" }]);
  expect(create).not.toHaveBeenCalled();
});
it("目录异步准备期间卸载插件，旧结果不能覆盖新的空目录", async () => {
  const registry = new ContentPluginRegistry();
  registry.install([
    definePlugin({
      ...metadata,
      whiteboardExtensions: [
        defineWhiteboardExtension({
          id: metadata.id,
          elements: [defineElement({ type, dataVersion: 1, render: () => null })],
          create: () => ({}),
        }),
      ],
    }),
  ]);
  const old = registry.prepareWhiteboardContracts();
  registry.install([]);
  await expect(old).rejects.toThrow("声明已更新");
  expect((await registry.prepareWhiteboardContracts()).current(type)).toBeUndefined();
});
it("未通过函数辅助器的定义也在安装时校验版本和资源", () => {
  const registry = new ContentPluginRegistry();
  expect(() =>
    registry.install([
      definePlugin({
        ...metadata,
        whiteboardExtensions: [
          {
            id: metadata.id,
            apiVersion: 1,
            elements: [
              {
                type,
                dataVersion: 1,
                collaboration: { textFields: ["cover"] },
                resources: [{ path: "cover", kind: "image" }],
                render: () => null,
              },
            ],
            create: () => ({}),
          },
        ],
      }),
    ])
  ).toThrow();
});
