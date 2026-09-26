/**
 * 今日页卡片标题前的色块图标：图标与侧栏入口同一套，色调按卡片区分（纸面 + 描边卡本身无彩，靠它给页面上色与辨识）。
 * 类名写全（不拼接），保证 Tailwind 能扫描到。
 */

import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

const TONES = {
  accent: "bg-accent-soft text-accent-text",
  green: "bg-tag-1-soft text-tag-1",
  blue: "bg-tag-2-soft text-tag-2",
  purple: "bg-tag-3-soft text-tag-3",
  ochre: "bg-tag-4-soft text-tag-4",
  rose: "bg-tag-5-soft text-tag-5",
} as const;

export type TitleTone = keyof typeof TONES;

export function TitleIcon({ icon: Icon, tone }: { icon: LucideIcon; tone: TitleTone }) {
  return (
    <span
      className={clsx("grid size-5 shrink-0 place-items-center rounded-[6px]", TONES[tone])}
      aria-hidden
    >
      <Icon size={12} strokeWidth={1.9} />
    </span>
  );
}
