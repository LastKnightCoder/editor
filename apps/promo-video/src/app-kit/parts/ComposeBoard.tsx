/**
 * 创作模式左栏白板重建。结构与类名摘自 features/compose/components（ComposeBoard / IntentCard / ComposeCardAccessory）、
 * shared/whiteboard/components/Document（DocumentCard / DocumentPaper）与 packages/whiteboard 的 frame 默认样式。
 * 白板内容用板坐标摆放，view 决定可见区域（view.x/y 对准栏中心）；各元素的出现与状态由外部传入的进度驱动。
 */
import type { CSSProperties, ReactNode } from "react";
import clsx from "clsx";
import { Check, Loader2, Pencil, Sparkles, X } from "lucide-react";
import { Button } from "@tau/ui";
import { COVER_GRADIENTS } from "../cover";
import { KIND_LABEL, PAPER_WIDTH, type ComposeDoc, type ComposeFrame } from "../../mock/compose";

export type BoardView = { x: number; y: number; zoom: number };

export type DocState = {
  /** 飞入落位 0→1 */
  appear: number;
  /** 写作时亮起 0→1（亮起时底部换成「连到此段」操作条） */
  glow?: number;
  /** 「连到此段」按钮被按下 0→1 */
  press?: number;
  /** 已引用签 0→1 */
  cited?: number;
};

export type GatherStatus = { kind: "running"; text: string } | { kind: "done"; count: number };

export type IntentState = { open: number; text: string; caret: boolean; press: number };

/** frame 默认样式（packages/whiteboard/src/types/frame.ts） */
const FRAME_STYLE = { background: "rgba(59, 130, 246, 0.1)", border: "#3b82f6", radius: 8 };
const FRAME_TITLE = { height: 40, gap: 10 };

const INTENT_KINDS = ["卡片", "文章", "项目文档", "日记"];

export function ComposeBoard({
  frame,
  view,
  frames,
  frameAppear,
  docs,
  placeholder = 0,
  intent,
  status,
  statusOpacity = 0,
  controls = 0,
}: {
  /** 当前帧，用于转圈与亮起脉动 */
  frame: number;
  view: BoardView;
  frames: ComposeFrame[];
  frameAppear: number[];
  docs: Record<string, DocState>;
  /** 还没有素材板时的点阵占位背景 */
  placeholder?: number;
  intent?: IntentState;
  status?: GatherStatus;
  statusOpacity?: number;
  /** 右上角「意图 / 再找一些」 */
  controls?: number;
}) {
  return (
    <div className="relative size-full overflow-hidden">
      {placeholder > 0 && <div className="bg-page absolute inset-0 bg-[radial-gradient(var(--tau-line-1)_1px,transparent_1.2px)] [background-size:20px_20px]" style={{ opacity: placeholder }} />}
      <div className="absolute top-1/2 left-1/2 origin-top-left" style={{ transform: `scale(${view.zoom}) translate(${-view.x}px, ${-view.y}px)` }}>
        {frames.map((group, i) => (
          <FrameBox key={group.name} group={group} appear={frameAppear[i] ?? 0} />
        ))}
        {frames.flatMap(group =>
          group.items.map(doc => {
            const state = docs[doc.id];
            if (!state || state.appear <= 0) return null;
            return <DocCard key={doc.id} doc={doc} state={state} frame={frame} />;
          })
        )}
      </div>

      {controls > 0 && (
        <div className="absolute top-3 right-3 z-[6] flex items-center gap-1.5" style={{ opacity: controls }}>
          <span className="bg-surface shadow-card text-ink-2 grid size-[30px] place-items-center rounded-full">
            <Pencil className="size-3.5" strokeWidth={1.75} />
          </span>
          <span className="bg-surface shadow-card text-tau-meta text-accent-text inline-flex h-[30px] items-center gap-1.5 rounded-full px-3">
            <Sparkles className="size-3.5" strokeWidth={1.75} />
            再找一些
          </span>
        </div>
      )}

      {status && statusOpacity > 0 && (
        <div
          className="bg-surface shadow-float text-tau-meta text-ink-2 absolute top-3 left-1/2 z-[6] flex items-center gap-2 rounded-full py-1.5 pr-2 pl-3 whitespace-nowrap"
          style={{ opacity: statusOpacity, transform: `translateX(-50%) translateY(${(1 - statusOpacity) * -8}px)` }}
        >
          {status.kind === "running" ? (
            <>
              <Loader2 className="text-accent size-3.5" strokeWidth={1.75} style={{ transform: `rotate(${frame * 8}deg)` }} />
              {status.text}
              <span className="text-ink-3 ml-1">
                <X className="size-3.5" strokeWidth={1.75} />
              </span>
            </>
          ) : (
            <>
              <span className="bg-ok size-2 rounded-full" />
              {status.count} 份资料已摆上白板 · 不要的直接移走
              <span className="text-accent-text">撤销全部</span>
            </>
          )}
        </div>
      )}

      {intent && intent.open > 0 && <IntentCard intent={intent} />}
    </div>
  );
}

