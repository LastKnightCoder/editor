import { useState, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { App } from "antd";
import { getVLResourcesByProjectId } from "@/commands/vibe-learning";
import type { VLResource } from "@/types/vibe-learning";

interface UseVLResourceSelectionOptions {
  /** 是否只返回已完成处理的资源（有 markdownPath） */
  onlyReady?: boolean;
  /** 是否默认全选 */
  defaultSelectAll?: boolean;
}

interface UseVLResourceSelectionResult {
  /** 资源列表 */
  resources: VLResource[];
  /** 选中的资源 ID 列表 */
  selectedResourceIds: number[];
  /** 是否正在加载 */
  loading: boolean;
  /** 是否全部选中 */
  isAllSelected: boolean;
  /** 选中的资源数量 */
  selectedCount: number;
  /** 加载资源列表 */
  loadResources: () => Promise<void>;
  /** 切换单个资源的选择状态 */
  toggleResource: (resourceId: number) => void;
  /** 全选/取消全选 */
  toggleAll: () => void;
  /** 设置选中的资源 ID 列表 */
  setSelectedResourceIds: (ids: number[]) => void;
  /** 获取选中资源的名称列表 */
  getSelectedResourceNames: () => string[];
  /** 获取选中的资源列表 */
  getSelectedResources: () => VLResource[];
  /** 重置状态 */
  reset: () => void;
}

/**
 * VibeLearning 资源选择状态管理 Hook
 * 用于管理资源列表的加载和选择状态
 */
export const useVLResourceSelection = (
  projectId: number,
  options?: UseVLResourceSelectionOptions,
): UseVLResourceSelectionResult => {
  const { onlyReady = true, defaultSelectAll = true } = options || {};
  const { message } = App.useApp();

  const [resources, setResources] = useState<VLResource[]>([]);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  // 是否全部选中
  const isAllSelected = useMemo(
    () =>
      resources.length > 0 && selectedResourceIds.length === resources.length,
    [resources.length, selectedResourceIds.length],
  );

  // 选中的资源数量
  const selectedCount = selectedResourceIds.length;

  // 加载资源列表
  const loadResources = useMemoizedFn(async () => {
    if (!projectId) return;

    setLoading(true);
    try {
      const data = await getVLResourcesByProjectId(projectId);
      // 根据选项过滤资源
      const filteredResources = onlyReady
        ? data.filter((r) => r.markdownPath)
        : data;
      setResources(filteredResources);
      // 根据选项决定是否默认全选
      if (defaultSelectAll) {
        setSelectedResourceIds(filteredResources.map((r) => r.id));
      } else {
        setSelectedResourceIds([]);
      }
    } catch (error) {
      console.error("Failed to load resources:", error);
      message.error("加载资源失败");
    } finally {
      setLoading(false);
    }
  });

  // 切换单个资源的选择状态
  const toggleResource = useMemoizedFn((resourceId: number) => {
    setSelectedResourceIds((prev) =>
      prev.includes(resourceId)
        ? prev.filter((id) => id !== resourceId)
        : [...prev, resourceId],
    );
  });

  // 全选/取消全选
  const toggleAll = useMemoizedFn(() => {
    if (isAllSelected) {
      setSelectedResourceIds([]);
    } else {
      setSelectedResourceIds(resources.map((r) => r.id));
    }
  });

  // 获取选中资源的名称列表
  const getSelectedResourceNames = useMemoizedFn((): string[] => {
    return resources
      .filter((r) => selectedResourceIds.includes(r.id))
      .map((r) => r.name);
  });

  // 获取选中的资源列表
  const getSelectedResources = useMemoizedFn((): VLResource[] => {
    return resources.filter((r) => selectedResourceIds.includes(r.id));
  });

  // 重置状态
  const reset = useMemoizedFn(() => {
    setResources([]);
    setSelectedResourceIds([]);
    setLoading(false);
  });

  return {
    resources,
    selectedResourceIds,
    loading,
    isAllSelected,
    selectedCount,
    loadResources,
    toggleResource,
    toggleAll,
    setSelectedResourceIds,
    getSelectedResourceNames,
    getSelectedResources,
    reset,
  };
};

export default useVLResourceSelection;
