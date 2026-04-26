import { produce } from "immer";
import useSettingStore from "@/stores/useSettingStore";
import { DEFAULT_OPENAI_IMAGE_MODEL } from "@/utils/openai-image-service";
import { SettingInput, SettingSection } from "../components";

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

  return (
    <SettingSection
      title="图片生成"
      description="配置图片生成模型的连接信息。图片尺寸、质量、格式、背景等参数由模型在每次工具调用时按用户需求决定。"
    >
      <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/50">
        <SettingInput
          label="模型地址"
          placeholder="https://api.example.com/v1"
          value={imageGeneration.baseUrl}
          onChange={(event) =>
            updateImageGeneration({ baseUrl: event.target.value })
          }
          description="填写兼容图片生成 API 的服务地址，例如 https://api.example.com/v1。"
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
