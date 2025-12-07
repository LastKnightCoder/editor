import { useState } from "react";
import { useMemoizedFn, useAsyncEffect } from "ahooks";
import {
  listResourceSyncBlacklist,
  addResourceSyncBlacklist,
  removeResourceSyncBlacklist,
  clearResourceSyncBlacklist,
} from "@/commands";
import { IResourceSyncBlacklistItem } from "@/types";

const useResourceSyncBlacklist = (autoLoad = true) => {
  const [items, setItems] = useState<IResourceSyncBlacklistItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useMemoizedFn(async () => {
    setLoading(true);
    try {
      const list = await listResourceSyncBlacklist();
      setItems(list);
    } finally {
      setLoading(false);
    }
  });

  const addItems = useMemoizedFn(async (fileNames: string[]) => {
    if (!fileNames.length) return;
    setLoading(true);
    try {
      const list = await addResourceSyncBlacklist(fileNames);
      setItems(list);
    } finally {
      setLoading(false);
    }
  });

  const removeItems = useMemoizedFn(
    async (payload: { ids?: number[]; fileNames?: string[] }) => {
      setLoading(true);
      try {
        const list = await removeResourceSyncBlacklist(payload);
        setItems(list);
      } finally {
        setLoading(false);
      }
    },
  );

  const clearAll = useMemoizedFn(async () => {
    setLoading(true);
    try {
      await clearResourceSyncBlacklist();
      setItems([]);
    } finally {
      setLoading(false);
    }
  });

  useAsyncEffect(async () => {
    if (!autoLoad) return;
    await refresh();
  }, [autoLoad]);

  return {
    items,
    loading,
    refresh,
    addItems,
    removeItems,
    clearAll,
  };
};

export default useResourceSyncBlacklist;
