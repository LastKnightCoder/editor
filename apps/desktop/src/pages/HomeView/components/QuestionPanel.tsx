import React from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import { HelpCircle, ArrowRight } from "lucide-react";
import type { IQuestion } from "@/types/question";
import type { WorkbenchQuestionGroupStat } from "@/types/components-workbench";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

interface QuestionPanelProps {
  items: IQuestion[];
  groups: WorkbenchQuestionGroupStat[];
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  not_started: {
    label: "未开始",
    className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  },
  in_progress: {
    label: "进行中",
    className: "bg-[var(--th-info)]/15 text-status-info dark:",
  },
};

const QuestionPanel: React.FC<QuestionPanelProps> = ({ items, groups }) => {
  const themeColors = useThemeColors();
  const { createTab } = useTabStore();
  const previewItems = items.slice(0, 5);

  const getGroupName = (groupId: number): string => {
    const group = groups.find(g => g.group.id === groupId);
    return group?.group.title || "";
  };

  const totalCount = groups.reduce((sum, g) => sum + g.notStarted + g.inProgress, 0);

  return (
    <div
      className={classNames(
        "flex min-h-[200px] flex-col rounded-xl border p-4",
        themeColors.cardBorderClass,
        themeColors.cardBgClass
      )}
    >
      {/* 标题行 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={classNames(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              themeColors.iconBgClass
            )}
          >
            <HelpCircle className={classNames("h-4 w-4", themeColors.iconTextClass)} />
          </div>
          <h3 className={classNames("text-sm font-semibold", themeColors.textClass)}>待解决问题</h3>
          {totalCount > 0 && (
            <span
              className={classNames(
                "rounded-full px-1.5 py-0.5 text-xs font-medium",
                themeColors.badgeBgClass,
                themeColors.badgeTextClass
              )}
            >
              {totalCount}
            </span>
          )}
        </div>
        <button
          onClick={() => createTab(TabType.Questions)}
          className={classNames(
            "flex cursor-pointer items-center gap-1 text-xs transition-colors",
            themeColors.secondaryTextClass,
            "hover:opacity-80"
          )}
        >
          查看全部
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {/* 列表 */}
      {items.length === 0 ? (
        <div
          className={classNames(
            "flex flex-1 items-center justify-center text-sm",
            themeColors.secondaryTextClass
          )}
        >
          没有待解决的问题 ✅
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {previewItems.map(question => {
            const statusConfig = STATUS_CONFIG[question.status];
            const groupName = getGroupName(question.groupId);

            return (
              <div
                key={question.id}
                className={classNames(
                  "group cursor-pointer rounded-lg px-2 py-1.5 transition-colors",
                  themeColors.hoverClass
                )}
                onClick={() => createTab(TabType.Questions)}
              >
                <p className={classNames("truncate text-sm", themeColors.textClass)}>
                  {question.questionContent}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  {statusConfig && (
                    <span
                      className={classNames("rounded px-1 py-0.5 text-xs", statusConfig.className)}
                    >
                      {statusConfig.label}
                    </span>
                  )}
                  {groupName && (
                    <span className={classNames("text-xs", themeColors.secondaryTextClass)}>
                      {groupName}
                    </span>
                  )}
                  <span className={classNames("text-xs", themeColors.secondaryTextClass)}>
                    {dayjs(question.createTime).fromNow()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default QuestionPanel;
