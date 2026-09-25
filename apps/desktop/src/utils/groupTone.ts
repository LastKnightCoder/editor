/**
 * 分组色（待办项目 / 问题分组共用）：legacy 的 17 个色名（src/constants/project-colors.ts，
 * 库里存的是色名）收敛到 7 色设计板。全部走主题语义类（tag-1…5 / accent / ink-3），浅深两主题
 * 自动跟随，不新增 token；新建 / 编辑时只提供这 7 个代表色名。未知值（如旧的十六进制）归灰。
 */

import type { ProjectColorName } from "@/constants/project-colors";

export type TodoGroupTone = "rose" | "orange" | "yellow" | "green" | "blue" | "purple" | "gray";

const TONE_OF: Record<ProjectColorName, TodoGroupTone> = {
  "berry-red": "rose",
  red: "rose",
  orange: "orange",
  "light-orange": "orange",
  yellow: "yellow",
  "olive-green": "yellow",
  green: "green",
  "mint-green": "green",
  teal: "green",
  "sky-blue": "blue",
  "light-blue": "blue",
  blue: "blue",
  "grape-purple": "purple",
  violet: "purple",
  charcoal: "gray",
  gray: "gray",
  "gray-brown": "gray",
};

/** 色点背景类（Tailwind 需要完整类名字面量，不能拼接） */
export const TONE_DOT: Record<TodoGroupTone, string> = {
  rose: "bg-tag-5",
  orange: "bg-accent",
  yellow: "bg-tag-4",
  green: "bg-tag-1",
  blue: "bg-tag-2",
  purple: "bg-tag-3",
  gray: "bg-ink-3",
};

/** 选色器：设计板顺序 + 写库时使用的代表色名 */
export const TONE_OPTIONS: { tone: TodoGroupTone; color: ProjectColorName; label: string }[] = [
  { tone: "rose", color: "red", label: "红" },
  { tone: "orange", color: "orange", label: "橙" },
  { tone: "yellow", color: "yellow", label: "黄" },
  { tone: "green", color: "green", label: "绿" },
  { tone: "blue", color: "blue", label: "蓝" },
  { tone: "purple", color: "violet", label: "紫" },
  { tone: "gray", color: "charcoal", label: "灰" },
];

export function groupTone(color: string | null | undefined): TodoGroupTone {
  return (color && TONE_OF[color as ProjectColorName]) || "gray";
}

export function groupDotClass(color: string | null | undefined): string {
  return TONE_DOT[groupTone(color)];
}
