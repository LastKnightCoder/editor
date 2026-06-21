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
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
};

const QuestionPanel: React.FC<QuestionPanelProps> = ({ items, groups }) => {
  const themeColors = useThemeColors();
  const { createTab } = useTabStore();
  const previewItems = items.slice(0, 5);

  const getGroupName = (groupId: number): string => {
    const group = groups.find((g) => g.group.id === groupId);
    return group?.group.title || "";
  };

  const totalCount = groups.reduce(
    (sum, g) => sum + g.notStarted + g.inProgress,
    0,
  );

  return (
    <div
      className={classNames(
        "rounded-xl border p-4 min-h-[200px] flex flex-col",
        themeColors.cardBorderClass,
        themeColors.cardBgClass,
      )}
    >
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={classNames(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              themeColors.iconBgClass,
            )}
          >
            <HelpCircle
              className={classNames("w-4 h-4", themeColors.iconTextClass)}
            />
          </div>
          <h3
            className={classNames(
              "text-sm font-semibold",
              themeColors.textClass,
            )}
          >
            待解决问题
          </h3>
          {totalCount > 0 && (
            <span
              className={classNames(
                "text-xs px-1.5 py-0.5 rounded-full font-medium",
                themeColors.badgeBgClass,
                themeColors.badgeTextClass,
              )}
            >
              {totalCount}
            </span>
          )}
        </div>
        <button
          onClick={() => createTab(TabType.Questions)}
          className={classNames(
            "text-xs flex items-center gap-1 transition-colors cursor-pointer",
            themeColors.secondaryTextClass,
            "hover:opacity-80",
          )}
        >
          查看全部
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* 列表 */}
      {items.length === 0 ? (
        <div
          className={classNames(
            "flex-1 flex items-center justify-center text-sm",
            themeColors.secondaryTextClass,
          )}
        >
          没有待解决的问题 ✅
        </div>
      ) : (
        <div className="flex-1 space-y-1 overflow-y-auto min-h-0 pr-1">
          {previewItems.map((question) => {
            const statusConfig = STATUS_CONFIG[question.status];
            const groupName = getGroupName(question.groupId);

            return (
              <div
                key={question.id}
                className={classNames(
                  "group px-2 py-1.5 rounded-lg transition-colors cursor-pointer",
                  themeColors.hoverClass,
                )}
                onClick={() => createTab(TabType.Questions)}
              >
                <p
                  className={classNames(
                    "text-sm truncate",
                    themeColors.textClass,
                  )}
                >
                  {question.questionContent}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {statusConfig && (
                    <span
                      className={classNames(
                        "text-xs px-1 py-0.5 rounded",
                        statusConfig.className,
                      )}
                    >
                      {statusConfig.label}
                    </span>
                  )}
                  {groupName && (
                    <span
                      className={classNames(
                        "text-xs",
                        themeColors.secondaryTextClass,
                      )}
                    >
                      {groupName}
                    </span>
                  )}
                  <span
                    className={classNames(
                      "text-xs",
                      themeColors.secondaryTextClass,
                    )}
                  >
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
