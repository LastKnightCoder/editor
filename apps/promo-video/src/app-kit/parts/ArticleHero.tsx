/**
 * 文章标题 + 元信息行。结构摘自 features/articles/components/ArticleHero.tsx（无题图），
 * 元信息行尾部的「N 处关联」（ContextBadge，无关联时不渲染）、「AI 洞见」与创作模式开关（ComposeModeToggle）。
 */
import clsx from "clsx";
import { Loader2, MoreHorizontal, PanelsLeftRight, Sparkles, Waypoints } from "lucide-react";

const META_CHIP = "text-ink-2 inline-flex h-[22px] shrink-0 items-center gap-[5px] rounded-full px-2";

export function ArticleHero({
  title,
  titleCount,
  words,
  links = 0,
  composing = false,
  togglePressed = 0,
  insights = "off",
  frame = 0,
}: {
  title: string;
  /** 标题已打出的字数 */
  titleCount: number;
  words: number;
  /** 关联数，0 时不显示徽标 */
  links?: number;
  composing?: boolean;
  /** 开关被按下的高亮（光标悬停 / 点按），0→1 */
  togglePressed?: number;
  /** AI 洞见按钮的状态（useInsightsView：off / reading / on） */
  insights?: "off" | "reading" | "on";
  /** 当前帧，用于「正在读」的转圈 */
  frame?: number;
}) {
  const titleChars = [...title];
  return (
    <div className="mx-auto mt-10 w-[720px] max-w-[calc(100%-52px)]">
      <div className="text-ink-1 w-full text-[27px] leading-[1.35] font-semibold tracking-[-0.01em]">
        {titleCount > 0 ? titleChars.slice(0, titleCount).join("") : <span className="text-ink-3">无标题</span>}
      </div>
      <div className="text-tau-meta text-ink-3 mt-1.5 flex items-center gap-2.5 whitespace-nowrap tabular-nums">
        <span>刚刚编辑</span>
        <span className="bg-ink-3 size-[3px] rounded-full opacity-60" />
        <span>{words} 字</span>
        {links > 0 && (
          <span className={META_CHIP}>
            <Waypoints className="size-[13px]" strokeWidth={1.75} />
            {links} 处关联
          </span>
        )}
        <span className={clsx(META_CHIP, insights !== "off" && "bg-accent-soft text-accent-text")}>
          {insights === "reading" ? <Loader2 className="size-[13px]" strokeWidth={1.75} style={{ transform: `rotate(${frame * 8}deg)` }} /> : <Sparkles className="size-[13px]" strokeWidth={1.75} />}
          {insights === "off" ? "AI 洞见" : insights === "reading" ? "正在读" : "退出洞见"}
        </span>
        <span
          className={clsx(META_CHIP, composing && "bg-accent-soft text-accent-text")}
          style={!composing && togglePressed > 0 ? { background: `color-mix(in srgb, var(--tau-bg-hover) ${togglePressed * 100}%, transparent)`, color: "var(--tau-ink-1)" } : undefined}
        >
          <PanelsLeftRight className="size-[13px]" strokeWidth={1.75} />
          {composing ? "退出创作模式" : "创作模式"}
        </span>
        <span className="ml-auto flex items-center">
          <span className="text-ink-3 grid size-[26px] place-items-center">
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </span>
        </span>
      </div>
    </div>
  );
}
