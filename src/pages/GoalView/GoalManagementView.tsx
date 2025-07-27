import { memo, useState, useEffect } from "react";
import classnames from "classnames";
import {
  App,
  Button,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  message,
  Tree,
  Progress,
  Dropdown,
  DatePicker,
  Card,
  Tag,
  Tooltip,
  Empty,
} from "antd";
import {
  PlusOutlined,
  MoreOutlined,
  ClockCircleOutlined,
  TrophyOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import { TbTargetArrow } from "react-icons/tb";
import dayjs from "dayjs";

import {
  IGoal,
  IGoalWithItems,
  IGoalItemTree,
  EGoalStatus,
  EGoalItemType,
  EGoalItemStatus,
  ICreateGoal,
  ICreateGoalItem,
  ICreateGoalProgressEntry,
} from "@/types";
import {
  getAllGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  getGoalWithItems,
  createGoalItem,
  updateGoalItem,
  deleteGoalItem,
  createGoalProgressEntry,
  updateGoalItemProgress,
} from "@/commands";
import styles from "./index.module.less";
import { useMemoizedFn } from "ahooks";

const { TextArea } = Input;
const { RangePicker } = DatePicker;
const { Option } = Select;

const GoalManagementView = memo(() => {
  const { modal } = App.useApp();

  const [goals, setGoals] = useState<IGoal[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<IGoalWithItems | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const [createGoalModalVisible, setCreateGoalModalVisible] = useState(false);
  const [editGoalModalVisible, setEditGoalModalVisible] = useState(false);
  const [createItemModalVisible, setCreateItemModalVisible] = useState(false);
  const [progressModalVisible, setProgressModalVisible] = useState(false);

  const [goalForm] = Form.useForm();
  const [editGoalForm] = Form.useForm();
  const [itemForm] = Form.useForm();
  const [progressForm] = Form.useForm();
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [selectedItemType, setSelectedItemType] =
    useState<EGoalItemType | null>(null);
  const [editingGoal, setEditingGoal] = useState<IGoal | null>(null);

  const [collapsedSections, setCollapsedSections] = useState({
    [EGoalStatus.InProgress]: false,
    [EGoalStatus.Completed]: true,
    [EGoalStatus.Abandoned]: true,
  });

  const loadGoals = useMemoizedFn(async () => {
    setLoading(true);
    try {
      const data = await getAllGoals();
      setGoals(data);
    } catch (error) {
      console.error("Failed to load goals:", error);
      message.error("加载目标失败");
    } finally {
      setLoading(false);
    }
  });

  const loadGoalDetail = useMemoizedFn(async (goalId: number) => {
    setDetailLoading(true);
    try {
      const data = await getGoalWithItems(goalId);
      setSelectedGoal(data);
    } catch (error) {
      console.error("Failed to load goal detail:", error);
      message.error("加载目标详情失败");
    } finally {
      setDetailLoading(false);
    }
  });

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

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
        if (progress >= 100 && item.status !== EGoalItemStatus.Completed) {
          updateGoalItem({ id: item.id, status: EGoalItemStatus.Completed });
        }
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
        return "#d9d9d9";
      case EGoalItemStatus.InProgress:
        return "#1890ff";
      case EGoalItemStatus.Completed:
        return "#52c41a";
      case EGoalItemStatus.Abandoned:
        return "#ff4d4f";
      default:
        return "#d9d9d9";
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
      <Tag color={config.color} icon={config.icon}>
        {config.label}
      </Tag>
    );
  };

  const handleGoalSelect = (goal: IGoal) => {
    if (selectedGoal?.id !== goal.id) {
      loadGoalDetail(goal.id);
    }
  };

  const handleCreateGoal = async (values: any) => {
    try {
      const goalData: ICreateGoal = {
        title: values.title,
        description: values.description,
        start_date: values.dateRange?.[0]?.valueOf(),
        end_date: values.dateRange?.[1]?.valueOf(),
        status: EGoalStatus.InProgress,
      };

      const newGoal = await createGoal(goalData);
      message.success("目标创建成功");
      setCreateGoalModalVisible(false);
      goalForm.resetFields();
      await loadGoals();
      handleGoalSelect(newGoal);
    } catch (error) {
      console.error("Failed to create goal:", error);
      message.error("创建目标失败");
    }
  };

  const handleEditGoal = (goal: IGoal) => {
    setEditingGoal(goal);
    editGoalForm.setFieldsValue({
      title: goal.title,
      description: goal.description,
      dateRange:
        goal.start_date && goal.end_date
          ? [dayjs(goal.start_date), dayjs(goal.end_date)]
          : null,
    });
    setEditGoalModalVisible(true);
  };

  const handleUpdateGoal = async (values: any) => {
    if (!editingGoal) return;

    try {
      await updateGoal({
        id: editingGoal.id,
        title: values.title,
        description: values.description,
        start_date: values.dateRange?.[0]?.valueOf(),
        end_date: values.dateRange?.[1]?.valueOf(),
      });
      message.success("目标更新成功");
      setEditGoalModalVisible(false);
      editGoalForm.resetFields();
      setEditingGoal(null);
      await loadGoals();
      if (selectedGoal?.id === editingGoal.id) {
        loadGoalDetail(editingGoal.id);
      }
    } catch (error) {
      console.error("Failed to update goal:", error);
      message.error("更新目标失败");
    }
  };

  const handleDeleteGoal = (goal: IGoal) => {
    modal.confirm({
      title: "确认删除目标",
      content: `删除目标"${goal.title}"将同时删除其所有子目标和进度记录，此操作无法撤销。`,
      okText: "确认删除",
      cancelText: "取消",
      okType: "danger",
      onOk: async () => {
        try {
          await deleteGoal(goal.id);
          message.success("目标删除成功");
          if (selectedGoal?.id === goal.id) {
            setSelectedGoal(null);
          }
          await loadGoals();
        } catch (error) {
          console.error("Failed to delete goal:", error);
          message.error("删除目标失败");
        }
      },
    });
  };

  const handleUpdateGoalStatus = (goal: IGoal, newStatus: EGoalStatus) => {
    modal.confirm({
      title: "确认状态更改",
      content: `确认将目标"${goal.title}"标记为${
        newStatus === EGoalStatus.Completed ? "已完成" : "已放弃"
      }？`,
      okText: "确认",
      cancelText: "取消",
      onOk: async () => {
        try {
          await updateGoal({ id: goal.id, status: newStatus });
          message.success("状态更新成功");
          await loadGoals();
          if (selectedGoal?.id === goal.id) {
            loadGoalDetail(goal.id);
          }
        } catch (error) {
          console.error("Failed to update goal status:", error);
          message.error("状态更新失败");
        }
      },
    });
  };

  const handleCreateItem = async (values: any) => {
    if (!selectedGoal) return;

    try {
      const itemData: ICreateGoalItem = {
        goal_id: selectedGoal.id,
        parent_id: selectedParentId || undefined,
        title: values.title,
        description: values.description,
        type: values.type,
        status: EGoalItemStatus.NotStarted,
        target_value: values.target_value,
        unit: values.unit,
        sort_order: 0,
      };

      await createGoalItem(itemData);
      message.success("子目标创建成功");
      setCreateItemModalVisible(false);
      itemForm.resetFields();
      setSelectedParentId(null);
      loadGoalDetail(selectedGoal.id);
    } catch (error) {
      console.error("Failed to create goal item:", error);
      message.error("创建子目标失败");
    }
  };

  const handleAddProgress = async (values: any) => {
    if (!selectedItemId) return;

    try {
      const entryData: ICreateGoalProgressEntry = {
        goal_item_id: selectedItemId,
        title: values.title,
        description: values.description,
        progress_delta: values.progress_delta,
      };

      await createGoalProgressEntry(entryData);

      if (
        values.progress_delta &&
        selectedItemType === EGoalItemType.Progress
      ) {
        await updateGoalItemProgress(selectedItemId, values.progress_delta);
      }

      message.success("进度记录添加成功");
      setProgressModalVisible(false);
      progressForm.resetFields();
      setSelectedItemId(null);
      setSelectedItemType(null);
      loadGoalDetail(selectedGoal!.id);
    } catch (error) {
      console.error("Failed to add progress:", error);
      message.error("添加进度记录失败");
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    modal.confirm({
      title: "确认删除",
      content: "删除子目标将同时删除其所有子项和进度记录，此操作无法撤销。",
      okText: "确认",
      cancelText: "取消",
      onOk: async () => {
        try {
          await deleteGoalItem(itemId);
          message.success("子目标删除成功");
          loadGoalDetail(selectedGoal!.id);
        } catch (error) {
          console.error("Failed to delete goal item:", error);
          message.error("删除子目标失败");
        }
      },
    });
  };

  const handleToggleMilestone = async (item: IGoalItemTree) => {
    if (item.type !== EGoalItemType.Milestone) return;

    const newStatus =
      item.status === EGoalItemStatus.Completed
        ? EGoalItemStatus.InProgress
        : EGoalItemStatus.Completed;

    try {
      await updateGoalItem({ id: item.id, status: newStatus });
      message.success("状态更新成功");
      loadGoalDetail(selectedGoal!.id);
    } catch (error) {
      console.error("Failed to update item status:", error);
      message.error("更新状态失败");
    }
  };

  const renderTreeNode = (item: IGoalItemTree): any => {
    const progress = calculateProgress(item);

    const getMenuItems = () => {
      const baseItems = [
        {
          key: "delete",
          label: "删除",
          danger: true,
          onClick: () => handleDeleteItem(item.id),
        },
      ];

      if (item.type === EGoalItemType.BigGoal) {
        return [
          {
            key: "addChild",
            label: "添加子目标",
            onClick: () => {
              setSelectedParentId(item.id);
              setCreateItemModalVisible(true);
            },
          },
          ...baseItems,
        ];
      } else if (item.type === EGoalItemType.Milestone) {
        return [
          {
            key: "addProgress",
            label: "添加进度记录",
            onClick: () => {
              setSelectedItemId(item.id);
              setSelectedItemType(item.type);
              setProgressModalVisible(true);
            },
          },
          {
            key: "toggleStatus",
            label:
              item.status === EGoalItemStatus.Completed
                ? "标记为进行中"
                : "标记为完成",
            onClick: () => handleToggleMilestone(item),
          },
          ...baseItems,
        ];
      } else if (item.type === EGoalItemType.Progress) {
        return [
          {
            key: "addProgress",
            label: "添加进度",
            onClick: () => {
              setSelectedItemId(item.id);
              setSelectedItemType(item.type);
              setProgressModalVisible(true);
            },
          },
          ...baseItems,
        ];
      }

      return baseItems;
    };

    const children = [
      ...item.children.map(renderTreeNode),
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
              <span className={styles.entryTime}>
                {dayjs(entry.create_time).format("MM-DD HH:mm")}
              </span>
            </div>
            {entry.description && (
              <div className={styles.entryDescription}>{entry.description}</div>
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
        <div className={styles.treeNodeContent}>
          <div className={styles.nodeInfo}>
            <div className={styles.nodeTitleRow}>
              <span className={styles.nodeTitle}>
                {item.title}
                {item.type === EGoalItemType.Progress && item.target_value && (
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
          <div className={styles.nodeActions}>
            <Tooltip title={`进度: ${progress.toFixed(1)}%`}>
              <Progress
                percent={progress}
                size="small"
                strokeColor={getStatusColor(item.status)}
                style={{ width: 120 }}
                showInfo={false}
              />
            </Tooltip>
            <Dropdown menu={{ items: getMenuItems() }} trigger={["click"]}>
              <Button type="text" size="small" icon={<MoreOutlined />} />
            </Dropdown>
          </div>
        </div>
      ),
      key: item.id,
      children: children.length > 0 ? children : undefined,
    };
  };

  // 渲染目标卡片
  const renderGoalCard = (goal: IGoal) => {
    const isSelected = selectedGoal?.id === goal.id;
    const hasDateRange = goal.start_date && goal.end_date;
    const isOverdue = goal.end_date && Date.now() > goal.end_date;

    const getGoalMenuItems = () => {
      const baseItems = [
        {
          key: "edit",
          label: "编辑",
          onClick: () => handleEditGoal(goal),
        },
        {
          key: "delete",
          label: "删除",
          danger: true,
          onClick: () => handleDeleteGoal(goal),
        },
      ];

      if (goal.status === EGoalStatus.InProgress) {
        return [
          ...baseItems,
          { type: "divider" as const },
          {
            key: "complete",
            label: "标记为已完成",
            onClick: () => handleUpdateGoalStatus(goal, EGoalStatus.Completed),
          },
          {
            key: "abandon",
            label: "标记为已放弃",
            onClick: () => handleUpdateGoalStatus(goal, EGoalStatus.Abandoned),
          },
        ];
      }

      return baseItems;
    };

    return (
      <Card
        key={goal.id}
        size="small"
        className={classnames(styles.goalCard, {
          [styles.selected]: isSelected,
          [styles.overdue]: isOverdue && goal.status === EGoalStatus.InProgress,
        })}
        onClick={() => handleGoalSelect(goal)}
      >
        <div className={styles.goalHeader}>
          <h4 className={styles.goalTitle}>{goal.title}</h4>
          <div className={styles.goalActions}>
            <Dropdown menu={{ items: getGoalMenuItems() }} trigger={["click"]}>
              <Button
                type="text"
                size="small"
                icon={<MoreOutlined />}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              />
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
  };

  return (
    <div className={styles.goalManagementView}>
      <div className={styles.leftPanel}>
        <div className={styles.panelHeader}>
          <h2>进度管理</h2>
          <Button
            icon={<PlusOutlined />}
            onClick={() => setCreateGoalModalVisible(true)}
          >
            新建目标
          </Button>
        </div>

        <div className={styles.goalSections}>
          {/* 进行中的目标 */}
          <div className={styles.goalSection}>
            <div
              className={styles.sectionHeader}
              onClick={() =>
                setCollapsedSections((prev) => ({
                  ...prev,
                  [EGoalStatus.InProgress]: !prev[EGoalStatus.InProgress],
                }))
              }
            >
              <span className={styles.sectionTitle}>
                进行中 (
                {
                  goals.filter((g) => g.status === EGoalStatus.InProgress)
                    .length
                }
                )
              </span>
              <span
                className={classnames(styles.sectionArrow, {
                  [styles.collapsed]: collapsedSections[EGoalStatus.InProgress],
                })}
              >
                ▼
              </span>
            </div>
            {!collapsedSections[EGoalStatus.InProgress] && (
              <div className={styles.goalList}>
                {loading ? (
                  <div className={styles.loading}>加载中...</div>
                ) : goals.filter((g) => g.status === EGoalStatus.InProgress)
                    .length === 0 ? (
                  <Empty description="暂无进行中的目标" />
                ) : (
                  goals
                    .filter((g) => g.status === EGoalStatus.InProgress)
                    .map(renderGoalCard)
                )}
              </div>
            )}
          </div>

          <div className={styles.goalSection}>
            <div
              className={styles.sectionHeader}
              onClick={() =>
                setCollapsedSections((prev) => ({
                  ...prev,
                  [EGoalStatus.Completed]: !prev[EGoalStatus.Completed],
                }))
              }
            >
              <span className={styles.sectionTitle}>
                已完成 (
                {goals.filter((g) => g.status === EGoalStatus.Completed).length}
                )
              </span>
              <span
                className={classnames(styles.sectionArrow, {
                  [styles.collapsed]: collapsedSections[EGoalStatus.Completed],
                })}
              >
                ▼
              </span>
            </div>
            {!collapsedSections[EGoalStatus.Completed] && (
              <div className={styles.goalList}>
                {goals.filter((g) => g.status === EGoalStatus.Completed)
                  .length === 0 ? (
                  <Empty description="暂无已完成的目标" />
                ) : (
                  goals
                    .filter((g) => g.status === EGoalStatus.Completed)
                    .map(renderGoalCard)
                )}
              </div>
            )}
          </div>

          <div className={styles.goalSection}>
            <div
              className={styles.sectionHeader}
              onClick={() =>
                setCollapsedSections((prev) => ({
                  ...prev,
                  [EGoalStatus.Abandoned]: !prev[EGoalStatus.Abandoned],
                }))
              }
            >
              <span className={styles.sectionTitle}>
                已放弃 (
                {goals.filter((g) => g.status === EGoalStatus.Abandoned).length}
                )
              </span>
              <span
                className={classnames(styles.sectionArrow, {
                  [styles.collapsed]: collapsedSections[EGoalStatus.Abandoned],
                })}
              >
                ▼
              </span>
            </div>
            {!collapsedSections[EGoalStatus.Abandoned] && (
              <div className={styles.goalList}>
                {goals.filter((g) => g.status === EGoalStatus.Abandoned)
                  .length === 0 ? (
                  <Empty description="暂无已放弃的目标" />
                ) : (
                  goals
                    .filter((g) => g.status === EGoalStatus.Abandoned)
                    .map(renderGoalCard)
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.rightPanel}>
        {!selectedGoal ? (
          <div className={styles.emptyDetail}>
            <Empty description="请选择一个目标查看详情" />
          </div>
        ) : (
          <>
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
              <Button
                icon={<PlusOutlined />}
                onClick={() => {
                  setSelectedParentId(null);
                  setCreateItemModalVisible(true);
                }}
              >
                添加子目标
              </Button>
            </div>

            <div className={styles.detailContent}>
              {detailLoading ? (
                <div className={styles.loading}>加载中...</div>
              ) : selectedGoal.items.length === 0 ? (
                <Empty description="还没有子目标，点击上方按钮添加第一个子目标" />
              ) : (
                <Tree
                  treeData={selectedGoal.items.map(renderTreeNode)}
                  defaultExpandAll
                  className={styles.goalTree}
                />
              )}
            </div>
          </>
        )}
      </div>

      <Modal
        title="新建目标"
        open={createGoalModalVisible}
        onCancel={() => {
          setCreateGoalModalVisible(false);
          goalForm.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form form={goalForm} layout="vertical" onFinish={handleCreateGoal}>
          <Form.Item
            name="title"
            label="目标标题"
            rules={[{ required: true, message: "请输入目标标题" }]}
          >
            <Input placeholder="输入目标标题" />
          </Form.Item>

          <Form.Item
            name="description"
            label="目标描述"
            rules={[{ required: true, message: "请输入目标描述" }]}
          >
            <TextArea rows={4} placeholder="输入目标描述（可选）" />
          </Form.Item>

          <Form.Item name="dateRange" label="时间范围">
            <RangePicker
              style={{ width: "100%" }}
              placeholder={["开始时间（可选）", "结束时间（可选）"]}
            />
          </Form.Item>

          <Form.Item>
            <div className={styles.modalActions}>
              <Button
                onClick={() => {
                  setCreateGoalModalVisible(false);
                  goalForm.resetFields();
                }}
              >
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                创建
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑目标"
        open={editGoalModalVisible}
        onCancel={() => {
          setEditGoalModalVisible(false);
          editGoalForm.resetFields();
          setEditingGoal(null);
        }}
        footer={null}
        width={600}
      >
        <Form form={editGoalForm} layout="vertical" onFinish={handleUpdateGoal}>
          <Form.Item
            name="title"
            label="目标标题"
            rules={[{ required: true, message: "请输入目标标题" }]}
          >
            <Input placeholder="输入目标标题" />
          </Form.Item>

          <Form.Item
            name="description"
            label="目标描述"
            rules={[{ required: true, message: "请输入目标描述" }]}
          >
            <TextArea rows={4} placeholder="输入目标描述（可选）" />
          </Form.Item>

          <Form.Item name="dateRange" label="时间范围">
            <RangePicker
              style={{ width: "100%" }}
              placeholder={["开始时间（可选）", "结束时间（可选）"]}
            />
          </Form.Item>

          <Form.Item>
            <div className={styles.modalActions}>
              <Button
                onClick={() => {
                  setEditGoalModalVisible(false);
                  editGoalForm.resetFields();
                  setEditingGoal(null);
                }}
              >
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                保存
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={selectedParentId ? "添加子目标" : "添加根目标"}
        open={createItemModalVisible}
        onCancel={() => {
          setCreateItemModalVisible(false);
          itemForm.resetFields();
          setSelectedParentId(null);
        }}
        footer={null}
        width={600}
      >
        <Form form={itemForm} layout="vertical" onFinish={handleCreateItem}>
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: "请输入标题" }]}
          >
            <Input placeholder="输入子目标标题" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <TextArea rows={3} placeholder="输入描述（可选）" />
          </Form.Item>

          <Form.Item
            name="type"
            label="类型"
            rules={[{ required: true, message: "请选择类型" }]}
          >
            <Select placeholder="选择子目标类型">
              <Option value={EGoalItemType.BigGoal}>大目标</Option>
              <Option value={EGoalItemType.Milestone}>里程碑</Option>
              <Option value={EGoalItemType.Progress}>进度</Option>
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) =>
              prevValues.type !== currentValues.type
            }
          >
            {({ getFieldValue }) =>
              getFieldValue("type") === EGoalItemType.Progress && (
                <>
                  <Form.Item
                    name="target_value"
                    label="目标值"
                    rules={[{ required: true, message: "请输入目标值" }]}
                  >
                    <InputNumber
                      min={0}
                      style={{ width: "100%" }}
                      placeholder="输入目标值"
                    />
                  </Form.Item>
                  <Form.Item name="unit" label="单位">
                    <Input placeholder="输入单位（如：页、小时、%）" />
                  </Form.Item>
                </>
              )
            }
          </Form.Item>

          <Form.Item>
            <div className={styles.modalActions}>
              <Button
                onClick={() => {
                  setCreateItemModalVisible(false);
                  itemForm.resetFields();
                  setSelectedParentId(null);
                }}
              >
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                创建
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          selectedItemType === EGoalItemType.Milestone
            ? "添加进度记录"
            : "添加进度记录"
        }
        open={progressModalVisible}
        onCancel={() => {
          setProgressModalVisible(false);
          progressForm.resetFields();
          setSelectedItemId(null);
          setSelectedItemType(null);
        }}
        footer={null}
        width={500}
      >
        <Form
          form={progressForm}
          layout="vertical"
          onFinish={handleAddProgress}
        >
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: "请输入进度记录标题" }]}
          >
            <Input placeholder="输入进度记录标题" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <TextArea
              rows={3}
              placeholder={
                selectedItemType === EGoalItemType.Milestone
                  ? "输入里程碑的进度记录描述"
                  : "输入进度描述"
              }
            />
          </Form.Item>

          {selectedItemType === EGoalItemType.Progress && (
            <Form.Item
              name="progress_delta"
              label="进度增量"
              rules={[{ required: true, message: "请输入进度增量" }]}
            >
              <InputNumber
                style={{ width: "100%" }}
                placeholder="输入进度增量"
              />
            </Form.Item>
          )}

          {selectedItemType === EGoalItemType.Milestone && (
            <div
              style={{
                padding: "12px",
                background: "var(--color-fill-secondary)",
                borderRadius: "6px",
                marginBottom: "16px",
                color: "var(--color-text-secondary)",
                fontSize: "12px",
              }}
            >
              💡 里程碑的进度记录不会影响完成状态，请使用右键菜单手动标记完成。
            </div>
          )}

          <Form.Item>
            <div className={styles.modalActions}>
              <Button
                onClick={() => {
                  setProgressModalVisible(false);
                  progressForm.resetFields();
                  setSelectedItemId(null);
                  setSelectedItemType(null);
                }}
              >
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                添加记录
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
});

export default GoalManagementView;
