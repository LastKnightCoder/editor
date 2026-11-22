import { useEffect, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import type { DatabaseProps, DatabaseRef, RowData, RowChanges } from "@tau/database";
import { ConfirmDialog, toast } from "@tau/ui";
import type { DataTableSource } from "@tau/shared/database-types";
import { off, on } from "@/electron";
import type { DomainEventMessage } from "@/types/domain-events";
import useSettingStore from "@/stores/useSettingStore";
import { requireSourceDef, sourceColumnId } from "@/features/databases/data-sources";
import { DesktopDatabase, type DesktopDatabaseProps } from "./DesktopDatabase";

const sameDatabase = (a: string, b: string) => a.replace(/\.db$/, "") === b.replace(/\.db$/, "");

/** 源头变化时重读：卡片、文章、项目文档走业务事件，日记走 diary:changed */
function useSourceRefresh(source: DataTableSource, reload: (() => Promise<void>) | undefined) {
  const kind = source.kind;
  const run = useMemoizedFn(
    () => void reload?.().catch(error => console.error("[database] 重读关联表失败", error))
  );
  useEffect(() => {
    const databaseName = useSettingStore.getState().setting.database.active;
    let timer = 0;
    // 一次写回会连着发几条事件，合并成一次重读
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(run, 120);
    };
    if (kind === "diary") {
      const handle = (_event: unknown, message: { databaseName: string }) => {
        if (sameDatabase(message.databaseName, databaseName)) schedule();
      };
      on("diary:changed", handle);
      return () => {
        window.clearTimeout(timer);
        off("diary:changed", handle);
      };
    }
    const handle = (_event: unknown, message: DomainEventMessage) => {
      if (!sameDatabase(message.databaseName, databaseName)) return;
      if (
        message.events.some(
          event => event.type.startsWith(`${kind}.`) || event.type === "workspace.reset"
        )
      )
        schedule();
    };
    on("domain-events", handle);
    return () => {
      window.clearTimeout(timer);
      off("domain-events", handle);
    };
  }, [kind, run]);
}

interface DataTableEditorProps extends DesktopDatabaseProps {
  source?: DataTableSource;
  reload?: () => Promise<void>;
}

export function DataTableEditor({ source, reload, ...props }: DataTableEditorProps) {
  return source ? (
    <LinkedDatabase {...props} source={source} reload={reload} />
  ) : (
    <DesktopDatabase {...props} />
  );
}

function LinkedDatabase({
  source,
  reload,
  onDataChange,
  ...props
}: DataTableEditorProps & { source: DataTableSource }) {
  const def = requireSourceDef(source.kind);
  const instance = useRef<DatabaseRef>(null);
  const [revision, setRevision] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [databaseName] = useState(() => useSettingStore.getState().setting.database.active);
  useSourceRefresh(source, reload);

  // 选项随源头标签变化，未变化的确认回执保留单元格正在输入的新选项。
  const tagColumn = props.columns.find(column => column.id === sourceColumnId("tags"));
  const tagConfig = JSON.stringify(tagColumn?.config);
  const lastTagConfig = useRef(tagConfig);
  useEffect(() => {
    if (tagColumn && lastTagConfig.current !== tagConfig)
      instance.current?.dispatch(
        { type: "column.configure", id: tagColumn.id, config: tagColumn.config },
        "external"
      );
    lastTagConfig.current = tagConfig;
  }, [tagColumn, tagConfig]);

  const save = useMemoizedFn(
    async (...args: Parameters<NonNullable<DatabaseProps["onDataChange"]>>) => {
      if (useSettingStore.getState().setting.database.active !== databaseName) return;
      try {
        await onDataChange?.(...args);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败");
        try {
          await reload?.();
        } catch (reloadError) {
          toast.error(reloadError instanceof Error ? reloadError.message : "重新读取数据源失败");
        } finally {
          setRevision(value => value + 1);
        }
      }
    }
  );

  // 增删只在源头提交成功后进入 store，外部回填同时建立新的撤销基线。
  const changeRows = (rows: RowChanges) =>
    save(
      { columns: props.columns, rows: props.data },
      { source: "user", dataChanged: true, viewChanged: false, rows }
    );

  const add = (initial?: Partial<RowData>) => {
    if (props.readonly || !source.canCreate) return;
    const id = crypto.randomUUID();
    void changeRows({ upsert: [{ ...initial, id }], inserted: [id], remove: [] });
  };

  return (
    <>
      <DesktopDatabase
        {...props}
        key={JSON.stringify([source.fields, source.scope, revision])}
        ref={instance}
        config={{
          ...props.config,
          allowAddRow: source.canCreate && props.config?.allowAddRow !== false,
        }}
        onDataChange={save}
        onRowAdd={add}
        onRowDelete={async id => setDeleting(id)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={open => {
          if (!open) setDeleting(null);
        }}
        title={`删除${def.unit}`}
        description={`会同时从${def.label}页删除原内容和这一行的自建列值，无法在表格中撤销。`}
        danger
        confirmText="删除"
        onConfirm={() => (deleting ? changeRows({ upsert: [], remove: [deleting] }) : undefined)}
      />
    </>
  );
}
