// 闪卡富文本轻量渲染器：只读渲染 Slate JSON（题干/详情/参考资料）。
// 不引入完整 Slate 编辑器——复习页只需渲染 + 填空交互；未知节点降级为纯文本，
// 保证桌面端新增节点类型时移动端不白屏（前向兼容）。

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { BlankNode } from "./reviewFlow";

export interface BlankRenderProps {
  /** 揭示态：渲染成答案胶囊 */
  revealed: boolean;
  /** 答题态：按空取用户输入 */
  getBlankValue: (blankId: string) => string;
  onBlankChange: (blankId: string, value: string) => void;
  /** 揭示态：按空判对错（未提供时按 false 展示） */
  correct?: (blankId: string) => boolean;
}

function renderTextMarks(node: Record<string, unknown>, keyPrefix: string): ReactNode {
  const text = typeof node.text === "string" ? node.text : "";
  if (!text) return null;
  let element: ReactNode = text;
  const style: CSSProperties = {};
  if (node.bold) style.fontWeight = 700;
  if (node.italic) style.fontStyle = "italic";
  if (node.underline || node.strikethrough) {
    style.textDecoration = [
      node.underline ? "underline" : "",
      node.strikethrough ? "line-through" : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (node.code) {
    element = (
      <code
        key={keyPrefix}
        style={{
          fontFamily: "var(--mono-font)",
          fontSize: "0.88em",
          background: "var(--bg-input)",
          borderRadius: 6,
          padding: "1px 5px",
        }}
      >
        {text}
      </code>
    );
  } else if (Object.keys(style).length > 0) {
    element = (
      <span key={keyPrefix} style={style}>
        {text}
      </span>
    );
  } else {
    return text;
  }
  return element;
}

function collectText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  if (Array.isArray(node)) return node.map(collectText).join("");
  const record = node as Record<string, unknown>;
  if (typeof record.text === "string") return record.text;
  if (Array.isArray(record.children)) return record.children.map(collectText).join("");
  return "";
}

/**
 * 填空行内输入：宽度精确跟随内容——隐藏镜像 span 与输入框同字体（input 默认不
 * 继承正文字体，须显式对齐），layout 后取实测宽度设置输入框，杜绝系数估算
 * 造成的虚宽（虚宽会把输入框挤到下一行独占一行）
 */
function BlankInput({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const measureRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (measureRef.current) setWidth(measureRef.current.offsetWidth);
  }, [value, placeholder]);
  const sharedFont: CSSProperties = {
    fontFamily: "inherit",
    fontSize: "inherit",
    fontWeight: 700,
  };
  return (
    <>
      <span
        ref={measureRef}
        aria-hidden
        style={{
          ...sharedFont,
          position: "absolute",
          visibility: "hidden",
          whiteSpace: "pre",
          pointerEvents: "none",
        }}
      >
        {value || placeholder}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
        style={{
          ...sharedFont,
          display: "inline-block",
          // 实测内容宽 + 左右 padding 与余量；上限防极端长内容撑破行宽
          width: width > 0 ? `${width + 12}px` : "4.5ch",
          maxWidth: "70vw",
          border: "none",
          borderBottom: "2px solid var(--brand)",
          background: "transparent",
          color: "var(--brand)",
          textAlign: "center",
          outline: "none",
          padding: "0 4px 1px",
          borderRadius: 0,
        }}
      />
    </>
  );
}

function renderInline(
  children: unknown[],
  keyPrefix: string,
  blankProps: BlankRenderProps | null
): ReactNode[] {
  const nodes: ReactNode[] = [];
  children.forEach((child, index) => {
    const key = `${keyPrefix}-${index}`;
    if (!child || typeof child !== "object") return;
    const record = child as Record<string, unknown>;
    if (record.type === "flashcard-blank" && typeof record.blankId === "string" && blankProps) {
      const blank: BlankNode = {
        blankId: record.blankId,
        answer: typeof record.answer === "string" ? record.answer : "",
        placeholder: typeof record.placeholder === "string" ? record.placeholder : "",
        alternativeAnswers: Array.isArray(record.alternativeAnswers)
          ? (record.alternativeAnswers as string[])
          : undefined,
      };
      if (blankProps.revealed) {
        const correct = blankProps.correct?.(blank.blankId) ?? false;
        nodes.push(
          <span
            key={key}
            style={{
              display: "inline-block",
              padding: "0 8px 1px",
              margin: "0 2px",
              borderRadius: 8,
              border: "1.5px dashed",
              fontWeight: 700,
              lineHeight: 1.5,
              background: correct ? "var(--sage-soft)" : "var(--rose-soft)",
              color: correct ? "var(--sage)" : "var(--danger)",
              borderColor: correct ? "var(--sage)" : "var(--danger)",
            }}
          >
            {blank.answer}
          </span>
        );
      } else {
        nodes.push(
          <BlankInput
            key={key}
            value={blankProps.getBlankValue(blank.blankId)}
            placeholder={blank.placeholder || "填空"}
            onChange={value => blankProps.onBlankChange(blank.blankId, value)}
          />
        );
      }
      return;
    }
    if (Array.isArray(record.children)) {
      nodes.push(<span key={key}>{renderInline(record.children, key, blankProps)}</span>);
      return;
    }
    if (typeof record.text === "string") {
      const marked = renderTextMarks(record, key);
      if (marked !== null) nodes.push(marked);
    }
  });
  return nodes;
}

