import { Card, Select, Typography, Space } from "antd";
import useSettingStore from "@/stores/useSettingStore";

const { Title, Text } = Typography;
const { Option } = Select;

const UsageSettings = () => {
  const { llmConfigs, llmUsageSettings, updateLLMUsageSetting } =
    useSettingStore((state) => ({
      llmConfigs: state.setting.llmConfigs,
      llmUsageSettings: state.setting.llmUsageSettings,
      updateLLMUsageSetting: state.updateLLMUsageSetting,
    }));

  const featureNames = {
    chat: "对话功能",
    titleSummary: "标题总结",
    aiContinueWrite: "AI续写",
    webClip: "网页剪藏",
    podcastGeneration: "播客生成",
  } as const;

  const handleProviderChange = (
    feature: keyof typeof llmUsageSettings,
    providerId: string,
  ) => {
    const provider = llmConfigs.find((p) => p.id === providerId);
    if (provider && provider.models.length > 0) {
      // 默认选择第一个模型
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
    <Card title="功能使用设置" className="mb-0">
      <div className="flex flex-col gap-6">
        {Object.entries(featureNames).map(([featureKey, featureName]) => {
          const feature = featureKey as keyof typeof llmUsageSettings;
          const currentConfig = llmUsageSettings[feature];
          const availableModels = currentConfig
            ? getAvailableModels(currentConfig.providerId)
            : [];

          return (
            <div
              key={feature}
              className="border border-gray-100 rounded-lg p-4 bg-gray-50 dark:border-gray-700 dark:bg-gray-800 transition-all duration-200"
            >
              <div className="mb-3">
                <Title level={5} className="!mb-1">
                  {featureName}
                </Title>
                <Text type="secondary">为此功能选择使用的大模型配置</Text>
              </div>

              <Space direction="vertical" style={{ width: "100%" }}>
                <div>
                  <Text strong>选择配置:</Text>
                  <Select
                    placeholder="选择一个配置"
                    value={currentConfig?.providerId}
                    onChange={(value) => handleProviderChange(feature, value)}
                    style={{ width: "100%", marginTop: 4 }}
                    allowClear
                    onClear={() => updateLLMUsageSetting(feature, null)}
                  >
                    {llmConfigs.map((config) => (
                      <Option key={config.id} value={config.id}>
                        <div>
                          <div>{config.name}</div>
                        </div>
                      </Option>
                    ))}
                  </Select>
                </div>

                {currentConfig && availableModels.length > 0 && (
                  <div>
                    <Text strong>选择模型:</Text>
                    <Select
                      value={currentConfig.modelName}
                      onChange={(value) => handleModelChange(feature, value)}
                      style={{ width: "100%", marginTop: 4 }}
                    >
                      {availableModels.map((model) => (
                        <Option key={model.name} value={model.name}>
                          <div>
                            {model.name}/{model.description}
                          </div>
                        </Option>
                      ))}
                    </Select>
                  </div>
                )}
              </Space>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default UsageSettings;
