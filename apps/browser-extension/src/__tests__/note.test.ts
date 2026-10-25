import { describe, expect, it } from "vitest";
import type { Descendant } from "slate";
import { EMPTY_NOTE, isEmptyNote, loadDraft, notePreview, takePending } from "../note/draft";
import { markdownToNodes } from "../note/kit";
import { extensionPageOf } from "../background/hub";
import type { KeyValueStore } from "../background/connection";

const memory = (
  initial: Record<string, unknown> = {}
): KeyValueStore & { data: Record<string, unknown> } => {
  const data = { ...initial };
  return {
    data,
    get: async <T>(key: string) => data[key] as T | undefined,
    set: async (key, value) => void (data[key] = value),
    remove: async key => void delete data[key],
  };
};

const types = (nodes: readonly Descendant[]) => nodes.map(node => (node as { type: string }).type);

describe("笔记页的 Markdown 转换（基础组件）", () => {
  it("标题、列表、引用、代码块、分割线转成编辑器节点", () => {
    const nodes = markdownToNodes(
      "## 要点\n\n- 一\n- 二\n\n> 引文\n\n```ts\nconst a = 1;\n```\n\n---\n\n正文 **加粗**"
    );
    expect(types(nodes)).toEqual([
      "header",
      "bulleted-list",
      "blockquote",
      "code-block",
      "divide-line",
      "paragraph",
    ]);
  });
});

describe("草稿", () => {
  it("早先的 Markdown 字符串草稿读取时转换一次并写回", async () => {
    const storage = memory({ "note:https://a.com/x": "## 旧草稿" });
    const draft = await loadDraft(storage, "https://a.com/x#h", markdownToNodes);
    expect(types(draft)).toEqual(["header"]);
    expect(Array.isArray(storage.data["note:https://a.com/x"])).toBe(true);
  });

  it("没有草稿时是一个空段落；取走待追加的片段后清空队列", async () => {
    const storage = memory({ "note-pending:https://a.com/x": ["> 摘录", "AI 回答"] });
    expect(await loadDraft(storage, "https://a.com/x", markdownToNodes)).toEqual(EMPTY_NOTE);
    const nodes = await takePending(storage, "https://a.com/x", markdownToNodes);
    expect(types(nodes!)).toEqual(["blockquote", "paragraph"]);
    expect(storage.data["note-pending:https://a.com/x"]).toBeUndefined();
    expect(await takePending(storage, "https://a.com/x", markdownToNodes)).toBeNull();
  });

  it("空笔记判断与预览", () => {
    expect(isEmptyNote(EMPTY_NOTE)).toBe(true);
    expect(isEmptyNote(markdownToNodes("---"))).toBe(false);
    expect(notePreview(markdownToNodes("\n\n## 标题\n\n正文"))).toBe("标题");
  });
});

describe("extensionPageOf", () => {
  it("只认本扩展的笔记页与伴读库，不认内容脚本和别的扩展页面", () => {
    expect(extensionPageOf({ id: "me", url: "chrome-extension://dyn/note.html?url=x" }, "me")).toBe(
      "note"
    );
    expect(
      extensionPageOf({ id: "me", url: "moz-extension://dyn/library.html?page=x" }, "me")
    ).toBe("library");
    expect(extensionPageOf({ id: "me", url: "https://evil.com/note.html" }, "me")).toBe(null);
    expect(extensionPageOf({ id: "other", url: "chrome-extension://dyn/note.html" }, "me")).toBe(
      null
    );
    expect(extensionPageOf({ id: "me", url: "chrome-extension://dyn/options.html" }, "me")).toBe(
      null
    );
  });
});
