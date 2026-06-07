import useSettingStore from "@/stores/useSettingStore";
import useThemeColors from "@/hooks/useThemeColors";
import { App } from "antd";
import { produce } from "immer";
import classNames from "classnames";
import { useState } from "react";
import { ChevronDown, Plus, Pencil, Trash2, Copy } from "lucide-react";
import { ConfigItem, ModelItem } from "../types";
import { SettingButton } from "../../components";

const featureMap: Array<{
  key: keyof ModelItem["features"];
  label: string;
  colorClass: string;
}> = [
  {
    key: "online",
    label: "联网",
    colorClass:
      "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",
  },
  {
    key: "thinking",
    label: "思考",
    colorClass:
      "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400",
  },
  {
    key: "image",
    label: "图片",
    colorClass:
      "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400",
  },
  {
    key: "video",
    label: "视频",
    colorClass:
      "bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-400",
  },
  {
    key: "audio",
    label: "音频",
    colorClass:
      "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400",
  },
  {
    key: "file",
    label: "文件",
    colorClass:
      "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400",
  },
];

interface ConfigListProps {
  onAddConfig: () => void;
  onEditConfig: (config: ConfigItem) => void;
  selectedConfigId: string;
  onSelectConfig: (configId: string) => void;
  onAddModel: (configId: string) => void;
  onEditModel: (configId: string, model: ModelItem) => void;
}

const ConfigList = ({
  onAddConfig,
  onEditConfig,
  selectedConfigId,
  onSelectConfig,
  onAddModel,
  onEditModel,
}: ConfigListProps) => {
  const { configs } = useSettingStore((state) => ({
    configs: state.setting.llmConfigs,
  }));
  const { modal, message } = App.useApp();
  const themeColors = useThemeColors();
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
    onSelectConfig(id);
  };

  const onDeleteConfig = (id: string) => {
    modal.confirm({
      title: "确定删除此配置吗？",
      okButtonProps: { danger: true },
      okText: "删除",
      cancelText: "取消",
      onOk: () => {
        useSettingStore.setState(
          produce((draft) => {
            const index = draft.setting.llmConfigs.findIndex(
              (item: ConfigItem) => item.id === id,
            );
            if (index !== -1) {
              draft.setting.llmConfigs.splice(index, 1);
            }
          }),
        );
        if (id === selectedConfigId) {
          onSelectConfig("");
        }
        setExpandedIds((prev) => prev.filter((i) => i !== id));
      },
    });
  };

  const onDeleteModel = (configId: string, modelName: string) => {
    modal.confirm({
      title: "确定删除此模型吗？",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: () => {
        useSettingStore.setState(
          produce((draft) => {
            const config = draft.setting.llmConfigs.find(
              (item: ConfigItem) => item.id === configId,
            );
            if (config && config.models) {
              config.models = config.models.filter(
                (item: ModelItem) => item.name !== modelName,
              );
            }
          }),
        );
      },
    });
  };

  const onCopyApiKey = (apiKey: string) => {
    navigator.clipboard.writeText(apiKey);
    message.success("API Key 已复制到剪贴板");
  };

  const renderFeatureTags = (features: ModelItem["features"]) => {
    const normalizedFeatures: Record<string, boolean> = {
      online: features?.online ?? false,
      thinking: features?.thinking ?? false,
      image: features?.image ?? features?.multimodal ?? false,
      video: features?.video ?? false,
      audio: features?.audio ?? false,
      file: features?.file ?? false,
    };

    const tags = featureMap
      .filter((item) => normalizedFeatures[item.key])
      .map((item) => (
        <span
          key={item.key}
          className={`px-2 py-0.5 text-xs font-medium rounded-full ${item.colorClass}`}
        >
          {item.label}
        </span>
      ));

    return tags.length > 0 ? tags : null;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SettingButton
          variant="secondary"
          onClick={onAddConfig}
          icon={<Plus className="w-4 h-4" />}
        >
          添加配置
        </SettingButton>
      </div>

      <div className="space-y-1">
        {configs.map((config) => {
          const isExpanded = expandedIds.includes(config.id);
          return (
            <div key={config.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleExpand(config.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleExpand(config.id);
                  }
                }}
                className={classNames(
                  "w-full flex items-center justify-between px-3 py-3 rounded-lg text-left transition-colors",
                  themeColors.hoverClass,
                )}
              >
                <div className="flex items-center gap-2">
                  <ChevronDown
                    className={classNames(
                      "w-4 h-4 transition-transform",
                      isExpanded && "rotate-180",
                    )}
                  />
                  <span className="font-medium">{config.name}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {config.models?.length || 0} 个模型
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditConfig(config);
                    }}
                    className={classNames(
                      "p-1.5 rounded-lg transition-colors",
                      themeColors.secondaryTextClass,
                      themeColors.hoverClass,
                      themeColors.hoverTextClass,
                    )}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConfig(config.id);
                    }}
                    className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="pl-6 pb-4 pt-2">
                  <div className="grid grid-cols-[72px_1fr] gap-y-2 text-sm mb-2">
                    <span className="text-gray-500 dark:text-gray-400 mb-1">
                      Base URL
                    </span>
                    <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
                      {config.baseUrl}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      API Key
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
                        ••••••••
                      </span>
                      <button
                        onClick={() => onCopyApiKey(config.apiKey)}
                        className="p-1 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                        title="复制"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-[#eee] dark:border-[#333] pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                        模型列表
                      </span>
                      <SettingButton
                        variant="secondary"
                        onClick={() => onAddModel(config.id)}
                        icon={<Plus className="w-3.5 h-3.5" />}
                      >
                        添加
                      </SettingButton>
                    </div>

                    {config.models && config.models.length > 0 ? (
                      <div className="space-y-1">
                        {config.models.map((model) => (
                          <div
                            key={model.name}
                            className="group flex items-start justify-between p-3 -mx-3 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-gray-800 dark:text-gray-100">
                                {model.name}
                              </div>
                              <div className="text-xs mt-1 text-gray-500 dark:text-gray-400">
                                {model.description}
                              </div>
                              {renderFeatureTags(model.features) && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {renderFeatureTags(model.features)}
                                  {model.messageFormat === "claude" && (
                                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                                      Claude 格式
                                    </span>
                                  )}
                                  {typeof model.maxOutputTokens ===
                                    "number" && (
                                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400">
                                      输出 {model.maxOutputTokens} tokens
                                    </span>
                                  )}
                                  {model.apiProtocol === "responses" && (
                                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
                                      Responses API
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5 ml-3 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => onEditModel(config.id, model)}
                                className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
                                title="编辑"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() =>
                                  onDeleteModel(config.id, model.name)
                                }
                                className="p-1.5 rounded-md text-gray-500 hover:text-red-500 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors"
                                title="删除"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm py-6 text-center text-gray-400 dark:text-gray-500">
                        暂无模型，点击上方按钮添加
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {configs.length === 0 && (
          <div
            className={classNames(
              "py-8 text-center",
              themeColors.secondaryTextClass,
            )}
          >
            暂无配置，点击上方按钮添加
          </div>
        )}
      </div>
    </div>
  );
};

export default ConfigList;
