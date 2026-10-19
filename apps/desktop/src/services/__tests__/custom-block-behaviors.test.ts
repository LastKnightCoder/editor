// custom-block 段首退格聚焦行为的等价测试（原 plugins/deleteBackward 的语义，走 v2 行为分发装配）
import { createEditor, Element, Transforms, type Descendant, type Editor } from "slate";
import { describe, expect, it } from "vitest";

import { createEditorKit } from "@tau/editor";
import { customBlockExtension } from "../../test-fixtures/plugin-packages";
import "@tau/plugins/source-editor-host";
import {
  applyGuardedPlugins,
  createCircuitBreaker,
  withElementBehaviors,
} from "../../../../../packages/editor/src/core/kit/extensionGuard";
import { consoleErrorReporter } from "@tau/editor";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { IEditorSlots } from "@tau/editor/extensions/media/services";

const text = (value: string) => ({ type: "formatted", text: value });
const paragraph = (value: string) => ({ type: "paragraph", children: [text(value)] });
const customBlock = () =>
  ({ type: "custom-block", content: "", children: [text("")] }) as Descendant;

/** 复刻编辑器创建链里与退格相关的部分：插件链 + v2 行为分发（withIngest 等与退格无关） */
const createTestEditor = () => {
  const kit = createEditorKit({
    extensions: [customBlockExtension],
    services: [register => register(IEditorSlots, createDefaultEditorSlots())],
  });
  const breaker = createCircuitBreaker(() => consoleErrorReporter);
  let editor: Editor = applyGuardedPlugins(createEditor(), kit.assembly.pluginGroups, breaker);
  editor = withElementBehaviors(editor, kit.assembly.behaviors, breaker);
  return editor;
};

const focusEventsOf = (editor: Editor, run: () => void) => {
  const events: unknown[] = [];
  const listener = (event: Event) => events.push((event as CustomEvent).detail);
  document.addEventListener("preview-editor-focus", listener);
  editor.children = [] as unknown as Descendant[];
  run();
  document.removeEventListener("preview-editor-focus", listener);
  return events;
};

describe("custom-block 段首退格聚焦行为", () => {
  it("空段落开头退格且前一块是 custom-block：删除空段落并派发聚焦事件", () => {
    const editor = createTestEditor();
    const events = focusEventsOf(editor, () => {
      editor.children = [customBlock(), paragraph("")] as unknown as Descendant[];
      Transforms.select(editor, { path: [1, 0], offset: 0 });
      editor.deleteBackward("character");
    });

    expect(editor.children.map(node => (node as Element).type)).toEqual(["custom-block"]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "custom-block" });
  });

  it("非空段落开头退格：段落保留，聚焦事件照常派发", () => {
    const editor = createTestEditor();
    const events = focusEventsOf(editor, () => {
      editor.children = [customBlock(), paragraph("内容")] as unknown as Descendant[];
      Transforms.select(editor, { path: [1, 0], offset: 0 });
      editor.deleteBackward("character");
    });

    expect(editor.children.map(node => (node as Element).type)).toEqual([
      "custom-block",
      "paragraph",
    ]);
    expect(events).toHaveLength(1);
  });

  it("前一块不是 custom-block：不派发事件，交给默认删除", () => {
    const editor = createTestEditor();
    const events = focusEventsOf(editor, () => {
      editor.children = [paragraph("前"), paragraph("段")] as unknown as Descendant[];
      Transforms.select(editor, { path: [1, 0], offset: 0 });
      editor.deleteBackward("character");
    });

    // 默认退格把两段合并
    expect(editor.children.map(node => (node as Element).type)).toEqual(["paragraph"]);
    expect(events).toHaveLength(0);
  });

  it("嵌套容器中的空段落退格只删除该段落，不误删容器", () => {
    const editor = createTestEditor();
    const events = focusEventsOf(editor, () => {
      editor.children = [
        { type: "blockquote", children: [customBlock(), paragraph("")] },
      ] as unknown as Descendant[];
      Transforms.select(editor, { path: [0, 1, 0], offset: 0 });
      editor.deleteBackward("character");
    });
    expect(editor.children[0]).toMatchObject({
      type: "blockquote",
      children: [{ type: "custom-block" }],
    });
    expect(events).toHaveLength(1);
  });

  it("custom-block 声明为 void 块（kind/isVoid 落到 schema）", () => {
    const editor = createTestEditor();
    const block = { type: "custom-block", content: "", children: [text("")] };
    expect(editor.isVoid(block as never)).toBe(true);
    expect(editor.isBlock(block as never)).toBe(true);
  });
});
