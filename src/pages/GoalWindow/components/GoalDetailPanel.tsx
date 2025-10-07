import React, { memo, useState, useEffect } from "react";
import {
  Empty,
  Tree,
  Dropdown,
  Progress,
  Tag,
  Tooltip,
  Form,
  MenuProps,
  App,
} from "antd";
import { ClockCircleOutlined, MoreOutlined } from "@ant-design/icons";
import { TbTargetArrow } from "react-icons/tb";
import { TrophyOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { IoAdd } from "react-icons/io5";
import dayjs from "dayjs";

import {
  IGoalWithItems,
  IGoalItemTree,
  EGoalItemType,
  EGoalItemStatus,
  IGoalProgressEntry,
  IGoalNoteLink,
} from "@/types";
import {
  createAndAttachGoalNote,
  attachExistingGoalNote,
  listGoalNotes,
  updateGoalNoteTitle,
} from "@/commands/goal-note";
import { updateGoalNoteType } from "@/commands/goal-note";
import { EditProgressModal } from "./modals";
import GoalItemNotes from "./GoalItemNotes";
import ProgressEntryNotes from "./ProgressEntryNotes";
import { useMemoizedFn } from "ahooks";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import RichTextEditModal from "@/components/RichTextEditModal";
import { IndexType, SearchResult } from "@/types";
import { getEditorText } from "@/utils";
import styles from "./GoalDetailPanel.module.less";

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

const selectNotes = [
  "card",
  "article",
  "project-item",
  "document-item",
] satisfies IndexType[];

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

    const { message } = App.useApp();
    const [selectorModalVisible, setSelectorModalVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [linkedNotes, setLinkedNotes] = useState<IGoalNoteLink[]>([]);
    const [currentGoalId, setCurrentGoalId] = useState<number | null>(null);
    const [currentEditingContentId, setCurrentEditingContentId] = useState<
      number | null
    >(null);
    const [currentEditingTitle, setCurrentEditingTitle] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);

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
      const isExpanded = expandedKeys.includes(item.id);
      if (isExpanded) {
        setExpandedKeys((prev) => prev.filter((key) => key !== item.id));
      } else {
        setExpandedKeys((prev) => [...prev, item.id]);
      }
    };

    // 加载关联的笔记（用于检查重复）
    const loadLinkedNotes = useMemoizedFn(async (goalId: number) => {
      try {
        const notes = await listGoalNotes(goalId);
        setLinkedNotes(notes);
      } catch (error) {
        console.error("加载关联笔记失败:", error);
      }
    });

    // 创建新笔记
    const handleCreateNote = useMemoizedFn(async (goalId: number) => {
      try {
        const result = await createAndAttachGoalNote(goalId, "未命名文档");
        setCurrentGoalId(goalId);
        setCurrentEditingContentId(result.contentId);
        setCurrentEditingTitle("未命名文档");
        setEditModalVisible(true);
        // 加载笔记列表，以便后续编辑时能找到笔记
        await loadLinkedNotes(goalId);
      } catch (error) {
        console.error("创建笔记失败:", error);
        message.error("创建笔记失败");
      }
    });

    // 关联现有笔记
    const handleLinkNote = useMemoizedFn((goalId: number) => {
      setCurrentGoalId(goalId);
      loadLinkedNotes(goalId);
      setSelectorModalVisible(true);
    });

    // 选择笔记进行关联
    const handleSelectNote = useMemoizedFn(
      async (items: SearchResult | SearchResult[]) => {
        const item = Array.isArray(items) ? items[0] : items;
        if (!item) return;

        const goalId = currentGoalId;
        if (!goalId) return;

        // 检查是否已经关联
        const exists = linkedNotes.some(
          (note) => note.contentId === item.contentId,
        );
        if (exists) {
          message.warning("该笔记已经关联");
          return;
        }

        try {
          await attachExistingGoalNote({
            goalId,
            contentId: item.contentId,
            title:
              item.title || getEditorText(item.content, 10) || "未命名文档",
            type: item.type as string,
          });

          message.success("笔记关联成功");
          setSelectorModalVisible(false);
          // 触发刷新
          setRefreshKey((prev) => prev + 1);
        } catch (error) {
          console.error("关联笔记失败:", error);
          message.error("关联笔记失败");
        }
      },
    );

    // 编辑笔记标题
    const handleEditSave = useMemoizedFn(async (title: string) => {
      if (!currentEditingContentId || !currentGoalId) return;

      try {
        const note = linkedNotes.find(
          (n) => n.contentId === currentEditingContentId,
        );
        if (note) {
          await updateGoalNoteTitle(note.id, title || note.title || "");
        }
      } catch (error) {
        console.error("更新笔记标题失败:", error);
        message.error("更新笔记标题失败");
      }
    });

    // 编辑笔记类型
    const handleTypeChange = useMemoizedFn(async (type: string) => {
      if (!currentEditingContentId || !currentGoalId) return;

      try {
        const note = linkedNotes.find(
          (n) => n.contentId === currentEditingContentId,
        );
        if (note) {
          await updateGoalNoteType(note.id, type);
        }
      } catch (error) {
        console.error("更新笔记类型失败:", error);
        message.error("更新笔记类型失败");
      }
    });

    // 关闭编辑模态框
    const onCloseEditModal = useMemoizedFn(async () => {
      setEditModalVisible(false);
      setCurrentEditingContentId(null);
      setCurrentEditingTitle("");
      // 触发刷新
      setRefreshKey((prev) => prev + 1);
    });

    const getMenuItems = useMemoizedFn((item: IGoalItemTree) => {
      const baseItems: MenuProps["items"] = [
        {
          key: "createNote",
          label: "新建笔记",
          onClick: () => handleCreateNote(item.id),
        },
        {
          key: "linkNote",
          label: "关联笔记",
          onClick: () => handleLinkNote(item.id),
        },
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
    });

    const getProgressEntryMenuItems = useMemoizedFn(
      (entry: IGoalProgressEntry, parentItem: IGoalItemTree) => {
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
      },
    );

    const renderTreeNode = (item: IGoalItemTree, level = 0): any => {
      const progress = calculateProgress(item);

      const children = [
        ...item.children.map((child) => renderTreeNode(child, level + 1)),
        ...(item.progress_entries || []).map((entry) => ({
          title: (
            <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg p-4 px-5 w-full transition-all duration-200 border-l-4 border-l-green-500 hover:border-gray-300 dark:hover:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-900/50">
              <div className="flex items-center gap-3">
                <ClockCircleOutlined className="text-green-500 text-sm flex-shrink-0" />
                <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm flex-1 min-w-0 tracking-tight">
                  {entry.title || "进度记录"}
                  {entry.progress_delta && (
                    <span className="text-green-600 dark:text-green-500 font-semibold text-[13px] ml-1.5 bg-green-50 dark:bg-green-900/20 py-0.5 px-1.5 rounded-md">
                      (+{entry.progress_delta}
                      {item.unit ? ` ${item.unit}` : ""})
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-gray-500 dark:text-gray-500 text-[11px] font-mono bg-gray-100 dark:bg-zinc-800 py-1 px-2 rounded-md font-medium">
                    {dayjs(entry.create_time).format("MM-DD HH:mm")}
                  </span>
                  <Dropdown
                    menu={{ items: getProgressEntryMenuItems(entry, item) }}
                    trigger={["click"]}
                  >
                    <button
                      className="w-6 h-6 border-none rounded-md bg-transparent text-gray-400 dark:text-gray-500 cursor-pointer flex items-center justify-center opacity-60 transition-all duration-200 hover:opacity-100 hover:bg-gray-200 dark:hover:bg-zinc-700 hover:text-gray-900 dark:hover:text-gray-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreOutlined />
                    </button>
                  </Dropdown>
                </div>
              </div>
              {entry.description && (
                <div className="text-gray-600 dark:text-gray-400 text-[13px] leading-relaxed ml-[26px] pt-2 border-t border-gray-100 dark:border-zinc-800 mt-2">
                  {entry.description}
                </div>
              )}
              <div className="mt-3">
                <ProgressEntryNotes
                  goalProgressEntryId={entry.id}
                  readonly={false}
                  className="border-0 shadow-none"
                />
              </div>
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
            className="flex items-center justify-between w-full min-h-[72px] py-6 px-7 rounded-xl transition-all duration-200 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 mb-0 cursor-pointer hover:border-gray-300 dark:hover:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-900/50"
            onClick={(e) => {
              e.stopPropagation();
              handleNodeClick(item);
            }}
          >
            <div className="flex-1 min-w-0 mr-6">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-gray-900 dark:text-gray-100 text-base leading-normal tracking-tight">
                  {item.title}
                  {item.type === EGoalItemType.Progress &&
                    item.target_value && (
                      <span className="text-gray-600 dark:text-gray-400 font-medium text-sm ml-2">
                        ({item.current_value || 0}/{item.target_value}
                        {item.unit ? ` ${item.unit}` : ""})
                      </span>
                    )}
                </span>
                {getTypeTag(item.type)}
              </div>
              {item.description && (
                <div className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mt-1.5">
                  {item.description}
                </div>
              )}
              <div className="mt-3">
                <GoalItemNotes
                  key={`goal-notes-${item.id}-${refreshKey}`}
                  goalId={item.id}
                  readonly={false}
                  className="border-0 shadow-none"
                />
              </div>
            </div>
            <div
              className="flex items-center gap-4 flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <Tooltip title={`进度: ${progress.toFixed(1)}%`}>
                <div className="w-[120px]">
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
                <button className="w-8 h-8 border-none rounded-md bg-transparent text-gray-600 dark:text-gray-400 cursor-pointer flex items-center justify-center opacity-70 transition-all duration-200 hover:opacity-100 hover:bg-gray-200 dark:hover:bg-zinc-700 hover:text-gray-900 dark:hover:text-gray-100">
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
        setExpandedKeys(allKeys);
      }
    }, [selectedGoal]);

    if (!selectedGoal) {
      return (
        <div className="flex-1 min-w-0 flex flex-col bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 overflow-hidden">
          <div className="flex flex-col justify-center items-center h-full text-gray-600 dark:text-gray-400 gap-4">
            <Empty description="请选择一个目标查看详情" />
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 min-w-0 flex flex-col bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 overflow-hidden">
        <div className="py-8 px-8 border-b border-gray-100 dark:border-zinc-800 flex items-start gap-5 bg-white dark:bg-zinc-900">
          <div className="flex-1">
            <h1 className="m-0 mb-3 text-gray-900 dark:text-gray-100 text-[28px] font-bold tracking-tight leading-tight">
              {selectedGoal.title}
            </h1>
            {selectedGoal.description && (
              <p className="m-0 mb-4 text-gray-600 dark:text-gray-400 leading-relaxed text-base">
                {selectedGoal.description}
              </p>
            )}
            {selectedGoal.start_date && selectedGoal.end_date && (
              <div className="text-gray-500 dark:text-gray-500 text-sm flex items-center gap-2 bg-gray-100 dark:bg-zinc-800 py-2 px-3 rounded-md w-fit">
                <ClockCircleOutlined />
                {dayjs(selectedGoal.start_date).format("YYYY-MM-DD")} ~{" "}
                {dayjs(selectedGoal.end_date).format("YYYY-MM-DD")}
              </div>
            )}
          </div>
          <button
            className="inline-flex items-center justify-center gap-2 px-[18px] h-10 border-none rounded-lg bg-gradient-to-br from-indigo-500/60 to-purple-600/60 hover:from-indigo-600/70 hover:to-purple-700/70 text-white text-sm font-semibold cursor-pointer transition-all duration-200 outline-none"
            onClick={onAddRootItem}
          >
            <IoAdd size={18} />
            添加目标
          </button>
        </div>

        <div className="flex-1 p-10 overflow-y-auto bg-gray-50 dark:bg-zinc-950">
          {detailLoading ? (
            <div className="flex justify-center items-center h-[200px] text-gray-600 dark:text-gray-400 text-base">
              加载中...
            </div>
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
        <ContentSelectorModal
          open={selectorModalVisible}
          onCancel={() => setSelectorModalVisible(false)}
          onSelect={handleSelectNote}
          contentType={selectNotes}
          extensions={[]}
          title="选择要关联的笔记"
          emptyDescription="未找到相关笔记"
          multiple={false}
          excludeContentIds={linkedNotes.map((note) => note.contentId)}
        />
        {currentEditingContentId && (
          <RichTextEditModal
            visible={editModalVisible}
            contentId={currentEditingContentId}
            title={currentEditingTitle}
            onClose={onCloseEditModal}
            onTitleChange={handleEditSave}
            onTypeChange={handleTypeChange}
          />
        )}
      </div>
    );
  },
);

export default GoalDetailPanel;
