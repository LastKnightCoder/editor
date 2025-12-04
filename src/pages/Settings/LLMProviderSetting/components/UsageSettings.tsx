import useSettingStore from "@/stores/useSettingStore";
import classNames from "classnames";
import { SettingDropdown } from "../../components";
import useThemeColors from "@/hooks/useThemeColors";

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
    contentPolish: "内容润色",
  } as const;

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

  return (
    <div className={classNames("rounded-xl bg-transparent")}>
      <div className="space-y-4">
        {Object.entries(featureNames).map(([featureKey, featureName]) => {
          const feature = featureKey as keyof typeof llmUsageSettings;
          const currentConfig = llmUsageSettings[feature];
          const availableModels = currentConfig
            ? getAvailableModels(currentConfig.providerId)
            : [];

          return (
            <div
              key={feature}
              className={classNames(
                "rounded-lg p-4 border",
                themeColors.focusBorderClass,
              )}
            >
              <div className="mb-3">
                <h4 className={classNames("text-sm font-medium")}>
                  {featureName}
                </h4>
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
        })}
      </div>
    </div>
  );
};

export default UsageSettings;
