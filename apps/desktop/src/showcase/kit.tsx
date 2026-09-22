/**
 * 样板间档案页布局原语 —— v6（2026-09-17 排版/配色重排）。
 *
 * 层级不变：page（环境）→ surface（画布卡 / API 卡）→ 展品；改的是「怎么用色」
 * 与「怎么排字」：
 *  - 用色：accent 从 1.5px 装饰点升级为**容器锚点**（LIVE / API 卡的标注点 +
 *    标签），全页因此有稳定的暖橙出现位；表面依旧中性，颜色仍只表意。
 *  - 排版：说明文字下限抬到 12.5px（原 11.5px mikro 中文读起来吃力）；小节题
 *    去掉 uppercase + 0.09em 字距（uppercase 对中文无效，只剩「工程 README」
 *    感），改 ink-1 semibold 常规字距，英文副标退为 mono ink-3；状态行去掉
 *    96px 强制高度，改由内容撑开——原版每行 150px+ 把页面拉得又长又空。
 *  - 字号阶梯：**25 / 20 / 14.5 / 12.5**（档案名 hero ／ 小节题 title-lg ／
 *    状态名 title+mono ／ 说明 meta），相邻档差 ≥2px。原先 20/14.5/13/12.5 后三级
 *    挤在 1.5px 内，标题层级塌成一片；跨级另靠留白拉开——小节之间 mt-12、
 *    字头 mb-9，行距只 28px（同级近、跨级远）。
 *  - 舞台：CanvasCard 增 stage 双模。card（默认）是白卡画布；page 无底色，
 *    是「展品本身即白卡」时唯一能自证的环境（Panel 档案）。
 *  - 版心：**全页唯一内容宽度** `PAGE_COL`，由壳层（ShowcaseApp）居中承载——展品区、
 *    状态矩阵、职责说明、正文注记、API 表共用同一条左右边界。历史演变：74ch≈629 太窄、
 *    860 偏宽，且"卡片满宽 + 文本列 740"的两种宽度让页面像被切成两截（2026-09-17 用户
 *    要求"同意[统一]设置版心，然后水平居中"）。740px 在 13px 下约 57 个中文字/行。
 */

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@tau/ui";

/**
 * 档案页版心 —— 全页唯一内容宽度，单一事实源：
 * 壳层用它居中，档案内的块不再各自写 max-w（各写各的正是宽度漂开的原因）。
 */
export const PAGE_COL = "max-w-[740px]";

/* ── L1 档案头 ── */

export function DocHead({
  title,
  en,
  duty,
  src,
}: {
  title: string;
  en: string;
  duty: ReactNode;
  src: string;
}) {
  return (
    <header className="mb-9">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-tau-hero text-ink-1 font-[650] tracking-[-0.012em]">{title}</h1>
        <span className="font-tau-mono text-tau-meta text-ink-3">{en}</span>
      </div>
      <p className="text-tau-body-lg text-ink-2 mt-2.5 leading-[1.75]">{duty}</p>
      <span className="border-line-1 bg-surface font-tau-mono text-tau-micro text-ink-2 mt-4 inline-block rounded-[7px] border px-2.5 py-1">
        {src}
      </span>
    </header>
  );
}

/* ── LIVE 画布卡 ──
   stage="card"：surface 卡（默认，展品为非白卡时的画布）
   stage="page"：无底色无阴影，展品直接坐 page 环境（展品是白卡时用它，否则白卡
   叠白卡只能靠阴影分辨） */

export function CanvasCard({
  cap,
  note,
  stage = "card",
  stageClassName,
  children,
}: {
  cap: string;
  /** 标注行右侧的浅色说明（可选，不抢 cap 的注意力） */
  note?: ReactNode;
  stage?: "card" | "page";
  /** 舞台布局类（flex/items/gap/min-h 等由档案明确给出，避免与默认类争优先级） */
  stageClassName: string;
  children: ReactNode;
}) {
  const isCard = stage === "card";
  return (
    <section className={cn(isCard && "bg-surface shadow-card rounded-tau-lg")}>
      <div className={cn("flex items-center gap-2", isCard && "px-6 pt-4")}>
        <span className="bg-accent size-1.5 shrink-0 rounded-full" />
        <span className="text-tau-tiny text-accent-text font-[650] tracking-[0.1em]">{cap}</span>
        {note && <span className="text-tau-micro text-ink-3 min-w-0 truncate">{note}</span>}
      </div>
      <div
        className={cn("text-ink-1 relative", isCard ? "px-6 pb-7 pt-5" : "pt-4", stageClassName)}
      >
        {children}
      </div>
    </section>
  );
}

/* ── L2 小节题：中文 semibold 主 + 英文 mono 副（不再 uppercase 硬撑）└─ */

