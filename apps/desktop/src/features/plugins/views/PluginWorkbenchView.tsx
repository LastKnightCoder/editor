import { useState } from "react";
import { Button, Panel } from "@tau/ui";
import { useDesktopPluginError, useDesktopPlugins } from "@/app/plugins/context";
import { usePage } from "@/page/PageProvider";
import { PluginEditorWorkbench } from "./PluginEditorWorkbench";

export function PluginWorkbenchView() {
  const runtime = useDesktopPlugins();
  const startupError = useDesktopPluginError();
  const { navigator } = usePage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!runtime)
    return (
      <p role={startupError ? "alert" : undefined} className="text-tau-body text-ink-2 p-6">
        {startupError || "正在准备插件开发台…"}
      </p>
    );
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-tau-title text-ink-1">插件开发台</h1>
      <p className="text-tau-body text-ink-2">
        这里提供已安装插件的调试命令与实验编辑器。请在插件管理中启用需要的插件。
      </p>
      <Button onClick={() => navigator.push("plugins", { tab: "installed" })}>打开插件管理</Button>
      {error && (
        <p role="alert" className="text-danger text-tau-body">
          {error}
        </p>
      )}
      {runtime.host.listPlugins().map(plugin => (
        <Panel key={plugin.id}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-tau-body text-ink-1 font-semibold">{plugin.name}</h2>
              <p className="text-tau-meta text-ink-2">
                {plugin.id} · {plugin.version}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {runtime.host
              .listCommands()
              .filter(command => command.pluginId === plugin.id)
              .map(command => (
                <Button
                  key={command.id}
                  variant="soft"
                  disabled={busy}
                  onClick={() => void run(() => runtime.host.executeCommand(command.id))}
                >
                  {command.title}
                </Button>
              ))}
          </div>
        </Panel>
      ))}
      <PluginEditorWorkbench runtime={runtime} />
    </div>
  );
}
