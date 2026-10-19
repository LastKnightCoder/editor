import { useMemo } from "react";
import { produce } from "immer";
import type { JsonValue } from "@tau/plugins";
import { copyJson } from "@tau/plugins/host";
import useSettingStore from "@/stores/useSettingStore";
import { useDesktopPlugins } from "@/app/plugins/context";
import { savePluginVideoConfig } from "@/commands/plugin-video";
import { PluginSettingsView } from "@/features/plugins/views/PluginSettingsView";
import type { RegisteredPluginSettings } from "@/app/plugins/runtime";
import { SettingsGroup } from "../components/SettingsGroup";

function VideoPluginSection({ section }: { section: RegisteredPluginSettings }) {
  const pluginId = section.context.pluginId;
  const stored = useSettingStore(state => state.setting.onlineVideo.configurations[pluginId]);
  const value = useMemo(() => copyJson((stored ?? {}) as JsonValue), [stored]);
  return (
    <div className="flex flex-col gap-2">
      <div className="text-tau-body text-ink-1 font-medium">{section.definition.title}</div>
      <PluginSettingsView
        section={section}
        videoConfig={{
          value,
          save: async (next: JsonValue) => {
            await savePluginVideoConfig(pluginId, next);
            useSettingStore.setState(state => ({
              setting: produce(state.setting, draft => {
                draft.onlineVideo.configurations[pluginId] = next;
              }),
            }));
          },
        }}
      />
    </div>
  );
}

/** 视频插件的账号与代理表单，由各插件注册；配置按插件分别保存。 */
export function OnlineVideoPluginSettings() {
  const runtime = useDesktopPlugins();
  const sections =
    runtime?.listSettings().filter(section => section.definition.target === "video") ?? [];
  return (
    <SettingsGroup
      title="在线视频"
      description="添加 Bilibili、YouTube 等来源的视频时使用的账号与代理"
    >
      {sections.length ? (
        sections.map(section => <VideoPluginSection key={section.key} section={section} />)
      ) : (
        <p role="status" className="text-ink-2 text-tau-body">
          在插件中心安装 Bilibili、YouTube 等视频来源后，可以在这里登录账号或设置代理。
        </p>
      )}
    </SettingsGroup>
  );
}
