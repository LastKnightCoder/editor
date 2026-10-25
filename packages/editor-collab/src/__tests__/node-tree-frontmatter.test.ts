import { describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import * as Y from "yjs";
import YAML from "yaml";
import { NodeTree } from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { createTextFieldBinding } from "../textFieldBinding";
import { createYamlScalarField } from "../../../editor/src/extensions/front-matter/src/yamlScalarField";
import { bindTextFieldTextarea } from "../../../editor-source-view/src/textFieldTextarea";

async function setup(value: string) {
  const original = globalThis.crypto;
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  try {
    const definition = await prepareContentContract("tau.front-matter", {
      type: "front-matter",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
      collaboration: { textFields: ["value"] },
    });
    const tree = new NodeTree(new Y.Doc());
    await tree.installContracts({ [definition.id]: definition.contract }, null);
    const id = tree.insertNode(
      { type: "front-matter", value, tauContract: definition.id, children: [{ text: "" }] },
      null,
      0,
      null
    );
    const history = tree.createUndoManager({ trackedOrigins: new Set() });
    const source = createTextFieldBinding(tree, id, "value", history, () => true);
    const field = createYamlScalarField(source, "description");
    return {
      tree,
      source,
      field,
      text: tree.textField(id, "value"),
      dispose: () => {
        field.dispose();
        source.dispose();
        history.destroy();
        tree.doc.destroy();
      },
    };
  } finally {
    Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
  }
}

describe("Front Matter 描述源码绑定", () => {
  it("块标量编辑保留其他键、注释及排版，撤销不撤远端键修改", async () => {
    const value = "name: demo # 保留\ndescription: |\n  old\n  text\nother: 7\n";
    const { field, source, text, dispose } = await setup(value);
    try {
      field.edit({ offset: 0, remove: 3, text: "新描述", revision: field.getSnapshot().revision });
      expect(source.getSnapshot().value).toContain("name: demo # 保留\n");
      expect(source.getSnapshot().value).toContain("\nother: 7\n");
      expect(YAML.parse(source.getSnapshot().value)).toEqual({
        name: "demo",
        description: "新描述\ntext\n",
        other: 7,
      });
      text.insert(text.length, "remote: true\n");
      field.undo();
      expect(YAML.parse(source.getSnapshot().value)).toEqual({
        name: "demo",
        description: "old\ntext\n",
        other: 7,
        remote: true,
      });
    } finally {
      dispose();
    }
  });

  it("组合期间远端插入描述文字，与本机输入合并且不修改名称", async () => {
    const { field, source, text, dispose } = await setup('name: demo\ndescription: "abcd"\n');
    const input = document.createElement("textarea"),
      error = vi.fn();
    const binding = bindTextFieldTextarea(input, field, () => {}, error);
    try {
      input.dispatchEvent(new CompositionEvent("compositionstart"));
      input.value = "a中d";
      input.dispatchEvent(new Event("input"));
      text.insert(text.toString().indexOf("abcd") + 2, "远端");
      input.dispatchEvent(new CompositionEvent("compositionend"));
      expect(YAML.parse(source.getSnapshot().value)).toEqual({
        name: "demo",
        description: "a中远端d",
      });
      expect(error).not.toHaveBeenCalled();
    } finally {
      binding.dispose();
      dispose();
    }
  });

  it("源码损坏时拒绝提交，保留表单中的草稿和原始源码", async () => {
    const { field, source, text, dispose } = await setup('name: demo\ndescription: "old"\n');
    const input = document.createElement("textarea"),
      error = vi.fn();
    const binding = bindTextFieldTextarea(input, field, () => {}, error);
    try {
      text.insert(text.length, "name: duplicate\n");
      const corrupted = source.getSnapshot().value;
      input.value = "未提交描述";
      input.dispatchEvent(new Event("input"));
      expect(error).toHaveBeenCalledOnce();
      expect(input.value).toBe("未提交描述");
      expect(source.getSnapshot().value).toBe(corrupted);
    } finally {
      binding.dispose();
      dispose();
    }
  });
});
