import { useState } from "react";
import { Button, Textarea } from "@tau/ui";
import { useNavigator } from "../../router";
import { usePluginManager, type ManagedPluginItem } from "./data/usePluginManager";
import { InstalledPluginRow } from "./components/InstalledPluginRow";
import { PluginChangesBanner } from "./components/PluginChangesBanner";
import { PluginListState } from "./components/PluginListState";
import { hasPendingChange, lifecycleOf } from "./components/pluginStatus";
import { storeTaskPhase } from "./components/storeActions";
import { useMobileCenterInstall, useMobileCenterUpdate } from "./data/center-queries";

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
  const navigator = useNavigator();
  const install = useMobileCenterInstall();
  const { update } = useMobileCenterUpdate(
    item.id,
    item.version,
    !!item.centerSource && !item.pending && !item.blocked
  );
  const toggle = item.enabled ? "disable" : "enable";
  return (
    <InstalledPluginRow
      id={item.id}
      name={item.name}
      version={item.version}
      status={lifecycleOf(item, storeTaskPhase(install.task, item.id), install.mutation.error)}
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

/** 已安装：开关 + 状态；变更经横幅「立即生效」重建插件会话，管理动作在详情页；开发构建保留受控开发安装。 */
export function InstalledPluginsPanel({ q = "" }: { q?: string }) {
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
      {manager.actionError && (
        <p role="alert" className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-[13px]">
          {String(manager.actionError)}
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
        emptyTitle={q ? "没有找到匹配的插件" : "还没有安装插件"}
        emptyHint={
          q
            ? "换个关键词试试。"
            : import.meta.env.DEV
              ? "可在下方受控开发安装。"
              : "前往商店查看适用于本机的插件。"
        }
      >
        {items.map((item, index) => (
          <Row key={item.id} item={item} manager={manager} divider={index > 0} />
        ))}
      </PluginListState>
      {!manager.loading && !manager.managementEnabled && manager.items.length > 0 && (
        <p className="text-ink-3 px-1 text-[12px]">当前构建未开放插件管理操作。</p>
      )}
      {manager.items.some(item => item.statusStale) && (
        <p className="text-ink-3 px-1 text-[12px]">发布状态未刷新；已确认撤回的版本仍保持停用。</p>
      )}
      {import.meta.env.DEV && (
        <section
          aria-labelledby="plugin-dev-install"
          className="bg-surface my-2 flex flex-col gap-2 rounded-[18px] p-4"
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
    </div>
  );
}
