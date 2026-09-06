import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { slateNodesToInsertDelta } from "@slate-yjs/core";
import type { Descendant } from "slate";
import {
  createSharedDocument,
  getBlockFields,
  getBody,
  migrateTabsBlocksInDoc,
  prepareNodes,
  readSharedContent,
} from "./document";
import type { ContentNode } from "./protocol";

const paragraph = (text: string): ContentNode => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});

/** 手工构造旧版本协作缓存结构：tabs 内容外置在块字段（tabOrder + tabs Y.Map），树内 children 为占位 */
function createLegacyTabsDoc(tabTexts: Record<string, string>): Y.Doc {
  // 直接用底层 API 构造（不走 createSharedDocument，其内置迁移会先转换掉旧形态）
  const doc = new Y.Doc();
  const content: ContentNode[] = [
    paragraph("正文开头"),
    {
      type: "tabs",
      collabId: "tabs-1",
      activeKey: "a",
      children: [{ type: "formatted", text: "" }],
    },
    paragraph("结尾"),
  ];
  doc.transact(() => {
    doc.getMap("meta").set("version", 1);
    doc.getMap("meta").set("mode", "local");
    doc.getText("title").insert(0, "旧文档");
    getBody(doc).applyDelta(slateNodesToInsertDelta(prepareNodes(doc, content) as Descendant[]));
    const block = getBlockFields(doc, "tabs-1");
    const order = new Y.Array<string>();
    const tabs = new Y.Map<Y.Map<unknown>>();
    for (const [key, text] of Object.entries(tabTexts)) {
      const entry = new Y.Map<unknown>();
      const title = new Y.Text();
      title.insert(0, `标签 ${key}`);
      entry.set("title", title);
      const root = new Y.XmlText();
      root.applyDelta(slateNodesToInsertDelta([paragraph(text)] as unknown as Descendant[]));
      entry.set("content", root);
      tabs.set(key, entry);
      order.push([key]);
    }
    block.set("tabOrder", order);
    block.set("tabs", tabs);
  });
  return doc;
}

describe("migrateTabsBlocksInDoc", () => {
  it("旧块字段结构应转换为 tab-pane 树内形态且内容不丢", () => {
    const doc = createLegacyTabsDoc({ a: "内容 A", b: "内容 B" });
    try {
      const changed = migrateTabsBlocksInDoc(doc);
      expect(changed).toBe(true);
      const content = readSharedContent(doc).content as ContentNode[];
      const tabs = content.find(node => node.type === "tabs");
      expect(tabs).toBeDefined();
      expect(tabs?.tabsContent).toBeUndefined();
      const panes = (tabs?.children || []) as ContentNode[];
      expect(panes.map(pane => pane.type)).toEqual(["tab-pane", "tab-pane"]);
      expect(JSON.stringify(panes[0])).toContain("内容 A");
      expect(JSON.stringify(panes[1])).toContain("内容 B");
      expect(tabs.activeKey).toBe(panes[0].tabKey);
      // 块字段已清理
      const block = getBlockFields(doc, "tabs-1");
      expect(block.has("tabs")).toBe(false);
      expect(block.has("tabOrder")).toBe(false);
      // 正文其余部分保留
      expect(JSON.stringify(content)).toContain("正文开头");
      expect(JSON.stringify(content)).toContain("结尾");
    } finally {
      doc.destroy();
    }
  });

  it("幂等：新结构文档再次迁移应无变化", () => {
    const doc = createLegacyTabsDoc({ a: "内容 A" });
    try {
      migrateTabsBlocksInDoc(doc);
      const before = JSON.stringify(readSharedContent(doc));
      expect(migrateTabsBlocksInDoc(doc)).toBe(false);
      expect(JSON.stringify(readSharedContent(doc))).toBe(before);
    } finally {
      doc.destroy();
    }
  });

  it("不含 tabs 的文档应保持不动", () => {
    const doc = createSharedDocument({
      title: "普通文档",
      bannerBg: "",
      bannerPosition: "center",
      content: [paragraph("只有段落")],
    });
    try {
      const before = getBody(doc).toString();
      expect(migrateTabsBlocksInDoc(doc)).toBe(false);
      expect(getBody(doc).toString()).toBe(before);
    } finally {
      doc.destroy();
    }
  });
});
