import { createEditor } from "slate";
import { describe, expect, it, vi } from "vitest";

import { createMentionPanelStore } from "../createMentionPanelStore";

const wrapContentLink = vi.fn();
vi.mock("../../components/utils", () => ({
  wrapContentLink: (...args: unknown[]) => wrapContentLink(...args),
}));

vi.mock("../../plugins/withMentionCommands", () => ({
  cleanupMentionPanel: vi.fn(),
}));

describe("createMentionPanelStore", () => {
  it("选择 mention 时应使用内容标题作为内联显示文本", () => {
    const editor = createEditor();
    editor.deleteBackward = vi.fn();

    const store = createMentionPanelStore(editor);
    store.setState({
      inputValue: "@测试",
      searchResults: [
        {
          id: 42,
          contentId: 301,
          type: "card",
          title: "测试卡片",
          content: [],
        } as any,
      ],
    });

    store.getState().selectItem(0);

    expect(wrapContentLink).toHaveBeenCalledWith(editor, 301, "card", "测试卡片", 42, "测试卡片");
  });

  it("[[ 触发时无标题内容应以搜索词作为内联显示文本", () => {
    const editor = createEditor();
    editor.deleteBackward = vi.fn();

    const store = createMentionPanelStore(editor);
    store.setState({
      inputValue: "[[关键词",
      trigger: "[[",
      searchResults: [
        {
          id: 7,
          contentId: 402,
          type: "article",
          title: "",
          content: [],
        } as any,
      ],
    });

    store.getState().selectItem(0);

    // 触发词 + 搜索词共 5 个字符都应从文档里删掉
    expect(editor.deleteBackward).toHaveBeenCalledTimes(5);
    expect(wrapContentLink).toHaveBeenCalledWith(editor, 402, "article", "", 7, "关键词");
  });

  it("【【 触发时选中项的标题优先作为内联显示文本", () => {
    const editor = createEditor();
    editor.deleteBackward = vi.fn();

    const store = createMentionPanelStore(editor);
    store.setState({
      inputValue: "【【候选",
      trigger: "【【",
      searchResults: [
        {
          id: 9,
          contentId: 503,
          type: "card",
          title: "标题卡片",
          content: [],
        } as any,
      ],
    });

    store.getState().selectItem(0);

    expect(wrapContentLink).toHaveBeenCalledWith(editor, 503, "card", "标题卡片", 9, "标题卡片");
  });
});
