/**
 * 图片生成 —— 文生图提供商（兼容 OpenAI Images 接口），mockups/settings/index.html 第三版「图片生成」。
 *
 * 移植 legacy ImageGenerationSetting：多提供商 providers[] + currentProviderId。布局 = 顶部
 * ProviderSwitcher + 整宽「连接」分组（与 LLMSection 同构，provider-layout.html 方案 A）：切换栏只切换「正在编辑哪家」（与 legacy 下拉直接切当前不同），生效由右侧「设为当前」
 * 显式指定，切换栏里当前项附注「当前」。新增沿用 legacy 命名与默认值并直接设为当前；删除走
 * ConfirmDialog，删掉的是当前提供商时回落到剩余第一家（与 legacy 一致）。
 */

import { useState } from "react";
import { produce } from "immer";
import { Check, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, Input } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import {
  DEFAULT_OPENAI_IMAGE_BASE_URL,
  DEFAULT_OPENAI_IMAGE_MODEL,
} from "@/utils/image-generation";
import type { ImageGenerationStoreShape, ImageProviderConfig } from "@/types/imageGeneration";
import { SettingRow } from "../components/SettingRow";
import { SettingsGroup } from "../components/SettingsGroup";
import {
  FieldBox,
  ProviderSection,
  ProviderSwitcher,
  SecretInput,
} from "../components/ProviderLayout";

type EditableField = "name" | "baseUrl" | "apiKey" | "modelName";

const generateId = () => `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function ImageGenerationSection() {
  const { providers, currentProviderId } = useSettingStore(s => s.setting.imageGeneration);

  /* 正在编辑的提供商：editingId 失效时回落当前提供商，再回落第一家 */
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing =
    providers.find(p => p.id === editingId) ??
    providers.find(p => p.id === currentProviderId) ??
    providers[0];
  const [deleteOpen, setDeleteOpen] = useState(false);

  const mutate = (fn: (draft: ImageGenerationStoreShape) => void) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => fn(draft.imageGeneration)),
    }));
  };

  const updateField = (field: EditableField, value: string) => {
    if (!editing) return;
    mutate(draft => {
      const target = draft.providers.find(p => p.id === editing.id);
      if (target) target[field] = value;
    });
  };

  const addProvider = () => {
    const id = generateId();
    mutate(draft => {
      draft.providers.push({
        id,
        name: `OpenAI 兼容 ${draft.providers.length + 1}`,
        providerType: "openai",
        baseUrl: DEFAULT_OPENAI_IMAGE_BASE_URL,
        apiKey: "",
        modelName: DEFAULT_OPENAI_IMAGE_MODEL,
      });
      draft.currentProviderId = id;
    });
    setEditingId(id);
  };

  const setCurrent = (provider: ImageProviderConfig) => {
    mutate(draft => {
      draft.currentProviderId = provider.id;
    });
  };

  const confirmDelete = () => {
    if (!editing) return;
    const id = editing.id;
    mutate(draft => {
      const index = draft.providers.findIndex(p => p.id === id);
      if (index === -1) return;
      draft.providers.splice(index, 1);
      if (draft.currentProviderId === id) draft.currentProviderId = draft.providers[0]?.id ?? "";
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
          onAdd={addProvider}
        />
        {!editing ? (
          <div className="text-tau-meta text-ink-2 px-3 py-8 text-center">
            还没有图片生成提供商——点击「添加提供商」，再填写模型地址、API Key 和模型名称
          </div>
        ) : (
          <ProviderSection
            title="连接"
            description={
              editing.id === currentProviderId
                ? "图片生成当前使用这一家"
                : "未启用——图片生成使用标为「当前」的那一家"
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
                    onClick={() => setCurrent(editing)}
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
                  placeholder="OpenAI 兼容"
                  onChange={e => updateField("name", e.target.value)}
                />
              </FieldBox>
            </SettingRow>
            <SettingRow title="模型地址" description="OpenAI Images 兼容的接口地址">
              <FieldBox>
                <Input
                  className="font-tau-mono"
                  value={editing.baseUrl}
                  placeholder="https://api.example.com/v1"
                  spellCheck={false}
                  onChange={e => updateField("baseUrl", e.target.value)}
                />
              </FieldBox>
            </SettingRow>
            <SettingRow title="API Key" description="只保存在本地，用于生图与改图">
              <FieldBox>
                <SecretInput
                  label="API Key"
                  value={editing.apiKey}
                  placeholder="sk-…"
                  onChange={value => updateField("apiKey", value)}
                />
              </FieldBox>
            </SettingRow>
            <SettingRow title="模型名称">
              <FieldBox>
                <Input
                  className="font-tau-mono"
                  value={editing.modelName}
                  placeholder={DEFAULT_OPENAI_IMAGE_MODEL}
                  spellCheck={false}
                  onChange={e => updateField("modelName", e.target.value)}
                />
              </FieldBox>
            </SettingRow>
          </ProviderSection>
        )}
      </SettingsGroup>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="删除图片生成提供商"
        context={editing?.name}
        description="此操作会移除该提供商的模型地址、API Key 和模型名称。"
        impact={
          editing?.id === currentProviderId && providers.length > 1
            ? "这是当前提供商，删除后改用列表中的第一家"
            : undefined
        }
        danger
        confirmText="删除"
        onConfirm={confirmDelete}
      />
    </>
  );
}
