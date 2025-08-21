import React, { memo, useRef } from "react";
import { Dropdown, MenuProps, Tooltip } from "antd";
import { MdMoreHoriz } from "react-icons/md";
import { useMemoizedFn } from "ahooks";
import Editor, { EditorRef } from "@/components/Editor";
import ErrorBoundary from "@/components/ErrorBoundary";
import { formatDate } from "@/utils";
import { LogEntry } from "@/commands/log";
import classnames from "classnames";

interface LogCardProps {
  log: LogEntry;
  onClick?: (log: LogEntry) => void;
  onDelete?: (logId: number) => Promise<void>;
  className?: string;
  style?: React.CSSProperties;
}

const LogCard = memo((props: LogCardProps) => {
  const { log, className, style, onClick, onDelete } = props;

  const editorRef = useRef<EditorRef>(null);

  const handleClick = useMemoizedFn(() => {
    if (onClick) {
      onClick(log);
    }
  });

  const stopPropagation = useMemoizedFn(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
    },
  );

  const moreMenuItems: MenuProps["items"] = [
    {
      key: "delete-log",
      label: "删除日志",
      danger: true,
    },
  ];

  const handleMoreClick: MenuProps["onClick"] = useMemoizedFn(
    async ({ key }) => {
      if (key === "delete-log" && onDelete) {
        await onDelete(log.id);
      }
    },
  );

  return (
    <div
      className={classnames(
        "p-4 border border-gray-200 dark:border-gray-700 rounded-lg relative hover:cursor-pointer transition-all duration-200",
        className,
      )}
      style={style}
      onClick={handleClick}
    >
      <div className="mb-3 flex text-xs gap-2.5 text-gray-500">
        <span>创建于 {formatDate(log.create_time, true)}</span>
        <span>更新于 {formatDate(log.update_time, true)}</span>
      </div>

      <div className="mb-3">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2 line-clamp-1">
          {log.title || "未命名"}
        </h3>

        <ErrorBoundary>
          <Editor
            ref={editorRef}
            className="max-h-32 overflow-hidden pointer-events-none text-sm"
            readonly={true}
            initValue={
              log.content && log.content.length > 0
                ? log.content.slice(0, 3)
                : [
                    {
                      type: "paragraph",
                      children: [{ type: "formatted", text: "" }],
                    },
                  ]
            }
          />
        </ErrorBoundary>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
          {log.period_type === "day"
            ? "日记"
            : log.period_type === "week"
              ? "周记"
              : log.period_type === "month"
                ? "月记"
                : "年记"}
        </span>
      </div>

      <div
        className="absolute top-3 right-3 flex justify-end"
        onClick={stopPropagation}
      >
        <Dropdown
          menu={{
            items: moreMenuItems,
            onClick: handleMoreClick,
          }}
          trigger={["click"]}
        >
          <Tooltip title="更多操作">
            <div className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <MdMoreHoriz className="text-gray-500" />
            </div>
          </Tooltip>
        </Dropdown>
      </div>
    </div>
  );
});

export default LogCard;
