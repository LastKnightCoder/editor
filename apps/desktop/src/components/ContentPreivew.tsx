import { Fragment, memo, useMemo, type ReactNode } from "react";
import type { Descendant } from "slate";
import { cn } from "@tau/ui";

const MAX_PREVIEW_NODES = 120;
const MAX_PREVIEW_CHARACTERS = 1_200;
const MAX_PREVIEW_DEPTH = 12;

interface PreviewBudget {
  nodes: number;
  characters: number;
  truncated: boolean;
}

const MEDIA_LABELS: Record<string, string> = {
  image: "图片",
  "inline-image": "图片",
  video: "视频",
  audio: "音频",
  whiteboard: "白板",
  database: "数据表",
  "file-attachment": "附件",
};

function previewText(text: string, budget: PreviewBudget): string {
  const result = text.slice(0, budget.characters);
  budget.characters -= result.length;
  if (result.length < text.length) budget.truncated = true;
  return result;
}

function renderNodes(nodes: readonly unknown[], budget: PreviewBudget, depth: number): ReactNode[] {
  const result: ReactNode[] = [];
  for (let index = 0; index < nodes.length; index++) {
    if (budget.nodes <= 0 || budget.characters <= 0 || depth >= MAX_PREVIEW_DEPTH) {
      budget.truncated = true;
      break;
    }
    budget.nodes--;
    const node = nodes[index];
    if (!node || typeof node !== "object") continue;
    const rendered = renderNode(node, budget, depth);
    if (rendered !== null) result.push(<Fragment key={index}>{rendered}</Fragment>);
  }
  return result;
}

function renderNode(value: object, budget: PreviewBudget, depth: number): ReactNode {
  const node = value as Record<string, unknown>;
  if (typeof node.text === "string") {
    if (!node.text) return null;
    return (
      <span
        className={cn(
          Boolean(node.bold) && "font-semibold",
          Boolean(node.italic) && "italic",
          Boolean(node.underline) && "underline",
          Boolean(node.strikethrough) && "line-through",
          Boolean(node.code) && "bg-hover font-tau-mono rounded-tau-sm px-0.5"
        )}
      >
        {previewText(node.text, budget)}
      </span>
    );
  }

  const type = typeof node.type === "string" ? node.type : "";
  const mediaLabel = Object.hasOwn(MEDIA_LABELS, type) ? MEDIA_LABELS[type] : undefined;
  if (mediaLabel) {
    const label = [node.alt, node.fileName, node.name, node.title].find(
      value => typeof value === "string" && value.trim()
    );
    return (
      <span className="text-ink-3">
        {previewText(`[${mediaLabel}${label ? `：${label}` : ""}]`, budget)}
      </span>
    );
  }
  if ((type === "inline-math" || type === "block-math") && typeof node.tex === "string") {
    return <code className="font-tau-mono">{previewText(node.tex, budget)}</code>;
  }
  if ((type === "code-block" || type === "code-step") && typeof node.code === "string") {
    return (
      <pre className="font-tau-mono text-[0.85em] whitespace-pre-wrap">
        {previewText(node.code, budget)}
      </pre>
    );
  }

  const children = Array.isArray(node.children)
    ? renderNodes(node.children, budget, depth + 1)
    : [];
  switch (type) {
    case "paragraph":
      return <p className="mb-[1.25em] last:mb-0">{children.length ? children : <br />}</p>;
    case "header":
      return <div className="mb-2 text-[1.125em] font-semibold last:mb-0">{children}</div>;
    case "blockquote":
      return <blockquote className="text-ink-2 pl-3">{children}</blockquote>;
    case "bulleted-list":
    case "check-list":
      return <ul className="list-disc pl-5">{children}</ul>;
    case "numbered-list":
      return <ol className="list-decimal pl-5">{children}</ol>;
    case "list-item":
    case "check-list-item":
      return <li className={node.checked ? "text-ink-3 line-through" : undefined}>{children}</li>;
    case "link":
    case "content-link":
      return (
        <span className="text-accent-text underline">
          {children.length ? children : previewText(String(node.contentTitle ?? "链接"), budget)}
        </span>
      );
    case "table":
      return (
        <table className="w-full text-[0.85em]">
          <tbody>{children}</tbody>
        </table>
      );
    case "table-row":
      return <tr>{children}</tr>;
    case "table-cell":
      return <td className="border-line-1 border px-1 py-0.5 align-top">{children}</td>;
    case "code-block":
    case "code-step":
      return <div className="font-tau-mono text-[0.85em] whitespace-pre-wrap">{children}</div>;
    default:
      return children.length ? (
        children
      ) : (
        <span className="text-ink-3">{previewText("[内容块]", budget)}</span>
      );
  }
}

/** 静态摘要仅投影传入快照；预算限制复杂子树，不挂载编辑器、媒体或引用查询。 */
export const ContentPreivew = memo(function ContentPreivew({
  content,
  blocks = 3,
  className,
}: {
  content: Descendant[];
  blocks?: number;
  className?: string;
}) {
  const preview = useMemo(() => {
    const budget = {
      nodes: MAX_PREVIEW_NODES,
      characters: MAX_PREVIEW_CHARACTERS,
      truncated: false,
    };
    const nodes = renderNodes(content.slice(0, blocks), budget, 0);
    return (
      <>
        {nodes}
        {budget.truncated && "…"}
      </>
    );
  }, [content, blocks]);

  return (
    <div
      data-content-preview
      className={cn(
        "pointer-events-none overflow-hidden py-0.5 break-words whitespace-pre-wrap",
        className
      )}
    >
      {preview}
    </div>
  );
});
