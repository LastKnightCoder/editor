/**
 * 划词「交给 Agent」：选中正文 → 写一句要求（可 @ 某个 Agent）→ 作为带原文引用的消息发进当前对话。
 * 结果仍回到这篇正文：建议落成修订痕迹、提问落成批注。只在主窗口可用（对话在主窗口的停靠栏里）。
 */

import { Editor, Range } from "slate";
import { ReactEditor, useSlate } from "slate-react";
import { AtSign } from "lucide-react";
import { defineExtension, type ExtensionLayerProps } from "@tau/editor";
import { EditorTooltip } from "@tau/editor/api";
import { AgentCommentComposer } from "./AgentCommentComposer";
import { useAgentCommentDraft, type AgentCommentTarget } from "./agentCommentDraft";

export type { AgentCommentTarget } from "./agentCommentDraft";

export function createAgentCommentExtension(target: AgentCommentTarget) {
  const key = `${target.entityType}:${target.entityId}:${target.contentId}`;

  function AgentCommentItem() {
    const editor = useSlate();
    const open = (event: React.MouseEvent) => {
      // 保住选区：点按钮不让编辑器失焦前丢掉选中的文字
      event.preventDefault();
      const selection = editor.selection;
      if (!selection || Range.isCollapsed(selection)) return;
      const quote = Editor.string(editor, selection).trim();
      if (!quote) return;
      const box = ReactEditor.toDOMRange(editor, selection).getBoundingClientRect();
      useAgentCommentDraft.setState({
        draft: {
          key,
          quote,
          rect: { left: box.left, top: box.top, width: box.width, height: box.height },
        },
      });
    };
    return (
      <EditorTooltip content="交给 Agent">
        <div
          role="button"
          aria-label="交给 Agent"
          className="ed-toolbar-item flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-all duration-200"
          onMouseDown={open}
        >
          <AtSign size={16} strokeWidth={2.5} />
        </div>
      </EditorTooltip>
    );
  }

  function AgentCommentLayer({ readOnly }: ExtensionLayerProps) {
    const draft = useAgentCommentDraft(state => (state.draft?.key === key ? state.draft : null));
    if (!draft || readOnly) return null;
    return <AgentCommentComposer target={target} draft={draft} />;
  }

  return defineExtension({
    id: "host.agent-comment",
    toolbar: [{ id: "agent-comment", order: 24, element: AgentCommentItem }],
    layers: [AgentCommentLayer],
  });
}
