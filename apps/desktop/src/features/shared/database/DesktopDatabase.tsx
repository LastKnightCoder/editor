import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Database, { type DatabaseProps, type DatabaseRef } from "@tau/database";
import { patchDataTableRow } from "@/commands/data-table";
import { getDatabaseConnection } from "@/services/command-context";
import { useDatabaseCommands } from "@/hooks/useDatabaseCommands";
import useSettingStore from "@/stores/useSettingStore";
import { toDatabaseView } from "./viewAdapter";
import { desktopDatabaseExtension } from "./desktopExtension";

const desktopOnlyExtensions: NonNullable<DatabaseProps["extensions"]> = [desktopDatabaseExtension];
const rowCommands = { patchDataTableRow };

export interface DesktopDatabaseProps extends DatabaseProps {
  tableId?: number;
  /** 调用方传入的 extensions 必须引用稳定（模块级常量或 useMemo）：Database 实例生命周期内变更会抛错 */
  extensions?: DatabaseProps["extensions"];
}

export const DesktopDatabase = forwardRef<DatabaseRef, DesktopDatabaseProps>(
  (
    {
      tableId,
      extensions,
      onRowCleanup,
      onDataChange,
      onViewConfigChange,
      onDetachedRowPatch,
      views,
      onCreateView,
      onRenameView,
      onUpdateView,
      ...props
    },
    ref
  ) => {
    const [databaseName] = useState(() => useSettingStore.getState().setting.database.active);
    const instance = useRef<DatabaseRef>(null);
    const attachRef = useCallback(
      (value: DatabaseRef | null) => {
        instance.current = value;
        if (typeof ref === "function") return ref(value);
        if (ref) ref.current = value;
      },
      [ref]
    );
    useEffect(() => {
      if (tableId)
        instance.current?.dispatch({ type: "rows.receive", rows: props.data }, "external");
    }, [props.data, tableId]);
    const { commands, connectionId } = useDatabaseCommands(rowCommands, databaseName);
    const combinedExtensions = useMemo(
      () => (extensions ? [desktopDatabaseExtension, ...extensions] : desktopOnlyExtensions),
      [extensions]
    );
    const isCurrent = useCallback(
      () =>
        useSettingStore.getState().setting.database.active === databaseName &&
        getDatabaseConnection(databaseName)?.connectionId === connectionId,
      [databaseName, connectionId]
    );
    const saveData = useCallback<NonNullable<DatabaseProps["onDataChange"]>>(
      (data, change) => {
        if (isCurrent()) return onDataChange?.(data, change);
      },
      [isCurrent, onDataChange]
    );
    const saveView = useCallback<NonNullable<DatabaseProps["onViewConfigChange"]>>(
      config => {
        if (isCurrent()) return onViewConfigChange?.(config);
      },
      [isCurrent, onViewConfigChange]
    );
    const createView = useCallback<NonNullable<DatabaseProps["onCreateView"]>>(
      async input => {
        if (!isCurrent()) return null;
        const view = await onCreateView?.(input);
        return view ? toDatabaseView(view) : null;
      },
      [isCurrent, onCreateView]
    );
    const renameView = useCallback<NonNullable<DatabaseProps["onRenameView"]>>(
      async (id, name) => {
        if (!isCurrent()) return null;
        const view = await onRenameView?.(id, name);
        return view ? toDatabaseView(view) : null;
      },
      [isCurrent, onRenameView]
    );
    const updateView = useCallback<NonNullable<DatabaseProps["onUpdateView"]>>(
      async (id, input) => {
        if (!isCurrent()) return null;
        const view = await onUpdateView?.(id, input);
        return view ? toDatabaseView(view) : null;
      },
      [isCurrent, onUpdateView]
    );
    return (
      <Database
        key={connectionId}
        {...props}
        views={views.map(toDatabaseView)}
        onCreateView={onCreateView ? createView : undefined}
        onRenameView={onRenameView ? renameView : undefined}
        onUpdateView={onUpdateView ? updateView : undefined}
        ref={attachRef}
        extensions={combinedExtensions}
        onDataChange={saveData}
        onViewConfigChange={saveView}
        onDetachedRowPatch={async (rowId, patch, previousRow) => {
          if (!isCurrent()) return false;
          if (!tableId) return onDetachedRowPatch?.(rowId, patch, previousRow) ?? false;
          const fields = Object.keys(patch).filter(field => field !== "id");
          return commands.patchDataTableRow({
            tableId,
            rowId,
            patch: Object.fromEntries(fields.map(field => [field, patch[field]])),
            expected: Object.fromEntries(fields.map(field => [field, previousRow[field] ?? null])),
          });
        }}
        onRowCleanup={async row => {
          if (isCurrent()) await onRowCleanup?.(row);
        }}
      />
    );
  }
);

DesktopDatabase.displayName = "DesktopDatabase";
