import React, { useMemo, useState } from "react";
import { motion } from "motion/react";
import useSettingStore from "@/stores/useSettingStore";
import useThemeColors from "@/hooks/useThemeColors";
import weReadService from "@/services/weread";
import { openExternal } from "@/commands/extra";

const WeReadSetting: React.FC = () => {
  const themeColors = useThemeColors();
  const weread = useSettingStore(state => state.setting.integration.weread);
  const updateWeReadApiKey = useSettingStore(state => state.updateWeReadApiKey);
  const [loading, setLoading] = useState(false);
  const [apiKeyValue, setApiKeyValue] = useState(weread.apiKey);
  const [errorMessage, setErrorMessage] = useState("");

  const handleOpenApiKeyPage = () => {
    void openExternal("https://weread.qq.com/r/weread-skills");
  };

  const statusMeta = useMemo(() => {
    switch (weread.connectionStatus) {
      case "checking":
        return {
          dotClass: "bg-amber-500",
          text: "检测中",
          detail: "正在验证微信读书 API Key",
        };
      case "valid":
        return {
          dotClass: "bg-status-success",
          text: "可用",
          detail: "当前 API Key 可正常同步微信读书数据",
        };
      case "invalid":
        return {
          dotClass: "bg-red-500",
          text: "已失效",
          detail: weread.statusReason || "API Key 已失效，请重新配置",
        };
      default:
        return {
          dotClass: "bg-gray-400",
          text: "未连接",
          detail: "尚未配置微信读书 API Key",
        };
    }
  }, [weread.connectionStatus, weread.statusReason]);

  const isSessionValid = weread.connectionStatus === "valid";

  const handleValidateApiKey = async () => {
    const nextApiKey = apiKeyValue.trim();
    if (!nextApiKey) {
      setErrorMessage("请输入微信读书 API Key");
      return;
    }
    setLoading(true);
    setErrorMessage("");
    try {
      updateWeReadApiKey(nextApiKey);
      const isValid = await weReadService.validateSession();
      if (!isValid) {
        setErrorMessage(
          useSettingStore.getState().setting.integration.weread.statusReason || "API Key 校验失败"
        );
      }
    } catch (error: any) {
      setErrorMessage(error?.message || "API Key 校验失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`group relative flex h-[280px] flex-col overflow-hidden rounded-xl shadow-sm transition-all duration-300 hover:shadow-md ${themeColors.cardBgClass} ${themeColors.cardBorderClass} border`}
    >
      <div className="absolute right-4 top-4">
        <div
          className={`flex items-center gap-2 rounded-full px-3 py-1 ${themeColors.inputBgClass}`}
        >
          <div className={`h-2 w-2 rounded-full ${statusMeta.dotClass}`} />
          <span className={`text-xs font-medium ${themeColors.textClass}`}>{statusMeta.text}</span>
        </div>
      </div>

      <div className="p-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-linear-to-br flex h-12 w-12 items-center justify-center rounded-lg from-blue-500 to-indigo-600 text-xl font-bold text-white shadow-sm">
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className={`truncate text-base font-semibold ${themeColors.activeTextClass}`}>
              微信读书
            </h3>
            <p className={`truncate text-xs ${themeColors.secondaryTextClass}`}>
              通过官方 API Key 同步书架、划线与想法
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-hidden px-6 py-2">
        <p className={`text-sm leading-5 ${themeColors.secondaryTextClass}`}>{statusMeta.detail}</p>

        <div className="flex flex-col gap-2">
          <label
            className={`text-xs font-semibold uppercase tracking-wider ${themeColors.secondaryTextClass}`}
          >
            API Key
          </label>
          <input
            type="password"
            value={apiKeyValue}
            onChange={event => {
              setApiKeyValue(event.target.value);
              setErrorMessage("");
            }}
            placeholder="wrk-xxxxxxxxxxxxxxxx"
            className={`w-full rounded-xl px-3.5 py-2.5 outline-none transition-all ${themeColors.inputBgClass} ${themeColors.textClass} border ${themeColors.cardBorderClass}`}
          />
        </div>

        <div className="text-xs text-gray-600 dark:text-gray-400">
          <button
            type="button"
            onClick={handleOpenApiKeyPage}
            className="cursor-pointer text-blue-500 hover:text-[var(--th-active-text)] hover:underline dark:hover:text-blue-300"
          >
            获取微信读书 API Key
          </button>
        </div>

        {errorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
            {errorMessage}
          </div>
        )}
      </div>

      <div className="mt-auto space-y-2 p-6 pt-4">
        <button
          onClick={handleValidateApiKey}
          className="w-full rounded-lg bg-[var(--th-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--th-btn-text)] transition-colors hover:bg-[var(--th-btn-hover)]"
          disabled={!apiKeyValue.trim() || loading}
        >
          {loading ? "校验中..." : isSessionValid ? "重新校验" : "保存并校验"}
        </button>
      </div>
    </motion.div>
  );
};

export default WeReadSetting;
