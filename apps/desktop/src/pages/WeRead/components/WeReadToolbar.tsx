import { memo } from "react";
import { AiOutlineLogin, AiOutlineSync } from "react-icons/ai";
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
  hasStoredSession?: boolean;
  userName?: string;
  lastSyncedAt: number | null;
  syncing: boolean;
  onQuickLogin: () => void;
  onSync: () => void;
  themeColors: ThemeColors;
}

export const WeReadToolbar: React.FC<WeReadToolbarProps> = memo((props) => {
  const {
    isConnected,
    isChecking = false,
    hasLocalData = false,
    initializing = false,
    hasStoredSession = false,
    userName,
    lastSyncedAt,
    syncing,
    onQuickLogin,
    onSync,
    themeColors,
  } = props;

  const isRestoringSession =
    initializing || (isChecking && hasStoredSession && !isConnected);

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
              ? "正在校验微信读书登录状态..."
              : isConnected
                ? `已登录：${userName || "已连接账号"}`
                : hasLocalData
                  ? "当前未连接，可查看本地缓存"
                  : "尚未连接微信读书账号"}
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
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!isConnected && !isRestoringSession && (
          <button
            onClick={onQuickLogin}
            disabled={syncing}
            className={classNames(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border cursor-pointer",
              themeColors.cardBorderClass,
              themeColors.hoverClass,
              themeColors.activeTextClass,
              syncing && "opacity-50 cursor-not-allowed",
            )}
          >
            <AiOutlineLogin />
            扫码登录
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
