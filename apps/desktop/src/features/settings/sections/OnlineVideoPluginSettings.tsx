import { Button, SettingRow } from "@tau/ui";
import { useDesktopPlugins } from "@/app/plugins/context";
import { openProviderSettings } from "@/services/open-provider-settings";
import { SettingsGroup } from "../components/SettingsGroup";

/** 视频来源按链接匹配，账号与代理在对应插件页配置。 */
export function OnlineVideoPluginSettings() {
  const runtime = useDesktopPlugins();
  const sections =
    runtime?.listSettings().filter(section => section.definition.target === "video") ?? [];
  return (
    <SettingsGroup
      title="在线视频"
      description="已启用的来源按视频链接自动匹配，可同时使用多个来源。"
    >
      {sections.map(section => (
        <SettingRow key={section.key} title={section.definition.title} description="已启用">
          <Button
            size="sm"
            onClick={() =>
              openProviderSettings(section.context.pluginId, section.key, "integration")
            }
          >
            配置
          </Button>
        </SettingRow>
      ))}
      {!sections.length && (
        <p role="status" className="text-ink-2 text-tau-body">
          在插件中心安装并启用视频来源后，可在对应插件页登录账号或设置代理。
        </p>
      )}
    </SettingsGroup>
  );
}
