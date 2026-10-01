import { getContentKit } from "@/services/editorKit";
import { Editor } from "@tau/editor";
import type { Descendant } from "slate";
import type { MarkRenderProps } from "@tau/editor/api";
import { cn } from "@tau/ui";
import type { ReviewLeaf } from "@/utils/review-merged-content";

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
  const { leaf, children } = props;
  const diffLeaf = leaf as ReviewLeaf;

  return (
    <span
      className={cn(
        diffLeaf.diffType && DIFF_CLASS[diffLeaf.diffType],
        diffLeaf.reviewSyntheticKind && SYNTHETIC_CLASS[diffLeaf.reviewSyntheticKind]
      )}
      title={diffLeaf.diffId ? `变更：${diffLeaf.diffId}` : undefined}
    >
      {children}
    </span>
  );
};

export const DiffHighlightedEditor = ({ content }: DiffHighlightedEditorProps) => {
  return (
    <Editor
      kit={getContentKit()}
      initValue={content}
      readonly
      leafWrapper={ReviewLeafWrapper}
      className="text-ink-1"
      style={{ padding: "0 4px" }}
    />
  );
};
