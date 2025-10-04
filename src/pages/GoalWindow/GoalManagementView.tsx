import { memo, useState, useEffect } from "react";
import { App, Form, message } from "antd";
import dayjs from "dayjs";
import useInitDatabase from "@/hooks/useInitDatabase";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";

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
  updateGoalProgressEntry,
  updateGoalItemProgress,
  deleteGoalProgressEntry,
} from "@/commands";
import GoalList from "./components/GoalList";
import GoalDetailPanel from "./components/GoalDetailPanel";
import {
  CreateGoalModal,
  EditGoalModal,
  CreateItemModal,
  ProgressModal,
} from "./components/modals";
import styles from "./index.module.less";
import { useMemoizedFn } from "ahooks";

const GoalManagementView = memo(() => {
  const { active } = useInitDatabase();
  const isConnected = useDatabaseConnected();
  const { modal } = App.useApp();

  // 数据状态
  const [goals, setGoals] = useState<IGoal[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<IGoalWithItems | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // 模态框状态
  const [createGoalModalVisible, setCreateGoalModalVisible] = useState(false);
  const [editGoalModalVisible, setEditGoalModalVisible] = useState(false);
  const [createItemModalVisible, setCreateItemModalVisible] = useState(false);
  const [progressModalVisible, setProgressModalVisible] = useState(false);

  // 其他状态
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

  // 表单实例
  const [goalForm] = Form.useForm();
  const [editGoalForm] = Form.useForm();
  const [itemForm] = Form.useForm();
  const [progressForm] = Form.useForm();

  // 基础数据操作
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
    if (isConnected && active) {
      loadGoals();
    } else {
      // 当数据库断开连接或切换时，清空数据
      setGoals([]);
      setSelectedGoal(null);
    }
  }, [isConnected, active, loadGoals]);

  // 目标相关操作
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
      okButtonProps: {
        danger: true,
      },
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
      okButtonProps: {
        danger: true,
      },
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

  // 子目标相关操作
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

  const handleSubmitProgress = async (values: any) => {
    if (!selectedItemId || !selectedGoal) return;

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
      loadGoalDetail(selectedGoal.id);
    } catch (error) {
      console.error("Failed to add progress:", error);
      message.error("添加进度失败");
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!selectedGoal) return;
    modal.confirm({
      title: "确认删除",
      content: "删除子目标将同时删除其所有子项和进度记录，此操作无法撤销。",
      okText: "确认",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
      onOk: async () => {
        try {
          await deleteGoalItem(itemId);
          message.success("子目标删除成功");
          loadGoalDetail(selectedGoal.id);
        } catch (error) {
          console.error("Failed to delete goal item:", error);
          message.error("删除子目标失败");
        }
      },
    });
  };

  const handleToggleMilestone = async (item: IGoalItemTree) => {
    if (item.type !== EGoalItemType.Milestone || !selectedGoal) return;

    const newStatus =
      item.status === EGoalItemStatus.Completed
        ? EGoalItemStatus.InProgress
        : EGoalItemStatus.Completed;

    try {
      await updateGoalItem({ id: item.id, status: newStatus });
      message.success("状态更新成功");
      loadGoalDetail(selectedGoal.id);
    } catch (error) {
      console.error("Failed to update item status:", error);
      message.error("更新状态失败");
    }
  };

  // 处理分组折叠状态
  const handleToggleSection = (status: EGoalStatus) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [status]: !prev[status],
    }));
  };

  // 处理笔记变化
  const handleNoteChange = () => {
    // 当笔记发生变化时，可以选择重新加载目标数据或执行其他操作
    // 这里可以根据需要添加逻辑，比如显示提示信息等
    console.log("Goal notes have been updated");
  };

  // 处理更新进度记录
  const handleUpdateProgressEntry = async (
    entryId: number,
    newProgressDelta: number,
    oldProgressDelta: number | null,
    goalItemId: number,
  ) => {
    try {
      // 更新进度记录
      await updateGoalProgressEntry({
        id: entryId,
        progress_delta: newProgressDelta,
      });

      // 计算进度差值：新值 - 旧值
      const deltaChange = newProgressDelta - (oldProgressDelta || 0);

      // 如果有进度变化，需要更新目标项的当前值
      if (deltaChange !== 0) {
        await updateGoalItemProgress(goalItemId, deltaChange);
      }

      message.success("进度记录更新成功");

      // 重新加载目标详情以更新进度
      if (selectedGoal) {
        loadGoalDetail(selectedGoal.id);
      }
    } catch (error) {
      console.error("更新进度记录失败:", error);
      message.error("更新进度记录失败");
    }
  };

  // 处理删除进度记录
  const handleDeleteProgressEntry = async (
    entryId: number,
    progressDelta: number | null,
    goalItemId: number,
  ) => {
    modal.confirm({
      title: "确认删除进度记录",
      content: "删除进度记录后无法恢复，确认要删除吗？",
      okText: "确认删除",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
      onOk: async () => {
        try {
          // 先删除进度记录
          await deleteGoalProgressEntry(entryId);

          // 如果有进度增量，需要从目标项中减去这个进度
          if (progressDelta && progressDelta > 0) {
            await updateGoalItemProgress(goalItemId, -progressDelta);
          }

          message.success("进度记录删除成功");

          // 重新加载目标详情以更新显示
          if (selectedGoal) {
            loadGoalDetail(selectedGoal.id);
          }
        } catch (error) {
          console.error("删除进度记录失败:", error);
          message.error("删除进度记录失败");
        }
      },
    });
  };

  // 模态框操作
  const handleCreateGoalModalCancel = () => {
    setCreateGoalModalVisible(false);
    goalForm.resetFields();
  };

  const handleEditGoalModalCancel = () => {
    setEditGoalModalVisible(false);
    editGoalForm.resetFields();
    setEditingGoal(null);
  };

  const handleCreateItemModalCancel = () => {
    setCreateItemModalVisible(false);
    itemForm.resetFields();
    setSelectedParentId(null);
  };

  const handleProgressModalCancel = () => {
    setProgressModalVisible(false);
    progressForm.resetFields();
    setSelectedItemId(null);
    setSelectedItemType(null);
  };

  const handleAddChild = (parentId: number) => {
    setSelectedParentId(parentId);
    setCreateItemModalVisible(true);
  };

  const handleAddProgress = (itemId: number, itemType: EGoalItemType) => {
    setSelectedItemId(itemId);
    setSelectedItemType(itemType);
    setProgressModalVisible(true);
  };

  const handleAddRootItem = () => {
    setSelectedParentId(null);
    setCreateItemModalVisible(true);
  };

  return (
    <div className={styles.goalManagementView}>
      <GoalList
        goals={goals}
        loading={loading}
        selectedGoalId={selectedGoal?.id}
        collapsedSections={collapsedSections}
        onCreateGoal={() => setCreateGoalModalVisible(true)}
        onGoalSelect={handleGoalSelect}
        onEditGoal={handleEditGoal}
        onDeleteGoal={handleDeleteGoal}
        onUpdateGoalStatus={handleUpdateGoalStatus}
        onToggleSection={handleToggleSection}
        onNoteChange={handleNoteChange}
      />

      <GoalDetailPanel
        selectedGoal={selectedGoal}
        detailLoading={detailLoading}
        onAddRootItem={handleAddRootItem}
        onToggleMilestone={handleToggleMilestone}
        onAddChild={handleAddChild}
        onAddProgress={handleAddProgress}
        onDeleteItem={handleDeleteItem}
        onUpdateProgressEntry={handleUpdateProgressEntry}
        onDeleteProgressEntry={handleDeleteProgressEntry}
      />

      <CreateGoalModal
        visible={createGoalModalVisible}
        onCancel={handleCreateGoalModalCancel}
        onSubmit={handleCreateGoal}
        form={goalForm}
      />

      <EditGoalModal
        visible={editGoalModalVisible}
        onCancel={handleEditGoalModalCancel}
        onSubmit={handleUpdateGoal}
        form={editGoalForm}
      />

      <CreateItemModal
        visible={createItemModalVisible}
        isChildItem={!!selectedParentId}
        onCancel={handleCreateItemModalCancel}
        onSubmit={handleCreateItem}
        form={itemForm}
      />

      <ProgressModal
        visible={progressModalVisible}
        itemType={selectedItemType}
        onCancel={handleProgressModalCancel}
        onSubmit={handleSubmitProgress}
        form={progressForm}
      />
    </div>
  );
});

export default GoalManagementView;
