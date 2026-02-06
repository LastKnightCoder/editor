import { useState, useEffect, useCallback } from "react";
import { useMemoizedFn } from "ahooks";
import type {
  VLResource,
  VLResourceStatus,
  TaskProgress,
} from "@/types/vibe-learning";
import { invoke, on, off } from "@/electron";

interface StatusChangeData {
  resourceId: number;
  status: VLResourceStatus;
  error?: string;
  taskProgress?: TaskProgress;
}

export const useIndexingStatus = () => {
  const [statusMap, setStatusMap] = useState<Map<number, VLResourceStatus>>(
    new Map(),
  );
  const [progressMap, setProgressMap] = useState<Map<number, TaskProgress>>(
    new Map(),
  );

  useEffect(() => {
    const handler = (_: unknown, data: StatusChangeData) => {
      setStatusMap((prev) => {
        const next = new Map(prev);
        if (data.status === "completed") {
          next.delete(data.resourceId);
        } else {
          next.set(data.resourceId, data.status);
        }
        return next;
      });

      // 更新进度数据
      if (data.taskProgress) {
        setProgressMap((prev) => {
          const next = new Map(prev);
          next.set(data.resourceId, data.taskProgress!);
          return next;
        });
      }

      // 完成或失败时清除进度
      if (data.status === "completed" || data.status === "failed") {
        setProgressMap((prev) => {
          const next = new Map(prev);
          next.delete(data.resourceId);
          return next;
        });
      }
    };

    on("vibe-learning-status-change", handler);
    return () => {
      off("vibe-learning-status-change", handler);
    };
  }, []);

  return { statusMap, progressMap };
};

export const computeResourceStatus = async (
  resource: VLResource,
  mainDbName: string,
  queueStatus: VLResourceStatus | null,
): Promise<VLResourceStatus> => {
  // 1. 先检查是否在处理队列中（内存状态）
  if (queueStatus) {
    return queueStatus;
  }

  // 2. 检查是否有 markdown_path
  if (!resource.markdownPath) {
    return "pending";
  }

  // 3. 检查 Markdown 文件是否存在
  try {
    const mdExists = await invoke(
      "vl-check-markdown-exists",
      resource.markdownPath,
    );
    if (!mdExists) {
      return "need_convert";
    }
  } catch {
    return "need_convert";
  }

  // 4. 检查索引数据库中是否有记录
  try {
    const indexExists = await invoke(
      "vl-check-index-exists",
      mainDbName,
      resource.projectId,
      resource.id,
    );
    if (!indexExists) {
      return "need_index";
    }
  } catch {
    return "need_index";
  }

  return "completed";
};

export const useResourceStatus = (
  resource: VLResource | null,
  mainDbName: string,
) => {
  const [status, setStatus] = useState<VLResourceStatus>("pending");
  const [loading, setLoading] = useState(true);

  // 获取队列中的进行时状态
  const { statusMap: indexingStatus } = useIndexingStatus();
  const queueStatus = resource ? indexingStatus.get(resource.id) || null : null;

  // 计算状态
  const computeStatus = useMemoizedFn(async () => {
    if (!resource) {
      setStatus("pending");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const computed = await computeResourceStatus(
        resource,
        mainDbName,
        queueStatus,
      );
      setStatus(computed);
    } catch (error) {
      console.error("Failed to compute resource status:", error);
      setStatus("pending");
    } finally {
      setLoading(false);
    }
  });

  // 当资源或队列状态变化时重新计算
  useEffect(() => {
    computeStatus();
  }, [resource?.id, resource?.markdownPath, queueStatus, computeStatus]);

  return { status, loading, refresh: computeStatus };
};

interface UseResourcesStatusOptions {
  onResourceUpdate?: (data: {
    resourceId: number;
    projectId: number;
    mainDbName: string;
  }) => void;
  projectId?: number;
}

export const useResourcesStatus = (
  resources: VLResource[],
  mainDbName: string,
  options?: UseResourcesStatusOptions,
) => {
  const [statusMap, setStatusMap] = useState<Map<number, VLResourceStatus>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);

  // 获取队列中的进行时状态
  const { statusMap: indexingStatus, progressMap } = useIndexingStatus();

  // 计算所有资源的状态
  const computeAllStatus = useMemoizedFn(async () => {
    if (resources.length === 0) {
      setStatusMap(new Map());
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const newMap = new Map<number, VLResourceStatus>();

      await Promise.all(
        resources.map(async (resource) => {
          const queueStatus = indexingStatus.get(resource.id) || null;
          const status = await computeResourceStatus(
            resource,
            mainDbName,
            queueStatus,
          );
          newMap.set(resource.id, status);
        }),
      );

      setStatusMap(newMap);
    } catch (error) {
      console.error("Failed to compute resources status:", error);
    } finally {
      setLoading(false);
    }
  });

  // 当资源列表或队列状态变化时重新计算
  useEffect(() => {
    computeAllStatus();
  }, [resources, indexingStatus, computeAllStatus]);

  // 解构 options 以便在 useEffect 中使用
  const { projectId: filterProjectId, onResourceUpdate } = options || {};

  // 监听资源更新完成事件（后端完成转换/索引后触发）
  useEffect(() => {
    const handler = (
      _: unknown,
      data: { resourceId: number; projectId: number; mainDbName: string },
    ) => {
      // 如果指定了 projectId，只处理匹配的项目
      if (filterProjectId !== undefined && data.projectId !== filterProjectId) {
        return;
      }
      // 调用回调刷新资源列表
      onResourceUpdate?.(data);
    };

    on("vibe-learning-resource-updated", handler);
    return () => {
      off("vibe-learning-resource-updated", handler);
    };
  }, [filterProjectId, onResourceUpdate]);

  const getStatus = useCallback(
    (resourceId: number): VLResourceStatus => {
      // 优先使用队列状态
      const queueStatus = indexingStatus.get(resourceId);
      if (queueStatus) {
        return queueStatus;
      }
      return statusMap.get(resourceId) || "pending";
    },
    [statusMap, indexingStatus],
  );

  const getProgress = useCallback(
    (resourceId: number): TaskProgress | undefined => {
      return progressMap.get(resourceId);
    },
    [progressMap],
  );

  return {
    statusMap,
    loading,
    getStatus,
    getProgress,
    refresh: computeAllStatus,
  };
};

export const statusConfig: Record<
  VLResourceStatus,
  {
    text: string;
    color: string;
    spin: boolean;
  }
> = {
  pending: { text: "待处理", color: "gray", spin: false },
  downloading: { text: "下载中", color: "blue", spin: true },
  transcribing: { text: "转录中", color: "cyan", spin: true },
  converting: { text: "转换中", color: "blue", spin: true },
  summarizing: { text: "摘要生成中", color: "purple", spin: true },
  indexing: { text: "索引中", color: "orange", spin: true },
  completed: { text: "已完成", color: "green", spin: false },
  need_download: { text: "需要下载", color: "purple", spin: false },
  need_convert: { text: "需要重建", color: "orange", spin: false },
  need_index: { text: "需要索引", color: "yellow", spin: false },
  failed: { text: "失败", color: "red", spin: false },
};

export default useResourceStatus;
