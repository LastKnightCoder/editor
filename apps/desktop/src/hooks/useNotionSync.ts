import { useState, useEffect, useRef } from "react";
import { useMemoizedFn, useDebounceFn } from "ahooks";
import { Descendant } from "slate";
import { NotionSync, ProjectItem } from "@/types";
import { syncToNotion } from "@/utils/notion-sync";
import { SyncStatus } from "@/components/NotionSyncStatus";

interface UseNotionSyncOptions {
  token: string;
  projectItem: ProjectItem | null;
  notionSync: NotionSync | null;
  enabled: boolean;
}

interface UseNotionSyncReturn {
  status: SyncStatus;
  sync: () => Promise<void>;
  error: string | null;
}

const DEBOUNCE_WAIT = 2000; // 2 秒防抖
const RETRY_INTERVALS = [5000, 10000, 30000]; // 重试间隔：5s, 10s, 30s

export function useNotionSync(
  options: UseNotionSyncOptions,
): UseNotionSyncReturn {
  const { token, projectItem, notionSync, enabled } = options;

  const [status, setStatus] = useState<SyncStatus>("synced");
  const [error, setError] = useState<string | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastContentRef = useRef<Descendant[] | null>(null);

  // 执行同步
  const performSync = useMemoizedFn(async () => {
    if (!enabled || !token || !projectItem || !notionSync) {
      return;
    }

    setStatus("syncing");
    setError(null);

    try {
      const result = await syncToNotion(token, projectItem, notionSync);

      if (result.success) {
        setStatus("synced");
        setError(null);
        retryCountRef.current = 0;

        // 清除重试定时器
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
      } else {
        throw new Error(result.error || "同步失败");
      }
    } catch (err: any) {
      const errorMessage = err.message || "同步失败";
      setStatus("error");
      setError(errorMessage);

      // 安排重试
      scheduleRetry();
    }
  });

  // 安排重试
  const scheduleRetry = useMemoizedFn(() => {
    if (retryCountRef.current >= RETRY_INTERVALS.length) {
      // 超过最大重试次数，标记为待同步
      setStatus("pending");
      return;
    }

    const retryDelay = RETRY_INTERVALS[retryCountRef.current];
    retryCountRef.current++;

    retryTimerRef.current = setTimeout(() => {
      performSync();
    }, retryDelay);
  });

  // 防抖同步
  const { run: debouncedSync } = useDebounceFn(
    () => {
      performSync();
    },
    { wait: DEBOUNCE_WAIT },
  );

  // 手动触发同步
  const manualSync = useMemoizedFn(async () => {
    await performSync();
  });

  // 监听内容变化
  useEffect(() => {
    if (!enabled || !projectItem) {
      return;
    }

    // 检查内容是否真的变化了
    const currentContent = JSON.stringify(projectItem.content);
    const lastContent = lastContentRef.current
      ? JSON.stringify(lastContentRef.current)
      : null;

    if (currentContent !== lastContent) {
      lastContentRef.current = projectItem.content;

      // 如果不是第一次（lastContent 不为 null），触发同步
      if (lastContent !== null) {
        debouncedSync();
      }
    }
  }, [projectItem?.content, enabled, debouncedSync]);

  // 清理
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  return {
    status,
    sync: manualSync,
    error,
  };
}
