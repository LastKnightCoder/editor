/**
 * 就地成型的文档正文。元素类名摘自 editor-extensions（header / blockquote / list / text-formatting / math / code-block），
 * 公式用 KaTeX、代码用 Shiki（github-light / github-dark，同 code-block 的 shikiHighlighter）。
 */
import type { ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { ease, progress } from "../../brand/motion";
import { useShikiHtml } from "../../kit/Shiki";
import { MARK, PACE, type InlinePart, type Timed } from "./script";

const Caret = () => <i className="bg-ink-1 ml-px inline-block h-[1.1em] w-[2px] translate-y-[0.18em]" />;

/** 成型瞬间的「弹出」：轻微放大回落 + accent 淡底闪一下 */
function formStyle(t: number, frame: number, formAt: number) {
  const pop = progress(frame, formAt, 16, ease.out);
  const flash = Math.max(0, 1 - Math.abs(frame - formAt - 6) / 18);
  return {
    pop,
    style: {
      transform: `scale(${0.97 + 0.03 * pop})`,
      transformOrigin: "left center",
      opacity: 0.3 + 0.7 * pop,
      // 成型瞬间左缘一道 accent 竖光，提示「这里刚变了」
      boxShadow: flash > 0 ? `-14px 0 0 -11px color-mix(in srgb, var(--tau-accent) ${70 * flash}%, transparent)` : undefined,
    },
    t,
  };
}

function typedCount(frame: number, at: number, total: number, perChar = PACE.char) {
  return Math.max(0, Math.min(total, Math.floor((frame - at) / perChar)));
}

function InlineText({ parts, count, caret }: { parts: InlinePart[]; count: number; caret: boolean }) {
  // count 以「正文字符 + 记号字符」计：加粗前后各 2 个 *，行内代码前后各 1 个 `
  let left = count;
  const out: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (left <= 0) return;
    const markLen = part.bold ? 2 : part.code ? 1 : 0;
    const chars = [...part.text];
    const total = chars.length + markLen * 2;
    const shown = Math.min(left, total);
    left -= shown;
    const closed = shown >= total;
    if (!markLen) {
      out.push(<span key={i}>{chars.slice(0, shown).join("")}</span>);
      return;
    }
    const mark = part.bold ? "**" : "`";
    if (closed) {
      out.push(
        part.bold ? (
          <span key={i} className="font-bold">
            {part.text}
          </span>
        ) : (
          <span key={i} className="border-line-1 bg-page rounded-[4px] border px-[0.35em] py-[0.15em] font-mono text-[0.9em]">
            {part.text}
          </span>
        )
      );
    } else {
      const inner = Math.max(0, shown - markLen);
      out.push(
        <span key={i}>
          <span className="text-ink-3">{mark.slice(0, Math.min(shown, markLen))}</span>
          {chars.slice(0, inner).join("")}
        </span>
      );
    }
  });
  return (
    <>
      {out}
      {caret && <Caret />}
    </>
  );
}

function MathBlock({ tex }: { tex: string }) {
  const html = katex.renderToString(tex, { displayMode: true, throwOnError: false });
  return <div className="text-[1.15em] [&_.katex-display]:py-[2px] [&_.katex-display>.katex]:mx-auto" dangerouslySetInnerHTML={{ __html: html }} />;
}

const LANG_LABEL: Record<string, string> = { ts: "TypeScript", tsx: "TSX", js: "JavaScript", py: "Python" };

/** 代码块：结构摘自 code-block/components/CodeBlock + CodeBlockHeader，高亮同 shikiHighlighter（github-light / github-dark） */
export function CodeBlock({ code, lang, dark, lines }: { code: string; lang: string; dark: boolean; lines?: number }) {
  const html = useShikiHtml(code, lang, dark ? "github-dark" : "github-light");
  const total = code.split("\n").length;
  const shown = lines ?? total;
  return (
    <div className="overflow-hidden rounded-[0.625em] bg-[var(--tau-bg-surface-hover)] shadow-[inset_0_0_0_1px_var(--tau-line-1)]">
      <div className="text-ink-2 flex h-[2.25em] items-center gap-[0.25em] border-b border-solid border-[var(--tau-line-1)] px-[0.375em]">
        <span className="text-ink-2 inline-flex h-[1.75em] items-center rounded-[0.375em] px-[0.5em] text-[0.75em] font-medium">{LANG_LABEL[lang] ?? lang}</span>
      </div>
      <div
        className="text-[0.8em] leading-[1.8] whitespace-pre [&_pre]:m-0 [&_pre]:!bg-transparent"
        style={{ fontFamily: "var(--tau-font-mono)", padding: "0.9em 1em 0.9em 1.25em", clipPath: shown < total ? `inset(0 0 ${((total - shown) / total) * 100}% 0)` : undefined }}
        dangerouslySetInnerHTML={{ __html: html ?? "" }}
      />
    </div>
  );
}

