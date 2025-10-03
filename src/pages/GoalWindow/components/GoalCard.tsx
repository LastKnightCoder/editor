import { memo } from "react";
import classnames from "classnames";
import { Card, Dropdown } from "antd";
import { MoreOutlined, ClockCircleOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

import { IGoal, EGoalStatus } from "@/types";
import styles from "../index.module.less";

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
    const hasDateRange = goal.start_date && goal.end_date;
    const isOverdue = goal.end_date && Date.now() > goal.end_date;

    const getGoalMenuItems = () => {
      const baseItems = [
        {
          key: "edit",
          label: "编辑",
          onClick: () => onEdit(goal),
        },
        {
          key: "delete",
          label: "删除",
          danger: true,
          onClick: () => onDelete(goal),
        },
      ];

      if (goal.status === EGoalStatus.InProgress) {
        return [
          ...baseItems,
          { type: "divider" as const },
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
        ];
      }

      return baseItems;
    };

    return (
      <Card
        size="small"
        className={classnames(styles.goalCard, {
          [styles.selected]: isSelected,
          [styles.overdue]: isOverdue && goal.status === EGoalStatus.InProgress,
        })}
        onClick={() => onSelect(goal)}
      >
        <div className={styles.goalHeader}>
          <h4 className={styles.goalTitle}>{goal.title}</h4>
          <div className={styles.goalActions}>
            <Dropdown menu={{ items: getGoalMenuItems() }} trigger={["click"]}>
              <button onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                <MoreOutlined />
              </button>
            </Dropdown>
          </div>
        </div>

        {goal.description && (
          <p className={styles.goalDescription}>{goal.description}</p>
        )}

        {hasDateRange && (
          <div className={styles.goalDateRange}>
            <ClockCircleOutlined /> {dayjs(goal.start_date).format("MM-DD")} ~{" "}
            {dayjs(goal.end_date).format("MM-DD")}
          </div>
        )}

        <div className={styles.goalMeta}>
          <span>创建于 {dayjs(goal.create_time).format("YYYY-MM-DD")}</span>
        </div>
      </Card>
    );
  },
);

export default GoalCard;
