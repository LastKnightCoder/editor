import { useMemo } from "react";
import { ColumnDef, RowData, FilterGroup } from "../types";
import { TableViewConfig } from "../types";
import PluginManager from "../PluginManager";
import { SortRule } from "@/types";

interface GroupedRow {
  key: string;
  label: string;
  rows: RowData[];
  column: ColumnDef | null;
}

export const useFilteredAndSortedRows = (
  rows: RowData[],
  columns: ColumnDef[],
  viewConfig: TableViewConfig,
  pluginManager: PluginManager,
) => {
  const columnMap = useMemo(() => {
    const map = new Map<string, ColumnDef>();
    columns.forEach((column) => {
      map.set(column.id, column);
    });
    return map;
  }, [columns]);

  const filteredRows = useMemo(() => {
    const activeFilters = viewConfig.filters ?? null;
    if (!activeFilters) return rows;
    const columnLookup = new Map<string, ColumnDef>();
    columns.forEach((column) => {
      columnLookup.set(column.id, column);
    });

    const evaluateGroup = (group: FilterGroup, row: RowData): boolean => {
      if (
        !group ||
        !Array.isArray(group.children) ||
        group.children.length === 0
      ) {
        console.warn("筛选组为空", group);
        return true;
      }
      const matches = group.children.map((child) => {
        if (child.type === "group") {
          return evaluateGroup(child, row);
        }
        if (!child.fieldId || !child.operator) {
          return true;
        }
        const column = columnLookup.get(child.fieldId);
        if (!column) {
          return true;
        }
        const plugin = pluginManager.getPlugin(column.type);
        if (!plugin) {
          return true;
        }
        const definition = (plugin.filters ?? []).find(
          (item) => item.operator === child.operator,
        );
        if (!definition) {
          return true;
        }
        try {
          return definition.filter(child.value ?? null, row, column);
        } catch (error) {
          console.error("筛选执行失败", error);
          return true;
        }
      });

      if (group.logic === "and") {
        return matches.every(Boolean);
      }
      return matches.some(Boolean);
    };

    return rows.filter((row) => evaluateGroup(activeFilters, row));
  }, [viewConfig.filters, rows, columns, pluginManager]);

  const sortedSortRules = useMemo(() => {
    if (!viewConfig.sorts || !viewConfig.sorts.length) {
      return [] as SortRule[];
    }
    return [...viewConfig.sorts]
      .map((rule, index) => ({ rule, index }))
      .sort((a, b) => {
        if (a.rule.priority === b.rule.priority) {
          return a.index - b.index;
        }
        return a.rule.priority - b.rule.priority;
      })
      .map((item) => item.rule);
  }, [viewConfig.sorts]);

  const orderedRows = useMemo(() => {
    if (sortedSortRules.length) {
      const orders = filteredRows.slice();
      const sortedOrders = orders.toSorted((a: RowData, b: RowData) => {
        for (const sort of sortedSortRules) {
          const column = columnMap.get(sort.fieldId);
          if (!column) continue;
          const plugin = pluginManager.getPlugin(column.type);
          if (!plugin) continue;
          const compare =
            plugin.sort?.({
              a: a[sort.fieldId],
              b: b[sort.fieldId],
              column,
              direction: sort.direction,
              columnConfig: column.config,
              rowA: a,
              rowB: b,
            }) ?? 0;
          if (compare !== 0) {
            return compare;
          }
        }
        // 兜底根据 rowOrder 排序
        const rowAIndex = orders.indexOf(a);
        const rowBIndex = orders.indexOf(b);
        if (rowAIndex !== -1 && rowBIndex !== -1) {
          return rowAIndex - rowBIndex;
        }

        return 0;
      });
      return sortedOrders;
    }

    const order: RowData[] = [];
    const existing = new Set<string>();

    viewConfig.rowOrder.forEach((rowId) => {
      const row = filteredRows.find((item) => item.id === rowId);
      if (row && !existing.has(rowId)) {
        order.push(row);
        existing.add(rowId);
      }
    });
    filteredRows.forEach((row) => {
      if (!existing.has(row.id)) {
        order.push(row);
        existing.add(row.id);
      }
    });
    return order;
  }, [
    viewConfig.rowOrder,
    sortedSortRules,
    filteredRows,
    columnMap,
    pluginManager,
  ]);

  const groupConfig = viewConfig.groupBy;
  const isGrouped = Boolean(groupConfig && groupConfig.fieldId);

  const groupedRows = useMemo(() => {
    if (!groupConfig || !groupConfig.fieldId) {
      return [
        { key: "__all__", label: "全部", rows: orderedRows, column: null },
      ] as GroupedRow[];
    }

    const targetColumn = columns.find((col) => col.id === groupConfig.fieldId);
    if (!targetColumn) {
      return [
        { key: "__all__", label: "全部", rows: orderedRows, column: null },
      ] as GroupedRow[];
    }

    const groups = new Map<string, RowData[]>();

    orderedRows.forEach((row) => {
      const key =
        pluginManager
          .getPlugin(targetColumn.type)
          ?.getGroupKey?.(row, targetColumn) || "未分组";
      console.assert(typeof key === "string", "Group key must be a string");
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)?.push(row);
    });

    const sortedKeys = [...groups.keys()].sort((a, b) => {
      if (a === "未分组") return 1;
      if (b === "未分组") return -1;
      return a.localeCompare(b, "zh-CN");
    });

    return sortedKeys.map((key) => ({
      key,
      label: key,
      rows: groups.get(key) ?? [],
      column: targetColumn,
    }));
  }, [groupConfig, orderedRows, columns, pluginManager]);

  return {
    filteredRows,
    orderedRows,
    groupedRows,
    isGrouped,
  };
};
