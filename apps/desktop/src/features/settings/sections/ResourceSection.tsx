import { useMemo, useState } from "react";
import { produce } from "immer";
import { copyJson } from "@tau/plugins/host";
import { Info } from "lucide-react";
import { Segmented, Select, Switch } from "@tau/ui";
import useSettingStore, { EImageBed } from "@/stores/useSettingStore";
import { useDesktopPlugins } from "@/app/plugins/context";
import { savePluginUploadConfig } from "@/commands/plugin-local";
import { PluginSettingsView } from "@/features/plugins/views/PluginSettingsView";
import { SettingRow } from "../components/SettingRow";
import { SettingsGroup, SettingsNote } from "../components/SettingsGroup";

export function ResourceSection() {
  const imageBed = useSettingStore(state => state.setting.imageBed);
  const runtime = useDesktopPlugins();
  const sections =
    runtime?.listSettings().filter(section => section.definition.target === "upload") ?? [];
  const [selected, setSelected] = useState("");
  const pluginId = selected || imageBed.plugin?.id || sections[0]?.context.pluginId || "";
  const section = sections.find(section => section.context.pluginId === pluginId);
  const stored = imageBed.plugin?.configurations[pluginId];
  const config = useMemo(() => copyJson(stored ?? {}), [stored]);
  return (
    <>
      <SettingsGroup title="上传目标" description="编辑器内上传的图片与附件保存到所选存储">
        <SettingRow title="存储位置">
          <Segmented
            label="上传目标"
            size="sm"
            value={imageBed.active}
            onValueChange={value =>
              useSettingStore.setState(state => ({
                setting: produce(state.setting, draft => {
                  draft.imageBed.active = value as EImageBed;
                }),
              }))
            }
          >
            <Segmented.Item value={EImageBed.Local} label="本地" />
            <Segmented.Item value={EImageBed.Plugin} label="上传插件" />
          </Segmented>
        </SettingRow>
        {imageBed.active === EImageBed.Local ? (
          <SettingRow
            title="存储目录"
            description="资源保存在应用目录的 resources 文件夹；独立 Markdown 文件保留文档旁的本地保存规则。"
          />
        ) : (
          <>
            <SettingRow title="上传插件">
              <Select
                aria-label="上传插件"
                value={pluginId}
                onValueChange={setSelected}
                options={sections.map(section => ({
                  value: section.context.pluginId,
                  label: section.definition.title,
                }))}
              />
            </SettingRow>
            {section ? (
              <PluginSettingsView
                key={section.key}
                section={section}
                uploadConfig={{
                  value: config,
                  save: async value => {
                    await savePluginUploadConfig(pluginId, value);
                    useSettingStore.setState(state => ({
                      setting: produce(state.setting, draft => {
                        draft.imageBed.active = EImageBed.Plugin;
                        draft.imageBed.plugin = {
                          id: pluginId,
                          configurations: {
                            ...draft.imageBed.plugin?.configurations,
                            [pluginId]: value,
                          },
                        };
                      }),
                    }));
                  },
                }}
              />
            ) : (
              <p role="status" className="text-ink-2 text-tau-body">
                请在插件中心安装并启用上传插件。已保存配置会保留，插件不可用时上传会明确报错。
              </p>
            )}
          </>
        )}
      </SettingsGroup>
      <SettingsGroup title="处理">
        <SettingRow title="上传压缩" description="png / jpeg / jpg 保存前自动转为 webp">
          <Switch
            aria-label="上传压缩"
            checked={imageBed.enableCompression}
            onCheckedChange={value =>
              useSettingStore.setState(state => ({
                setting: produce(state.setting, draft => {
                  draft.imageBed.enableCompression = value;
                }),
              }))
            }
          />
        </SettingRow>
      </SettingsGroup>
      <SettingsNote icon={<Info size={14} />}>
        本地 resources 目录与云端的镜像同步在「同步 · 资源文件」中管理。
      </SettingsNote>
    </>
  );
}
