/**
 * 迷你编辑器快照的渲染：样式同 LiveDoc（标题、引用、列表、代码块、公式），补上有序列表、分割线、
 * 行内删除线 / 高亮 / 斜体 / 行内公式（类名摘自 text-formatting、numbered-list、divide-line、math 扩展），
 * 以及斜杠菜单、任务列表、表格、标签页、详情块、提示块、高亮块、流程图、嵌入块（外框复用 app-kit/doc/Blocks）。
 * 还没成型的记号用淡墨显示；光标、每块末尾、容器里的每段打 data 标记供镜头跟随测量，可点的元素打 data-hit 供光标定位。
 */
import type { CSSProperties, ReactNode } from "react";
import katex from "katex";
import { ease, progress } from "../../brand/motion";
import { Check, Plus, Workflow } from "lucide-react";
import { BULLET_ITEM, CodeBlock, formStyle, HEADING_SIZE, HighlightedSource, MathBlock, QuoteFrame } from "../../app-kit/doc/LiveDoc";
import { AudioBlock, CalloutFrame, CheckBox, DatabaseBlock, DetailFrame, HighlightFrame, MermaidBlock, TabsFrame, VideoBlock, WhiteboardBlock } from "../../app-kit/doc/Blocks";
import { SlashMenu } from "../../app-kit/doc/SlashMenu";
import { SLASH_MAX_HEIGHT, SLASH_ROW } from "../../app-kit/doc/slashItems";
import { panelLevels, type Block, type Container, type Doc, type Leaf, type Panel, type Paragraph } from "./model";

/** 高亮：同色相淡底 + 底线（text-formatting 的 inlineHighlight，黄色 #dc9b04，浅色下 16% / 65%） */
const HIGHLIGHT: CSSProperties = {
  backgroundColor: "color-mix(in srgb, #dc9b04 16%, transparent)",
  borderBottom: "2px solid color-mix(in srgb, #dc9b04 65%, transparent)",
};
/** 有序列表：序号用 CSS 计数器画在 ::before（accent 色），同 NumberedList 的 LIST_CLASS */
const NUMBERED_LIST =
  "m-0 mb-[1.25em] ps-[2.5em] [counter-reset:item] [&>li]:relative [&>li]:mb-[0.5em] [&>li]:list-none [&>li]:[counter-increment:item] [&>li]:before:absolute [&>li]:before:-left-[1.5em] [&>li]:before:top-[0.1em] [&>li]:before:h-[1.5em] [&>li]:before:w-[2em] [&>li]:before:leading-[1.5em] [&>li]:before:text-[var(--tau-accent)] [&>li]:before:content-[counter(item)'.']";

/** 光标：打字中常亮，停住时闪烁（隐藏只改透明度，保留排版供测量） */
function Caret({ frame, typingAt }: { frame: number; typingAt: number }) {
  const on = frame - typingAt < 24 || Math.floor(frame / 30) % 2 === 0;
  return <i data-caret className="bg-ink-1 ml-px inline-block h-[1.1em] w-[2px] translate-y-[0.18em]" style={{ opacity: on ? 1 : 0 }} />;
}

/** 刚成型的行内片段：accent 淡底闪一下 */
function flash(frame: number, formedAt: number | undefined): CSSProperties | undefined {
  if (formedAt === undefined) return undefined;
  const k = 1 - progress(frame, formedAt, 30, ease.out);
  return k > 0 ? { boxShadow: `0 0 0 3px color-mix(in srgb, var(--tau-accent) ${28 * k}%, transparent)`, borderRadius: 3 } : undefined;
}

