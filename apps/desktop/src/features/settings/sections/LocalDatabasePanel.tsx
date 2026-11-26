import { syncTranslator, useSyncI18n } from "../sync/i18n";
import { localDatabaseVersion } from "@tau/db-schema/sync-protocol";
/**
 * 本地数据库 —— 同步页第三个 Tab（从 legacy AppAbout「数据库管理」迁入：
 * 数据库是同步的对象，切库 / 建库与同步放在一起）。
 *
 * 逻辑对齐 legacy components/SelectDatabase：切换即写 database.active（legacy 无确认，保持）；
 * 新建数据库自动补 .db 后缀并设为当前；非当前库可删除（确认后移出清单、关闭连接并删除文件）。
 * 修正 legacy 重名校验：legacy 拿未补后缀的输入与带 .db 的库名比对，「notes」与「notes.db」
 * 不会判重，会造出重复条目；这里统一按补后缀后的名称比对。
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, Info, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { produce } from "immer";
import {
  ROW_DIVIDER,
  SettingRow,
  Button,
  ConfirmDialog,
  Dialog,
  DialogBody,
  IconButton,
  Input,
  Select,
  toast,
} from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import { closeDatabase, getDatabasePath, removeFile } from "@/commands";
import { SettingsGroup, SettingsNote } from "../components/SettingsGroup";

const displayName = (name: string) => name.replace(/\.db$/i, "");
const normalizeName = (name: string) => (name.endsWith(".db") ? name : `${name}.db`);

export function LocalDatabasePanel() {
  useSyncI18n();
  const { active, databases } = useSettingStore(s => s.setting.database);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: activePath } = useQuery({
    queryKey: ["settings", "database", "path", active],
    queryFn: () => getDatabasePath(active),
    staleTime: Infinity,
  });

  const trimmed = newName.trim();
  const duplicate =
    !!trimmed &&
    databases.some(db => db.name.toLowerCase() === normalizeName(trimmed).toLowerCase());

  const switchDatabase = (name: string) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        draft.database.active = name;
      }),
    }));
  };

  const handleCreate = () => {
    if (!trimmed || duplicate) return;
    const name = normalizeName(trimmed);
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        draft.database.databases.push({ name, version: 1 });
        draft.database.active = name;
      }),
    }));
    toast.success(syncTranslator.t("database.created", { name: displayName(name) }));
    setCreateOpen(false);
  };

  const handleDelete = async () => {
    const name = deleteTarget;
    if (!name || name === active) return;
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        draft.database.databases = draft.database.databases.filter(db => db.name !== name);
      }),
    }));
    try {
      await closeDatabase(name);
      const path = await getDatabasePath(name);
      if (path) await removeFile(path);
      toast.success(syncTranslator.t("database.deleted", { name: displayName(name) }));
    } catch (error) {
      toast.error(
        syncTranslator.t("error.withReason", {
          reason: error instanceof Error ? error.message : String(error),
          message: syncTranslator.t("database.deleteError"),
        })
      );
    }
  };

  const others = databases.filter(db => db.name !== active);

  return (
    <>
      <SettingsGroup
        title={syncTranslator.t("database.current")}
        description={syncTranslator.t("database.description")}
      >
        <SettingRow
          title={syncTranslator.t("database")}
          description={
            activePath ? <span className="font-tau-mono break-all">{activePath}</span> : active
          }
        >
          <Select
            aria-label={syncTranslator.t("database.current")}
            className="w-[200px]"
            value={active}
            options={databases.map(db => ({ value: db.name, label: displayName(db.name) }))}
            onValueChange={v => switchDatabase(v)}
          />
        </SettingRow>
        <SettingRow
          title={syncTranslator.t("database.create")}
          description={syncTranslator.t("database.createHint")}
        >
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>
            {syncTranslator.t("action.new")}
          </Button>
        </SettingRow>
      </SettingsGroup>

      {others.length > 0 && (
        <SettingsGroup
          title={syncTranslator.t("database.others")}
          description={syncTranslator.t("database.deleteHint")}
        >
          {others.map(db => (
            <div
              key={db.name}
              className={clsx("rounded-tau-sm flex items-center gap-3 px-3 py-3", ROW_DIVIDER)}
            >
              <span className="bg-hover text-ink-2 rounded-tau-sm grid size-8 shrink-0 place-items-center">
                <Database size={15} strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-tau-body-lg text-ink-1 truncate font-medium">
                  {displayName(db.name)}
                </div>
                <div className="text-tau-meta text-ink-2">
                  {syncTranslator.t("database.version", { version: localDatabaseVersion(db) })}
                </div>
              </div>
              <IconButton
                aria-label={syncTranslator.t("database.deleteAria", { name: displayName(db.name) })}
                onClick={() => setDeleteTarget(db.name)}
              >
                <Trash2 size={15} strokeWidth={1.75} />
              </IconButton>
            </div>
          ))}
        </SettingsGroup>
      )}

      <SettingsNote icon={<Info size={14} strokeWidth={1.75} />}>
        {syncTranslator.t("database.backupHint")}
      </SettingsNote>

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onAfterClose={() => setNewName("")}
        title={syncTranslator.t("database.create")}
        subtitle={syncTranslator.t("database.suffixHint")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {syncTranslator.t("action.cancel")}
            </Button>
            <Button variant="primary" disabled={!trimmed || duplicate} onClick={handleCreate}>
              {syncTranslator.t("action.create")}
            </Button>
          </>
        }
      >
        <DialogBody>
          <div className="flex flex-col gap-1.5">
            <label className="text-tau-sm text-ink-2" htmlFor="new-database-name">
              {syncTranslator.t("database.name")}
            </label>
            <Input
              id="new-database-name"
              autoFocus
              value={newName}
              placeholder={syncTranslator.t("database.placeholder")}
              spellCheck={false}
              aria-invalid={duplicate || undefined}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") handleCreate();
              }}
            />
            {duplicate && (
              <div className="text-tau-meta text-danger">
                {syncTranslator.t("database.duplicate")}
              </div>
            )}
          </div>
        </DialogBody>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={open => {
          if (!open) setDeleteTarget(null);
        }}
        title={syncTranslator.t("database.delete")}
        context={deleteTarget ? displayName(deleteTarget) : undefined}
        danger
        description={syncTranslator.t("database.deleteWarning")}
        impact={syncTranslator.t("database.irreversible")}
        confirmText={syncTranslator.t("action.delete")}
        onConfirm={handleDelete}
      />
    </>
  );
}
