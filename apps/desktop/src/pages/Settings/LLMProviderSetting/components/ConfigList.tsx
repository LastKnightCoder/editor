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
    colorClass: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",
  },
  {
    key: "thinking",
    label: "思考",
    colorClass: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400",
  },
  {
    key: "image",
    label: "图片",
    colorClass: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400",
  },
  {
    key: "video",
    label: "视频",
    colorClass: "bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-400",
  },
  {
    key: "audio",
    label: "音频",
    colorClass: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400",
  },
  {
    key: "file",
    label: "文件",
    colorClass: "bg-[var(--th-success)]/15 text-status-success",
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
  const { configs } = useSettingStore(state => ({
    configs: state.setting.llmConfigs,
  }));
  const { modal, message } = App.useApp();
  const themeColors = useThemeColors();
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => (prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]));
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
          produce(draft => {
            const index = draft.setting.llmConfigs.findIndex((item: ConfigItem) => item.id === id);
            if (index !== -1) {
              draft.setting.llmConfigs.splice(index, 1);
            }
          })
        );
        if (id === selectedConfigId) {
          onSelectConfig("");
        }
        setExpandedIds(prev => prev.filter(i => i !== id));
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
          produce(draft => {
            const config = draft.setting.llmConfigs.find(
              (item: ConfigItem) => item.id === configId
            );
            if (config && config.models) {
              config.models = config.models.filter((item: ModelItem) => item.name !== modelName);
            }
          })
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
      .filter(item => normalizedFeatures[item.key])
      .map(item => (
        <span
          key={item.key}
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.colorClass}`}
        >
          {item.label}
        </span>
      ));

    return tags.length > 0 ? tags : null;
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <SettingButton
          variant="secondary"
          onClick={onAddConfig}
          icon={<Plus className="h-4 w-4" />}
        >
          添加配置
        </SettingButton>
      </div>

      <div className="space-y-1">
        {configs.map(config => {
          const isExpanded = expandedIds.includes(config.id);
          return (
            <div key={config.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleExpand(config.id)}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleExpand(config.id);
                  }
                }}
                className={classNames(
                  "flex w-full items-center justify-between rounded-lg px-3 py-3 text-left transition-colors",
                  themeColors.hoverClass
                )}
              >
                <div className="flex items-center gap-2">
                  <ChevronDown
                    className={classNames(
                      "h-4 w-4 transition-transform",
                      isExpanded && "rotate-180"
                    )}
                  />
                  <span className="font-medium">{config.name}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {config.models?.length || 0} 个模型
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onEditConfig(config);
                    }}
                    className={classNames(
                      "rounded-lg p-1.5 transition-colors",
                      themeColors.secondaryTextClass,
                      themeColors.hoverClass,
                      themeColors.hoverTextClass
                    )}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onDeleteConfig(config.id);
                    }}
                    className="rounded-lg p-1.5 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="pb-4 pl-6 pt-2">
                  <div className="mb-2 grid grid-cols-[72px_1fr] gap-y-2 text-sm">
                    <span className="mb-1 text-gray-500 dark:text-gray-400">Base URL</span>
                    <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
                      {config.baseUrl}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">API Key</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
                        ••••••••
                      </span>
                      <button
                        onClick={() => onCopyApiKey(config.apiKey)}
                        className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-gray-200"
                        title="复制"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-[#eee] pt-4 dark:border-[#333]">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                        模型列表
                      </span>
                      <SettingButton
                        variant="secondary"
                        onClick={() => onAddModel(config.id)}
                        icon={<Plus className="h-3.5 w-3.5" />}
                      >
                        添加
                      </SettingButton>
                    </div>

                    {config.models && config.models.length > 0 ? (
                      <div className="space-y-1">
                        {config.models.map(model => (
                          <div
                            key={model.name}
                            className="group -mx-3 flex items-start justify-between rounded-lg p-3 transition-colors hover:bg-gray-50 dark:hover:bg-white/5"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                                {model.name}
                              </div>
                              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {model.description}
                              </div>
                              {renderFeatureTags(model.features) && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {renderFeatureTags(model.features)}
                                  {model.messageFormat === "claude" && (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                                      Claude 格式
                                    </span>
                                  )}
                                  {typeof model.maxOutputTokens === "number" && (
                                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/20 dark:text-blue-400">
                                      输出 {model.maxOutputTokens} tokens
                                    </span>
                                  )}
                                  {typeof model.contextWindowK === "number" && (
                                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-500/20 dark:text-violet-400">
                                      上下文 {model.contextWindowK}k
                                    </span>
                                  )}
                                  {model.apiProtocol === "responses" && (
                                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
                                      Responses API
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="ml-3 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                onClick={() => onEditModel(config.id, model)}
                                className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-zinc-700 dark:hover:text-gray-200"
                                title="编辑"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => onDeleteModel(config.id, model.name)}
                                className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-gray-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                                title="删除"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
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
          <div className={classNames("py-8 text-center", themeColors.secondaryTextClass)}>
            暂无配置，点击上方按钮添加
          </div>
        )}
      </div>
    </div>
  );
};

export default ConfigList;
