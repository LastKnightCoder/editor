import { useState } from "react";
import { Button, Panel } from "@tau/ui";
import type { PluginInfo, PluginState } from "@tau/plugins/host";
import type { DesktopPluginRuntime } from "@/app/plugins/runtime";
import { useDesktopPluginError, useDesktopPlugins } from "@/app/plugins/context";
import { useSettingsStore } from "@/app/settingsStore";
import { PluginSettingsView } from "./PluginSettingsView";
import { isElectron } from "@/electron";

const labels: Record<PluginState, string> = {
  disabled: "已停用",
  activating: "正在启用",
  active: "已启用",
  deactivating: "正在停用",
  failed: "操作失败",
  "restart-required": "需要重启",
};

export function PluginManagerView() {
  const runtime = useDesktopPlugins();
  const startupError = useDesktopPluginError();
  const location = useSettingsStore(state => state.section);
  const setSection = useSettingsStore(state => state.setSection);
  if (!runtime)
    return (
      <p role={startupError ? "alert" : undefined} className="text-tau-body text-ink-2">
        {startupError || (import.meta.env.DEV ? "正在准备插件管理…" : "当前没有可管理的插件")}
      </p>
    );
  const plugins = runtime.host.listPlugins();
  const parts = location.split(":");
  const detail = location !== "plugins";
  const plugin = parts.length === 3 ? plugins.find(item => item.id === parts[1]) : undefined;
  if (detail && !plugin)
    return (
      <Panel>
        <p className="text-tau-body text-ink-2 mb-3">此插件已不可用。</p>
        <Button onClick={() => setSection("plugins")}>返回插件列表</Button>
      </Panel>
    );
  if (!plugin)
    return (
      <div className="space-y-4">
        {import.meta.env.DEV && isElectron && runtime.development && (
          <DevelopmentPluginImport runtime={runtime} />
        )}
        {startupError && (
          <p role="alert" className="text-tau-body text-danger">
            {startupError}
          </p>
        )}
        {plugins.length === 0 && <p className="text-tau-body text-ink-2">当前没有可管理的插件</p>}
        {plugins.map(item => (
          <Panel key={item.id}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Button variant="ghost" onClick={() => setSection(`plugin:${item.id}:`)}>
                  {item.name}
                </Button>
                <p className="text-tau-meta text-ink-2">
                  {item.id} · {item.version}
                </p>
              </div>
              <PluginActions runtime={runtime} plugin={item} />
            </div>
          </Panel>
        ))}
      </div>
    );
  const sections = runtime.listSettings().filter(item => item.context.pluginId === plugin.id);
  const active = parts[2] ? sections.find(item => item.key === location) : sections[0];
  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={() => setSection("plugins")}>
        返回插件列表
      </Button>
      <Panel>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-tau-title text-ink-1">{plugin.name}</h2>
            <p className="text-tau-meta text-ink-2">
              {plugin.id} · {plugin.version}
            </p>
          </div>
          <PluginActions key={plugin.id} runtime={runtime} plugin={plugin} />
        </div>
      </Panel>
      {plugin.state !== "active" ? (
        <p className="text-tau-body text-ink-2">
          插件设置暂不可用。启用后可恢复设置，已保存的偏好仍然保留。
        </p>
      ) : (
        <>
          {sections.length > 1 && (
            <nav aria-label="插件设置分组" className="flex flex-wrap gap-2">
              {sections.map(item => (
                <Button
                  key={item.key}
                  variant={item === active ? "soft" : "ghost"}
                  aria-current={item === active ? "page" : undefined}
                  onClick={() => setSection(item.key)}
                >
                  {item.definition.title}
                </Button>
              ))}
            </nav>
          )}
          {active ? (
            <section aria-label={active.definition.title}>
              <h3 className="text-tau-body text-ink-1 mb-2 font-semibold">
                {active.definition.title}
              </h3>
              <p className="text-tau-meta text-ink-2 mb-4">{active.definition.description}</p>
              <PluginSettingsView section={active} />
            </section>
          ) : parts[2] ? (
            <PluginSettingsView />
          ) : (
            <p className="text-tau-body text-ink-2">此插件没有自定义设置。</p>
          )}
        </>
      )}
    </div>
  );
}

function DevelopmentPluginImport({ runtime }: { runtime: DesktopPluginRuntime }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const choose = async () => {
    setBusy(true);
    setError("");
    try {
      await runtime.development?.choose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "读取插件失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel>
      <p className="text-tau-body text-ink-2 mb-3">
        开发插件与应用共享运行环境，仅选择你信任的代码。选择目录后默认停用，启用时才执行。
        移除登记保留插件数据和作者目录。
      </p>
      <Button loading={busy} onClick={() => void choose()}>
        选择开发插件目录
      </Button>
      {error && (
        <p role="alert" className="text-tau-meta text-danger mt-2">
          {error}
        </p>
      )}
    </Panel>
  );
}

function PluginActions({ runtime, plugin }: { runtime: DesktopPluginRuntime; plugin: PluginInfo }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const enabled = plugin.state === "active" || runtime.development?.enabled(plugin.id);
  const change = async () => {
    setBusy(true);
    setError("");
    try {
      const manager = runtime.development?.owns(plugin.id) ? runtime.development : runtime.host;
      if (enabled) await manager.disable(plugin.id);
      else await manager.enable(plugin.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await runtime.development?.remove(plugin.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : "移除失败");
    } finally {
      setBusy(false);
    }
  };
  const managementError = runtime.development?.error(plugin.id);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-tau-meta text-ink-2">{labels[plugin.state]}</span>
        <Button
          aria-label={`${enabled ? "停用" : "启用"} ${plugin.name}`}
          disabled={
            busy ||
            plugin.state === "activating" ||
            plugin.state === "deactivating" ||
            (plugin.state === "restart-required" && !enabled)
          }
          onClick={() => void change()}
        >
          {enabled ? "停用" : "启用"}
        </Button>
        {runtime.development?.owns(plugin.id) && (
          <Button
            variant="ghost"
            disabled={busy || plugin.state === "activating" || plugin.state === "deactivating"}
            onClick={() => void remove()}
          >
            移除登记
          </Button>
        )}
      </div>
      {(error || managementError || plugin.error || plugin.state === "restart-required") && (
        <p role="alert" className="text-tau-meta text-danger">
          {plugin.state === "restart-required"
            ? "插件清理未能确认完成，请重启应用后再启用。已保存的数据保留。"
            : error || managementError || plugin.error}
        </p>
      )}
    </div>
  );
}
