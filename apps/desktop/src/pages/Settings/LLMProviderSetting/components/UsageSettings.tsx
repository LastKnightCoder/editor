import useSettingStore from "@/stores/useSettingStore";
import classNames from "classnames";
import { SettingDropdown } from "../../components";
import useThemeColors from "@/hooks/useThemeColors";
import { useState } from "react";

const UsageSettings = () => {
  const { llmConfigs, llmUsageSettings, updateLLMUsageSetting } =
    useSettingStore((state) => ({
      llmConfigs: state.setting.llmConfigs,
      llmUsageSettings: state.setting.llmUsageSettings,
      updateLLMUsageSetting: state.updateLLMUsageSetting,
    }));

  const themeColors = useThemeColors();

  const featureNames = {
    chat: "对话功能",
    titleSummary: "标题总结",
    aiContinueWrite: "AI续写",
    webClip: "网页剪藏",
    podcastGeneration: "播客生成",
    flashcardGeneration: "闪卡生成",
    aiJudgement: "答案评判",
    autoTagging: "自动打标签",
    transcriptionOptimization: "转录断句优化",
    videoSummary: "视频总结",
    vibeLearningImageDescription: "Vibe Learning 图片理解",
    vibeLearningDocSummary: "Vibe Learning 文档摘要",
  } as const;

  const categories = [
    {
      key: "conversation",
      label: "对话与写作",
      features: ["chat", "aiContinueWrite"] as const,
    },
    {
      key: "content",
      label: "内容处理",
      features: ["titleSummary", "webClip", "autoTagging"] as const,
    },
    {
      key: "media",
      label: "多媒体",
      features: [
        "podcastGeneration",
        "videoSummary",
        "transcriptionOptimization",
      ] as const,
    },
    {
      key: "learning",
      label: "学习辅助",
      features: [
        "flashcardGeneration",
        "aiJudgement",
        "vibeLearningImageDescription",
        "vibeLearningDocSummary",
      ] as const,
    },
  ];

  const handleProviderChange = (
    feature: keyof typeof llmUsageSettings,
    providerId: string,
  ) => {
    if (!providerId) {
      updateLLMUsageSetting(feature, null);
      return;
    }
    const provider = llmConfigs.find((p) => p.id === providerId);
    if (provider && provider.models.length > 0) {
      updateLLMUsageSetting(feature, {
        providerId,
        modelName: provider.models[0].name,
      });
    }
  };

  const handleModelChange = (
    feature: keyof typeof llmUsageSettings,
    modelName: string,
  ) => {
    const currentConfig = llmUsageSettings[feature];
    if (currentConfig) {
      updateLLMUsageSetting(feature, {
        ...currentConfig,
        modelName,
      });
    }
  };

  const getAvailableModels = (providerId: string) => {
    const provider = llmConfigs.find((p) => p.id === providerId);
    return provider?.models || [];
  };

  const renderFeatureItem = (featureKey: keyof typeof featureNames) => {
    const feature = featureKey as keyof typeof llmUsageSettings;
    const featureName = featureNames[featureKey];
    const currentConfig = llmUsageSettings[feature];
    const availableModels = currentConfig
      ? getAvailableModels(currentConfig.providerId)
      : [];

    return (
      <div
        key={feature}
        className="py-4 border-b last:border-b-0 border-[#fafafa] dark:border-[#2a2a2a]"
      >
        <div className="mb-3">
          <h4 className={classNames("text-sm font-medium")}>{featureName}</h4>
          <p
            className={classNames(
              "text-xs mt-0.5",
              themeColors.secondaryTextClass,
            )}
          >
            为此功能选择使用的大模型配置
          </p>
        </div>

        <div className="space-y-3">
          <SettingDropdown
            label="选择配置"
            value={currentConfig?.providerId || ""}
            onChange={(value) => handleProviderChange(feature, value)}
            options={[
              { label: "请选择配置", value: "" },
              ...llmConfigs.map((config) => ({
                label: config.name,
                value: config.id,
              })),
            ]}
          />

          {currentConfig && availableModels.length > 0 && (
            <SettingDropdown
              label="选择模型"
              value={currentConfig.modelName}
              onChange={(value) => handleModelChange(feature, value)}
              options={availableModels.map((model) => ({
                label: `${model.name} / ${model.description}`,
                value: model.name,
              }))}
            />
          )}
        </div>
      </div>
    );
  };

  const [activeTab, setActiveTab] = useState(categories[0].key);

  const activeCategory = categories.find((c) => c.key === activeTab)!;

  return (
    <div>
      <div className="flex gap-2 mb-4 border-b border-[#fafafa] dark:border-[#2a2a2a]">
        {categories.map((category) => (
          <button
            key={category.key}
            onClick={() => setActiveTab(category.key)}
            className={classNames(
              "px-4 py-2 text-sm font-medium transition-colors -mb-px border-b-2",
              activeTab === category.key
                ? themeColors.activeTextClass
                : classNames(
                    "border-transparent",
                    themeColors.hoverTextClass,
                    themeColors.secondaryTextClass,
                  ),
            )}
            style={
              activeTab === category.key
                ? { borderBottomColor: themeColors.accentColor }
                : undefined
            }
          >
            {category.label}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        {activeCategory.features.map((featureKey) =>
          renderFeatureItem(featureKey),
        )}
      </div>
    </div>
  );
};

export default UsageSettings;
