import { ArrowRight, ArrowUpCircle, CircleAlert } from "lucide-react";
import { Button, Panel } from "@tau/ui";
import { useDesktopPlugins } from "@/app/plugins/context";
import { useSettingsStore } from "@/app/settingsStore";
import { openPage } from "@/services/page-navigation";
import { installedPlugins, needsAttention } from "../model";

/** 设置弹窗里的插件分节：只给概要与跳转，安装、启停和插件设置都在插件页。 */
export function PluginsSettingsEntry() {
  const runtime = useDesktopPlugins();
  const plugins = runtime ? installedPlugins(runtime) : [];
  const enabled = plugins.filter(item => item.enabled).length;
  const failing = plugins.filter(needsAttention).length;
  const pending = runtime?.local?.updates.filter(item => item.pending).length ?? 0;
  const open = (tab?: string) => {
    useSettingsStore.getState().closeSettings();
    openPage("plugins", tab ? { tab } : undefined);
  };
  return (
    <Panel className="flex flex-col gap-3">
      <p className="text-tau-body text-ink-2">
        已安装 {plugins.length} 个插件，其中 {enabled}{" "}
        个启用。安装、更新和每个插件的设置都在插件页。
      </p>
      {(failing > 0 || pending > 0) && (
        <div className="text-tau-meta flex flex-wrap gap-3">
          {failing > 0 && (
            <span className="text-danger inline-flex items-center gap-1">
              <CircleAlert className="size-3.5" strokeWidth={1.75} />
              {failing} 个需要处理
            </span>
          )}
          {pending > 0 && (
            <span className="text-accent-text inline-flex items-center gap-1">
              <ArrowUpCircle className="size-3.5" strokeWidth={1.75} />
              {pending} 项重启后生效
            </span>
          )}
        </div>
      )}
      <div>
        <Button variant="primary" size="sm" onClick={() => open(failing ? "installed" : undefined)}>
          打开插件页
          <ArrowRight className="size-3.5" strokeWidth={1.75} />
        </Button>
      </div>
    </Panel>
  );
}
