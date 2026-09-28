import { useCallback } from "react";
import { getContentKit } from "@/services/editorKit";
import { Editor } from "@tau/editor/src";
import type { RenderLeafProps } from "slate-react";
import type { Descendant } from "slate";
import type { FormattedText as FormattedTextType } from "@tau/editor/src/types";
import FormattedText from "@tau/editor/src/components/FormattedText";
import { cn } from "@tau/ui";
import type { ReviewLeaf } from "@/utils/review-merged-content";

interface DiffHighlightedEditorProps {
  content: Descendant[];
  /** 兼容保留：diff 取色已走语义 token（随主题切换），不再按主题分支 */
  isDark: boolean;
}

const sanitizeLeaf = (leaf: ReviewLeaf): FormattedTextType => {
  const { diffType: _diffType, diffId: _diffId, reviewSynthetic: _reviewSynthetic, ...rest } = leaf;
  return rest;
};

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

export const DiffHighlightedEditor = ({ content }: DiffHighlightedEditorProps) => {
  const customRenderLeaf = useCallback((props: RenderLeafProps) => {
    const { leaf, children, attributes } = props;
    const diffLeaf = leaf as ReviewLeaf;

    return (
      <span
        {...attributes}
        className={cn(
          diffLeaf.diffType && DIFF_CLASS[diffLeaf.diffType],
          diffLeaf.reviewSyntheticKind && SYNTHETIC_CLASS[diffLeaf.reviewSyntheticKind]
        )}
        title={diffLeaf.diffId ? `变更：${diffLeaf.diffId}` : undefined}
      >
        <FormattedText
          leaf={sanitizeLeaf(diffLeaf)}
          attributes={{} as RenderLeafProps["attributes"]}
        >
          {children}
        </FormattedText>
      </span>
    );
  }, []);

  return (
    <Editor
      kit={getContentKit()}
      initValue={content}
      readonly
      customRenderLeaf={customRenderLeaf}
      className="text-ink-1"
      style={{ padding: "0 4px" }}
    />
  );
};
