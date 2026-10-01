import { describe, expect, it } from "vitest";
import { createMarkdownDocument } from "../markdownDocument";

describe("Markdown 文件的 Y.Doc 会话", () => {
  it("仅打开和载入外部版本时保留原文格式，外部事务不进撤销", () => {
    const file = createMarkdownDocument();
    const sources: string[] = [];
    const stop = file.onChange(source => sources.push(source));
    try {
      const raw = "标题\n====\n\n正文  \n\n";
      expect(file.applyMarkdown(raw, "external")).toBe(true);
      expect(file.getText()).toBe(raw);
      file.undo();
      expect(file.getText()).toBe(raw);
      expect(sources.every(source => source === "external")).toBe(true);
      expect(file.applyMarkdown("# 新标题\r\n\r\n外部正文\r\n", "external")).toBe(true);
      expect(file.getText()).toBe("# 新标题\r\n\r\n外部正文\r\n");
    } finally {
      stop();
      file.dispose();
    }
  });

  it("源码修改连同原文缓存一起撤销/重做，重复导入保留代码块 UUID", () => {
    const file = createMarkdownDocument();
    try {
      const initial = "```js\nconst a = 1;\n```\n";
      file.applyMarkdown(initial, "external");
      const first = file.getContent()[0];
      if (first.type !== "code-block") throw new Error("代码块未加载");
      const uuid = first.uuid;
      const changed = "```js\nconst a = 2;\n```\n\n新段落\n";
      file.applyMarkdown(changed, "user");
      expect(file.getContent()[0]).toMatchObject({ uuid, code: "const a = 2;" });
      expect(file.getText()).toBe(changed);
      file.undo();
      expect(file.getText()).toBe(initial);
      file.redo();
      expect(file.getText()).toBe(changed);
      file.applyMarkdown(changed, "user");
      expect(file.getContent()[0]).toMatchObject({ uuid });
    } finally {
      file.dispose();
    }
  });

  it("无法转换的正文保留原文并提示，不用丢字段的投影覆盖文件", () => {
    const file = createMarkdownDocument();
    try {
      const raw =
        ':tau-node[]{type="formatted" json="{&quot;type&quot;:&quot;formatted&quot;,&quot;text&quot;:&quot;&quot;,&quot;vendor&quot;:true}"}';
      expect(file.applyMarkdown(raw, "external")).toBe(false);
      expect(file.getSnapshot().error).toContain("空文本");
      expect(file.getText()).toBe(raw);
      expect(file.applyMarkdown("可编辑正文", "user")).toBe(true);
      expect(file.getSnapshot().error).toBeNull();
      file.undo();
      expect(file.getText()).toBe(raw);
    } finally {
      file.dispose();
    }
  });
});
