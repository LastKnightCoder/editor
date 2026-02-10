import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import { SettingButton } from "../../components";
import type { ConfigItem } from "../types";

interface ConfigTableProps {
  configs: ConfigItem[];
  currentConfigId: string;
  onAddConfig: () => void;
  onEditConfig: (config: ConfigItem) => void;
  onActivateConfig: (id: string) => void;
  onDeleteConfig: (id: string) => void;
}

const ConfigTable = ({
  configs,
  currentConfigId,
  onAddConfig,
  onEditConfig,
  onActivateConfig,
  onDeleteConfig,
}: ConfigTableProps) => {
  const themeColors = useThemeColors();

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
        <h3 className={classNames("text-base font-semibold")}>Provider 列表</h3>
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
                        {config.baseUrl || "未设置 Base URL"}
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
            暂无 Provider 配置，点击上方按钮添加
          </div>
        )}
      </div>
    </div>
  );
};

export default ConfigTable;
