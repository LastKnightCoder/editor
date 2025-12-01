import useSettingStore from "@/stores/useSettingStore";
import useThemeColors from "@/hooks/useThemeColors";
import { App } from "antd";
import { produce } from "immer";
import classNames from "classnames";
import { ConfigItem } from "../types";
import { SettingButton } from "../../components";

interface ConfigListProps {
  onAddConfig: () => void;
  onEditConfig: (config: ConfigItem) => void;
  selectedConfigId: string;
  onSelectConfig: (configId: string) => void;
}

const ConfigList = ({
  onAddConfig,
  onEditConfig,
  selectedConfigId,
  onSelectConfig,
}: ConfigListProps) => {
  const { configs } = useSettingStore((state) => ({
    configs: state.setting.llmConfigs,
  }));
  const { modal } = App.useApp();
  const themeColors = useThemeColors();

  const onDeleteConfig = (id: string) => {
    modal.confirm({
      title: "确定删除此配置吗？",
      okButtonProps: {
        danger: true,
      },
      okText: "删除",
      cancelText: "取消",
      onOk: () => {
        useSettingStore.setState(
          produce((draft) => {
            const index = draft.setting.llmConfigs.findIndex(
              (item: any) => item.id === id,
            );
            if (index === -1) {
              return;
            }
            draft.setting.llmConfigs.splice(index, 1);
          }),
        );
        if (id === selectedConfigId) {
          onSelectConfig("");
        }
      },
    });
  };

  const handleItemClick = (config: ConfigItem) => {
    onSelectConfig(config.id);
  };

  return (
    <div
      className={classNames(
        "h-full rounded-xl border",
        themeColors.cardBgClass,
        themeColors.cardBorderClass,
      )}
    >
      <div
        className={classNames(
          "flex items-center justify-between px-4 py-3 border-b",
          themeColors.borderClass,
        )}
      >
        <h3
          className={classNames(
            "text-base font-semibold",
            // themeColors.activeTextClass,
          )}
        >
          LLM 配置
        </h3>
        <SettingButton
          variant="secondary"
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
          添加
        </SettingButton>
      </div>
      <div className="p-3 space-y-2 overflow-y-auto max-h-[400px]">
        {configs.map((config) => (
          <div
            key={config.id}
            className={classNames(
              "p-3 rounded-lg cursor-pointer transition-all duration-200 border",
              config.id === selectedConfigId
                ? classNames(
                    themeColors.activeBgClass,
                    themeColors.activeBorderClass,
                  )
                : classNames(
                    themeColors.inputBgClass,
                    themeColors.borderClass,
                    themeColors.hoverClass,
                  ),
            )}
            onClick={() => handleItemClick(config)}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div
                  className={classNames(
                    "font-medium truncate",
                    // themeColors.activeTextClass,
                  )}
                >
                  {config.name}
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
              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditConfig(config);
                  }}
                  className={classNames(
                    "p-1.5 rounded-md transition-colors",
                    themeColors.secondaryTextClass,
                    themeColors.hoverClass,
                    themeColors.hoverTextClass,
                  )}
                >
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
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteConfig(config.id);
                  }}
                  className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors"
                >
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
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
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