function FrameBox({ group, appear }: { group: ComposeFrame; appear: number }) {
  if (appear <= 0) return null;
  return (
    <div
      className="absolute"
      style={{
        left: group.x,
        top: group.y,
        width: group.width,
        height: group.height,
        opacity: Math.min(1, appear * 1.4),
        transform: `scale(${0.96 + 0.04 * appear})`,
        transformOrigin: "top left",
      }}
    >
      <div className="absolute inset-0" style={{ background: FRAME_STYLE.background, border: `2px solid ${FRAME_STYLE.border}`, borderRadius: FRAME_STYLE.radius }} />
      <div className="absolute left-0 flex items-center" style={{ top: -(FRAME_TITLE.height + FRAME_TITLE.gap), height: FRAME_TITLE.height }}>
        <span
          className="flex h-full w-fit min-w-5 items-center rounded-lg px-2 py-1 text-center text-sm font-medium select-none"
          style={{ background: FRAME_STYLE.border, color: "#ffffff", textShadow: "0 1px 1px rgba(0,0,0,0.25)" }}
        >
          {group.name}
        </span>
      </div>
    </div>
  );
}

/** 文档卡：按版宽排好的纸面整体缩小，底部渐隐，叠加召集理由 / 亮起操作条 / 已引用签 */
export function DocCard({ doc, state, frame }: { doc: ComposeDoc; state: DocState; frame: number }) {
  const { appear, glow = 0, press = 0, cited = 0 } = state;
  // 亮起脉动：同 Tailwind animate-pulse（2s，透明度 1 → 0.5 → 1）
  const pulse = 0.75 + 0.25 * Math.cos(((frame % 120) / 120) * Math.PI * 2);
  const style: CSSProperties = {
    left: doc.x,
    top: doc.y,
    width: doc.width,
    height: doc.height,
    opacity: Math.min(1, appear * 1.5),
    transform: `translateY(${(1 - appear) * 36}px) scale(${0.92 + 0.08 * appear})`,
  };
  return (
    <div className="absolute" style={style}>
      <div className="bg-surface shadow-paper relative size-full overflow-hidden" style={{ borderRadius: 16 }}>
        <div className="pointer-events-none absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${doc.width / PAPER_WIDTH[doc.kind]})` }}>
          <DocPaper doc={doc} />
        </div>
        <div className="to-surface pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-b from-transparent" />
        {glow > 0 && <div className="ring-accent pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-inset" style={{ opacity: glow * pulse }} />}
        {glow > 0 ? (
          <div className="bg-surface border-line-2 absolute inset-x-0 bottom-0 flex items-center gap-2 border-t px-3 py-1.5" style={{ opacity: glow }}>
            <span className="text-ink-2 min-w-0 flex-1 truncate text-[11.5px]">与正在写的这段相关</span>
            <span className="bg-accent text-surface shrink-0 rounded-[6px] px-2 text-[11.5px] leading-[22px]" style={{ filter: press > 0 ? `brightness(${1 - 0.12 * press})` : undefined }}>
              连到此段
            </span>
          </div>
        ) : (
          doc.why && <div className="text-accent-text bg-surface border-line-2 pointer-events-none absolute inset-x-0 bottom-0 truncate border-t px-3 py-1.5 text-[11.5px]">{doc.why}</div>
        )}
        {cited > 0 && (
          <span
            className="bg-ok-soft text-ok absolute top-2 right-2 inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[11px] leading-5"
            style={{ opacity: cited, transform: `scale(${0.8 + 0.2 * cited})` }}
          >
            <Check className="size-3" strokeWidth={2} />
            已引用
          </span>
        )}
      </div>
    </div>
  );
}

