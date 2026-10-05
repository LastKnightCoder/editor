/**
 * 点一处标记后的气泡：一句理由，对方是谁和一小段原文（重复与矛盾并排两段），最多两个按钮。
 * 逐条看时附一行快捷键提示。
 */

import { CircleHelp, FileText, FolderKanban, Layers, Link2, X } from "lucide-react";
import { AnchoredPanel, Button, IconButton } from "@tau/ui";
import type { InsightMark } from "@/types/content-insights";

const TARGET_ICON = {
  card: Layers,
  article: FileText,
  "project-item": FolderKanban,
  diary: FileText,
};

export interface InsightPopoverProps {
  mark: InsightMark;
  anchor: HTMLElement | null;
  walking: boolean;
  onConnect(mark: InsightMark): void;
  onQuestion(mark: InsightMark): void;
  onDismiss(mark: InsightMark): void;
  onOpenTarget(mark: InsightMark): void;
  /** 关闭气泡（逐条看时一并结束），与 Esc 第一层相同 */
  onClose(): void;
}

export const connectsByDefault = (mark: InsightMark) => mark.kind === "link" || mark.kind === "dup";

export function InsightPopover({
  mark,
  anchor,
  walking,
  onConnect,
  onQuestion,
  onDismiss,
  onOpenTarget,
  onClose,
}: InsightPopoverProps) {
  const target = mark.target;
  const Icon = target ? TARGET_ICON[target.ref.kind] : Layers;
  const targetName = target ? `${target.title}${target.heading ? ` › ${target.heading}` : ""}` : "";
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
          {connectsByDefault(mark) ? (
            <Button size="sm" variant="primary" icon={Link2} onClick={() => onConnect(mark)}>
              连接
            </Button>
          ) : (
            <Button size="sm" variant="primary" icon={CircleHelp} onClick={() => onQuestion(mark)}>
              记为问题
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onDismiss(mark)}>
            不相关
          </Button>
          {walking && (
            <span className="text-ink-3 ml-auto text-[11px]">
              回车{connectsByDefault(mark) ? "连接" : "记为问题"} · ⌫ 不相关
            </span>
          )}
        </div>
      </div>
    </AnchoredPanel>
  );
}