export function LiveDoc({ timed, frame, dark = false }: { timed: Timed[]; frame: number; dark?: boolean }) {
  const active = timed.findLast(item => frame >= item.start);
  return (
    <div className="text-[16px] leading-[1.65]">
      {timed.map((item, index) => {
        if (frame < item.start) return null;
        const { block } = item;
        const mark = MARK[block.kind](block);
        const isActive = item === active && frame < item.end + PACE.gap;
        const caret = isActive && Math.floor(frame / 30) % 2 === 0;
        const marking = mark && frame < item.formAt;
        if (marking) {
          const n = typedCount(frame, item.start, [...mark].length, PACE.mark);
          return (
            <p key={index} className="relative mb-[1.25em]">
              <span className="text-ink-3 font-mono">{[...mark].slice(0, n).join("")}</span>
              <Caret />
            </p>
          );
        }
        const { style } = formStyle(0, frame, item.formAt);
        const animated = mark ? style : undefined;
        switch (block.kind) {
          case "heading": {
            const count = typedCount(frame, item.bodyAt, [...block.text].length);
            const size = { 1: "text-[2em] leading-[1.3]", 2: "text-[1.75em]", 3: "text-[1.5em]" }[block.level];
            return (
              <div key={index} className="relative mt-[1.3em] first:mt-0" style={animated}>
                <h2 className={`relative mb-[0.6em] w-fit leading-[1.5] font-bold ${size}`}>
                  {[...block.text].slice(0, count).join("")}
                  {isActive && <Caret />}
                </h2>
              </div>
            );
          }
          case "paragraph": {
            const total = block.parts.reduce((n, p) => n + [...p.text].length + (p.bold ? 4 : p.code ? 2 : 0), 0);
            const count = typedCount(frame, item.bodyAt, total);
            return (
              <p key={index} className="relative mb-[1.25em]">
                <InlineText parts={block.parts} count={count} caret={isActive && (caret || count < total)} />
              </p>
            );
          }
          case "quote": {
            const count = typedCount(frame, item.bodyAt, [...block.text].length);
            return (
              <div key={index} className="relative mb-[1.25em]" style={animated}>
                <div className="relative pl-[2em] text-[var(--tau-ink-1)]">
                  <span
                    className="text-accent pointer-events-none absolute -top-[0.12em] -left-[0.02em] text-[2.9em] leading-none opacity-55 select-none"
                    style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                  >
                    “
                  </span>
                  <span className="absolute top-[1.6em] bottom-[0.35em] left-[0.5em] w-[2px] rounded-full bg-[color-mix(in_srgb,var(--tau-ink-1)_20%,transparent)]" />
                  <p className="relative">
                    {[...block.text].slice(0, count).join("")}
                    {isActive && <Caret />}
                  </p>
                  {block.source && count >= [...block.text].length && (
                    <p className="text-ink-3 mt-1 text-[0.85em]">
                      —— <span className="text-accent-text decoration-accent/40 underline decoration-dotted decoration-[1.5px] underline-offset-[3px]">{block.source}</span>
                    </p>
                  )}
                </div>
              </div>
            );
          }
          case "bullets": {
            let at = item.bodyAt;
            return (
              <ul key={index} className="m-0 mb-[1.25em] ps-[2.5em]" style={animated}>
                {block.items.map((text, i) => {
                  const itemAt = at;
                  at += [...text].length * PACE.char + 6;
                  if (frame < itemAt && i > 0) return null;
                  const count = typedCount(frame, itemAt, [...text].length);
                  const last = frame < at || i === block.items.length - 1;
                  return (
                    <li
                      key={i}
                      className="relative mb-[0.5em] list-none pl-[0.5em] before:absolute before:top-[0.7em] before:-left-[1em] before:h-[0.35em] before:w-[0.35em] before:rounded-full before:bg-[var(--tau-accent)]"
                    >
                      {[...text].slice(0, count).join("")}
                      {isActive && last && frame < at + 6 && <Caret />}
                    </li>
                  );
                })}
              </ul>
            );
          }
          case "math":
            return (
              <div key={index} className="relative mb-[1.25em]" style={animated}>
                <MathBlock tex={block.tex} />
              </div>
            );
          case "code": {
            const lines = block.code.split("\n").length;
            const shown = Math.min(lines, Math.max(1, Math.ceil(progress(frame, item.bodyAt, item.end - item.bodyAt, ease.inOut) * lines)));
            return (
              <div key={index} className="relative mb-[1.25em]" style={animated}>
                <CodeBlock code={block.code} lang={block.lang} dark={dark} lines={shown} />
              </div>
            );
          }
        }
      })}
    </div>
  );
}
