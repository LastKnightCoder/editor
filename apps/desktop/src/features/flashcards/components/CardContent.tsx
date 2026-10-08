/**
 * 卡面内容渲染：
 *  - RichContent：只读编辑器渲染 Slate 内容（题干 / 补充说明 / 自定义参考资料），挂闪卡填空扩展；
 *  - ClozePrompt：填空题题面——文本 + 行内输入框；判定后在原位显示对错与正确答案。
 *    只保留文本与基础行内样式（粗 / 斜 / 行内代码），与 legacy ClozeReviewRenderer 口径一致。
 */

import { ErrorBoundary } from "@tau/ui";
import { getFlashcardKit } from "@/services/editorKit";
import type { FlashcardBlankElement } from "@/editor-extensions/flashcard-blank/types";
import { Editor } from "@tau/editor";
import { cn } from "@tau/ui";
import { Fragment, useMemo, type ReactNode } from "react";
import type { Descendant } from "slate";
import { blankCorrect } from "../model";

export function RichContent({ content, className }: { content: Descendant[]; className?: string }) {
  // initValue 仅在挂载时生效：内容变化（编辑后）重建只读实例
  const revision = useMemo(() => JSON.stringify(content), [content]);
  return (
    <ErrorBoundary>
      <Editor
        kit={getFlashcardKit()}
        key={revision}
        readonly
        initValue={content}
        className={cn("cursor-default", className)}
      />
    </ErrorBoundary>
  );
}

interface LeafNode {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

export function ClozePrompt({
  content,
  values,
  revealed,
  onChange,
  onSubmit,
}: {
  content: Descendant[];
  values: Record<string, string>;
  revealed: boolean;
  onChange(blankId: string, value: string): void;
  /** 在最后一个空按回车 = 提交；前面的空回车跳到下一个空 */
  onSubmit(): void;
}) {
  const focusNext = (from: HTMLInputElement) => {
    const inputs = [...(from.closest("[data-cloze]")?.querySelectorAll("input") ?? [])];
    const next = inputs[inputs.indexOf(from) + 1];
    if (next && !next.value) next.focus();
    else onSubmit();
  };

  const renderNode = (node: unknown, key: number): ReactNode => {
    const el = node as { type?: string; children?: unknown[] } & Partial<LeafNode>;
    if (el.type === "flashcard-blank") {
      const blank = el as unknown as FlashcardBlankElement;
      const value = values[blank.blankId] ?? "";
      if (!revealed) {
        return (
          <input
            key={key}
            value={value}
            onChange={e => onChange(blank.blankId, e.target.value)}
            onKeyDown={e => {
              // 保留输入与输入法按键，仅让 Esc 进入页面浮层仲裁。
              if (e.key !== "Escape") e.stopPropagation();
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                focusNext(e.currentTarget);
              }
            }}
            aria-label="填空"
            autoComplete="off"
            style={{ width: `${Math.max(4, blank.answer.length + 2)}em` }}
            className="bg-surface border-line-1 text-accent-text focus:border-accent mx-[3px] inline-block h-8 max-w-full rounded-[8px] border px-2.5 text-center align-[1px] text-[16px] font-medium outline-none focus:shadow-[var(--tau-focus-ring)]"
          />
        );
      }
      const ok = blankCorrect(blank, value);
      return (
        <Fragment key={key}>
          {(ok || value.trim()) && (
            <span
              className={cn(
                "mx-[3px] inline-block rounded-[8px] px-2.5 text-[16px] font-medium leading-8",
                ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger line-through"
              )}
            >
              {value.trim()}
            </span>
          )}
          {!ok && <span className="text-ok mx-[3px] font-semibold">{blank.answer}</span>}
        </Fragment>
      );
    }
    if (typeof el.text === "string") {
      let out: ReactNode = el.text;
      if (el.code)
        out = <code className="bg-hover rounded-[5px] px-1.5 font-mono text-[0.86em]">{out}</code>;
      if (el.bold) out = <b>{out}</b>;
      if (el.italic) out = <i>{out}</i>;
      return <Fragment key={key}>{out}</Fragment>;
    }
    const children = el.children?.map(renderNode);
    if (el.type === "paragraph") return <p key={key}>{children}</p>;
    return <Fragment key={key}>{children}</Fragment>;
  };

  return (
    <div data-cloze className="space-y-2">
      {content.map(renderNode)}
    </div>
  );
}
