import { useCallback } from "react";
import { Editor } from "@tau/editor/src";
import type { RenderLeafProps } from "slate-react";
import type { Descendant } from "slate";
import type { FormattedText as FormattedTextType } from "@tau/editor/src/types";
import FormattedText from "@tau/editor/src/components/FormattedText";
import type IExtension from "@tau/editor/src/extensions/types";
import classNames from "classnames";
import type { ReviewLeaf } from "@/utils/review-merged-content";

interface DiffHighlightedEditorProps {
  content: Descendant[];
  isDark: boolean;
  extensions?: IExtension[];
}

const sanitizeLeaf = (leaf: ReviewLeaf): FormattedTextType => {
  const { diffType: _diffType, diffId: _diffId, reviewSynthetic: _reviewSynthetic, ...rest } = leaf;
  return rest;
};

export const DiffHighlightedEditor = ({
  content,
  isDark,
  extensions,
}: DiffHighlightedEditorProps) => {
  const customRenderLeaf = useCallback(
    (props: RenderLeafProps) => {
      const { leaf, children, attributes } = props;
      const diffLeaf = leaf as ReviewLeaf;

      let highlightClass = "";
      let syntheticClass = "";
      if (diffLeaf.diffType === "insert") {
        highlightClass =
          "bg-[var(--th-success)]/15 text-status-success border-b-2 border-[var(--th-success)]/50";
      } else if (diffLeaf.diffType === "replace") {
        highlightClass =
          "bg-[var(--th-warning)]/15 text-status-warning border-b-2 border-[var(--th-warning)]/50";
      } else if (diffLeaf.diffType === "delete") {
        highlightClass = "bg-[var(--th-danger)]/15 text-status-error line-through rounded-sm";
      }

      if (diffLeaf.reviewSyntheticKind === "collapsed") {
        syntheticClass = isDark ? "italic text-slate-500" : "italic text-slate-400";
      } else if (diffLeaf.reviewSyntheticKind === "meta") {
        syntheticClass = "italic text-status-info";
      } else if (diffLeaf.reviewSyntheticKind === "code") {
        syntheticClass = isDark ? "font-mono whitespace-pre-wrap" : "font-mono whitespace-pre-wrap";
      }

      return (
        <span
          {...attributes}
          className={classNames(highlightClass, syntheticClass)}
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
    },
    [isDark]
  );

  return (
    <Editor
      initValue={content}
      readonly
      extensions={extensions}
      customRenderLeaf={customRenderLeaf}
      className={isDark ? "text-slate-100" : "text-slate-900"}
      style={{ padding: "0 4px" }}
    />
  );
};
