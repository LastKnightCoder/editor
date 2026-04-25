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

    expect(wrapContentLink).toHaveBeenCalledWith(
      editor,
      301,
      "card",
      "测试卡片",
      42,
      "测试卡片",
    );
  });
});
