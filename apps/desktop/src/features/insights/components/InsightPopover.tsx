/**
 * 点一处标记后的气泡：一句理由，对方是谁和一小段原文（重复与矛盾并排两段），最多两个按钮。
 * 主按钮按类型（KL-069 思路）：可连接 / 重复 → 连接；可以展开 → 去补写；矛盾 → 聊一聊。
 * 逐条看时附一行快捷键提示。
 */

import type { ReactNode } from "react";
import {
  FileText,
  FolderKanban,
  Layers,
  Link2,
  MessageCircle,
  PenLine,
  X,
  Puzzle,
  type LucideIcon,
} from "lucide-react";
import { AnchoredPanel, Button, IconButton } from "@tau/ui";
import type { InsightMark } from "@/types/content-insights";

const TARGET_ICON = {
  card: Layers,
  article: FileText,
  "project-item": FolderKanban,
  "diary-moment": FileText,
  "plugin-entity": Puzzle,
};

export interface InsightPopoverProps {
  mark: InsightMark;
  anchor: HTMLElement | null;
  walking: boolean;
  /** 执行主按钮（连接 / 去补写 / 聊一聊，见 primaryActionOf） */
  onPrimary(mark: InsightMark): void;
  onDismiss(mark: InsightMark): void;
  onOpenTarget(mark: InsightMark): void;
  /** 对方标题旁的宿主动作（创作模式：放到白板） */
  targetAction?(mark: InsightMark): ReactNode;
  /** 关闭气泡（逐条看时一并结束），与 Esc 第一层相同 */
  onClose(): void;
}

export type InsightPrimaryAction = "connect" | "write" | "discuss";

export const primaryActionOf = (mark: InsightMark): InsightPrimaryAction =>
  mark.kind === "gap" ? "write" : mark.kind === "conflict" ? "discuss" : "connect";

const PRIMARY: Record<InsightPrimaryAction, { label: string; icon: LucideIcon }> = {
  connect: { label: "连接", icon: Link2 },
  write: { label: "去补写", icon: PenLine },
  discuss: { label: "聊一聊", icon: MessageCircle },
};

export function InsightPopover({
  mark,
  anchor,
  walking,
  onPrimary,
  onDismiss,
  onOpenTarget,
  targetAction,
  onClose,
}: InsightPopoverProps) {
  const target = mark.target;
  const Icon = target ? TARGET_ICON[target.ref.kind] : Layers;
  const targetName = target ? `${target.title}${target.heading ? ` › ${target.heading}` : ""}` : "";
  const primary = PRIMARY[primaryActionOf(mark)];
  return (
    <AnchoredPanel anchor={anchor} placement="bottom-start" className="w-[360px] max-w-[360px]">
      <div
        data-insight-popover
        className="text-tau-body text-ink-1 relative px-3.5 pb-2.5 pt-3 leading-[1.7]"
        onMouseDown={event => event.stopPropagation()}
      >
        <IconButton
          className="absolute right-1.5 top-1.5 size-6"
          title="关闭 (Esc)"
          aria-label="关闭"
          onClick={onClose}
        >
          <X className="size-3.5" strokeWidth={1.75} />
        </IconButton>
        <p className="pr-5">{mark.kind === "gap" ? mark.text : mark.why}</p>
        {mark.kind === "gap" && mark.why && (
          <p className="text-ink-2 text-tau-meta mt-1">{mark.why}</p>
        )}
        {target && (mark.mine || mark.theirs) ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="bg-surface-hover rounded-tau-sm text-ink-2 text-tau-meta px-2.5 py-2 leading-[1.65]">
              <span className="text-ink-3 block text-[11.5px]">这里</span>
              {mark.mine || mark.anchor}
            </div>
            <button
              type="button"
              onClick={() => onOpenTarget(mark)}
              className="bg-surface-hover rounded-tau-sm text-ink-2 text-tau-meta hover:bg-hover px-2.5 py-2 text-left leading-[1.65]"
            >
              <span className="text-ink-3 block truncate text-[11.5px]">《{targetName}》</span>
              {mark.theirs || target.excerpt}
            </button>
          </div>
        ) : (
          target && (
            <button
              type="button"
              onClick={() => onOpenTarget(mark)}
              className="bg-surface-hover rounded-tau-sm hover:bg-hover mt-2 block w-full px-2.5 py-2 text-left"
            >
              <span className="text-ink-1 text-tau-meta flex min-w-0 items-center gap-1.5 font-medium">
                <Icon className="text-ink-3 size-[13px] shrink-0" strokeWidth={1.75} />
                <span className="min-w-0 truncate">{targetName}</span>
                {targetAction?.(mark)}
              </span>
              {target.excerpt && (
                <span className="text-ink-2 text-tau-meta mt-0.5 line-clamp-3 block leading-[1.65]">
                  {target.excerpt}
                </span>
              )}
            </button>
          )
        )}
        <div className="mt-2.5 flex items-center gap-1.5">
          <Button size="sm" variant="primary" icon={primary.icon} onClick={() => onPrimary(mark)}>
            {primary.label}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDismiss(mark)}>
            不相关
          </Button>
          {walking && (
            <span className="text-ink-3 ml-auto text-[11px]">回车{primary.label} · ⌫ 不相关</span>
          )}
        </div>
      </div>
    </AnchoredPanel>
  );
}
