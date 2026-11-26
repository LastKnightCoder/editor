import { useEffect, useMemo, useRef, useState } from "react";
import type { DataTable } from "@tau/shared/database-types";
import type { QueryDefinition } from "@tau/shared/query-database";
import { updateQueryDefinition } from "@/commands/query-database";
import { getDataTableDetail } from "@/commands/data-table";
import { Button } from "@tau/ui";
import { useDatabaseCommands } from "@/hooks/useDatabaseCommands";
import useSettingStore from "@/stores/useSettingStore";
import { on, off } from "@/electron";
import { toDatabaseView } from "../database/viewAdapter";
import type { DesktopDatabaseProps } from "../database/DesktopDatabase";
import { QueryDatabasePanel } from "./QueryDatabasePanel";
import { takeQueryOpenIntent } from "./headerSlot";

const queryCommands = { updateQueryDefinition, getDataTableDetail };
export default function StoredQueryDatabase({
  query,
  reload,
  tableId,
  ...props
}: DesktopDatabaseProps & {
  query: NonNullable<DataTable["query"]>;
  reload?: () => Promise<void>;
}) {
  const databaseName = useSettingStore(state => state.setting.database.active);
  const { commands } = useDatabaseCommands(queryCommands, databaseName);
  const [definition, setDefinition] = useState(query.definition);
  const [saveError, setSaveError] = useState<string>();
  const [localDraft, setLocalDraft] = useState<QueryDefinition>();
  const initialRevision = useRef(query.revision);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const writer = useMemo(() => {
    let revision = initialRevision.current;
    let pending: QueryDefinition | undefined;
    let running = false;
    const flush = async () => {
      if (running || !tableId) return;
      running = true;
      try {
        while (pending) {
          const next = pending;
          pending = undefined;
          try {
            const saved = await commands.updateQueryDefinition({
              tableId,
              definition: next,
              expectedRevision: revision,
            });
            revision = saved.revision;
            if (live.current) setSaveError(undefined);
          } catch (error) {
            pending ??= next;
            if (live.current) setSaveError(error instanceof Error ? error.message : String(error));
            break;
          }
        }
      } finally {
        running = false;
      }
    };
    return {
      retry() {
        void flush();
      },
      reset(value: NonNullable<DataTable["query"]>) {
        if (running) throw new Error("正在保存，请稍后重新读取");
        revision = value.revision;
        pending = undefined;
        setDefinition(value.definition);
        setSaveError(undefined);
      },
      put(next: QueryDefinition) {
        pending = next;
        void flush();
      },
      receive(value: NonNullable<DataTable["query"]>) {
        if (!pending && !running && value.revision > revision) {
          revision = value.revision;
          setDefinition(value.definition);
        }
      },
    };
    // 每个连接与表身份各自持有写入队列，旧异步操作保持原库绑定。
  }, [commands, tableId]);
  useEffect(() => writer.receive(query), [writer, query]);
  useEffect(() => {
    const changed = (_: unknown, message: { databaseName?: string; tableId?: number }) => {
      if (
        message.tableId === tableId &&
        message.databaseName?.replace(/\.db$/, "") === databaseName.replace(/\.db$/, "")
      )
        void reload?.().catch(error => {
          if (live.current) setSaveError(String(error));
        });
    };
    on("query-database:changed", changed);
    return () => off("query-database:changed", changed);
  }, [databaseName, tableId, reload]);
  const views = props.views.map(toDatabaseView);
  const [intent] = useState(() => takeQueryOpenIntent(tableId));
  const readSaved = () => {
    if (!tableId) return;
    void commands
      .getDataTableDetail(tableId)
      .then(detail => {
        if (!detail.table?.query) throw new Error("查询数据库不存在");
        setLocalDraft(definition);
        writer.reset(detail.table.query);
      })
      .catch(error => setSaveError(error instanceof Error ? error.message : String(error)));
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {localDraft && (
        <div className="text-ink-3 text-tau-meta mx-8 mb-2 flex items-center gap-2">
          已读取保存的版本，你的本地改动另存为草稿。
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDefinition(localDraft);
              writer.put(localDraft);
              setLocalDraft(undefined);
            }}
          >
            恢复本地改动
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setLocalDraft(undefined)}>
            丢弃
          </Button>
        </div>
      )}
      <QueryDatabasePanel
        definition={definition}
        onDefinitionChange={next => {
          setDefinition(next);
          writer.put(next);
        }}
        initialSourceOpen={Boolean(intent)}
        initialAssist={intent?.assist}
        saveIssue={
          saveError
            ? {
                message: saveError,
                actions: (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => writer.retry()}>
                      重试保存
                    </Button>
                    <Button size="sm" variant="ghost" onClick={readSaved}>
                      读取已保存的版本
                    </Button>
                  </>
                ),
              }
            : undefined
        }
        presentation={{ views, activeViewId: props.activeViewId }}
        databaseProps={{
          ...props,
          views,
          onDataChange: undefined,
          onCreateView: props.onCreateView
            ? async input => {
                const created = await props.onCreateView?.(input);
                return created ? toDatabaseView(created) : null;
              }
            : undefined,
          onRenameView: props.onRenameView
            ? async (id, name) => {
                const view = await props.onRenameView?.(id, name);
                return view ? toDatabaseView(view) : null;
              }
            : undefined,
          onUpdateView: props.onUpdateView
            ? async (id, updates) => {
                const view = await props.onUpdateView?.(id, updates);
                return view ? toDatabaseView(view) : null;
              }
            : undefined,
        }}
      />
    </div>
  );
}
