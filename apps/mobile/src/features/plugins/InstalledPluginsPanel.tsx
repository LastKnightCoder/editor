import {
  pluginTranslator,
  pluginCount,
  usePluginI18n,
  pluginActionReason,
  pluginError,
} from "./i18n";
import { useState } from "react";
import { Button, Textarea } from "@tau/ui";
import { describeCenterPermissions } from "@tau/plugins/center";
import { useNavigator } from "../../router";
import { usePluginManager, type ManagedPluginItem } from "./data/usePluginManager";
import { InstalledPluginRow } from "./components/InstalledPluginRow";
import { PluginChangesBanner } from "./components/PluginChangesBanner";
import { PluginListState } from "./components/PluginListState";
import { hasPendingChange, lifecycleOf } from "./components/pluginStatus";
import { storeTaskPhase } from "./components/storeActions";
import { releasePermissions } from "./components/centerDisplay";
import { UpdateAllSheet, type UpdateAllEntry } from "./components/UpdateAllSheet";
import {
  checksUpdate,
  useAvailablePluginUpdates,
  useMobileCenterInstall,
  useMobileCenterUpdate,
} from "./data/center-queries";
const t = pluginTranslator.t;

const matches = (item: ManagedPluginItem, q: string) => {
  const query = q.toLowerCase();
  return !query || item.name.toLowerCase().includes(query) || item.id.toLowerCase().includes(query);
};

function Row({
  item,
  manager,
  divider,
}: {
  item: ManagedPluginItem;
  manager: ReturnType<typeof usePluginManager>;
  divider: boolean;
}) {
  usePluginI18n();
  const navigator = useNavigator();
  const task = useMobileCenterInstall().task(item.id);
  const { update } = useMobileCenterUpdate(item.id, item.version, checksUpdate(item));
  const toggle = item.enabled ? "disable" : "enable";
  return (
    <InstalledPluginRow
      id={item.id}
      name={item.name}
      version={item.version}
      status={lifecycleOf(item, storeTaskPhase(task), task?.error)}
      update={update?.version ?? null}
      enabled={item.enabled}
      toggle={manager.managementEnabled ? item.actions[toggle] : null}
      divider={divider}
      onOpen={() => navigator.push("pluginDetail", { pluginId: item.id })}
      // 错误由控制器的 actionError 呈现，这里只吞掉 Promise 拒绝
      onToggle={() => void manager.actions.run(toggle, item.id).catch(() => undefined)}
    />
  );
}

/** 有可用更新时提供一键更新：确认后全部进入应用级安装队列，各行就地显示进度。 */
function UpdateAllBar({ items }: { items: readonly ManagedPluginItem[] }) {
  usePluginI18n();
  const install = useMobileCenterInstall();
  // 打开时冻结清单：确认后各项进入安装队列会从可更新列表消失，面板仍需完整播完退场
  const [batch, setBatch] = useState<{ open: boolean; entries: UpdateAllEntry[] }>({
    open: false,
    entries: [],
  });
  const entries: UpdateAllEntry[] = useAvailablePluginUpdates(items).map(
    ({ pluginId, release }) => {
      const item = items.find(value => value.id === pluginId);
      return {
        id: pluginId,
        releaseId: release.releaseId,
        name: item?.name ?? pluginId,
        from: item?.version ?? null,
        to: release.version,
        newPermissions: describeCenterPermissions(releasePermissions(release), item?.permissions)
          .filter(permission => permission.newlyRequested)
          .map(permission => permission.permission),
      };
    }
  );
  const close = () => setBatch(value => ({ ...value, open: false }));
  return (
    <>
      {entries.length > 0 && (
        <div className="bg-accent-soft flex items-center gap-2.5 rounded-[14px] px-3 py-2.5">
          <span className="text-ink-1 min-w-0 flex-1 text-[13px] leading-snug">
            {pluginCount("center.updates", entries.length)}
            <span className="text-ink-2 block truncate text-[11.5px]">
              {entries.map(entry => entry.name).join("、")}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setBatch({ open: true, entries })}
            className="bg-accent text-ink-inverse h-[30px] shrink-0 rounded-full px-3 text-[12.5px] font-bold active:scale-95"
          >
            {t("center.updateAll")}
          </button>
        </div>
      )}
      <UpdateAllSheet
        open={batch.open}
        entries={batch.entries}
        onClose={close}
        onConfirm={() => {
          close();
          for (const entry of batch.entries)
            void install.install(entry.id, entry.releaseId).catch(() => undefined);
        }}
      />
    </>
  );
}

/** 已安装：开关 + 状态；中心更新下载完自动重建插件会话，启停经横幅「立即生效」，管理动作在详情页；开发构建保留受控开发安装。 */
export function InstalledPluginsPanel({ q = "" }: { q?: string }) {
  usePluginI18n();
  const manager = usePluginManager();
  const [source, setSource] = useState("");
  const act = (action: Promise<unknown>) => {
    void action.catch(() => undefined);
  };
  const installing = manager.operation?.kind === "installDevelopment";
  const items = manager.items.filter(item => matches(item, q));
  return (
    <div className="flex flex-col gap-3">
      <PluginChangesBanner
        changes={manager.items.filter(hasPendingChange).map(item => item.name)}
      />
      <UpdateAllBar items={manager.items} />
      {manager.actionError && (
        <p role="alert" className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-[13px]">
          {pluginError(manager.actionError)}
        </p>
      )}
      <PluginListState
        status={
          manager.loading ? "loading" : manager.error && !manager.items.length ? "error" : "ready"
        }
        error={manager.error ? String(manager.error) : undefined}
        onRetry={() => void manager.refresh()}
        retrying={manager.refreshing}
        empty={!items.length}
        emptyTitle={q ? t("center.noMatches") : t("center.noInstalled")}
        emptyHint={
          q
            ? t("center.tryKeyword")
            : import.meta.env.DEV
              ? t("center.devHint")
              : t("center.storeHint")
        }
      >
        {items.map((item, index) => (
          <Row key={item.id} item={item} manager={manager} divider={index > 0} />
        ))}
      </PluginListState>
      {!manager.loading && !manager.managementEnabled && manager.items.length > 0 && (
        <p className="text-ink-3 px-1 text-[12px]">{t("center.managementClosed")}</p>
      )}
      {manager.items.some(item => item.statusStale) && (
        <p className="text-ink-3 px-1 text-[12px]">{t("center.statusStale")}</p>
      )}
      {import.meta.env.DEV && (
        <section
          aria-labelledby="plugin-dev-install"
          className="bg-surface my-2 flex flex-col gap-2 rounded-[18px] p-4"
        >
          <h2 id="plugin-dev-install" className="text-ink-1 text-[15px] font-semibold">
            {t("center.devInstall")}
          </h2>
          <p className="text-ink-2 text-[13px]">{t("center.devDescription")}</p>
          <Textarea
            value={source}
            onChange={event => setSource(event.target.value)}
            aria-label={t("center.devSource")}
          />
          {!manager.developmentInstall.allowed && manager.developmentInstall.reason && (
            <p className="text-ink-3 text-[12px]">
              {pluginActionReason(manager.developmentInstall)}
            </p>
          )}
          {installing && (
            <p role="status" className="text-ink-2 text-[13px]">
              {t("center.devDownloading")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              disabled={!manager.developmentInstall.allowed}
              loading={installing}
              onClick={() => act(manager.actions.installDevelopment(source))}
            >
              {t("center.devSubmit")}
            </Button>
            {manager.canCancelInstall && (
              <Button className="min-h-11" onClick={() => act(manager.actions.cancelInstall())}>
                {t("install.cancelDownload")}
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
