import { useState, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { ColumnDef } from "../types";

/**
 * 用于管理列可见性的钩子
 */
export function useColumnVisibility(initialColumns: ColumnDef[]) {
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(
    new Set(initialColumns.filter((col) => col.hidden).map((col) => col.id)),
  );

  // 当列变化时更新隐藏列
  useEffect(() => {
    setHiddenColumns(
      new Set(initialColumns.filter((col) => col.hidden).map((col) => col.id)),
    );
  }, [initialColumns]);

  const toggleColumnVisibility = useMemoizedFn((columnId: string) => {
    setHiddenColumns((prev) => {
      const newHidden = new Set(prev);
      if (newHidden.has(columnId)) {
        newHidden.delete(columnId);
      } else {
        newHidden.add(columnId);
      }
      return newHidden;
    });
  });

  const isColumnVisible = useMemoizedFn((columnId: string) => {
    return !hiddenColumns.has(columnId);
  });

  const getVisibleColumns = useMemoizedFn((columns: ColumnDef[]) => {
    return columns.filter((col) => !hiddenColumns.has(col.id));
  });

  const setColumnVisibility = useMemoizedFn(
    (columnId: string, visible: boolean) => {
      setHiddenColumns((prev) => {
        const newHidden = new Set(prev);
        if (visible) {
          newHidden.delete(columnId);
        } else {
          newHidden.add(columnId);
        }
        return newHidden;
      });
    },
  );

  return {
    hiddenColumns,
    toggleColumnVisibility,
    isColumnVisible,
    getVisibleColumns,
    setColumnVisibility,
  };
}

export default useColumnVisibility;
