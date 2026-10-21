import { useState } from "react";
import { produce } from "immer";
import { copyJson } from "@tau/plugins/host";
import { Check, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, Input, Select } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import { useDesktopPlugins } from "@/app/plugins/context";
import { savePluginImagesConfig } from "@/commands/plugin-images";
import { PluginSettingsView } from "@/features/plugins/views/PluginSettingsView";
import { useImageCapabilities } from "@/services/image-capabilities";
import type { ImageGenerationStoreShape } from "@/types/imageGeneration";
import { SettingRow } from "../components/SettingRow";
import { SettingsGroup } from "../components/SettingsGroup";

export function ImageGenerationSection() {
  const { providers, currentProviderId } = useSettingStore(state => state.setting.imageGeneration);
  const runtime = useDesktopPlugins();
  const sections =
    runtime?.listSettings().filter(item => item.definition.target === "images") ?? [];
  const capabilityError = useImageCapabilities(state => state.error);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(currentProviderId || providers[0]?.id || "");
  const editing = providers.find(item => item.id === selectedId);
  const section = sections.find(item => item.context.pluginId === editing?.pluginId);

  const mutate = (update: (draft: ImageGenerationStoreShape) => void) => {
    useSettingStore.setState(state => ({
      setting: produce(state.setting, draft => update(draft.imageGeneration)),
    }));
  };

  const addProvider = (pluginId: string) => {
    const plugin = sections.find(item => item.context.pluginId === pluginId);
    if (!plugin) return;
    const id = crypto.randomUUID();
    const name = `${plugin.definition.title} ${providers.filter(p => p.pluginId === pluginId).length + 1}`;
    mutate(draft => {
      draft.providers.push({ id, name, pluginId, modelId: "", config: {} });
    });
    setSelectedId(id);
  };

  const confirmDelete = () => {
    if (!editing) return;
    const id = editing.id;
    mutate(draft => {
      draft.providers = draft.providers.filter(item => item.id !== id);
      if (draft.currentProviderId === id) draft.currentProviderId = "";
    });
    const remaining = providers.filter(p => p.id !== id);
    setSelectedId(remaining[0]?.id || "");
    setDeleteOpen(false);
  };

  return (
    <>
      <SettingsGroup title="图片生成提供商" description="添加多个账号，在图片生成时选择使用哪一个">
        <SettingRow title="当前提供商">
          <div className="flex items-center gap-2">
            <Select
              className="min-w-[240px]"
              value={selectedId}
              onValueChange={setSelectedId}
              options={providers.map(provider => ({
                value: provider.id,
                label: provider.name || "未命名",
              }))}
              placeholder={providers.length === 0 ? "暂无提供商" : "选择提供商"}
            />
            {sections.length > 0 && (
              <Select
                className="min-w-[160px]"
                value=""
                onValueChange={addProvider}
                options={sections.map(item => ({
                  value: item.context.pluginId,
                  label: item.definition.title,
                }))}
                placeholder="添加提供商"
              />
            )}
          </div>
        </SettingRow>

        {providers.length === 0 ? (
          <SettingRow
            title="开始使用"
            description="请先到插件中心安装并启用图片生成插件（如 OpenAI Images），然后在此添加配置"
          />
        ) : !editing ? (
          <div className="text-tau-meta text-ink-2 px-3 py-8 text-center">请选择一个提供商</div>
        ) : (
          <>
            <SettingRow
              title="名称"
              description={
                editing.id === currentProviderId ? "当前使用的提供商" : "未启用，切换为当前后生效"
              }
            >
              <div className="flex items-center gap-2">
                <Input
                  className="min-w-[240px]"
                  value={editing.name}
                  placeholder="账号名称"
                  onChange={event => {
                    const name = event.target.value;
                    mutate(draft => {
                      const target = draft.providers.find(item => item.id === editing.id);
                      if (target) target.name = name;
                    });
                  }}
                />
                <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setDeleteOpen(true)}>
                  删除
                </Button>
                {editing.id !== currentProviderId && (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Check}
                    onClick={() =>
                      mutate(draft => {
                        draft.currentProviderId = editing.id;
                      })
                    }
                  >
                    设为当前
                  </Button>
                )}
              </div>
            </SettingRow>

            <PluginSettingsView
              section={section}
              imageConfig={{
                instanceId: editing.id,
                value: copyJson(editing.config),
                modelId: editing.modelId,
                save: async (config, modelId) => {
                  await savePluginImagesConfig(editing.id, editing.pluginId, config, modelId);
                  mutate(draft => {
                    const target = draft.providers.find(
                      item => item.id === editing.id && item.pluginId === editing.pluginId
                    );
                    if (target) {
                      target.config = config;
                      target.modelId = modelId;
                    }
                  });
                },
              }}
            />
            {editing.id === currentProviderId && capabilityError && (
              <p className="text-tau-meta text-warn mt-2">{capabilityError}</p>
            )}
          </>
        )}
      </SettingsGroup>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="删除图片生成提供商"
        context={editing?.name}
        description="此操作会移除该账号及其插件配置。"
        impact={editing?.id === currentProviderId ? "删除后需重新选择当前账号" : undefined}
        danger
        confirmText="删除"
        onConfirm={confirmDelete}
      />
    </>
  );
}
