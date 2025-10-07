import { memo, useMemo } from "react";
import classnames from "classnames";
import { Card, Dropdown, MenuProps } from "antd";
import { MoreOutlined } from "@ant-design/icons";

import { IGoal, EGoalStatus } from "@/types";

interface GoalCardProps {
  goal: IGoal;
  isSelected: boolean;
  onSelect: (goal: IGoal) => void;
  onEdit: (goal: IGoal) => void;
  onDelete: (goal: IGoal) => void;
  onUpdateStatus: (goal: IGoal, status: EGoalStatus) => void;
}

const GoalCard = memo(
  ({
    goal,
    isSelected,
    onSelect,
    onEdit,
    onDelete,
    onUpdateStatus,
  }: GoalCardProps) => {
    const getGoalMenuItems = useMemo(() => {
      const baseItems: MenuProps["items"] = [
        {
          key: "edit",
          label: "编辑",
          onClick: () => onEdit(goal),
        },
      ];

      if (goal.status === EGoalStatus.InProgress) {
        baseItems.push(
          {
            key: "complete",
            label: "标记为已完成",
            onClick: () => onUpdateStatus(goal, EGoalStatus.Completed),
          },
          {
            key: "abandon",
            label: "标记为已放弃",
            onClick: () => onUpdateStatus(goal, EGoalStatus.Abandoned),
          },
        );
      }

      // 添加删除选项
      baseItems.push(
        { type: "divider" },
        {
          key: "delete",
          label: "删除",
          danger: true,
          onClick: () => onDelete(goal),
        },
      );

      return baseItems;
    }, [goal, onDelete, onUpdateStatus, onEdit]);

    const handleClick = () => {
      onSelect(goal);
    };

    return (
      <div
        className={classnames(
          "flex justify-between items-start py-3 px-2 rounded-lg cursor-pointer",
          {
            "bg-gray-100 dark:bg-zinc-800": isSelected,
          },
        )}
        onClick={handleClick}
      >
        <h4 className="m-0 text-base font-semibold text-gray-900 dark:text-gray-100 flex-1 mr-3 leading-normal tracking-tight select-none">
          {goal.title}
        </h4>
        <div className="flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity duration-200">
          <Dropdown menu={{ items: getGoalMenuItems }} trigger={["click"]}>
            <button
              className="w-7 h-7 border-none rounded-full bg-transparent text-gray-600 dark:text-gray-400 cursor-pointer flex items-center justify-center transition-all duration-200 hover:bg-gray-200 dark:hover:bg-zinc-700 hover:text-gray-900 dark:hover:text-gray-100"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <MoreOutlined />
            </button>
          </Dropdown>
        </div>
      </div>
    );
  },
);

export default GoalCard;