function renderBlock(
  node: Record<string, unknown>,
  key: string,
  blankProps: BlankRenderProps | null
): ReactNode {
  const children = Array.isArray(node.children) ? node.children : [];
  switch (node.type) {
    case "header": {
      const level = typeof node.level === "number" ? Math.min(6, Math.max(1, node.level)) : 2;
      const sizes = [22, 19, 17, 15.5, 14.5, 13.5];
      return (
        <div
          key={key}
          style={{
            fontSize: sizes[level - 1],
            fontWeight: 800,
            margin: "10px 0 6px",
            lineHeight: 1.5,
          }}
        >
          {renderInline(children, key, blankProps)}
        </div>
      );
    }
    case "blockquote":
      return (
        <div
          key={key}
          style={{
            borderLeft: "3px solid var(--brand)",
            padding: "2px 0 2px 12px",
            margin: "8px 0",
            color: "var(--meta-ink)",
          }}
        >
          {renderInline(children, key, blankProps)}
        </div>
      );
    case "code-block":
      return (
        <pre
          key={key}
          style={{
            background: "var(--bg-input)",
            borderRadius: 12,
            padding: "12px 14px",
            margin: "8px 0",
            fontFamily: "var(--mono-font)",
            fontSize: 12.5,
            lineHeight: 1.7,
            overflowX: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {collectText(node)}
        </pre>
      );
    case "bulleted-list":
      return (
        <ul key={key} style={{ paddingLeft: 20, margin: "6px 0" }}>
          {(Array.isArray(children) ? children : []).map((item, i) => (
            <li key={`${key}-${i}`} style={{ margin: "3px 0" }}>
              {renderBlock((item ?? {}) as Record<string, unknown>, `${key}-${i}`, blankProps)}
            </li>
          ))}
        </ul>
      );
    case "numbered-list":
      return (
        <ol key={key} style={{ paddingLeft: 22, margin: "6px 0" }}>
          {(Array.isArray(children) ? children : []).map((item, i) => (
            <li key={`${key}-${i}`} style={{ margin: "3px 0" }}>
              {renderBlock((item ?? {}) as Record<string, unknown>, `${key}-${i}`, blankProps)}
            </li>
          ))}
        </ol>
      );
    case "list-item":
    case "paragraph":
      return (
        <div key={key} style={{ margin: "4px 0", lineHeight: 1.8 }}>
          {renderInline(children, key, blankProps)}
        </div>
      );
    case "divide-line":
      return (
        <hr
          key={key}
          style={{ border: "none", borderTop: "1px solid var(--line-1)", margin: "12px 0" }}
        />
      );
    case "image": {
      const src = typeof node.url === "string" ? node.url : undefined;
      return src ? (
        <img
          key={key}
          src={src}
          alt=""
          style={{ maxWidth: "100%", borderRadius: 12, margin: "8px 0" }}
        />
      ) : (
        <div key={key} style={{ color: "var(--ink-3)", fontSize: 12 }}>
          ［图片］
        </div>
      );
    }
    default: {
      // 未识别块级节点：拼接其文本内容，保证前向兼容
      const text = collectText(node);
      return text ? (
        <div key={key} style={{ margin: "4px 0", lineHeight: 1.8 }}>
          {text}
        </div>
      ) : null;
    }
  }
}

/** 渲染 Slate Descendant[]；blankProps 为空时填空节点退化为普通行内文本（children 即答案明文） */
export function RichContent({
  content,
  blankProps = null,
}: {
  content: unknown[];
  blankProps?: BlankRenderProps | null;
}) {
  if (!Array.isArray(content) || content.length === 0) return null;
  return (
    <>
      {content.map((node, index) => {
        if (!node || typeof node !== "object") return null;
        return renderBlock(node as Record<string, unknown>, `b${index}`, blankProps);
      })}
    </>
  );
}
