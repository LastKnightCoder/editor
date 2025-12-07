import { memo } from "react";
import { Empty, Tooltip } from "antd";
import { IoChevronDown, IoChevronForward, IoAdd } from "react-icons/io5";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";

import { IGoal, EGoalStatus } from "@/types";
import GoalCard from "./GoalCard";

interface GoalSectionProps {
  status: EGoalStatus;
  goals: IGoal[];
  isCollapsed: boolean;
  loading: boolean;
  selectedGoalId?: number;
  onToggleCollapse: () => void;
  onGoalSelect: (goal: IGoal) => void;
  onEditGoal: (goal: IGoal) => void;
  onDeleteGoal: (goal: IGoal) => void;
  onUpdateGoalStatus: (goal: IGoal, status: EGoalStatus) => void;
  onCreateGoal?: () => void; // 新增目标的回调，只有进行中的section会有
}

const GoalSection = memo(
  ({
    status,
    goals,
    isCollapsed,
    loading,
    selectedGoalId,
    onToggleCollapse,
    onGoalSelect,
    onEditGoal,
    onDeleteGoal,
    onUpdateGoalStatus,
    onCreateGoal,
  }: GoalSectionProps) => {
    const themeColors = useThemeColors();

    const getSectionTitle = () => {
      switch (status) {
        case EGoalStatus.InProgress:
          return `进行中 (${goals.length})`;
        case EGoalStatus.Completed:
          return `已完成 (${goals.length})`;
        case EGoalStatus.Abandoned:
          return `已放弃 (${goals.length})`;
        default:
          return `未知状态 (${goals.length})`;
      }
    };

    const getEmptyDescription = () => {
      switch (status) {
        case EGoalStatus.InProgress:
          return "暂无进行中的目标";
        case EGoalStatus.Completed:
          return "暂无已完成的目标";
        case EGoalStatus.Abandoned:
          return "暂无已放弃的目标";
        default:
          return "暂无目标";
      }
    };

    return (
      <div className="mb-2 last:mb-0">
        <div
          className={classNames(
            "flex justify-between items-center py-4 px-6 transition-all duration-200 border-b",
            themeColors.borderClass,
          )}
        >
          <div
            className="flex items-center gap-2 cursor-pointer flex-1 "
            onClick={onToggleCollapse}
          >
            <span
              className={classNames(
                "text-base transition-transform duration-200",
                themeColors.textClass,
                isCollapsed ? "-rotate-90" : "",
              )}
            >
              {isCollapsed ? (
                <IoChevronForward className="rotate-90" />
              ) : (
                <IoChevronDown />
              )}
            </span>
            <span
              className={classNames(
                "font-semibold text-base tracking-tight select-none",
                themeColors.textClass,
              )}
            >
              {getSectionTitle()}
            </span>
          </div>
          {status === EGoalStatus.InProgress && onCreateGoal && (
            <Tooltip title="新建目标" placement="left">
              <button
                className={classNames(
                  "flex items-center justify-center w-8 h-8 rounded-full bg-transparent cursor-pointer transition-all duration-200",
                  themeColors.textClass,
                  themeColors.hoverClass,
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateGoal();
                }}
              >
                <IoAdd size={18} />
              </button>
            </Tooltip>
          )}
        </div>

        {!isCollapsed && (
          <div className="p-4 flex flex-col gap-3">
            {loading ? (
              <div className="flex justify-center items-center h-[200px] text-gray-600 dark:text-gray-400 text-base">
                加载中...
              </div>
            ) : goals.length === 0 ? (
              <Empty description={getEmptyDescription()} />
            ) : (
              goals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  isSelected={selectedGoalId === goal.id}
                  onSelect={onGoalSelect}
                  onEdit={onEditGoal}
                  onDelete={onDeleteGoal}
                  onUpdateStatus={onUpdateGoalStatus}
                />
              ))
            )}
          </div>
        )}
      </div>
    );
  },
);

export default GoalSection;
