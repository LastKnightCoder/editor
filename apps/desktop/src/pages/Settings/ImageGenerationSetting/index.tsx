import { useCallback, useMemo, useRef, useState } from "react";
import { produce } from "immer";
import { App } from "antd";
import useSettingStore from "@/stores/useSettingStore";
import {
  DEFAULT_OPENAI_IMAGE_MODEL,
  DEFAULT_OPENAI_IMAGE_BASE_URL,
} from "@/utils/image-generation";
import { SettingInput, SettingSection } from "../components";
import SelectDropDown from "@tau/shared/src/components/SelectDropDown";
import type { ImageProviderConfig } from "@/types/imageGeneration";

const generateId = () => `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const ImageGenerationSettingContent = () => {
  const { modal } = App.useApp();
  const imageGeneration = useSettingStore(state => state.setting.imageGeneration);

  const [showDropdown, setShowDropdown] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const currentProvider = useMemo(() => {
    if (!imageGeneration.currentProviderId) return null;
    return imageGeneration.providers.find(p => p.id === imageGeneration.currentProviderId) ?? null;
  }, [imageGeneration.currentProviderId, imageGeneration.providers]);

  const selectedName = useMemo(() => {
    return currentProvider?.name ?? "选择提供商";
  }, [currentProvider]);

  const updateImageGeneration = useCallback(
    (updater: (draft: { providers: ImageProviderConfig[]; currentProviderId: string }) => void) => {
      useSettingStore.setState(state => ({
        setting: produce(state.setting, draft => {
          updater(draft.imageGeneration);
        }),
      }));
    },
    []
  );

  const selectProvider = useCallback(
    (item: ImageProviderConfig) => {
      updateImageGeneration(draft => {
        draft.currentProviderId = item.id;
      });
    },
    [updateImageGeneration]
  );

  const updateCurrentProvider = useCallback(
    (patch: Partial<ImageProviderConfig>) => {
      updateImageGeneration(draft => {
        const index = draft.providers.findIndex(p => p.id === draft.currentProviderId);
        if (index !== -1) {
          draft.providers[index] = { ...draft.providers[index], ...patch };
        }
      });
    },
    [updateImageGeneration]
  );

  const addProvider = useCallback(() => {
    const id = generateId();
    updateImageGeneration(draft => {
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
  }, [updateImageGeneration]);

  const removeCurrentProvider = useCallback(() => {
    setShowDropdown(false);
    updateImageGeneration(draft => {
      const idx = draft.providers.findIndex(p => p.id === draft.currentProviderId);
      if (idx === -1) return;
      draft.providers.splice(idx, 1);
      draft.currentProviderId = draft.providers[0]?.id ?? "";
    });
  }, [updateImageGeneration]);

  const deleteCurrentProvider = useCallback(() => {
    if (!currentProvider) return;
    modal.confirm({
      title: "删除图片生成提供商",
      content: `确定要删除「${currentProvider.name}」吗？此操作会移除该提供商的模型地址、API Key 和模型名称。`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: removeCurrentProvider,
    });
  }, [currentProvider, modal, removeCurrentProvider]);

  return (
    <SettingSection
      title="图片生成"
      description="配置图片生成模型。支持多个提供商配置，通过下拉切换当前使用的提供商。图片尺寸、质量、格式、背景等参数由模型在每次工具调用时按用户需求决定。"
    >
      <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/50">
        {/* Provider Selector */}
        <div className="flex items-center gap-3">
          <label className="whitespace-nowrap text-sm font-medium text-gray-700 dark:text-gray-300">
            当前提供商
          </label>
          <button
            ref={triggerRef}
            className="flex flex-1 items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--th-accent)] dark:border-zinc-600 dark:bg-zinc-800 dark:text-gray-200"
            onClick={() => setShowDropdown(true)}
          >
            <span>{selectedName}</span>
            <svg className="ml-2 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          {showDropdown && imageGeneration.providers.length > 0 && (
            <SelectDropDown<ImageProviderConfig>
              items={imageGeneration.providers}
              selectedKey={imageGeneration.currentProviderId}
              show
              onClose={() => setShowDropdown(false)}
              onSelect={selectProvider}
              triggerElement={triggerRef.current}
              getKey={p => p.id}
              renderItem={p => p.name}
            />
          )}
          <button
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 dark:border-zinc-600 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            onClick={addProvider}
          >
            + 添加
          </button>
        </div>

        {!currentProvider && (
          <div className="rounded-lg border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500 dark:border-zinc-700 dark:text-gray-400">
            暂无图片生成提供商。添加一个提供商后即可填写模型地址、API Key 和模型名称。
          </div>
        )}

        {/* Current Provider Config */}
        {currentProvider && (
          <>
            <SettingInput
              label="提供商名称"
              placeholder="OpenAI 兼容"
              value={currentProvider.name}
              onChange={event => updateCurrentProvider({ name: event.target.value })}
              description="为此配置设置一个便于识别的名称。"
            />
            <SettingInput
              label="模型地址"
              placeholder="https://api.example.com/v1"
              value={currentProvider.baseUrl}
              onChange={event => updateCurrentProvider({ baseUrl: event.target.value })}
              description="填写兼容图片生成 API 的服务地址，例如 https://api.example.com/v1。"
            />
            <SettingInput
              label="API Key"
              type="password"
              placeholder="sk-..."
              value={currentProvider.apiKey}
              onChange={event => updateCurrentProvider({ apiKey: event.target.value })}
              description="仅保存在本地设置中，用于调用图片生成和图片编辑 API。"
            />
            <SettingInput
              label="模型名称"
              placeholder={DEFAULT_OPENAI_IMAGE_MODEL}
              value={currentProvider.modelName}
              onChange={event => updateCurrentProvider({ modelName: event.target.value })}
              description="默认使用 gpt-image-2。"
            />
            <div className="pt-2">
              <button
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-600 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                onClick={deleteCurrentProvider}
              >
                删除此提供商
              </button>
            </div>
          </>
        )}
      </div>
    </SettingSection>
  );
};

const ImageGenerationSetting = () => (
  <div className="h-full overflow-y-auto px-6">
    <div className="mx-auto max-w-[1400px]">
      <ImageGenerationSettingContent />
    </div>
  </div>
);

export default ImageGenerationSetting;
