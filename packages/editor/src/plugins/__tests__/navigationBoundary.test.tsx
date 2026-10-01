import { createEditor, Editor, Transforms, type Descendant, type Element } from "slate";
import { describe, expect, it, vi } from "vitest";
import { createEditorKit } from "../../kit/EditorKit";
import { defineElement, defineExtension, type EditorCommandContext } from "../../api";
import { blockNavigationCommands } from "../../hotkeys/blockNavigation";
import {
  registerBlockNavigation,
  registerBlockNavigationBoundaries,
} from "../../utils/blockNavigation";
import { withBlockNavigation } from "../withBlockNavigation";

function makeEditor(type: string, isolate: boolean) {
  const spec = defineElement({
    type,
    kind: "block",
    isolateBlockNavigation: isolate,
    render: () => null,
  });
  const kit = createEditorKit({
    extensions: [
      defineExtension({
        id: "test.navigation-owner",
        elements: [spec],
      }),
    ],
  });
  let editor = createEditor();
  for (const plugin of kit.assembly.plugins) editor = plugin(editor);
  editor.children = [
    {
      type,
      children: [
        { type: "navigation-target", children: [{ type: "formatted", text: "" }] },
        { type: "paragraph", children: [{ type: "formatted", text: "" }] },
      ],
    },
  ] as unknown as Descendant[];
  const previous = Editor.node(editor, [0, 0])[0] as Element;
  const focus = vi.fn(() => true);
  registerBlockNavigation(previous, { focusEnd: focus });
  Transforms.select(editor, { path: [0, 1, 0], offset: 0 });
  const fallback = vi.fn();
  editor.deleteBackward = fallback;
  editor = withBlockNavigation(editor);
  return { editor, focus, fallback, spec };
}

describe("元素声明的块导航边界", () => {
  it.each([true, false])("任意外部类型按声明处理箭头与退格：%s", isolate => {
    const view = makeEditor("external-navigation-scope", isolate);
    const event = { preventDefault: vi.fn() } as unknown as NonNullable<
      EditorCommandContext["event"]
    >;
    blockNavigationCommands[0].run(view.editor, { event });
    expect(view.focus).toHaveBeenCalledTimes(isolate ? 0 : 1);
    expect(event.preventDefault).toHaveBeenCalledTimes(isolate ? 0 : 1);
    view.focus.mockClear();
    view.editor.deleteBackward("character");
    expect(view.focus).toHaveBeenCalledTimes(isolate ? 0 : 1);
    expect(view.fallback).toHaveBeenCalledTimes(isolate ? 1 : 0);
  });

  it("类型名 tabs 不自带特判，声明变更和不同编辑器互不串扰", () => {
    const plain = makeEditor("tabs", false);
    plain.editor.deleteBackward("character");
    expect(plain.focus).toHaveBeenCalledOnce();
    const isolated = makeEditor("external-navigation-scope", true);
    registerBlockNavigationBoundaries(isolated.editor, [
      { ...isolated.spec, isolateBlockNavigation: false },
    ]);
    isolated.editor.deleteBackward("character");
    expect(isolated.focus).toHaveBeenCalledOnce();
    const other = makeEditor("external-navigation-scope", true);
    other.editor.deleteBackward("character");
    expect(other.focus).not.toHaveBeenCalled();
    expect(other.fallback).toHaveBeenCalledOnce();
  });
});
