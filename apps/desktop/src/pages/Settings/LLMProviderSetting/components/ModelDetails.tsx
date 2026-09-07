import useSettingStore from "@/stores/useSettingStore";
import useThemeColors from "@/hooks/useThemeColors";
import { App } from "antd";
import { produce } from "immer";
import classNames from "classnames";
import { ModelItem, ConfigItem } from "../types";
import { SettingButton } from "../../components";

interface ModelDetailsProps {
  onAddModel: (configId: string) => void;
  onEditModel: (configId: string, model: ModelItem) => void;
  configId: string;
  onEditConfig: (config: ConfigItem) => void;
}

const featureMap: Array<{
  key: keyof ModelItem["features"];
  label: string;
  colorClass: string;
}> = [
  {
    key: "online",
    label: "联网",
    colorClass: "bg-[var(--th-info)]/15 text-status-info dark:bg-[var(--th-accent)]/20",
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

const ModelDetails = ({ onAddModel, onEditModel, configId, onEditConfig }: ModelDetailsProps) => {
  const { config } = useSettingStore(state => {
    return {
      config: state.setting.llmConfigs.find(item => item.id === configId),
    };
  });

  const { modal, message } = App.useApp();
  const themeColors = useThemeColors();

  const onDeleteModel = (name: string) => {
    modal.confirm({
      title: "确定删除此模型吗？",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
      onOk: () => {
        useSettingStore.setState(
          produce(draft => {
            const config = draft.setting.llmConfigs.find((item: any) => item.id === configId);
            if (config && config.models) {
              config.models = config.models.filter((item: any) => item.name !== name);
            }
          })
        );
      },
    });
  };

  const onCopyApiKey = () => {
    if (config) {
      navigator.clipboard.writeText(config.apiKey);
      message.success("API Key 已复制到剪贴板");
    }
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

    if (tags.length === 0) {
      return (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-zinc-700 dark:text-gray-400">
          无特殊功能
        </span>
      );
    }

    return tags;
  };

  if (!config) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center justify-between border-b border-[#fafafa] py-3 dark:border-[#2a2a2a]">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{config.name}</h3>
          <SettingButton
            variant="secondary"
            onClick={() => onEditConfig(config)}
            icon={
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            }
          >
            编辑配置
          </SettingButton>
        </div>
        <div className="space-y-3 py-4">
          <div className="flex items-center gap-3">
            <span className="w-20 text-sm text-gray-500 dark:text-gray-400">Base URL:</span>
            <span className="font-mono text-sm text-gray-800 dark:text-gray-200">
              {config.baseUrl}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-20 text-sm text-gray-500 dark:text-gray-400">API Key:</span>
            <span className="font-mono text-sm text-gray-800 dark:text-gray-200">********</span>
            <button
              onClick={onCopyApiKey}
              className={classNames(
                "rounded-md p-1.5 text-gray-500 transition-colors",
                themeColors.hoverClass,
                themeColors.hoverTextClass
              )}
              title="复制 API Key"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between border-b border-[#fafafa] py-3 dark:border-[#2a2a2a]">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">模型列表</h3>
          <SettingButton
            variant="primary"
            onClick={() => onAddModel(configId)}
            icon={
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            }
          >
            添加模型
          </SettingButton>
        </div>
        <div className="max-h-75 overflow-y-auto">
          {config.models && config.models.length > 0 ? (
            <div>
              {config.models.map(model => (
                <div
                  key={model.name}
                  className={classNames(
                    "border-b border-[#fafafa] py-4 transition-colors last:border-b-0 dark:border-[#2a2a2a]",
                    themeColors.hoverClass
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-800 dark:text-gray-200">
                        {model.name}
                      </div>
                      <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {model.description}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {renderFeatureTags(model.features)}
                        {model.messageFormat === "claude" && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                            Claude 格式
                          </span>
                        )}
                        {model.apiProtocol === "responses" && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
                            Responses API
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="ml-3 flex items-center gap-1">
                      <button
                        onClick={() => onEditModel(configId, model)}
                        className={classNames(
                          "rounded-md p-1.5 text-gray-500 transition-colors",
                          themeColors.hoverClass,
                          themeColors.hoverTextClass
                        )}
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => onDeleteModel(model.name)}
                        className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-gray-500 dark:text-gray-400">
              <svg
                className="mx-auto mb-3 h-12 w-12 opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              暂无模型配置
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModelDetails;
