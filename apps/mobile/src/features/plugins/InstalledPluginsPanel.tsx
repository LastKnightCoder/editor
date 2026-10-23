import { useState } from "react";
import { Button, Textarea } from "@tau/ui";
import { useNavigator } from "../../router";
import {
  usePluginManager,
  type ManagedPluginItem,
  type PluginManagerAction,
} from "./data/usePluginManager";
import { InstalledPluginCard } from "./components/InstalledPluginCard";
import { PluginListState } from "./components/PluginListState";
import type { PluginActionView, PluginLifecycleView } from "./components/pluginStatus";
import { useMobileCenterInstall, useMobileCenterUpdate } from "./data/center-queries";
import { CenterInstallSheet } from "./CenterInstallSheet";

function lifecycleOf(item: ManagedPluginItem): PluginLifecycleView {
  if (item.revoked) return { kind: "revoked", reason: item.revoked.reason };
  if (item.error) return { kind: "failed", message: item.error };
  if (item.pending) return { kind: "pending", version: item.pendingVersion ?? null };
  if (item.active) return { kind: "running" };
  return item.enabled ? { kind: "inactive" } : { kind: "disabled" };
}

function notesOf(item: ManagedPluginItem): string[] {
  const notes: string[] = [];
  if (!item.error && item.enabled !== item.active)
    notes.push(item.enabled ? "下次打开应用时启用。" : "下次打开应用时停用。");
  if (item.editor) notes.push("移动搜索暂不检索插件块内部源码；正文及导出仍保留原内容。");
  return notes;
}

function actionsOf(item: ManagedPluginItem): PluginActionView[] {
  const toggle: PluginManagerAction = item.error || item.enabled ? "disable" : "enable";
  const kinds: PluginManagerAction[] = [
    toggle,
    ...(item.pending ? (["cancelPending"] as const) : []),
    ...(item.hasBackup ? (["restore"] as const) : []),
    "uninstall",
    "clearData",
  ];
  return kinds.map(kind => ({ kind, ...item.actions[kind] }));
}

function InstalledPluginRow({
  item,
  manager,
}: {
  item: ManagedPluginItem;
  manager: ReturnType<typeof usePluginManager>;
}) {
  const navigator = useNavigator();
  const install = useMobileCenterInstall();
  const { config, update } = useMobileCenterUpdate(
    item.id,
    item.version,
    !!item.centerSource && !item.pending && !item.blocked
  );
  const [confirming, setConfirming] = useState(false);
  const busy = install.task.pluginId === item.id && install.mutation.isPending;
  const actions = manager.managementEnabled ? actionsOf(item) : [];
  if (config.data?.installationEnabled && !item.blocked && !item.pending) {
    if (item.retryAvailable)
      actions.unshift({ kind: "retry", allowed: !install.mutation.isPending });
    else if (update)
      actions.unshift({
        kind: "update",
        version: update.version,
        allowed: !install.mutation.isPending,
      });
  }
  if (busy) actions.unshift({ kind: "cancelInstall", allowed: true });
  let status = lifecycleOf(item);
  if (busy)
    status =
      install.phase === "checking"
        ? { kind: "verifying" }
        : { kind: "downloading", progress: null };
  else if (!item.revoked && install.task.pluginId === item.id && install.mutation.isError)
    status = { kind: "failed", message: String(install.mutation.error) };
  const perform = (action: Promise<unknown>) => {
    void action.catch(() => undefined);
  };
  return (
    <li className="flex" data-plugin-id={item.id}>
      <div className="w-full">
        <InstalledPluginCard
          name={item.name}
          pluginId={item.id}
          version={item.version}
          status={status}
          notes={notesOf(item)}
          statusStale={item.statusStale}
          actions={actions}
          busyAction={
            busy
              ? "update"
              : manager.operation?.id === item.id && manager.operation.kind !== "installDevelopment"
                ? manager.operation.kind
                : null
          }
          settings={item.settings}
          onAction={kind => {
            if (kind === "update") {
              setConfirming(true);
              return;
            }
            if (kind === "retry") {
              perform(manager.actions.retryCenter(item.id));
              return;
            }
            if (kind === "cancelInstall") {
              perform(install.cancel());
              return;
            }
            perform(manager.actions.run(kind, item.id));
          }}
          onOpenSetting={id => navigator.push("pluginSettings", { id })}
        />
      </div>
      {confirming && (
        <CenterInstallSheet
          pluginId={item.id}
          name={item.name}
          installedVersion={item.version}
          installedPermissions={item.permissions}
          install={install}
          onClose={() => setConfirming(false)}
        />
      )}
    </li>
  );
}

/** 已安装管理：启停、卸载、清数据、恢复备份与开发安装；动作允许性来自 usePluginManager。 */
export function InstalledPluginsPanel() {
  const manager = usePluginManager();
  const [source, setSource] = useState("");
  // 错误由控制器的 actionError 呈现，这里只吞掉 Promise 拒绝。
  const act = (action: Promise<unknown>) => {
    void action.catch(() => undefined);
  };
  const installing = manager.operation?.kind === "installDevelopment";
  return (
    <>
      <p className="text-ink-2 mb-4 text-[13px] leading-relaxed">
        安装与启停在重新打开应用后生效。请先保存正文；代码回退不会回退插件数据。
      </p>
      {manager.actionError && (
        <p
          role="alert"
          className="bg-danger-soft text-danger mb-3 rounded-xl px-3 py-2 text-[13px]"
        >
          {String(manager.actionError)}
        </p>
      )}
      {manager.saved && (
        <p role="status" className="bg-ok-soft text-ok mb-3 rounded-xl px-3 py-2 text-[13px]">
          已保存。重新打开应用后生效。
        </p>
      )}
      <PluginListState
        status={
          manager.loading ? "loading" : manager.error && !manager.items.length ? "error" : "ready"
        }
        error={manager.error ? String(manager.error) : undefined}
        onRetry={() => void manager.refresh()}
        retrying={manager.refreshing}
        empty={!manager.items.length}
        emptyTitle="还没有安装插件"
        emptyHint={
          import.meta.env.DEV ? "可在下方受控开发安装。" : "前往商店查看适用于本机的插件。"
        }
      >
        {manager.items.map(item => (
          <InstalledPluginRow key={item.id} item={item} manager={manager} />
        ))}
      </PluginListState>
      {import.meta.env.DEV && (
        <section
          aria-labelledby="plugin-dev-install"
          className="bg-surface shadow-card rounded-card my-4 flex flex-col gap-2 p-4"
        >
          <h2 id="plugin-dev-install" className="text-ink-1 text-[15px] font-semibold">
            受控开发安装
          </h2>
          <p className="text-ink-2 text-[13px]">
            粘贴包含 id、version、url、sha256、size 的开发包描述。
          </p>
          <Textarea
            value={source}
            onChange={event => setSource(event.target.value)}
            aria-label="开发包描述"
          />
          {!manager.developmentInstall.allowed && manager.developmentInstall.reason && (
            <p className="text-ink-3 text-[12px]">{manager.developmentInstall.reason}</p>
          )}
          {installing && (
            <p role="status" className="text-ink-2 text-[13px]">
              正在下载并校验…
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              disabled={!manager.developmentInstall.allowed}
              loading={installing}
              onClick={() => act(manager.actions.installDevelopment(source))}
            >
              校验并安装
            </Button>
            {manager.canCancelInstall && (
              <Button className="min-h-11" onClick={() => act(manager.actions.cancelInstall())}>
                取消下载
              </Button>
            )}
          </div>
        </section>
      )}
    </>
  );
}
