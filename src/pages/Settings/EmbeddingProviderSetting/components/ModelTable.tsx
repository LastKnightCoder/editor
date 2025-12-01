import useSettingStore from "@/stores/useSettingStore";
import useThemeColors from "@/hooks/useThemeColors";
import { App } from "antd";
import { produce } from "immer";
import classNames from "classnames";
import { ModelItem, ConfigItem } from "../types";
import {
  clearVecDocumentTable,
  initVecDocumentTable,
} from "@/commands/vec-document";
import { SettingButton } from "../../components";

interface ModelTableProps {
  onAddModel: () => void;
  onEditModel: (model: ModelItem) => void;
}

const ModelTable = ({ onAddModel, onEditModel }: ModelTableProps) => {
  const { currentConfig } = useSettingStore((state) => {
    const settings = state.setting.embeddingProvider;
    const { configs, currentConfigId } = settings;
    return {
      currentConfig: configs.find((item) => item.id === currentConfigId),
    };
  });

  const { modal } = App.useApp();
  const themeColors = useThemeColors();

  const onActivateModel = (name: string, contextLength: number) => {
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
          await initVecDocumentTable(contextLength);

          useSettingStore.setState(
            produce((draft) => {
              const index = draft.setting.embeddingProvider.configs.findIndex(
                (item: ConfigItem) => item.id === currentConfig?.id,
              );
              if (index !== -1) {
                draft.setting.embeddingProvider.configs[index].currentModel =
                  name;
              }
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
          produce((draft) => {
            const currentConfig = draft.setting.embeddingProvider.configs.find(
              (item: ConfigItem) =>
                item.id === draft.setting.embeddingProvider.currentConfigId,
            );
            if (currentConfig && currentConfig.models) {
              currentConfig.models = currentConfig.models.filter(
                (item: ModelItem) => item.name !== name,
              );
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
          模型列表
        </h3>
        <SettingButton
          variant="primary"
          onClick={onAddModel}
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
          添加模型
        </SettingButton>
      </div>
      <div className="p-4">
        {currentConfig?.models && currentConfig.models.length > 0 ? (
          <div className="space-y-3">
            {currentConfig.models.map((model) => {
              const isActive = model.name === currentConfig.currentModel;
              return (
                <div
                  key={model.name}
                  className={classNames(
                    "p-4 rounded-lg transition-colors",
                    isActive
                      ? classNames(themeColors.activeBgClass)
                      : classNames(
                          "bg-transparent",
                          "hover:bg-gray-50 dark:hover:bg-gray-800/30",
                        ),
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={classNames(
                            "font-medium",
                            isActive
                              ? themeColors.activeTextClass
                              : themeColors.secondaryTextClass,
                          )}
                        >
                          {model.name}
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
                                  themeColors.tagBgClass,
                                  themeColors.tagTextClass,
                                ),
                          )}
                        >
                          {isActive ? "使用中" : "未使用"}
                        </span>
                        {model.features?.multimodal && (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400">
                            多模态
                          </span>
                        )}
                      </div>
                      <div
                        className={classNames(
                          "text-sm mt-1",
                          themeColors.secondaryTextClass,
                        )}
                      >
                        {model.description}
                      </div>
                      <div
                        className={classNames(
                          "flex gap-4 mt-2 text-xs",
                          themeColors.secondaryTextClass,
                        )}
                      >
                        <span>向量长度: {model.contextLength}</span>
                        <span>距离阈值: {model.distance}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {!isActive && (
                        <button
                          onClick={() =>
                            onActivateModel(model.name, model.contextLength)
                          }
                          className="px-3 py-1.5 text-sm text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-500/10 rounded-lg transition-colors"
                        >
                          启用
                        </button>
                      )}
                      <button
                        onClick={() => onEditModel(model)}
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
                        onClick={() => onDeleteModel(model.name)}
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
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            暂无模型，点击上方按钮添加
          </div>
        )}
      </div>
    </div>
  );
};

export default ModelTable;
