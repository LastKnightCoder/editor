import { Editor, Element, Range } from "slate";
import { useReadOnly, useSlate } from "slate-react";
import { Copy, CircleHelp } from "lucide-react";
import { Tooltip } from "@tau/ui";
import { defineExtension, getCommandElementPath } from "@tau/editor/api";
import { extractToCardWithFeedback, type ExtractSource } from "@/services/extract-to-card";
import { requestSelectionQuestionCapture } from "@/services/question-capture";

export function createExtractExtension(source: ExtractSource) {
  const QuestionAction = () => {
    const editor = useSlate();
    const readonly = useReadOnly();
    return (
      <Tooltip content="转为问题">
        <button
          type="button"
          aria-label="转为问题"
          className="text-ink-2 hover:bg-hover rounded-tau-sm flex size-8 items-center justify-center"
          disabled={readonly || !editor.selection || Range.isCollapsed(editor.selection)}
          onMouseDown={event => event.preventDefault()}
          onClick={() => {
            if (editor.selection) requestSelectionQuestionCapture(editor, editor.selection, source);
          }}
        >
          <CircleHelp size={16} />
        </button>
      </Tooltip>
    );
  };
  const SelectionAction = () => {
    const editor = useSlate();
    const readonly = useReadOnly();
    return (
      <Tooltip content="抽成卡片（复制）">
        <button
          type="button"
          aria-label="抽成卡片（复制）"
          className="text-ink-2 hover:bg-hover rounded-tau-sm flex size-8 items-center justify-center"
          disabled={readonly || !editor.selection || Range.isCollapsed(editor.selection)}
          onMouseDown={event => event.preventDefault()}
          onClick={() => {
            if (editor.selection) void extractToCardWithFeedback(editor, editor.selection, source);
          }}
        >
          <Copy size={16} />
        </button>
      </Tooltip>
    );
  };
  return defineExtension({
    id: "host.extract",
    toolbar: [
      { id: "extract-to-card", compactGroup: "more", order: 23, element: SelectionAction },
      { id: "selection-question", compactGroup: "more", order: 24, element: QuestionAction },
    ],
    menuFor: {
      header: [
        { id: "extract-section", title: "这一节抽成卡片（复制）", command: "host.extract.section" },
      ],
    },
    commands: [
      {
        id: "host.extract.section",
        run: (editor, context) => {
          const path = getCommandElementPath(editor, context);
          if (!path || path.length !== 1) return;
          const header = editor.children[path[0]];
          if (!Element.isElement(header) || header.type !== "header") return;
          let end = path[0];
          while (end + 1 < editor.children.length) {
            const next = editor.children[end + 1];
            if (Element.isElement(next) && next.type === "header" && next.level <= header.level)
              break;
            end++;
          }
          void extractToCardWithFeedback(
            editor,
            { anchor: Editor.start(editor, path), focus: Editor.end(editor, [end]) },
            source
          );
        },
      },
    ],
  });
}
