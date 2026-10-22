/**
 * Skill 页共用小件：图标、来源 / 调用方式徽标、常驻上下文预算条。
 * 图标中性墨色（同 MCP 页）；颜色只给语义状态（自动 ok、仅手动 info、问题 warn / danger）。
 */

import {
  BookMarked,
  Database,
  FileCode2,
  Library,
  Link2,
  Network,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@tau/ui";
import type { Skill } from "@/types";
import { linkedDirLabel, type SkillItem, type SkillMode } from "../useSkills";

const BUILTIN_ICONS: Record<string, LucideIcon> = {
  "knowledge-base": Library,
  "database-schema": Database,
  markdown: FileCode2,
  mindmap: Network,
};

export function SkillIcon({ skill, size = "md" }: { skill: Skill; size?: "md" | "lg" }) {
  const Icon =
    skill.source === "builtin"
      ? (BUILTIN_ICONS[skill.folderName] ?? BookMarked)
      : skill.source === "linked"
        ? Link2
        : Sparkles;
  return (
    <span
      className={cn(
        "bg-hover text-ink-2 grid shrink-0 place-items-center",
        size === "lg" ? "size-11 rounded-[12px]" : "size-[30px] rounded-[9px]"
      )}
    >
      <Icon className={size === "lg" ? "size-5" : "size-[15px]"} strokeWidth={1.75} />
    </span>
  );
}

export function SourceTag({ skill }: { skill: Skill }) {
  if (skill.source === "mine" || !skill.source) return null;
  return (
    <span
      title={skill.rootPath}
      className="text-tau-micro text-ink-3 border-line-1 inline-flex shrink-0 items-center gap-1 rounded-[5px] border px-1.5 font-normal leading-[18px]"
    >
      {skill.source === "builtin"
        ? "内置"
        : skill.source === "plugin"
          ? `插件 · ${skill.pluginName}`
          : skill.source === "package"
            ? `Skill 包 · ${skill.pluginName}`
            : linkedDirLabel(skill)}
    </span>
  );
}

const MODE_STYLE: Record<SkillMode, string> = {
  auto: "bg-ok-soft text-ok",
  manual: "bg-info-soft text-info",
  off: "text-ink-3 border border-dashed border-line-1",
};
const MODE_TEXT: Record<SkillMode, string> = { auto: "自动", manual: "仅手动", off: "已停用" };

export function ModeBadge({ mode }: { mode: SkillMode }) {
  return (
    <span
      className={cn(
        "text-tau-tiny inline-flex h-5 shrink-0 items-center rounded-full px-2 leading-none",
        MODE_STYLE[mode]
      )}
    >
      {MODE_TEXT[mode]}
    </span>
  );
}

export function WarningText({ item, className }: { item: SkillItem; className?: string }) {
  if (!item.warning) return null;
  return (
    <span
      className={cn(
        "text-tau-sm min-w-0 truncate",
        item.warning.level === "danger" ? "text-danger" : "text-warn",
        className
      )}
    >
      {item.warning.text}
    </span>
  );
}

/** 常驻上下文：自动 Skill 的名称 + 描述每次对话都会带上 */
export function BudgetBar({
  total,
  count,
  longTokens,
  longCount,
  className,
}: {
  total: number;
  count: number;
  longTokens: number;
  longCount: number;
  className?: string;
}) {
  const scale = Math.max(1000, total);
  return (
    <div
      className={cn("text-tau-sm text-ink-2 flex min-w-0 items-center gap-2.5", className)}
      title="自动模式的 Skill 会把名称和描述放进每次对话的系统提示词"
    >
      <span className="shrink-0 whitespace-nowrap tabular-nums">
        常驻上下文 <b className="text-ink-1 font-semibold">{total}</b> tokens
      </span>
      <span className="bg-hover flex h-1.5 min-w-[80px] flex-1 overflow-hidden rounded-full">
        <i
          className="bg-ok block h-full"
          style={{ width: `${((total - longTokens) / scale) * 100}%` }}
        />
        <i className="bg-warn block h-full" style={{ width: `${(longTokens / scale) * 100}%` }} />
      </span>
      <span className="text-ink-3 shrink-0 whitespace-nowrap tabular-nums">
        {count} 个自动
        {longCount > 0 && <span className="text-warn"> · {longCount} 个描述偏长</span>}
      </span>
    </div>
  );
}
