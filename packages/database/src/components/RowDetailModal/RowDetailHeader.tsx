import { ChevronDown, ChevronRight, ChevronUp, Ellipsis, Table2, Trash2, X } from "lucide-react";
import { IconButton, Menu, Tooltip } from "@tau/ui";
import type { DatabaseViewType } from "../../types";
import { getViewType } from "../../views/registry";

interface RowDetailHeaderProps {
  viewName?: string;
  viewType?: DatabaseViewType;
  title: string;
  /** 当前行在视图可见行序中的位置；-1 表示已被筛选出视图 */
  index: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
  onDeleteRow?: () => void;
  onClose: () => void;
}

const NAV_BUTTON_CLASS = "size-7 rounded-[8px]";
const NAV_ICON_CLASS = "size-[15px]";

/** 行详情头：视图 › 行标题 · 第 N / M 条 · 上一条 / 下一条 · 更多 · 关闭 */
const RowDetailHeader = ({
  viewName,
  viewType,
  title,
  index,
  total,
  onPrev,
  onNext,
  onDeleteRow,
  onClose,
}: RowDetailHeaderProps) => {
  const ViewIcon = (viewType && getViewType(viewType)?.icon) || Table2;
  return (
    <div className="flex h-[50px] shrink-0 items-center gap-0.5 pl-5 pr-3">
      <div className="text-ink-3 text-tau-meta flex min-w-0 items-center gap-1.5">
        {viewName && (
          <>
            <ViewIcon className="size-3.5 shrink-0" strokeWidth={1.75} />
            <span className="shrink-0">{viewName}</span>
            <ChevronRight className="size-3 shrink-0 opacity-70" strokeWidth={1.75} />
          </>
        )}
        <span className="text-ink-2 max-w-[320px] truncate">{title || "未命名"}</span>
      </div>
      <span className="flex-1" />
      {index >= 0 && (
        <span className="text-ink-3 text-tau-micro mr-1.5 font-mono tabular-nums">
          {index + 1} / {total}
        </span>
      )}
      <Tooltip content="上一条（K）" disabled={!onPrev}>
        <IconButton
          aria-label="上一条"
          disabled={!onPrev}
          onClick={onPrev}
          className={NAV_BUTTON_CLASS}
        >
          <ChevronUp className={NAV_ICON_CLASS} strokeWidth={1.75} />
        </IconButton>
      </Tooltip>
      <Tooltip content="下一条（J）" disabled={!onNext}>
        <IconButton
          aria-label="下一条"
          disabled={!onNext}
          onClick={onNext}
          className={NAV_BUTTON_CLASS}
        >
          <ChevronDown className={NAV_ICON_CLASS} strokeWidth={1.75} />
        </IconButton>
      </Tooltip>
      <span className="bg-line-1 mx-1.5 h-4 w-px" />
      {onDeleteRow && (
        <Menu
          align="end"
          trigger={
            <IconButton aria-label="更多" className={NAV_BUTTON_CLASS}>
              <Ellipsis className={NAV_ICON_CLASS} strokeWidth={1.75} />
            </IconButton>
          }
        >
          <Menu.Item
            danger
            icon={<Trash2 className="size-3.5" strokeWidth={1.75} />}
            onSelect={onDeleteRow}
          >
            删除此行
          </Menu.Item>
        </Menu>
      )}
      <IconButton aria-label="关闭" onClick={onClose} className={NAV_BUTTON_CLASS}>
        <X className={NAV_ICON_CLASS} strokeWidth={1.75} />
      </IconButton>
    </div>
  );
};

export default RowDetailHeader;
