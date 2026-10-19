/**
 * 斜杠菜单（BlockPanel）重建：类名摘自 packages/editor/src/components/BlockPanel 与 EditorContextMenu/menuClasses.ts。
 * 扁平列表、无分组、条目只有「图标块 + 标题 + 可选子菜单箭头」。
 */
import clsx from "clsx";
import { ChevronDown, ChevronRight, Code2, GitBranch, Heading1, Highlighter, Image, Layers, List, ListChecks, MessageSquare, Quote, Sigma, Table } from "lucide-react";

export const SLASH_ITEMS = [
  { icon: Heading1, title: "标题", sub: true },
  { icon: Image, title: "图片", sub: true },
  { icon: List, title: "无序列表" },
  { icon: ListChecks, title: "任务列表" },
  { icon: Layers, title: "标签页" },
  { icon: ChevronDown, title: "详情块" },
  { icon: Highlighter, title: "高亮块" },
  { icon: Quote, title: "引用块" },
  { icon: MessageSquare, title: "Callout", sub: true },
  { icon: Table, title: "表格" },
  { icon: GitBranch, title: "流程图（Mermaid）" },
  { icon: Code2, title: "代码块" },
  { icon: Sigma, title: "数学公式" },
];

export function SlashMenu({ active, scroll = 0, open = 1 }: { active: number; scroll?: number; open?: number }) {
  return (
    <div
      className="w-max max-w-[280px] min-w-[180px] rounded-[18px] border border-solid border-[var(--tau-line-2)] bg-[var(--tau-bg-surface)] p-[8px] pr-[2px] text-[var(--tau-ink-1)] shadow-[var(--tau-shadow-float)] backdrop-blur-[18px] backdrop-saturate-[180%]"
      style={{ opacity: open, transform: `translateY(${(1 - open) * 6}px) scale(${0.98 + 0.02 * open})`, transformOrigin: "top left" }}
    >
      <div className="relative inline-block w-max min-w-[220px] overflow-hidden">
        <div className="flex max-h-[360px] flex-col gap-[2px] overflow-hidden pr-[6px]">
          <div className="flex flex-col gap-[2px]" style={{ transform: `translateY(${-scroll}px)` }}>
            {SLASH_ITEMS.map((item, i) => (
              <div
                key={item.title}
                className={clsx(
                  "flex w-full items-center gap-[10px] rounded-[12px] p-[6px_10px] text-left text-[14px]",
                  i === active && "bg-[var(--tau-bg-selected)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--tau-accent)_25%,transparent)]"
                )}
              >
                <span className="flex size-[28px] shrink-0 items-center justify-center rounded-[9px] bg-[var(--tau-bg-press)]">
                  <item.icon className="size-[16px] text-[var(--tau-ink-2)]" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{item.title}</span>
                {item.sub && (
                  <span className="ml-[8px] flex items-center justify-center text-[12px] opacity-60">
                    <ChevronRight size={14} />
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
