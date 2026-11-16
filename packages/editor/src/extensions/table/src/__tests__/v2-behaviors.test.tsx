// 内置扩展迁到 v2 的行为回归（用例原文迁自 core/__tests__/define-extension.test.tsx）
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Element, Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, createEditorKit } from "@tau/editor";
import type { EditorRef } from "@tau/editor";
import { IExtensionErrorReporter, type ExtensionErrorEvent } from "@tau/editor/core";
import { standardExtensions } from "@tau/editor/presets/standard";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { IEditorSlots } from "@tau/editor/extensions/media/services";

const services = (events: ExtensionErrorEvent[] = []) =>
  [
    register => register(IEditorSlots, createDefaultEditorSlots()),
    register => register(IExtensionErrorReporter, { report: event => events.push(event) }),
  ] satisfies Parameters<typeof createEditorKit>[0]["services"];

describe("内置扩展迁到 v2：table（单元格行为 + 导航热键切命令 id）", () => {
  const mount = async (initValue: Descendant[]) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const ref = createRef<EditorRef>();
    const kit = createEditorKit({ extensions: standardExtensions, services: services() });
    await act(async () => {
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor ref={ref} kit={kit} readonly={false} initValue={initValue} />
        </DndProvider>
      );
    });
    return {
      kit,
      editor: ref.current!.getEditor(),
      done: async () => {
        await act(async () => root.unmount());
        container.remove();
      },
    };
  };

  const cell = (value: string) => ({
    type: "table-cell",
    children: [{ type: "formatted", text: value }],
  });
  const table = () =>
    ({
      type: "table",
      children: [
        { type: "table-row", children: [cell("A1"), cell("B1")] },
        { type: "table-row", children: [cell("A2"), cell("B2")] },
      ],
    }) as never;

  it("单元格内回车不拆行：光标落到下一行同列", async () => {
    const { editor, done } = await mount([table()]);
    Transforms.select(editor, { path: [0, 0, 0, 0], offset: 1 });
    await act(async () => editor.insertBreak());
    // A1 内部不拆出第二个段落，表格结构不变
    const row = (editor.children[0] as Element).children[0] as unknown as {
      children: { type: string; children: unknown[] }[];
    };
    expect(row.children[0]).toMatchObject({ type: "table-cell" });
    expect(row.children[0].children).toEqual([{ type: "formatted", text: "A1" }]);
    expect((editor.children[0] as Element).children).toHaveLength(2);
    await done();
  });

  it("单元格内首个文本开头退格：移到前一列末尾而不是并出单元格", async () => {
    const { editor, done } = await mount([table()]);
    await act(async () => {}); // ReactEditor 的 node→key 映射需要渲染周期
    Transforms.select(editor, { path: [0, 0, 1, 0], offset: 0 });
    await act(async () => editor.deleteBackward("character"));
    // 选区移到 A1（前一列），B1 结构原样
    expect(editor.selection?.anchor.path.slice(0, 3)).toEqual([0, 0, 0]);
    expect(editor.children).toHaveLength(1);
    expect((editor.children[0] as Element).children[0]).toMatchObject({ type: "table-row" });
    await done();
  });

  it("tab / shift+tab 等热键绑命令 id，单元格内经 editor.commands 导航", async () => {
    const { kit, editor, done } = await mount([table()]);
    expect(
      Object.fromEntries(
        kit.assembly.commandHotkeys
          .filter(entry => entry.hotkey.command.startsWith("tau.table."))
          .map(entry => [entry.hotkey.key, entry.hotkey.command])
      )
    ).toMatchObject({
      tab: "tau.table.next-cell",
      "shift+tab": "tau.table.prev-cell",
      enter: "tau.table.next-row",
      ArrowDown: "tau.table.move-down",
      ArrowUp: "tau.table.move-up",
      escape: "tau.table.select-merged-cell",
    });

    Transforms.select(editor, { path: [0, 0, 0, 0], offset: 0 });
    expect(editor.commands.execute("tau.table.next-cell")).toBe(true);
    expect(editor.selection?.anchor.path.slice(0, 4)).toEqual([0, 0, 1, 0]);
    expect(editor.commands.execute("tau.table.next-row")).toBe(true);
    // B1 下移到第二行同列（B2）
    expect(editor.selection?.anchor.path.slice(0, 3)).toEqual([0, 1, 1]);
    await done();
  });
});
