/**
 * className 合并 —— clsx 做条件拼接，tailwind-merge 去掉同属性冲突项。
 *
 * 组件基础类与调用方 className 撞同一属性时（size-[30px] vs size-[27px]、
 * items-start vs items-center），Tailwind 生成顺序决定胜负、clsx 的先后顺序无效，
 * 覆盖会被静默吞掉——凡允许 className 覆盖默认样式处（primitives、样板间 kit）都用本函数。
 *
 * 自定义尺度词（text-tau-*、rounded-tau-*、shadow-card…）tailwind-merge 默认不认识，
 * 会把 text-tau-meta 当颜色组而与 text-ink-2 互相残杀（后写赢、字号类被删）。下表把它们
 * 登记进正确的 classGroup；与 tokens.css 的一致性由 __tests__/cn.test.ts 守护，
 * 新增尺度词必须同步登记。
 */

import clsx, { type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** 尺度词表（值不含类名前缀：text-tau-meta 记为 tau-meta） */
export const SCALE_WORDS = {
  fontSize: [
    "tau-hero",
    "tau-title-lg",
    "tau-title",
    "tau-body-lg",
    "tau-body",
    "tau-meta",
    "tau-sm",
    "tau-micro",
    "tau-tiny",
  ],
  fontFamily: ["tau", "tau-mono"],
  radius: ["tau-sm", "tau-md", "tau-lg"],
  shadow: ["card", "float"],
  ease: ["tau-out"],
  animate: ["hm-pulse"],
} as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...SCALE_WORDS.fontSize] }],
      "font-family": [{ font: [...SCALE_WORDS.fontFamily] }],
      rounded: [{ rounded: [...SCALE_WORDS.radius] }],
      shadow: [{ shadow: [...SCALE_WORDS.shadow] }],
      ease: [{ ease: [...SCALE_WORDS.ease] }],
      animate: [{ animate: [...SCALE_WORDS.animate] }],
    },
  },
});

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
