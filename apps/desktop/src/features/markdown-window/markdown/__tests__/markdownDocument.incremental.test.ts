import { expect, it } from "vitest";
import { createEditor, Node, Transforms, type Descendant } from "slate";
import { getMarkdown } from "@/utils/markdown";
import { createMarkdownDocument } from "../markdownDocument";
import { createEditorKit } from "@tau/editor";
import linkExtension from "@tau/editor/extensions/link";
import annotationExtension from "@tau/editor/extensions/annotation";

it("混合正文局部编辑、属性、结构和历史变化与全量 Markdown 一致", async () => {
  const raw =
    [
      "标题\n====",
      "含 **加粗**、[链接](https://example.com) 的正文[^n]。",
      "1. 第一项\n2. 第二项",
      "| 列甲 | 列乙 |\n| :--- | ---: |\n| 甲 | 乙 |",
      "```js\nconst value = 1;\n```",
      "$$\nx + y\n$$",
      "[^n]: 脚注正文",
      ':::tau-node{type="vendor.block"}\n```json\n{"type":"vendor.block","data":{"keep":true},"children":[{"type":"formatted","text":"未知"}]}\n```\n:::',
    ].join("\n\n") + "\n";
  const file = createMarkdownDocument();
  const binding = file.document.binding;
  if (!binding) throw new Error("缺少绑定");
  const kit = createEditorKit({ extensions: [linkExtension, annotationExtension] });
  const editor = binding.install(
    kit.assembly.plugins.reduce((current, plugin) => plugin(current), createEditor())
  );
  try {
    file.applyMarkdown(raw, "external");
    const normalized = getMarkdown(file.getContent());
    binding.connect(editor);
    const verify = () => {
      const full = getMarkdown(file.getContent());
      expect(file.getText()).toBe(full === normalized ? raw : full);
      expect(file.getSnapshot().content).toEqual(file.getContent());
    };
    const apply = async (run: () => void) => {
      file.stopCapturing();
      run();
      await Promise.resolve();
      verify();
      file.undo();
      verify();
      file.redo();
      verify();
    };
    verify();
    const text = [...Node.texts(editor)].find(([, path]) => path[0] === 1);
    if (!text) throw new Error("正文未加载");
    await apply(() => Transforms.insertText(editor, "更新", { at: { path: text[1], offset: 0 } }));
    const code = editor.children.findIndex(node => node.type === "code-block");
    await apply(() => Transforms.setNodes(editor, { code: "const value = 2;" }, { at: [code] }));
    const table = editor.children.findIndex(node => node.type === "table");
    await apply(() => Transforms.setNodes(editor, { align: ["center", "left"] }, { at: [table] }));
    await apply(() =>
      Transforms.insertNodes(
        editor,
        { type: "paragraph", children: [{ type: "formatted", text: "新增段落" }] } as Descendant,
        { at: [0] }
      )
    );
    await apply(() => Transforms.moveNodes(editor, { at: [0], to: [editor.children.length] }));
    const nextRaw = "# 外部版本\r\n\r\n新的正文[^b]\r\n\r\n[^b]: 注释\r\n";
    expect(file.applyMarkdown(nextRaw, "external")).toBe(true);
    expect(file.getText()).toBe(nextRaw);
    expect(file.applyMarkdown(raw, "user")).toBe(true);
    expect(file.getText()).toBe(raw);
    file.undo();
    expect(file.getText()).toBe(nextRaw);
    file.redo();
    expect(file.getText()).toBe(raw);
  } finally {
    file.dispose();
  }
});