/** 纸面：卡片 / 日记只有标签（日记另有日期时刻），元信息在正文后；文章有封面与标题，元信息在标题下 */
function DocPaper({ doc }: { doc: ComposeDoc }) {
  const compact = doc.kind !== "article";
  const meta = (
    <div className={clsx("text-ink-3 text-[13px]", compact ? "mt-4" : "-mt-3 mb-6")}>
      {KIND_LABEL[doc.kind]} · 更新于 {doc.updated}
    </div>
  );
  return (
    <div className={clsx("text-ink-1 text-[16px] leading-[1.65]", compact ? "px-9 pt-[30px] pb-12" : "px-[52px] pt-10 pb-[72px]")} style={{ width: PAPER_WIDTH[doc.kind] }}>
      {doc.moment && (
        <div className="text-ink-3 mb-3 flex items-center gap-2 text-[13px] tabular-nums">
          <span>{doc.moment.day}</span>
          <span>{doc.moment.time}</span>
        </div>
      )}
      {compact ? (
        <Tags tags={doc.tags} />
      ) : (
        <header className="mb-6">
          <div className="relative -mx-[52px] -mt-10 mb-[30px] h-[190px] overflow-hidden" style={{ backgroundImage: COVER_GRADIENTS[doc.cover ?? 0] }} />
          <h1 className="text-ink-1 text-[30px] leading-[1.32] font-semibold tracking-[-0.01em]">{doc.title}</h1>
        </header>
      )}
      {!compact && meta}
      <Body doc={doc} />
      {compact && meta}
    </div>
  );
}

function Tags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="mb-3.5 flex flex-wrap gap-1.5">
      {tags.map(tag => (
        <span key={tag} className="bg-hover text-ink-2 rounded-[6px] px-2 text-[12px] leading-5">
          #{tag}
        </span>
      ))}
    </div>
  );
}

function Body({ doc }: { doc: ComposeDoc }) {
  const blocks: ReactNode[] = [];
  if (doc.heading)
    blocks.push(
      <h2 key="h" className="mb-[0.6em] text-[1.75em] leading-[1.5] font-bold">
        {doc.heading}
      </h2>
    );
  doc.body.forEach((text, i) =>
    blocks.push(
      <p key={i} className="mb-[1.25em]">
        {text}
      </p>
    )
  );
  return <div className="py-0.5">{blocks}</div>;
}

/** 意图卡：只遮住白板栏 */
function IntentCard({ intent }: { intent: IntentState }) {
  const open = Math.min(1, intent.open);
  return (
    <div className="bg-overlay absolute inset-0 z-20 grid place-items-center p-6" style={{ opacity: open }}>
      <div className="bg-surface shadow-float rounded-tau-lg w-full max-w-[520px] px-[22px] pt-5 pb-4" style={{ transform: `translateY(${(1 - open) * 14}px) scale(${0.97 + 0.03 * open})` }}>
        <h3 className="text-ink-1 text-[16px] font-semibold">这篇想写什么？</h3>
        <p className="text-ink-3 text-tau-meta mt-1 mb-3.5">说说主题、想表达的观点或想回答的问题。我会从你的笔记里挑出相关的，分好组放到左边白板上。</p>
        <div className="border-accent bg-surface rounded-tau-sm flex w-full items-start gap-2 border p-2 shadow-[var(--tau-focus-ring)]">
          <div className="text-ink-1 min-h-[86px] min-w-0 flex-1 text-[13px] leading-[1.65]">
            {intent.text}
            {intent.caret && <i className="bg-ink-1 ml-px inline-block h-[1.1em] w-[1.5px] translate-y-[0.2em]" />}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {INTENT_KINDS.map(label => (
            <span key={label} className="text-tau-meta bg-accent-soft text-accent-text inline-flex h-[26px] items-center rounded-full border border-transparent px-2.5">
              {label}
            </span>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Button variant="ghost" size="sm">
            跳过，空白白板
          </Button>
          <div className="flex-1" />
          <Button variant="primary" icon={Sparkles} style={intent.press > 0 ? { filter: `brightness(${1 - 0.1 * intent.press})` } : undefined}>
            开始找资料
          </Button>
        </div>
      </div>
    </div>
  );
}
