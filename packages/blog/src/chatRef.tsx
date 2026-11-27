import type { ReactNode } from "react";
import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor";

/** 对话只在作者本机：行内引用显示为出处文字，摘录块显示原文与来源，都不可点 */
interface ChatRefNode {
  title?: unknown;
  label?: unknown;
  turn?: unknown;
  quoteText?: unknown;
  model?: unknown;
}

const nameOf = (node: ChatRefNode) =>
  (typeof node.label === "string" && node.label) ||
  (typeof node.title === "string" && node.title) ||
  "AI 对话";
const labelOf = (node: ChatRefNode) =>
  `${nameOf(node)}${typeof node.turn === "number" ? ` · 第 ${node.turn} 轮` : ""}`;

function ChatRef({ attributes, children, element }: ElementRenderProps) {
  return (
    <span {...attributes} contentEditable={false} className="text-ink-2">
      {labelOf(element as unknown as ChatRefNode)}
      {children as ReactNode}
    </span>
  );
}

function ChatQuote({ attributes, children, element }: ElementRenderProps) {
  const node = element as unknown as ChatRefNode;
  return (
    <blockquote
      {...attributes}
      contentEditable={false}
      className="border-line-1 rounded-tau-md my-1 border py-2.5 pr-3 pl-4"
    >
      <p className="text-ink-1 m-0 whitespace-pre-wrap">
        {typeof node.quoteText === "string" ? node.quoteText : ""}
      </p>
      <footer className="text-ink-3 mt-1.5 text-xs">
        —— {labelOf(node)}
        {typeof node.model === "string" && node.model ? ` · ${node.model}` : ""}
      </footer>
      {children as ReactNode}
    </blockquote>
  );
}

export const chatRefExtension = defineExtension({
  id: "tau.published-chat-ref",
  elements: [
    defineElement({ type: "chat-ref", kind: "inline", isVoid: true, render: ChatRef }),
    defineElement({ type: "chat-quote", kind: "block", isVoid: true, render: ChatQuote }),
  ],
});
