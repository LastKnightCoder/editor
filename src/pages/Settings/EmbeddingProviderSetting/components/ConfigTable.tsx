import useSettingStore from "@/stores/useSettingStore";
import useThemeColors from "@/hooks/useThemeColors";
import { App } from "antd";
import { produce } from "immer";
import classNames from "classnames";
import { ConfigItem } from "../types";
import {
  clearVecDocumentTable,
  initVecDocumentTable,
} from "@/commands/vec-document";
import { SettingButton } from "../../components";

interface ConfigTableProps {
  onAddConfig: () => void;
  onEditConfig: (config: ConfigItem) => void;
}

const ConfigTable = ({ onAddConfig, onEditConfig }: ConfigTableProps) => {
  const { configs, currentConfigId } = useSettingStore((state) => {
    const configs = state.setting.embeddingProvider.configs;
    const currentConfigId = state.setting.embeddingProvider.currentConfigId;
    return {
      configs,
      currentConfigId,
    };
  });

  const { modal, message } = App.useApp();
  const themeColors = useThemeColors();

  const onActivateConfig = (id: string) => {
    const config = configs.find((item) => item.id === id);
    if (!config) return;

    modal.confirm({
      title: "切换嵌入模型",
      content: "不同的嵌入模型不能共用，之前的嵌入数据将会被删除，是否继续？",
      okText: "确认",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
      onOk: async () => {
        try {
          await clearVecDocumentTable();

          if (config.currentModel) {
            const model = config.models.find(
              (model) => model.name === config.currentModel,
            );
            if (model) {
              const vectorLength = model.contextLength;
              if (!vectorLength) {
                message.error("模型上下文长度未设置");
                return;
              }
              await initVecDocumentTable(vectorLength);
            }
          }

          useSettingStore.setState(
            produce((draft) => {
              draft.setting.embeddingProvider.currentConfigId = id;
            }),
          );
        } catch (error) {
          console.error("向量数据库重置失败:", error);
          modal.error({
            title: "错误",
            content: "向量数据库重置失败，请重试",
          });
        }
      },
    });
  };

  const onDeleteConfig = (id: string) => {
    modal.confirm({
      title: "确定删除此配置吗？",
      content:
        id === currentConfigId
          ? "数据也将被删除，删除后无法恢复"
          : "删除后无法恢复",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
      onOk: async () => {
        if (id === currentConfigId) {
          await clearVecDocumentTable();
        }
        useSettingStore.setState(
          produce((draft) => {
            const index = draft.setting.embeddingProvider.configs.findIndex(
              (item: ConfigItem) => item.id === id,
            );
            if (index !== -1) {
              draft.setting.embeddingProvider.configs.splice(index, 1);
            }
          }),
        );
      },
    });
  };

  return (
    <div
      className={classNames(
        "rounded-xl bg-transparent border",
        themeColors.focusBorderClass,
      )}
    >
      <div
        className={classNames("flex items-center justify-between px-5 py-4")}
      >
        <h3
          className={classNames(
            "text-base font-semibold",
            // themeColors.activeTextClass,
          )}
        >
          配置列表
        </h3>
        <SettingButton
          variant="primary"
          onClick={onAddConfig}
          icon={
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          }
        >
          添加配置
        </SettingButton>
      </div>
      <div className="p-4">
        {configs.length > 0 ? (
          <div className="space-y-3">
            {configs.map((config) => {
              const isActive = config.id === currentConfigId;
              return (
                <div
                  key={config.id}
                  className={classNames(
                    "p-4 rounded-lg transition-colors",
                    isActive
                      ? classNames(themeColors.activeBgClass)
                      : classNames("bg-transparent", themeColors.hoverClass),
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={classNames(
                            "font-medium",
                            isActive
                              ? themeColors.activeTextClass
                              : themeColors.secondaryTextClass,
                          )}
                        >
                          {config.name}
                        </span>
                        <span
                          className={classNames(
                            "px-2 py-0.5 text-xs font-medium rounded-full",
                            isActive
                              ? classNames(
                                  themeColors.activeBadgeClass,
                                  themeColors.activeTextClass,
                                )
                              : classNames(
                                  themeColors.secondaryTextClass,
                                  themeColors.tagBgClass,
                                ),
                          )}
                        >
                          {isActive ? "使用中" : "未使用"}
                        </span>
                      </div>
                      <div
                        className={classNames(
                          "text-sm mt-1 truncate",
                          themeColors.secondaryTextClass,
                        )}
                      >
                        {config.baseUrl}
                      </div>
                      <div
                        className={classNames(
                          "text-xs mt-1",
                          themeColors.secondaryTextClass,
                        )}
                      >
                        {config.models?.length || 0} 个模型
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {!isActive && (
                        <button
                          onClick={() => onActivateConfig(config.id)}
                          className="px-3 py-1.5 text-sm text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-500/10 rounded-lg transition-colors"
                        >
                          启用
                        </button>
                      )}
                      <button
                        onClick={() => onEditConfig(config)}
                        className={classNames(
                          "px-3 py-1.5 text-sm rounded-lg transition-colors",
                          themeColors.secondaryTextClass,
                          themeColors.hoverClass,
                          themeColors.hoverTextClass,
                        )}
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => onDeleteConfig(config.id)}
                        className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            className={classNames(
              "py-12 text-center",
              themeColors.secondaryTextClass,
            )}
          >
            <svg
              className="w-12 h-12 mx-auto mb-3 opacity-50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            暂无配置，点击上方按钮添加
          </div>
        )}
      </div>
    </div>
  );
};

export default ConfigTable;
