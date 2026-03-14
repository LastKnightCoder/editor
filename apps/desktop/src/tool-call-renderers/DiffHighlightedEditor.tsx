import { useCallback, useMemo } from "react";
import { Editor } from "@tau/editor/src";
import type { RenderLeafProps } from "slate-react";
import type { Node, Path, Range } from "slate";
import { Range as SlateRange } from "slate";
import { patchesToDecorations, type DiffRange } from "@/utils/diff-decoration";
import type { AppliedPatch } from "@/services/content-editing/types";
import type { PositionMapper } from "@/utils/positionMapper";
import type { Descendant } from "slate";
import type { FormattedText as FormattedTextType } from "@tau/editor/src/types";
import FormattedText from "@tau/editor/src/components/FormattedText";
import type IExtension from "@tau/editor/src/extensions/types";
import classNames from "classnames";

interface DiffHighlightedEditorProps {
  content: Descendant[];
  patches: AppliedPatch[];
  positionMapper: PositionMapper;
  lineOffsets: number[];
  proposalMarkdownLength: number;
  isDark: boolean;
  extensions?: IExtension[];
}

export const DiffHighlightedEditor = ({
  content,
  patches,
  positionMapper,
  lineOffsets,
  proposalMarkdownLength,
  isDark,
  extensions,
}: DiffHighlightedEditorProps) => {
  // 生成 decoration ranges（基于提案内容的坐标）
  const diffRanges = useMemo(
    () =>
      patchesToDecorations(
        patches,
        positionMapper,
        lineOffsets,
        proposalMarkdownLength,
      ),
    [patches, positionMapper, lineOffsets, proposalMarkdownLength],
  );

  // decorate 函数：正确处理跨节点 range
  const decorate = useCallback(
    ([node, path]: [Node, Path]): Range[] => {
      // 只对文本节点应用 decoration
      if (!("text" in node)) {
        return [];
      }

      const nodeRange: Range = {
        anchor: { path, offset: 0 },
        focus: { path, offset: (node as { text: string }).text.length },
      };

      // 过滤出与当前文本节点相交的 ranges
      return diffRanges
        .filter((range) => {
          // 使用 Slate 的 Range.intersection 判断是否相交
          return (
            SlateRange.includes(range, path) ||
            SlateRange.intersection(range, nodeRange) !== null
          );
        })
        .map((range) => {
          // 裁剪到当前节点范围内
          const intersection = SlateRange.intersection(range, nodeRange);
          if (!intersection) return null;
          return {
            ...intersection,
            diffType: range.diffType,
            diffId: range.diffId,
            deletedText: range.deletedText,
            deletionAnchor: range.deletionAnchor,
          } as DiffRange;
        })
        .filter((r): r is DiffRange => r !== null);
    },
    [diffRanges],
  );

  // 自定义 renderLeaf
  const customRenderLeaf = useCallback(
    (props: RenderLeafProps) => {
      const { leaf, children, attributes } = props;
      const diffLeaf = leaf as FormattedTextType & Partial<DiffRange>;

      if (diffLeaf.diffType) {
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
          highlightClass = classNames(
            "rounded-sm",
            isDark ? "bg-red-950/20 text-inherit" : "bg-red-50/80 text-inherit",
            diffLeaf.deletionAnchor === "before"
              ? isDark
                ? "border-l-2 border-red-500/60"
                : "border-l-2 border-red-400"
              : isDark
                ? "border-r-2 border-red-500/60"
                : "border-r-2 border-red-400",
          );
        }

        return (
          <FormattedText
            leaf={leaf}
            attributes={attributes}
            wrapperProps={{
              className: highlightClass,
              title: diffLeaf.deletedText
                ? `已删除内容：${diffLeaf.deletedText}`
                : undefined,
            }}
          >
            {children}
          </FormattedText>
        );
      }

      return (
        <FormattedText leaf={leaf} attributes={attributes}>
          {children}
        </FormattedText>
      );
    },
    [isDark],
  );

  return (
    <Editor
      initValue={content}
      readonly
      extensions={extensions}
      decorate={decorate}
      customRenderLeaf={customRenderLeaf}
      className={isDark ? "text-slate-100" : "text-slate-900"}
      style={{ padding: "0 4px" }}
    />
  );
};
