/** Notebook 对话的课题目标：标题 + 目标描述，进系统提示词，让回答围绕这个课题要解决的问题 */

import type { Descendant } from "slate";
import { slatePlainText } from "@/entity/inline-refs";

const MAX_GOAL_CHARS = 2000;

export function buildVLGoalSection(title: string, desc: Descendant[] | undefined): string {
  const name = title.trim();
  const goal = slatePlainText(desc ?? []).trim();
  if (!name && !goal) return "";
  const clipped = goal.length > MAX_GOAL_CHARS ? `${goal.slice(0, MAX_GOAL_CHARS)}…` : goal;
  const lines = [
    "## 课题目标",
    "这个学习项目要探究的课题如下。回答时围绕它组织资料，并指出资料还没覆盖到的部分。",
  ];
  if (name) lines.push(`课题：${name}`);
  if (clipped) lines.push(`目标描述：\n${clipped}`);
  return `\n\n${lines.join("\n\n")}`;
}
