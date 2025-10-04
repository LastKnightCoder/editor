import { memo } from "react";
import { Empty } from "antd";
import { IoChevronDown, IoChevronForward, IoAdd } from "react-icons/io5";

import { IGoal, EGoalStatus } from "@/types";
import GoalCard from "./GoalCard";
import styles from "../index.module.less";

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
  onNoteChange?: () => void; // 笔记变化回调
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
    onNoteChange,
  }: GoalSectionProps) => {
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
      <div className={styles.goalSection}>
        <div className={styles.sectionHeader} onClick={onToggleCollapse}>
          <span className={styles.sectionTitle}>{getSectionTitle()}</span>
          <span className={styles.sectionArrow}>
            {isCollapsed ? <IoChevronForward /> : <IoChevronDown />}
          </span>
        </div>

        {!isCollapsed && status === EGoalStatus.InProgress && onCreateGoal && (
          <div className={styles.sectionActions}>
            <button className={styles.addGoalButton} onClick={onCreateGoal}>
              <IoAdd size={18} />
              新建目标
            </button>
          </div>
        )}

        {!isCollapsed && (
          <div className={styles.goalList}>
            {loading ? (
              <div className={styles.loading}>加载中...</div>
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
                  onNoteChange={onNoteChange}
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
