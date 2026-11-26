import { useSidebarI18n } from "@/components/ChatSidebar/sidebar.i18n";
import { sidebarNumber, type sidebarT } from "@/components/ChatSidebar/sidebar.binding";
/**
 * 树谱面板：一个对话里全部分支的全貌。节点只画用户消息（回答折叠），没有分叉的直链压成一行，
 * 当前路径高亮，每个分支末端显示进度（从分叉处起问了几轮、最后活动时间）。
 * 点一行 = 切到那个分支（落到这条分支最近写入的位置）并在对话流里定位到它。
 *
 * 数据：主进程 pi-session:tree（conversationTreeOf）→ layoutConversationTree 排版。
 */
import { memo } from "react";
import dayjs from "dayjs";
import { cn } from "@tau/ui";
import type { ConversationTreeRow } from "../conversationTree";

interface ConversationTreePanelProps {
  rows: ConversationTreeRow[];
  branchCount: number;
  /** 回答进行中：只看不切 */
  disabled?: boolean;
  onSelect: (row: ConversationTreeRow) => void;
}

const relativeTime = (time: number, locale: string, t: typeof sidebarT) => {
  if (!time) return "";
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const now = dayjs();
  const at = dayjs(time);
  if (now.diff(at, "minute") < 1) return t("date.now");
  if (now.diff(at, "hour") < 1)
    return t("date.minutes", {
      count: now.diff(at, "minute"),
      number: number(now.diff(at, "minute")),
    });
  if (now.isSame(at, "day"))
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(at.toDate());
  if (now.diff(at, "day") < 7)
    return t("date.days", {
      count: now.diff(at, "day"),
      number: number(now.diff(at, "day")),
    });
  return new Intl.DateTimeFormat(locale, { month: "2-digit", day: "2-digit" }).format(at.toDate());
};

export const ConversationTreePanel = memo(function ConversationTreePanel({
  rows,
  branchCount,
  disabled,
  onSelect,
}: ConversationTreePanelProps) {
  const { t, locale } = useSidebarI18n();
  return (
    // 宽度由外层浮层卡片决定（卡片带内边距与 max-w，这里写死宽度会溢出卡片），这里撑满
    <div className="flex max-h-[420px] w-full min-w-0 flex-col">
      <div className="text-tau-meta text-ink-3 flex h-8 shrink-0 items-center justify-between px-2.5">
        <span className="text-ink-2 font-medium">{t("branch.title")}</span>
        <span className="tabular-nums">
          {t("branch.count", { count: branchCount, number: sidebarNumber(branchCount) })}
        </span>
      </div>
      <ul
        role="tree"
        aria-label={t("branch.title")}
        className="min-h-0 flex-1 overflow-y-auto pb-1"
      >
        {rows.map(row => {
          const current = row.onPath && row.isLeaf;
          const label = row.node.text || t("branch.empty");
          return (
            <li
              key={row.node.id}
              role="treeitem"
              aria-level={row.depth + 1}
              aria-selected={current}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(row)}
                title={row.node.text}
                className={cn(
                  "text-tau-meta flex min-h-8 w-full items-center gap-1.5 rounded-[7px] py-1 pr-2 text-left",
                  "ease-tau-out transition-colors duration-[160ms] disabled:cursor-default",
                  row.onPath ? "text-ink-1" : "text-ink-2 hover:bg-hover hover:text-ink-1",
                  current && "bg-selected font-medium"
                )}
                style={{ paddingLeft: `${row.depth * 14 + 10}px` }}
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    row.onPath ? "bg-accent" : "bg-ink-3/50"
                  )}
                />
                {row.isBranch && (
                  <span aria-hidden className="text-ink-3 shrink-0">
                    ↳
                  </span>
                )}
                <span className={cn("min-w-0 flex-1 truncate", row.node.omitted && "opacity-50")}>
                  {label}
                </span>
                {row.length > 1 && (
                  <span className="text-tau-tiny text-ink-3 shrink-0 tabular-nums">
                    +{sidebarNumber(row.length - 1)}
                  </span>
                )}
                {row.isLeaf && (
                  <span className="text-tau-tiny text-ink-3 shrink-0 tabular-nums">
                    {current ? t("branch.current") : relativeTime(row.lastActive, locale, t)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-tau-tiny text-ink-3 border-line-1 shrink-0 border-t px-2.5 py-1.5">
        {t("branch.hint")}
      </p>
    </div>
  );
});
