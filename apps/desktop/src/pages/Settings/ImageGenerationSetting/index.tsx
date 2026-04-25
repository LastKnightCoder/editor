import { produce } from "immer";
import useSettingStore from "@/stores/useSettingStore";
import {
  DEFAULT_OPENAI_IMAGE_BASE_URL,
  DEFAULT_OPENAI_IMAGE_MODEL,
} from "@/utils/openai-image-service";
import { SettingInput, SettingSection, SettingSwitch } from "../components";

export const ImageGenerationSettingContent = () => {
  const imageGeneration = useSettingStore(
    (state) => state.setting.imageGeneration,
  );

  const updateImageGeneration = (patch: Partial<typeof imageGeneration>) => {
    useSettingStore.setState((state) => ({
      setting: produce(state.setting, (draft) => {
        draft.imageGeneration = {
          ...draft.imageGeneration,
          ...patch,
        };
      }),
    }));
  };

  const isValid =
    imageGeneration.enabled &&
    imageGeneration.baseUrl.trim() &&
    imageGeneration.apiKey.trim() &&
    imageGeneration.modelName.trim();

  return (
    <SettingSection
      title="OpenAI 图片生成"
      description="配置 gpt-image-2 的连接信息。图片尺寸、质量、格式、背景等参数由模型在每次工具调用时按用户需求决定。"
    >
      <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/50">
        <SettingSwitch
          label="启用图片生成工具"
          description="启用后，配置有效时会向聊天模型注入图片生成和图片编辑工具。"
          checked={imageGeneration.enabled}
          onChange={(enabled) => updateImageGeneration({ enabled })}
        />
        <SettingInput
          label="模型地址"
          placeholder={DEFAULT_OPENAI_IMAGE_BASE_URL}
          value={imageGeneration.baseUrl}
          onChange={(event) =>
            updateImageGeneration({ baseUrl: event.target.value })
          }
          description="例如 https://api.openai.com/v1，也可填写兼容 OpenAI Images API 的代理地址。"
        />
        <SettingInput
          label="API Key"
          type="password"
          placeholder="sk-..."
          value={imageGeneration.apiKey}
          onChange={(event) =>
            updateImageGeneration({ apiKey: event.target.value })
          }
          description="仅保存在本地设置中，用于调用图片生成和图片编辑 API。"
        />
        <SettingInput
          label="模型名称"
          placeholder={DEFAULT_OPENAI_IMAGE_MODEL}
          value={imageGeneration.modelName}
          onChange={(event) =>
            updateImageGeneration({ modelName: event.target.value })
          }
          description="默认使用 gpt-image-2。"
        />
        <div className="rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-600 dark:bg-zinc-800/70 dark:text-zinc-300">
          当前状态：
          <span
            className={
              isValid
                ? "font-medium text-green-600 dark:text-green-400"
                : "font-medium text-amber-600 dark:text-amber-400"
            }
          >
            {isValid ? "配置有效，工具将自动注入" : "配置未完成，工具不会注入"}
          </span>
        </div>
      </div>
    </SettingSection>
  );
};

const ImageGenerationSetting = () => (
  <div className="h-full overflow-y-auto px-6">
    <div className="max-w-[1400px] mx-auto">
      <ImageGenerationSettingContent />
    </div>
  </div>
);

export default ImageGenerationSetting;
