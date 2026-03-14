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
  const {
    diffType: _diffType,
    diffId: _diffId,
    reviewSynthetic: _reviewSynthetic,
    ...rest
  } = leaf;
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
      if (diffLeaf.diffType === "insert") {
        highlightClass = isDark
          ? "bg-green-900/30 text-green-200 border-b-2 border-green-500/50"
          : "bg-green-50 text-green-900 border-b-2 border-green-300";
      } else if (diffLeaf.diffType === "replace") {
        highlightClass = isDark
          ? "bg-yellow-900/30 text-yellow-200 border-b-2 border-yellow-500/50"
          : "bg-yellow-50 text-yellow-900 border-b-2 border-yellow-300";
      } else if (diffLeaf.diffType === "delete") {
        highlightClass = isDark
          ? "bg-red-900/25 text-red-200 line-through rounded-sm"
          : "bg-red-50 text-red-700 line-through rounded-sm";
      }

      return (
        <span
          {...attributes}
          className={classNames(highlightClass)}
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
    [isDark],
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
