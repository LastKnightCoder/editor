import { useState } from "react";
import { produce } from "immer";
import { copyJson } from "@tau/plugins/host";
import { Check, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, Dialog, DialogBody, Input } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import { useDesktopPlugins } from "@/app/plugins/context";
import { savePluginImagesConfig } from "@/commands/plugin-images";
import { PluginSettingsView } from "@/features/plugins/views/PluginSettingsView";
import { useImageCapabilities } from "@/services/image-capabilities";
import type { ImageGenerationStoreShape } from "@/types/imageGeneration";
import { SettingRow } from "../components/SettingRow";
import { SettingsGroup } from "../components/SettingsGroup";
import { FieldBox, ProviderSection, ProviderSwitcher } from "../components/ProviderLayout";

export function ImageGenerationSection() {
  const { providers, currentProviderId } = useSettingStore(state => state.setting.imageGeneration);
  const runtime = useDesktopPlugins();
  const sections =
    runtime?.listSettings().filter(item => item.definition.target === "images") ?? [];
  const capabilityError = useImageCapabilities(state => state.error);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const editing =
    providers.find(item => item.id === editingId) ??
    providers.find(item => item.id === currentProviderId) ??
    providers[0];
  const section = sections.find(item => item.context.pluginId === editing?.pluginId);
  const mutate = (update: (draft: ImageGenerationStoreShape) => void) => {
    useSettingStore.setState(state => ({
      setting: produce(state.setting, draft => update(draft.imageGeneration)),
    }));
  };
  const addProvider = (pluginId: string, name: string) => {
    const id = crypto.randomUUID();
    mutate(draft => {
      draft.providers.push({ id, name, pluginId, modelId: "", config: {} });
    });
    setEditingId(id);
    setCreateOpen(false);
  };
  const confirmDelete = () => {
    if (!editing) return;
    const id = editing.id;
    mutate(draft => {
      draft.providers = draft.providers.filter(item => item.id !== id);
      if (draft.currentProviderId === id) draft.currentProviderId = "";
    });
    setEditingId(null);
    setDeleteOpen(false);
  };
  return (
    <>
      <SettingsGroup>
        <ProviderSwitcher
          label="图片生成提供商"
          items={providers.map(provider => ({
            id: provider.id,
            label: provider.name || "未命名",
            meta: provider.id === currentProviderId ? "当前" : undefined,
          }))}
          activeId={editing?.id}
          onSelect={setEditingId}
          addLabel="添加提供商"
          onAdd={() => setCreateOpen(true)}
        />
        {!editing ? (
          <div className="text-tau-meta text-ink-2 px-3 py-8 text-center">
            还没有图片生成提供商，请先安装并启用图片插件，再添加账号。
          </div>
        ) : (
          <ProviderSection
            title="连接"
            description={
              editing.id === currentProviderId
                ? "图片生成当前使用这一账号"
                : "未启用，图片生成使用标为当前的账号"
            }
            action={
              <>
                <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setDeleteOpen(true)}>
                  删除
                </Button>
                {editing.id !== currentProviderId && (
                  <Button
                    variant="secondary"
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
              </>
            }
          >
            <SettingRow title="名称">
              <FieldBox>
                <Input
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
              </FieldBox>
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
              <p className="text-tau-meta text-warn">{capabilityError}</p>
            )}
          </ProviderSection>
        )}
      </SettingsGroup>
      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="添加图片生成账号"
        subtitle="选择已启用的图片插件"
      >
        <DialogBody>
          <div className="flex flex-col gap-2">
            {sections.map(item => (
              <Button
                key={item.key}
                onClick={() => addProvider(item.context.pluginId, item.definition.title)}
              >
                {item.definition.title}
              </Button>
            ))}
            {sections.length === 0 && (
              <p className="text-tau-meta text-ink-2">请先到插件中心安装并启用图片插件。</p>
            )}
          </div>
        </DialogBody>
      </Dialog>
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
