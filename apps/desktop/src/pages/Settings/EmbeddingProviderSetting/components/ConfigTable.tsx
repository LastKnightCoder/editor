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
    <div className={classNames("rounded-xl border bg-transparent", themeColors.focusBorderClass)}>
      <div className={classNames("flex items-center justify-between px-5 py-4")}>
        <h3 className={classNames("text-base font-semibold")}>Provider 列表</h3>
        <SettingButton
          variant="primary"
          onClick={onAddConfig}
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
          添加配置
        </SettingButton>
      </div>

      <div className="p-4">
        {configs.length > 0 ? (
          <div className="space-y-3">
            {configs.map(config => {
              const isActive = config.id === currentConfigId;
              return (
                <div
                  key={config.id}
                  className={classNames(
                    "rounded-lg p-4 transition-colors",
                    isActive
                      ? classNames(themeColors.activeBgClass)
                      : classNames("bg-transparent", themeColors.hoverClass)
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={classNames(
                            "font-medium",
                            isActive ? themeColors.activeTextClass : themeColors.secondaryTextClass
                          )}
                        >
                          {config.name}
                        </span>
                        <span
                          className={classNames(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            isActive
                              ? classNames(themeColors.activeBgClass, themeColors.activeTextClass)
                              : classNames(themeColors.secondaryTextClass, themeColors.tagBgClass)
                          )}
                        >
                          {isActive ? "使用中" : "未使用"}
                        </span>
                      </div>

                      <div
                        className={classNames(
                          "mt-1 truncate text-sm",
                          themeColors.secondaryTextClass
                        )}
                      >
                        {config.baseUrl || "未设置 Base URL"}
                      </div>

                      <div className={classNames("mt-1 text-xs", themeColors.secondaryTextClass)}>
                        {config.models?.length || 0} 个模型
                      </div>
                    </div>

                    <div className="ml-4 flex items-center gap-2">
                      {!isActive && (
                        <button
                          onClick={() => onActivateConfig(config.id)}
                          className="text-status-success hover:text-status-success hover:bg-[var(--th-success)]/10 rounded-lg px-3 py-1.5 text-sm transition-colors"
                        >
                          启用
                        </button>
                      )}
                      <button
                        onClick={() => onEditConfig(config)}
                        className={classNames(
                          "rounded-lg px-3 py-1.5 text-sm transition-colors",
                          themeColors.secondaryTextClass,
                          themeColors.hoverClass,
                          themeColors.hoverTextClass
                        )}
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => onDeleteConfig(config.id)}
                        className="rounded-lg px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10"
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
          <div className={classNames("py-12 text-center", themeColors.secondaryTextClass)}>
            暂无 Provider 配置，点击上方按钮添加
          </div>
        )}
      </div>
    </div>
  );
};

export default ConfigTable;