export function BlockTitle({ children, en }: { children: ReactNode; en?: string }) {
  return (
    <h2 className="text-tau-title-lg text-ink-1 mb-3 mt-12 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 font-semibold">
      {children}
      {en && <span className="font-tau-mono text-tau-meta text-ink-3 font-normal">{en}</span>}
    </h2>
  );
}

/* ── 矩阵行 ──
   上下堆叠：状态名 mono 主 + 说明次墨在上，标本区在下。
   排布口径（2026-09-17 用户裁决，推翻此前左右两列）：左右两列的对齐参差（说明折行
   行数不一、标本高低不一）读起来杂乱——说明与示例改为纵向从属关系，一行一块。
   块间分隔只用留白（PREFERENCES「讨厌横线切割」，不给行加分隔线）；标本区不设
   min-h，节奏交给行距。 */

export function MatrixRow({
  name,
  desc,
  trayClassName,
  children,
}: {
  name: string;
  desc?: ReactNode;
  trayClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2.5 py-3.5">
      <div>
        <div className="font-tau-mono text-tau-title text-ink-1 font-[600]">{name}</div>
        {desc && (
          <div className="text-tau-meta text-ink-2 [&_code]:border-line-1 [&_code]:bg-surface [&_code]:text-ink-1 [&_code]:font-tau-mono mt-1.5 leading-[1.7] [&_code]:whitespace-nowrap [&_code]:rounded-[5px] [&_code]:border [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[11.5px]">
            {desc}
          </div>
        )}
      </div>
      <div className={cn("text-ink-1 flex flex-wrap items-start gap-4", trayClassName)}>
        {children}
      </div>
    </div>
  );
}

/* ── API 卡（Panel 视觉；宽度由壳层版心决定，自身不再限宽）└─ */

export function ApiCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-surface shadow-card rounded-tau-lg mt-9 overflow-hidden pb-1.5">
      <div className="flex items-center gap-2 px-6 pt-4">
        <span className="bg-accent size-1.5 shrink-0 rounded-full" />
        <span className="text-tau-title text-ink-1 font-semibold">{title}</span>
      </div>
      <div className="text-tau-meta text-ink-2 [&_th]:text-tau-tiny [&_th]:text-ink-3 [&_td]:border-line-2 [&_code]:border-line-1 [&_code]:bg-surface [&_code]:text-ink-1 [&_code]:font-tau-mono px-6 pt-3 [&_code]:rounded-[5px] [&_code]:border [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[11.5px] [&_table]:w-full [&_table]:border-collapse [&_td]:border-t [&_td]:py-2.5 [&_td]:pl-0 [&_td]:pr-6 [&_td]:text-left [&_td]:align-top [&_td]:leading-[1.7] [&_th]:whitespace-nowrap [&_th]:py-2.5 [&_th]:pl-0 [&_th]:pr-6 [&_th]:text-left [&_th]:font-semibold">
        {children}
      </div>
    </section>
  );
}

/* ── 正文注记（em = 重点，accent-text）── */

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="text-tau-body text-ink-2 [&_em]:text-accent-text mt-7 leading-[1.85] [&_em]:font-[550] [&_em]:not-italic">
      {children}
    </p>
  );
}

/* ── 工具栏：档案内的小型分段控件（位置选择等演示开关）── */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: ReactNode; title?: string }[];
  onChange: (value: T) => void;
}) {
  // 轨道用 group（分组底）、选中胶囊用 surface 浮起：sunken 是「进度轨道 / 凹陷画布」
  // 专档（D-009），落在分段控件上是一片比 page 深一档的重色块；group 同属暖纸系的分组底，
  // 既在 page 与 surface 上都显形，又不抢展品的注意力
  return (
    <div className="bg-group inline-flex items-center gap-0.5 rounded-[10px] p-0.5">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-pressed={value === option.value}
          className={cn(
            "ease-tau-out flex h-7 items-center gap-1.5 rounded-[8px] px-2.5",
            "transition-[background,color] duration-[160ms]",
            value === option.value
              ? "bg-surface text-ink-1 shadow-card font-[550]"
              : "text-ink-2 hover:text-ink-1"
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ── 演示触发按钮（工具控件，非 primitives 展品）── */

export function DemoButton({
  primary,
  className,
  ...props
}: ComponentProps<"button"> & { primary?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "text-tau-meta ease-tau-out inline-flex h-8 items-center gap-2 rounded-[10px] px-3.5",
        "transition-[background,color,border-color] duration-[160ms]",
        // hover 背景类必须分流：公共串的 hover:bg-hover（近透明墨）会替换掉
        // primary 的实心 accent 底，按钮 hover 时透成 surface 白底
        primary
          ? "bg-accent text-ink-inverse hover:bg-accent-hover font-[550]"
          : "border-line-1 text-ink-2 hover:bg-hover hover:text-ink-1 border",
        className
      )}
      {...props}
    />
  );
}
