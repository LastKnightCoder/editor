import { memo } from "react";
import { AiOutlineSetting, AiOutlineSync } from "react-icons/ai";
import { HiOutlineBookOpen } from "react-icons/hi";
import dayjs from "dayjs";
import classNames from "classnames";

interface ThemeColors {
  hoverClass: string;
  activeClass: string;
  textClass: string;
  secondaryTextClass: string;
  activeTextClass: string;
  tagBgClass: string;
  tagTextClass: string;
  buttonBg: string;
  buttonTextClass: string;
  cardBgClass: string;
  cardBorderClass: string;
  [key: string]: string;
}

interface WeReadToolbarProps {
  isConnected: boolean;
  isChecking?: boolean;
  hasLocalData?: boolean;
  initializing?: boolean;
  hasApiKey?: boolean;
  lastSyncedAt: number | null;
  syncing: boolean;
  syncProgress?: { completed: number; total: number } | null;
  onOpenSettings: () => void;
  onSync: () => void;
  themeColors: ThemeColors;
}

export const WeReadToolbar: React.FC<WeReadToolbarProps> = memo((props) => {
  const {
    isConnected,
    isChecking = false,
    hasLocalData = false,
    initializing = false,
    hasApiKey = false,
    lastSyncedAt,
    syncing,
    syncProgress,
    onOpenSettings,
    onSync,
    themeColors,
  } = props;

  const isRestoringSession =
    initializing || (isChecking && hasApiKey && !isConnected);
  const syncPercent =
    syncProgress && syncProgress.total > 0
      ? Math.floor((syncProgress.completed / syncProgress.total) * 100)
      : 0;

  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h4
          className={classNames(
            "text-lg font-semibold mb-1 flex items-center gap-2 transition-colors",
            themeColors.activeTextClass,
          )}
        >
          <HiOutlineBookOpen className="text-xl" />
          微信读书
        </h4>
        <div className="flex items-center gap-2">
          <span
            className={classNames(
              "text-sm transition-colors",
              themeColors.textClass,
            )}
          >
            {isRestoringSession
              ? "正在校验微信读书 API Key..."
              : isConnected
                ? "已连接微信读书 API"
                : hasLocalData
                  ? "当前未连接，可查看本地缓存"
                  : "尚未配置微信读书 API Key"}
          </span>
          {lastSyncedAt && (
            <span
              className={classNames(
                "text-xs px-2 py-0.5 rounded transition-colors",
                themeColors.tagBgClass,
                themeColors.tagTextClass,
              )}
            >
              上次同步：{dayjs(lastSyncedAt).format("YYYY-MM-DD HH:mm")}
            </span>
          )}
          {syncing && syncProgress && syncProgress.total > 0 && (
            <span
              className={classNames(
                "text-xs px-2 py-0.5 rounded transition-colors",
                themeColors.tagBgClass,
                themeColors.tagTextClass,
              )}
            >
              {syncProgress.completed}/{syncProgress.total} · {syncPercent}%
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!isConnected && !isRestoringSession && (
          <button
            onClick={onOpenSettings}
            disabled={syncing}
            className={classNames(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border cursor-pointer",
              themeColors.cardBorderClass,
              themeColors.hoverClass,
              themeColors.activeTextClass,
              syncing && "opacity-50 cursor-not-allowed",
            )}
          >
            <AiOutlineSetting />
            配置 API Key
          </button>
        )}
        <button
          onClick={onSync}
          disabled={!isConnected || syncing}
          className={classNames(
            "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer",
            themeColors.buttonBg,
            themeColors.buttonTextClass,
            (!isConnected || syncing) && "opacity-50 cursor-not-allowed",
          )}
        >
          <AiOutlineSync className={syncing ? "animate-spin" : ""} />
          同步
        </button>
      </div>
    </div>
  );
});

WeReadToolbar.displayName = "WeReadToolbar";
