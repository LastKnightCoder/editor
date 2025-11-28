import React, { memo, useState, useEffect } from "react";
import {
  Empty,
  Tree,
  Dropdown,
  Progress,
  Tooltip,
  Form,
  MenuProps,
  App,
} from "antd";
import type { DataNode } from "antd/es/tree";
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
import { IEditProgressFormValues } from "../types";
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
import useThemeColors from "@/hooks/useThemeColors";
import classNames from "classnames";

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
    const themeColors = useThemeColors();
    const [editProgressVisible, setEditProgressVisible] = useState(false);
    const [editingItem, setEditingItem] = useState<IGoalItemTree | null>(null);
    const [editingEntry, setEditingEntry] = useState<IGoalProgressEntry | null>(
      null,
    );
    const [editProgressForm] = Form.useForm<IEditProgressFormValues>();

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
      // 使用 CSS 变量以便支持主题色，或者返回 undefined 让 Progress 组件使用默认颜色（通常跟随文本颜色或主题色）
      // 但 Antd Progress strokeColor 需要具体颜色值。
      // 这里我们尽量使用主题色相关的颜色
      // 注意：这里返回的是 hex，无法直接用 tailwind 类。
      // 如果想跟随主题，可以使用 CSS 变量 var(--primary-color) 等，Antd 支持 var。
      switch (status) {
        case EGoalItemStatus.NotStarted:
          return "var(--text-secondary)"; // #adb5bd
        case EGoalItemStatus.InProgress:
          return "var(--text-primary)"; // #495057
        case EGoalItemStatus.Completed:
          return "var(--success-color)"; // #28a745
        case EGoalItemStatus.Abandoned:
          return "var(--error-color)"; // #dc3545
        default:
          return "var(--text-secondary)";
      }
    };

    const getTypeTag = (type: EGoalItemType) => {
      const typeConfig = {
        [EGoalItemType.BigGoal]: {
          label: "大目标",
          className: classNames(
            themeColors.tagBgClass,
            themeColors.tagTextClass,
          ),
          icon: <TbTargetArrow />,
        },
        [EGoalItemType.Milestone]: {
          label: "里程碑",
          className: classNames(
            themeColors.tagBgClass,
            themeColors.tagTextClass,
          ),
          icon: <TrophyOutlined />,
        },
        [EGoalItemType.Progress]: {
          label: "进度",
          className: classNames(
            themeColors.activeClass,
            themeColors.activeTextClass,
          ),
          icon: <CheckCircleOutlined />,
        },
      };

      const config = typeConfig[type];
      return (
        <div
          className={classNames(
            "flex items-center gap-1 px-2 py-0.5 rounded text-xs border-none",
            config.className,
          )}
        >
          <span className="text-sm flex items-center">{config.icon}</span>
          <span>{config.label}</span>
        </div>
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

    const handleEditProgressSubmit = (values: IEditProgressFormValues) => {
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

    const renderTreeNode = (item: IGoalItemTree, level = 0): DataNode => {
      const progress = calculateProgress(item);

      const children = [
        ...item.children.map((child) => renderTreeNode(child, level + 1)),
        ...(item.progress_entries || []).map((entry) => ({
          title: (
            <div
              className={classNames(
                "border rounded-lg p-4 px-5 w-full transition-all duration-200 border-l-4",
                themeColors.cardBgClass,
                themeColors.cardBorderClass,
                themeColors.hoverClass,
                themeColors.hoverBorderClass,
                // 使用 activeClass 的边框色作为左边框强调
                // 由于 border-l-4 优先级问题，可能需要内联样式或者更具体的类
                // 这里我们尝试使用 themeColors.activeTextClass 的颜色作为强调色，但这很难直接应用到 border-color
                // 暂时使用 inline style 配合 css variable 如果有，或者使用 themeColors 中定义的特定类
              )}
              style={{
                borderLeftColor: themeColors.timelineRingColor,
              }}
            >
              <div className="flex items-center gap-3">
                <ClockCircleOutlined
                  className={classNames(
                    "text-sm shrink-0",
                    themeColors.activeTextClass,
                  )}
                />
                <span
                  className={classNames(
                    "font-semibold text-sm flex-1 min-w-0 tracking-tight",
                    themeColors.textClass,
                  )}
                >
                  {entry.title || "进度记录"}
                  {entry.progress_delta && (
                    <span
                      className={classNames(
                        "font-semibold text-[13px] ml-1.5 py-0.5 px-1.5 rounded-md",
                        themeColors.activeClass,
                        themeColors.activeTextClass,
                      )}
                    >
                      (+{entry.progress_delta}
                      {item.unit ? ` ${item.unit}` : ""})
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={classNames(
                      "text-[11px] font-mono py-1 px-2 rounded-md font-medium",
                      themeColors.tagBgClass,
                      themeColors.tagTextClass,
                    )}
                  >
                    {dayjs(entry.create_time).format("MM-DD HH:mm")}
                  </span>
                  <Dropdown
                    menu={{ items: getProgressEntryMenuItems(entry, item) }}
                    trigger={["click"]}
                  >
                    <button
                      className={classNames(
                        "w-6 h-6 border-none rounded-md bg-transparent cursor-pointer flex items-center justify-center opacity-60 transition-all duration-200 hover:opacity-100",
                        themeColors.textClass,
                        themeColors.hoverClass,
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreOutlined />
                    </button>
                  </Dropdown>
                </div>
              </div>
              {entry.description && (
                <div
                  className={classNames(
                    "text-[13px] leading-relaxed ml-[26px] pt-2 border-t mt-2",
                    themeColors.textClass,
                    themeColors.borderClass,
                  )}
                >
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
            className={classNames(
              "flex items-center justify-between w-full min-h-[72px] py-6 px-7 rounded-xl transition-all duration-200 border mb-0 cursor-pointer",
              themeColors.cardBgClass,
              themeColors.cardBorderClass,
              themeColors.hoverClass,
              themeColors.hoverBorderClass,
            )}
            onClick={(e) => {
              e.stopPropagation();
              handleNodeClick(item);
            }}
          >
            <div className="flex-1 min-w-0 mr-6">
              <div className="flex items-center gap-3">
                <span
                  className={classNames(
                    "font-semibold text-base leading-normal tracking-tight",
                    themeColors.activeTextClass,
                  )}
                >
                  {item.title}
                  {item.type === EGoalItemType.Progress &&
                    item.target_value && (
                      <span
                        className={classNames(
                          "font-medium text-sm ml-2",
                          themeColors.textClass,
                        )}
                      >
                        ({item.current_value || 0}/{item.target_value}
                        {item.unit ? ` ${item.unit}` : ""})
                      </span>
                    )}
                </span>
                {getTypeTag(item.type)}
              </div>
              {item.description && (
                <div
                  className={classNames(
                    "text-sm leading-relaxed mt-1.5",
                    themeColors.textClass,
                  )}
                >
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
              className="flex items-center gap-4 shrink-0"
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
                <button
                  className={classNames(
                    "w-8 h-8 border-none rounded-md bg-transparent cursor-pointer flex items-center justify-center opacity-70 transition-all duration-200 hover:opacity-100",
                    themeColors.textClass,
                    themeColors.hoverClass,
                  )}
                >
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
        <div
          className={classNames(
            "flex-1 min-w-0 flex flex-col rounded-xl shadow-sm border overflow-hidden",
            themeColors.glassPanelBg,
            themeColors.cardBorderClass,
          )}
        >
          <div
            className={classNames(
              "flex flex-col justify-center items-center h-full gap-4",
              themeColors.textClass,
            )}
          >
            <Empty description="请选择一个目标查看详情" />
          </div>
        </div>
      );
    }

    return (
      <div
        className={classNames(
          "flex-1 min-w-0 flex flex-col rounded-xl shadow-sm border overflow-hidden",
          themeColors.glassPanelBg,
          themeColors.cardBorderClass,
        )}
      >
        <div
          className={classNames(
            "py-8 px-8 border-b flex items-start gap-5",
            themeColors.glassPanelBg,
            themeColors.borderClass,
          )}
        >
          <div className="flex-1">
            <h1
              className={classNames(
                "m-0 mb-3 text-[28px] font-bold tracking-tight leading-tight",
                themeColors.activeTextClass,
              )}
            >
              {selectedGoal.title}
            </h1>
            {selectedGoal.description && (
              <p
                className={classNames(
                  "m-0 mb-4 leading-relaxed text-base",
                  themeColors.textClass,
                )}
              >
                {selectedGoal.description}
              </p>
            )}
            {selectedGoal.start_date && selectedGoal.end_date && (
              <div
                className={classNames(
                  "text-sm flex items-center gap-2 py-2 px-3 rounded-md w-fit",
                  themeColors.tagBgClass,
                  themeColors.tagTextClass,
                )}
              >
                <ClockCircleOutlined />
                {dayjs(selectedGoal.start_date).format("YYYY-MM-DD")} ~{" "}
                {dayjs(selectedGoal.end_date).format("YYYY-MM-DD")}
              </div>
            )}
          </div>
          <button
            className={classNames(
              "inline-flex items-center justify-center gap-2 px-[18px] h-10 border-none rounded-lg text-sm font-semibold cursor-pointer transition-all duration-200 outline-none shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0",
              themeColors.buttonBg,
              themeColors.buttonTextClass,
            )}
            onClick={onAddRootItem}
          >
            <IoAdd size={18} />
            添加目标
          </button>
        </div>

        <div
          className={classNames(
            "flex-1 p-10 overflow-y-auto",
            // 移除硬编码背景，使用透明以便继承外层的 glassPanelBg 或 main-bg
            "bg-transparent",
          )}
        >
          {detailLoading ? (
            <div
              className={classNames(
                "flex justify-center items-center h-[200px] text-base",
                themeColors.textClass,
              )}
            >
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
