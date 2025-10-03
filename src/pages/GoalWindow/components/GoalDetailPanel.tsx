import React, { memo, useState, useEffect } from "react";
import { Empty, Tree, Dropdown, Progress, Tag, Tooltip, Form } from "antd";
import { ClockCircleOutlined, MoreOutlined } from "@ant-design/icons";
import { TbTargetArrow } from "react-icons/tb";
import { TrophyOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { IoAdd } from "react-icons/io5";
import dayjs from "dayjs";
import classnames from "classnames";

import {
  IGoalWithItems,
  IGoalItemTree,
  EGoalItemType,
  EGoalItemStatus,
  IGoalProgressEntry,
} from "@/types";
import { EditProgressModal } from "./modals";
import styles from "../index.module.less";

interface GoalDetailPanelProps {
  selectedGoal: IGoalWithItems | null;
  detailLoading: boolean;
  onAddRootItem: () => void;
  onToggleMilestone: (item: IGoalItemTree) => void;
  onAddChild: (parentId: number) => void;
  onAddProgress: (itemId: number, itemType: EGoalItemType) => void;
  onDeleteItem: (itemId: number) => void;
  onUpdateProgressEntry?: (
    entryId: number,
    newProgressDelta: number,
    oldProgressDelta: number | null,
    goalItemId: number,
  ) => void;
  onDeleteProgressEntry?: (
    entryId: number,
    progressDelta: number | null,
    goalItemId: number,
  ) => void;
}

const GoalDetailPanel = memo(
  ({
    selectedGoal,
    detailLoading,
    onAddRootItem,
    onToggleMilestone,
    onAddChild,
    onAddProgress,
    onDeleteItem,
    onUpdateProgressEntry,
    onDeleteProgressEntry,
  }: GoalDetailPanelProps) => {
    const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
    const [editProgressVisible, setEditProgressVisible] = useState(false);
    const [editingItem, setEditingItem] = useState<IGoalItemTree | null>(null);
    const [editingEntry, setEditingEntry] = useState<IGoalProgressEntry | null>(
      null,
    );
    const [editProgressForm] = Form.useForm();

    const calculateProgress = (item: IGoalItemTree): number => {
      const progress = Math.min(
        100,
        ((item.current_value || 0) / (item.target_value || 0)) * 100,
      );
      const childProgress = item.children.map(calculateProgress);

      switch (item.type) {
        case EGoalItemType.Milestone:
          return item.status === EGoalItemStatus.Completed ? 100 : 0;
        case EGoalItemType.Progress:
          return progress;
        case EGoalItemType.BigGoal:
          if (item.children.length === 0) return 0;
          return (
            childProgress.reduce((acc, curr) => acc + curr, 0) /
            childProgress.length
          );
        default:
          return 0;
      }
    };

    const getStatusColor = (status: EGoalItemStatus) => {
      switch (status) {
        case EGoalItemStatus.NotStarted:
          return "#adb5bd";
        case EGoalItemStatus.InProgress:
          return "#495057";
        case EGoalItemStatus.Completed:
          return "#28a745";
        case EGoalItemStatus.Abandoned:
          return "#dc3545";
        default:
          return "#adb5bd";
      }
    };

    const getTypeTag = (type: EGoalItemType) => {
      const typeConfig = {
        [EGoalItemType.BigGoal]: {
          label: "大目标",
          color: "blue",
          icon: <TbTargetArrow />,
        },
        [EGoalItemType.Milestone]: {
          label: "里程碑",
          color: "purple",
          icon: <TrophyOutlined />,
        },
        [EGoalItemType.Progress]: {
          label: "进度",
          color: "green",
          icon: <CheckCircleOutlined />,
        },
      };

      const config = typeConfig[type];
      return (
        <Tag
          color={config.color}
          icon={config.icon}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {config.label}
        </Tag>
      );
    };

    const handleEditProgressEntry = (
      entry: IGoalProgressEntry,
      parentItem: IGoalItemTree,
    ) => {
      setEditingEntry(entry);
      setEditingItem(parentItem);
      setEditProgressVisible(true);
      editProgressForm.setFieldsValue({
        current_value: entry.progress_delta || 0,
      });
    };

    const handleEditProgressSubmit = (values: any) => {
      if (editingEntry && editingItem && onUpdateProgressEntry) {
        onUpdateProgressEntry(
          editingEntry.id,
          values.current_value,
          editingEntry.progress_delta || null,
          editingItem.id,
        );
        setEditProgressVisible(false);
        setEditingEntry(null);
        setEditingItem(null);
        editProgressForm.resetFields();
      }
    };

    const handleEditProgressCancel = () => {
      setEditProgressVisible(false);
      setEditingEntry(null);
      setEditingItem(null);
      editProgressForm.resetFields();
    };

    const handleNodeClick = (item: IGoalItemTree) => {
      if (item.type === EGoalItemType.BigGoal) {
        const isExpanded = expandedKeys.includes(item.id);
        if (isExpanded) {
          setExpandedKeys((prev) => prev.filter((key) => key !== item.id));
        } else {
          setExpandedKeys((prev) => [...prev, item.id]);
        }
      }
    };

    const getMenuItems = (item: IGoalItemTree) => {
      const baseItems = [
        {
          key: "delete",
          label: "删除",
          danger: true,
          onClick: () => onDeleteItem(item.id),
        },
      ];

      if (item.type === EGoalItemType.BigGoal) {
        return [
          {
            key: "addChild",
            label: "添加子目标",
            onClick: () => onAddChild(item.id),
          },
          ...baseItems,
        ];
      } else if (item.type === EGoalItemType.Milestone) {
        return [
          {
            key: "addProgress",
            label: "添加进度",
            onClick: () => onAddProgress(item.id, item.type),
          },
          {
            key: "toggleStatus",
            label:
              item.status === EGoalItemStatus.Completed
                ? "标记为进行中"
                : "标记为完成",
            onClick: () => onToggleMilestone(item),
          },
          ...baseItems,
        ];
      } else if (item.type === EGoalItemType.Progress) {
        return [
          {
            key: "addProgress",
            label: "添加进度",
            onClick: () => onAddProgress(item.id, item.type),
          },
          ...baseItems,
        ];
      }

      return baseItems;
    };

    const getProgressEntryMenuItems = (
      entry: IGoalProgressEntry,
      parentItem: IGoalItemTree,
    ) => {
      return [
        {
          key: "editEntry",
          label: "编辑进度",
          onClick: () => handleEditProgressEntry(entry, parentItem),
        },
        {
          key: "deleteEntry",
          label: "删除记录",
          danger: true,
          onClick: () => {
            if (onDeleteProgressEntry) {
              onDeleteProgressEntry(
                entry.id,
                entry.progress_delta || null,
                parentItem.id,
              );
            }
          },
        },
      ];
    };

    const renderTreeNode = (item: IGoalItemTree, level = 0): any => {
      const progress = calculateProgress(item);

      const children = [
        ...item.children.map((child) => renderTreeNode(child, level + 1)),
        ...(item.progress_entries || []).map((entry) => ({
          title: (
            <div className={styles.progressEntry}>
              <div className={styles.entryHeader}>
                <ClockCircleOutlined className={styles.timeIcon} />
                <span className={styles.entryTitle}>
                  {entry.title || "进度记录"}
                  {entry.progress_delta && (
                    <span className={styles.entryProgressDelta}>
                      (+{entry.progress_delta}
                      {item.unit ? ` ${item.unit}` : ""})
                    </span>
                  )}
                </span>
                <div className={styles.entryActions}>
                  <span className={styles.entryTime}>
                    {dayjs(entry.create_time).format("MM-DD HH:mm")}
                  </span>
                  <Dropdown
                    menu={{ items: getProgressEntryMenuItems(entry, item) }}
                    trigger={["click"]}
                  >
                    <button
                      className={styles.entryMenuButton}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreOutlined />
                    </button>
                  </Dropdown>
                </div>
              </div>
              {entry.description && (
                <div className={styles.entryDescription}>
                  {entry.description}
                </div>
              )}
            </div>
          ),
          key: `entry_${entry.id}`,
          isLeaf: true,
          className: styles.progressEntryNode,
        })),
      ];

      return {
        title: (
          <div
            className={classnames(styles.treeNodeContent, {
              [styles.bigGoal]: item.type === EGoalItemType.BigGoal,
            })}
            onClick={(e) => {
              e.stopPropagation();
              handleNodeClick(item);
            }}
          >
            <div className={styles.nodeInfo}>
              <div className={styles.nodeTitleRow}>
                <span className={styles.nodeTitle}>
                  {item.title}
                  {item.type === EGoalItemType.Progress &&
                    item.target_value && (
                      <span className={styles.progressText}>
                        ({item.current_value || 0}/{item.target_value}
                        {item.unit ? ` ${item.unit}` : ""})
                      </span>
                    )}
                </span>
                {getTypeTag(item.type)}
              </div>
              {item.description && (
                <div className={styles.nodeDescription}>{item.description}</div>
              )}
            </div>
            <div
              className={styles.nodeActions}
              onClick={(e) => e.stopPropagation()}
            >
              <Tooltip title={`进度: ${progress.toFixed(1)}%`}>
                <div className={styles.progressBar}>
                  <Progress
                    percent={progress}
                    size="small"
                    strokeColor={getStatusColor(item.status)}
                    showInfo={false}
                  />
                </div>
              </Tooltip>
              <Dropdown
                menu={{ items: getMenuItems(item) }}
                trigger={["click"]}
              >
                <button>
                  <MoreOutlined />
                </button>
              </Dropdown>
            </div>
          </div>
        ),
        key: item.id,
        children: children.length > 0 ? children : undefined,
      };
    };

    // 初始化展开所有有子项的节点
    useEffect(() => {
      if (selectedGoal && selectedGoal.items.length > 0) {
        const getAllKeys = (items: IGoalItemTree[]): React.Key[] => {
          const keys: React.Key[] = [];
          items.forEach((item) => {
            // 如果有子项或有进度记录，就展开这个节点
            if (
              item.children.length > 0 ||
              (item.progress_entries && item.progress_entries.length > 0)
            ) {
              keys.push(item.id);
              console.log(
                `展开节点: ${item.title} (有 ${item.children.length} 个子目标和 ${item.progress_entries?.length || 0} 个进度记录)`,
              );
            }
            // 递归处理子项
            if (item.children && item.children.length > 0) {
              keys.push(...getAllKeys(item.children));
            }
          });
          return keys;
        };
        const allKeys = getAllKeys(selectedGoal.items);
        console.log("设置展开的节点 keys:", allKeys);
        setExpandedKeys(allKeys);
      }
    }, [selectedGoal]);

    if (!selectedGoal) {
      return (
        <div className={styles.rightPanel}>
          <div className={styles.emptyDetail}>
            <Empty description="请选择一个目标查看详情" />
          </div>
        </div>
      );
    }

    return (
      <div className={styles.rightPanel}>
        <div className={styles.detailHeader}>
          <div className={styles.goalInfo}>
            <h1>{selectedGoal.title}</h1>
            {selectedGoal.description && (
              <p className={styles.goalDescription}>
                {selectedGoal.description}
              </p>
            )}
            {selectedGoal.start_date && selectedGoal.end_date && (
              <div className={styles.dateRange}>
                <ClockCircleOutlined />
                {dayjs(selectedGoal.start_date).format("YYYY-MM-DD")} ~{" "}
                {dayjs(selectedGoal.end_date).format("YYYY-MM-DD")}
              </div>
            )}
          </div>
          <button
            className={`${styles.customButton} ${styles.primary} ${styles.large}`}
            onClick={onAddRootItem}
          >
            <IoAdd size={18} />
            添加子目标
          </button>
        </div>

        <div className={styles.detailContent}>
          {detailLoading ? (
            <div className={styles.loading}>加载中...</div>
          ) : selectedGoal.items.length === 0 ? (
            <Empty description="还没有子目标，点击上方按钮添加第一个子目标" />
          ) : (
            <Tree
              treeData={selectedGoal.items.map((item) =>
                renderTreeNode(item, 0),
              )}
              expandedKeys={expandedKeys}
              onExpand={setExpandedKeys}
              className={styles.goalTree}
            />
          )}
        </div>

        <EditProgressModal
          visible={editProgressVisible}
          unit={editingItem?.unit}
          onCancel={handleEditProgressCancel}
          onSubmit={handleEditProgressSubmit}
          form={editProgressForm}
        />
      </div>
    );
  },
);

export default GoalDetailPanel;
