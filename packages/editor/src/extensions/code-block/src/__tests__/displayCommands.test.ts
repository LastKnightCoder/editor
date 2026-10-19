import { createEditor, type Editor } from "slate";
import { describe, expect, it, vi } from "vitest";
import { CommandRegistry, createCommandDispatcher } from "@tau/editor/api";
import { createCircuitBreaker } from "../../../../core/kit/extensionGuard";
import { codeBlockCommands } from "../extensions/code-block/utils/menu";
import type { CodeBlockElement } from "../types";

const setup = (extra: Partial<CodeBlockElement> = {}) => {
  const editor = createEditor();
  const block: CodeBlockElement = {
    type: "code-block",
    uuid: "display-block",
    code: "a",
    language: "TypeScript",
    children: [{ type: "formatted", text: "" }],
    ...extra,
  };
  editor.children = [block];
  const registry = new CommandRegistry();
  registry.register("tau.code-block", codeBlockCommands);
  const dispatcher = createCommandDispatcher(
    registry,
    createCircuitBreaker(() => ({ report: vi.fn() }))
  );
  const execute = (id: string) =>
    dispatcher.execute(editor, id, { element: editor.children[0] as CodeBlockElement, path: [0] });
  return { editor, execute };
};
const blockOf = (editor: Editor) => editor.children[0] as CodeBlockElement;

describe("代码块显示类命令", () => {
  it("行号缺省显示，关闭时只存 false，再开启时删除字段", () => {
    const { editor, execute } = setup();
    execute("tau.code-block.toggle-line-numbers");
    expect(blockOf(editor).lineNumbers).toBe(false);
    execute("tau.code-block.toggle-line-numbers");
    expect(blockOf(editor)).not.toHaveProperty("lineNumbers");
  });

  it("自动换行开启存 true，关闭时删除字段", () => {
    const { editor, execute } = setup();
    execute("tau.code-block.toggle-wrap");
    expect(blockOf(editor).wrap).toBe(true);
    execute("tau.code-block.toggle-wrap");
    expect(blockOf(editor)).not.toHaveProperty("wrap");
  });
});
