import { useMemo, type ReactNode } from "react";
import { cn } from "@tau/ui";
import { parseMarkdown, type Block, type Inline } from "./parse";

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return node.text;
      case "break":
        return <br key={index} />;
      case "code":
        return (
          <code
            key={index}
            className="bg-hover font-tau-mono rounded-[5px] px-1 py-px text-[0.92em]"
          >
            {node.text}
          </code>
        );
      case "strong":
        return (
          <strong key={index} className="font-semibold">
            {renderInline(node.children)}
          </strong>
        );
      case "em":
        return <em key={index}>{renderInline(node.children)}</em>;
      case "link":
        return (
          <a
            key={index}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-accent-text decoration-accent/40 hover:decoration-accent underline underline-offset-2"
          >
            {renderInline(node.children)}
          </a>
        );
      case "image":
        return (
          <span key={index} className="text-ink-3">
            [图片{node.alt ? `：${node.alt}` : ""}]
          </span>
        );
    }
  });
}

const HEADING_CLASS: Record<number, string> = {
  1: "text-tau-title-lg font-semibold",
  2: "text-tau-title font-semibold",
  3: "text-tau-body font-semibold",
};

function renderBlock(block: Block, index: number): ReactNode {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}` as const;
      return (
        <Tag
          key={index}
          className={cn(
            "text-ink-1 mt-1",
            HEADING_CLASS[block.level] ?? "text-tau-body font-semibold"
          )}
        >
          {renderInline(block.children)}
        </Tag>
      );
    }
    case "paragraph":
      return <p key={index}>{renderInline(block.children)}</p>;
    case "quote":
      return (
        <blockquote key={index} className="border-line-2 text-ink-2 border-l-2 pl-3">
          {renderInline(block.children)}
        </blockquote>
      );
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List
          key={index}
          className={cn("flex flex-col gap-1 pl-5", block.ordered ? "list-decimal" : "list-disc")}
        >
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </List>
      );
    }
    case "code":
      return (
        <pre
          key={index}
          className="bg-hover rounded-tau-sm font-tau-mono text-tau-sm overflow-x-auto px-3 py-2.5"
        >
          <code>{block.text}</code>
        </pre>
      );
    case "rule":
      return <hr key={index} className="border-line-1" />;
  }
}

/** 介绍字段预览：只渲染受支持的 Markdown 子集，原始 HTML 显示为文字 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <div
      className={cn("text-tau-body text-ink-1 flex min-w-0 flex-col gap-3 break-words", className)}
    >
      {blocks.map(renderBlock)}
    </div>
  );
}