/** 文本里还没配对的记号字符淡显：`_` 只在不紧跟字母数字时算记号（变量名里的下划线不淡） */
function PendingText({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let run = "";
  let dim = false;
  const chars = [...text];
  chars.forEach((char, i) => {
    const isMark = "*~=`$".includes(char) || (char === "_" && !/[\p{L}\p{N}]/u.test(chars[i - 1] ?? ""));
    if (isMark !== dim && run) {
      out.push(
        dim ? (
          <span key={i} className="text-ink-3">
            {run}
          </span>
        ) : (
          run
        )
      );
      run = "";
    }
    dim = isMark;
    run += char;
  });
  if (run)
    out.push(
      dim ? (
        <span key="end" className="text-ink-3">
          {run}
        </span>
      ) : (
        run
      )
    );
  return <>{out}</>;
}

function LeafView({ leaf, frame }: { leaf: Leaf; frame: number }) {
  if (leaf.kind === "math") {
    const html = katex.renderToString(leaf.tex, { throwOnError: false });
    return <span className="relative inline-flex items-center rounded-[4px] px-[0.125em]" style={flash(frame, leaf.formedAt)} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  if (!leaf.mark) return <PendingText text={leaf.text} />;
  const style = flash(frame, leaf.formedAt);
  switch (leaf.mark) {
    case "bold":
      return (
        <span className="font-bold" style={style}>
          {leaf.text}
        </span>
      );
    case "italic":
      return (
        <span className="italic" style={style}>
          {leaf.text}
        </span>
      );
    case "boldItalic":
      return (
        <span className="font-bold italic" style={style}>
          {leaf.text}
        </span>
      );
    case "strike":
      return (
        <span className="line-through" style={style}>
          {leaf.text}
        </span>
      );
    case "highlight":
      return <span style={{ ...HIGHLIGHT, ...style }}>{leaf.text}</span>;
    case "code":
      return (
        <code className="border-line-1 bg-page rounded-[4px] border border-solid px-[0.35em] py-[0.15em] font-mono text-[0.9em]" style={style}>
          {leaf.text}
        </code>
      );
  }
}

/** 段首还是记号（`##`、`>`、`1.`、```ts、`$$`、`---`）：整段淡墨等宽，等触发键 */
const PENDING_BLOCK = /^(#{1,6}|>|[-*+]|\d+\.|```\w*|\$\$|-{1,3})$/;

/** menu：斜杠菜单，跟光标放在同一个相对定位的包裹里（不受光标闪烁的透明度影响） */
function Inline({ leaves, frame, caret, typingAt, menu }: { leaves: Leaf[]; frame: number; caret: boolean; typingAt: number; menu?: ReactNode }) {
  const only = leaves.length === 1 && leaves[0].kind === "text" && !leaves[0].mark ? leaves[0].text : null;
  return (
    <>
      {only !== null && PENDING_BLOCK.test(only) ? <span className="text-ink-3 font-mono">{only}</span> : leaves.map((leaf, i) => <LeafView key={i} leaf={leaf} frame={frame} />)}
      {caret && (
        <span className="relative">
          <Caret frame={frame} typingAt={typingAt} />
          {menu}
        </span>
      )}
    </>
  );
}

/** 公式块编辑中：上面源码行（两侧 `$$` 定界符），下面实时预览（同 PreviewWithEditor 的 inPlace 形态） */
function MathEditing({ tex, frame, typingAt }: { tex: string; frame: number; typingAt: number }) {
  return (
    <div className="rounded-[0.625em]">
      <div className="flex items-start gap-[0.5em] py-[0.25em]">
        <span className="text-ink-3 font-mono text-[0.85em] leading-[1.85] select-none">$$</span>
        <span className="min-w-0 flex-1 font-mono text-[0.85em] leading-[1.85]">
          {tex}
          <Caret frame={frame} typingAt={typingAt} />
        </span>
        <span className="text-ink-3 font-mono text-[0.85em] leading-[1.85] select-none">$$</span>
      </div>
      {tex.trim() ? (
        <MathBlock tex={tex} />
      ) : (
        <div className="text-ink-3 flex h-[3.5em] items-center justify-center rounded-[0.5625em] text-[0.9em] shadow-[inset_0_0_0_1px_var(--tau-line-1)]">公式 · 点击开始编写</div>
      )}
    </div>
  );
}

type Group = { container?: Container; items: { block: Block; index: number }[] };

/** 相邻的同容器段落合成一组（一个引用框 / 一个列表） */
function groups(blocks: Block[]): Group[] {
  const out: Group[] = [];
  blocks.forEach((block, index) => {
    const container = block.kind === "paragraph" ? block.container : undefined;
    const last = out[out.length - 1];
    if (container && last?.container === container) last.items.push({ block, index });
    else out.push({ container, items: [{ block, index }] });
  });
  return out;
}

/** 斜杠菜单：贴在光标右下（BlockPanel 定位在光标 x + 10、行底），打开时 8 帧淡入上浮 */
function SlashPanel({ panel, frame }: { panel: Panel; frame: number }) {
  const { top } = panelLevels(panel);
  if (!top.length) return null;
  const main = panel.path[0];
  const scroll = Math.max(0, (main - Math.floor(SLASH_MAX_HEIGHT / SLASH_ROW) + 1) * SLASH_ROW);
  const sub = panel.path.length > 1 ? { parent: main, active: panel.path[1] } : undefined;
  return (
    <span className="font-tau absolute top-full left-[10px] z-20 text-[14px] leading-[1.65]">
      <SlashMenu items={top} active={main} scroll={scroll} open={progress(frame, panel.at, 8, ease.out)} sub={sub} />
    </span>
  );
}

/** 流程图源码改完到预览刷新的延迟（PreviewWithEditor 非即时模式防抖 500ms） */
const MERMAID_COMMIT = 30;

/** 流程图编辑中：标题栏（Mermaid · 完成）+ 源码 + 预览 / 空态（PreviewWithEditor 非 inPlace 形态） */
function MermaidView({ block, index, frame, typingAt, caret }: { block: Extract<Block, { kind: "mermaid" }>; index: number; frame: number; typingAt: number; caret: boolean }) {
  // 源码停下 MERMAID_COMMIT 帧后才提交，预览才从空态换成图
  const committed = !block.editing || frame - typingAt >= MERMAID_COMMIT;
  const hasChart = committed && block.source.trim().length > 0;
  return (
    <div className="relative mt-2.5">
      <div className={block.editing ? "overflow-hidden rounded-[0.625em] border border-solid border-[var(--tau-line-1)]" : "rounded-[0.625em]"}>
        {block.editing && (
          <>
            <div className="flex h-[2.25em] items-center gap-[0.25em] bg-[var(--tau-bg-surface-hover)] pr-[0.375em] pl-[1em]">
              <span className="text-ink-3 mr-auto inline-flex items-center gap-[0.4em] text-[0.8em] whitespace-nowrap">
                <Workflow size="1.05em" strokeWidth={1.9} />
                Mermaid
              </span>
              <span className="text-accent-text inline-flex h-[1.75em] items-center gap-[0.3em] rounded-[0.375em] px-[0.6em] text-[0.8em] font-medium">
                <Check size="1.1em" strokeWidth={2} />
                完成
              </span>
            </div>
            <div className="bg-[var(--tau-bg-surface-hover)]" data-anchor-source={index}>
              <HighlightedSource code={block.source || " "} lang="mermaid" dark={false} padding="0.25em 1em 0.875em 1em" lineHeight={1.7} caret={caret} />
            </div>
            {hasChart && <div className="h-px bg-[var(--tau-line-1)]" />}
          </>
        )}
        {hasChart ? (
          <div className="box-border flex min-h-[3em] flex-col justify-center">
            <MermaidBlock uniform />
          </div>
        ) : (
          <div className="text-ink-3 m-[0.5em] flex h-[3.5em] items-center justify-center gap-[0.5em] rounded-[0.5625em] bg-[repeating-linear-gradient(-45deg,transparent_0_7px,var(--tau-bg-hover)_7px_8px)] text-[0.9em] shadow-[inset_0_0_0_1px_var(--tau-line-1)]">
            <Plus size="1.05em" strokeWidth={1.9} />
            Mermaid · 点击开始编写
          </div>
        )}
      </div>
      {/* 「完成」按钮的位置标记：点完按钮消失，标记留着，光标点按的涟漪不跳 */}
      <span data-hit={`mermaid-done:${index}`} className="pointer-events-none absolute top-[0.2em] right-[1.6em] size-[1.75em]" />
    </div>
  );
}

export function TutorialDoc({ doc, frame, typingAt, dark = false }: { doc: Doc; frame: number; typingAt: number; dark?: boolean }) {
  const caretIndex = doc.blocks.length - 1;
  const inBody = doc.focus.kind === "body";
  const animated = (formedAt: number | undefined) => (formedAt === undefined ? undefined : formStyle(0, frame, formedAt).style);
  const menu = doc.panel && <SlashPanel panel={doc.panel} frame={frame} />;
  const inline = (leaves: Leaf[], caret: boolean) => <Inline leaves={leaves} frame={frame} caret={caret} typingAt={typingAt} menu={caret ? menu : undefined} />;

  /** 容器里的段落（提示块、标签页）：每段末尾打 data-anchor，镜头按段跟随 */
  const children = (paragraphs: Paragraph[], index: number, prefix: string, caretHere: boolean) =>
    paragraphs.map((p, i) => (
      <p key={i} className="relative mb-[1.25em] min-h-[1.65em] last:mb-0">
        {inline(p.leaves, caretHere && i === paragraphs.length - 1)}
        <span data-anchor={`${index}:${prefix}${i}`} />
      </p>
    ));

  const renderBlock = (block: Block, index: number): ReactNode => {
    const caret = index === caretIndex && inBody;
    const end = <span data-block-end={index} />;
    switch (block.kind) {
      case "heading":
        return (
          <div key={index} className="relative mt-[1.3em] first:mt-0" style={animated(block.formedAt)}>
            <h2 className={`relative mb-[0.6em] w-fit leading-[1.5] font-bold ${HEADING_SIZE[block.level as 1 | 2 | 3]}`}>
              {inline(block.leaves, caret)}
              {end}
            </h2>
          </div>
        );
      case "paragraph":
        return (
          <p key={index} className="relative mb-[1.25em] min-h-[1.65em]">
            {inline(block.leaves, caret)}
            {end}
          </p>
        );
      case "divider":
        return (
          <div key={index} className="mx-auto my-[1.5em] h-[0.125em] w-[90%] bg-[var(--tau-bg-hover)]" style={animated(block.formedAt)}>
            {end}
          </div>
        );
      case "code":
        return (
          <div key={index} className="relative mb-[1.25em]" style={animated(block.formedAt)}>
            <CodeBlock code={block.code || " "} lang={block.lang} dark={dark} caret={caret && block.editing} />
            {end}
          </div>
        );
      case "math":
        return (
          <div key={index} className="relative mb-[1.25em]" style={animated(block.formedAt)}>
            {block.editing ? <MathEditing tex={block.tex} frame={frame} typingAt={typingAt} /> : <MathBlock tex={block.tex} />}
            {end}
          </div>
        );
      case "box": {
        const caretHere = index === caretIndex && inBody;
        const open = block.toggledAt === undefined ? (block.open ? 1 : 0) : block.open ? progress(frame, block.toggledAt, 14, ease.out) : 1 - progress(frame, block.toggledAt, 14, ease.out);
        const body = children(block.children, index, "c", caretHere);
        let inner: ReactNode;
        if (block.variant === "callout") inner = <CalloutFrame type={block.callout ?? "tip"}>{body}</CalloutFrame>;
        else if (block.variant === "highlight") inner = <HighlightFrame color="red">{body}</HighlightFrame>;
        else {
          const titleFocused = index === caretIndex && doc.focus.kind === "title";
          // 点进标题：默认标题「DETAIL」被选中，敲字就替换
          const title = block.title ? (
            <>
              {block.title}
              {titleFocused && <Caret frame={frame} typingAt={typingAt} />}
            </>
          ) : titleFocused ? (
            <span className="rounded-[2px] bg-[color-mix(in_srgb,var(--tau-accent)_24%,transparent)]">DETAIL</span>
          ) : (
            "DETAIL"
          );
          inner = (
            <DetailFrame title={title} open={open} hit={String(index)}>
              {body}
            </DetailFrame>
          );
        }
        return (
          <div key={index} className="relative mb-[1.25em]" style={animated(block.formedAt)}>
            {block.variant === "detail" && <span data-anchor={`${index}:title`} className="absolute top-[1.2em] left-0" />}
            {inner}
            {end}
          </div>
        );
      }
      case "tabs": {
        const caretHere = index === caretIndex && inBody;
        return (
          <div key={index} className="relative mb-[1.25em]" style={animated(block.formedAt)}>
            <TabsFrame titles={block.titles} active={block.active} hit={String(index)}>
              {children(block.panes[block.active], index, `p${block.active}:`, caretHere)}
            </TabsFrame>
            {end}
          </div>
        );
      }
      case "table": {
        const focus = index === caretIndex && doc.focus.kind === "cell" ? doc.focus : undefined;
        return (
          <div key={index} className="relative mb-[1.25em]" style={animated(block.formedAt)}>
            <div className="overflow-hidden rounded-[10px] border border-solid border-[var(--tau-line-1)]">
              <table className="w-full border-separate border-spacing-0">
                <tbody>
                  {block.cells.map((row, r) => (
                    <tr key={r} data-anchor={`${index}:r${r}`}>
                      {row.map((cell, c) => (
                        <td
                          key={c}
                          className={[
                            "min-w-[4.5em] border-solid border-[var(--tau-line-1)] px-3 py-[7px] text-left align-top",
                            c < row.length - 1 ? "border-r" : "",
                            r < block.cells.length - 1 ? "border-b" : "",
                            r === 0 ? "bg-hover font-semibold" : "",
                          ].join(" ")}
                        >
                          {cell || "​"}
                          {focus?.row === r && focus.col === c && <Caret frame={frame} typingAt={typingAt} />}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {end}
          </div>
        );
      }
      case "mermaid":
        return (
          <div key={index} className="relative mb-[1.25em]" data-anchor={block.editing ? undefined : `${index}:0`} style={animated(block.formedAt)}>
            <MermaidView block={block} index={index} frame={frame} typingAt={typingAt} caret={caret && block.editing} />
            {end}
          </div>
        );
      case "embed": {
        const Embed = { video: VideoBlock, audio: AudioBlock, board: WhiteboardBlock, database: DatabaseBlock }[block.embed];
        const appear = progress(frame, block.formedAt, 18, ease.out);
        return (
          <div key={index} data-anchor={`${index}:0`} className="relative mb-[1.25em]" style={{ opacity: appear, transform: `translateY(${(1 - appear) * 16}px)` }}>
            <Embed />
            {end}
          </div>
        );
      }
    }
  };

  return (
    <div data-doc-root className="relative text-[16px] leading-[1.65]">
      {groups(doc.blocks).map(group => {
        const first = group.items[0];
        const formedAt = first.block.kind === "paragraph" ? first.block.formedAt : undefined;
        const { container } = group;
        if (!container) return group.items.map(({ block, index }) => renderBlock(block, index));
        const lines = group.items.map(({ block, index }) =>
          block.kind === "paragraph" ? (
            <Line key={index} container={container} index={index} checked={block.checked} pop={block.toggledAt === undefined ? 1 : progress(frame, block.toggledAt, 12, ease.out)}>
              {inline(block.leaves, index === caretIndex && inBody)}
            </Line>
          ) : null
        );
        const key = `g${first.index}`;
        if (container === "quote")
          return (
            <div key={key} className="relative mb-[1.25em]" style={animated(formedAt)}>
              <QuoteFrame>{lines}</QuoteFrame>
            </div>
          );
        if (container === "bullet")
          return (
            <ul key={key} className="m-0 mb-[1.25em] ps-[2.5em]" style={animated(formedAt)}>
              {lines}
            </ul>
          );
        if (container === "check")
          return (
            <ul key={key} className="m-0 mb-[1.25em] ps-[0.75em]" style={animated(formedAt)}>
              {lines}
            </ul>
          );
        return (
          <ol key={key} className={NUMBERED_LIST} style={animated(formedAt)}>
            {lines}
          </ol>
        );
      })}
    </div>
  );
}

function Line({ container, index, checked, pop, children }: { container: Container; index: number; checked?: boolean; pop: number; children: ReactNode }) {
  const end = <span data-block-end={index} />;
  if (container === "quote")
    return (
      <p className="relative min-h-[1.65em]">
        {children}
        {end}
      </p>
    );
  if (container === "check")
    return (
      <li className="relative mb-[0.9em] flex items-start gap-[0.5em] leading-[1.8]">
        <CheckBox done={!!checked} pop={pop} hit={`check:${index}`} />
        <div className="min-h-[1.8em] flex-1">
          {children}
          {end}
        </div>
      </li>
    );
  return (
    <li className={container === "bullet" ? BULLET_ITEM : "min-h-[1.65em]"}>
      {children}
      {end}
    </li>
  );
}
