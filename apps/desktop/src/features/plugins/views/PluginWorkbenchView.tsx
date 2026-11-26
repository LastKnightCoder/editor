import { pluginControlsTranslator, usePluginControlsI18n } from "../controls.i18n";
import { useState } from "react";
import { Button, Panel } from "@tau/ui";
import { useDesktopPluginError, useDesktopPlugins } from "@/app/plugins/context";
import { usePage } from "@/page/PageProvider";
const t = pluginControlsTranslator.t;

export function PluginWorkbenchView() {
  usePluginControlsI18n();
  const runtime = useDesktopPlugins();
  const startupError = useDesktopPluginError();
  const { navigator } = usePage();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ cause: unknown } | null>(null);
  const error = failure
    ? failure.cause instanceof Error
      ? failure.cause.message
      : t("common.actionFailed")
    : "";
  if (!runtime)
    return (
      <p role={startupError ? "alert" : undefined} className="text-tau-body text-ink-2 p-6">
        {startupError || t("workbench.preparing")}
      </p>
    );
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setFailure(null);
    try {
      await action();
    } catch (error) {
      setFailure({ cause: error });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-tau-title text-ink-1">{t("workbench.title")}</h1>
      <p className="text-tau-body text-ink-2">{t("workbench.hint")}</p>
      <Button onClick={() => navigator.push("plugins", { tab: "installed" })}>
        {t("workbench.manage")}
      </Button>
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
    </div>
  );
}
