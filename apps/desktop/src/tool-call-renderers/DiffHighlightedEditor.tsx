import { getContentKit } from "@/services/editorKit";
import { Editor } from "@tau/editor";
import type { Descendant, Editor as SlateEditor } from "slate";
import type { MarkRenderProps } from "@tau/editor/api";
import { cn } from "@tau/ui";
import type { ReviewLeaf } from "@/utils/review-merged-content";

import { useReviewToolI18n, reviewSyntheticLabel } from "./review.i18n";

interface DiffHighlightedEditorProps {
  content: Descendant[];
  /** 兼容保留：diff 取色已走语义 token（随主题切换），不再按主题分支 */
  isDark: boolean;
}

/** diff 语义色成对：新增 ok、替换 warn、删除 danger（另加删除线） */
const DIFF_CLASS: Record<string, string> = {
  insert: "bg-ok-soft text-ok rounded-[3px]",
  replace: "bg-warn-soft text-warn rounded-[3px]",
  delete: "bg-danger-soft text-danger rounded-[3px] line-through",
};

const SYNTHETIC_CLASS: Record<string, string> = {
  collapsed: "italic text-ink-3",
  meta: "italic text-info",
  code: "font-tau-mono whitespace-pre-wrap",
};

const ReviewLeafWrapper = (props: MarkRenderProps) => {
  const { t } = useReviewToolI18n();
  const { leaf, children } = props;
  const diffLeaf = leaf as ReviewLeaf;
  const display = diffLeaf.reviewDisplay ? reviewSyntheticLabel(diffLeaf.reviewDisplay, t) : null;

  return (
    <span
      className={cn(
        diffLeaf.diffType && DIFF_CLASS[diffLeaf.diffType],
        diffLeaf.reviewSyntheticKind && SYNTHETIC_CLASS[diffLeaf.reviewSyntheticKind]
      )}
      title={diffLeaf.diffId ? t("review.diffId", { id: diffLeaf.diffId }) : undefined}
      data-review-leaf
    >
      {display === null ? (
        children
      ) : (
        <>
          <span
            contentEditable={false}
            role="note"
            data-review-display={display}
            aria-label={display}
            className="before:content-[attr(data-review-display)]"
          />
          <span className="sr-only" data-review-original>
            {children}
          </span>
        </>
      )}
    </span>
  );
};

const initializedClipboard = new WeakSet<SlateEditor>();
const initializeReviewClipboard = (editor: SlateEditor) => {
  if (initializedClipboard.has(editor)) return;
  initializedClipboard.add(editor);
  const setFragmentData = editor.setFragmentData;
  editor.setFragmentData = (data, originEvent) => {
    const result = setFragmentData.call(editor, data, originEvent);
    const html = data.getData("text/html");
    if (!html.includes("data-review-leaf")) return result;
    const template = document.createElement("template");
    template.innerHTML = html;
    template.content.querySelectorAll("[data-review-display]").forEach(element => element.remove());
    template.content
      .querySelectorAll("[data-review-original]")
      .forEach(element => element.replaceWith(...Array.from(element.childNodes)));
    template.content.querySelectorAll("[data-review-leaf]").forEach(element => {
      element.removeAttribute("title");
      element.removeAttribute("data-review-leaf");
    });
    data.setData("text/html", template.innerHTML);
    return result;
  };
};

export const DiffHighlightedEditor = ({ content }: DiffHighlightedEditorProps) => {
  return (
    <Editor
      kit={getContentKit()}
      initValue={content}
      readonly
      leafWrapper={ReviewLeafWrapper}
      onInit={initializeReviewClipboard}
      className="text-ink-1"
      style={{ padding: "0 4px" }}
    />
  );
};
