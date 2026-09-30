/**
 * 服务器的图标与状态行：卡片、详情抽屉、输入框快捷面板共用。
 * 图标一律中性墨色，只按服务器身份区分；颜色只留给状态点。
 */

import {
  BookMarked,
  Cloud,
  Database,
  FileText,
  FlaskConical,
  FolderOpen,
  Globe,
  Image,
  Locate,
  PenLine,
  Terminal,
  Video,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@tau/ui";
import type { McpServerItem, McpServerStatus } from "../useMcpServers";

const BUILTIN_ICONS: Record<string, LucideIcon> = {
  "content-edit-tools": PenLine,
  "context-tools": Locate,
  "fetch-tools": Globe,
  "filesystem-tools": FolderOpen,
  "openai-image-tools": Image,
  "sql-query-tools": Database,
};

/** 功能工具分组 → 图标（与侧栏导航同一套视觉语言；id 见 scopedToolCatalog） */
const SCOPED_ICONS: Record<string, LucideIcon> = {
  "scoped-pdf": BookMarked,
  "scoped-video-note": Video,
  "scoped-vibe-learning": FlaskConical,
};

const scopedIcon = (item: McpServerItem): LucideIcon => SCOPED_ICONS[item.id] ?? FileText;

const customIcon = (item: McpServerItem): LucideIcon =>
  item.server?.transport.type === "stdio" ? Terminal : Cloud;

export function ServerIcon({ item, size = "md" }: { item: McpServerItem; size?: "md" | "lg" }) {
  const Icon =
    item.kind === "builtin"
      ? (BUILTIN_ICONS[item.id] ?? FileText)
      : item.kind === "scoped"
        ? scopedIcon(item)
        : item.kind === "pi"
          ? Terminal
          : customIcon(item);
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

const DOT: Record<McpServerStatus, string> = {
  ready: "bg-ok",
  connecting: "bg-warn animate-pulse",
  error: "bg-danger",
  off: "border-ink-3 border-[1.5px] bg-transparent",
  unavailable: "bg-warn",
};

export function StatusDot({ status }: { status: McpServerStatus }) {
  return <i className={cn("size-[7px] shrink-0 rounded-full", DOT[status])} />;
}

export function statusText(item: McpServerItem): string {
  if (item.locked) return `${item.tools.length} 个工具 · 常开`;
  switch (item.status) {
    case "ready":
      return item.tools.length > 0
        ? `${item.tools.length - item.disabledTools.size} / ${item.tools.length} 个工具`
        : "已连接";
    case "connecting":
      return "连接中…";
    case "error":
      return "连接失败";
    case "off":
      return "已停用";
    case "unavailable":
      return "需要配置";
  }
}

export function StatusLine({ item, className }: { item: McpServerItem; className?: string }) {
  return (
    <span
      className={cn(
        "text-tau-sm inline-flex min-w-0 items-center gap-1.5 tabular-nums",
        item.status === "error" ? "text-danger" : "text-ink-3",
        className
      )}
    >
      <StatusDot status={item.status} />
      <span className="truncate">{statusText(item)}</span>
    </span>
  );
}
