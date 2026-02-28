import React, { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { useMemoizedFn } from "ahooks";
import useSettingStore from "@/stores/useSettingStore";
import useThemeColors from "@/hooks/useThemeColors";
import { chat } from "@/commands";
import { Role } from "@/constants";

const MinimaxSetting: React.FC = () => {
  const themeColors = useThemeColors();
  const setting = useSettingStore((state) => state.setting);
  const updateMinimaxApiKey = useSettingStore(
    (state) => state.updateMinimaxApiKey,
  );
  const setMinimaxEnabled = useSettingStore((state) => state.setMinimaxEnabled);
  const { minimax } = setting.integration;

  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiKeyValue, setApiKeyValue] = useState(minimax.apiKey);
  const [errorMessage, setErrorMessage] = useState("");

  const checkApiKey = useMemoizedFn(async () => {
    if (!apiKeyValue.trim()) {
      setErrorMessage("请输入 Minimax API Key");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      // 使用音色列表接口验证 API Key
      await chat(apiKeyValue, "https://api.minimaxi.com/v1/", "MiniMax-M2", [
        {
          role: Role.User,
          content: [
            {
              type: "text",
              text: "Hello, how are you?",
            },
          ],
        },
      ]);
      updateMinimaxApiKey(apiKeyValue);
      setMinimaxEnabled(true);

      setModalOpen(false);
      setApiKeyValue("");
      setErrorMessage("");
    } catch (error) {
      console.error("验证 Minimax API Key 失败:", error);
      setErrorMessage("验证失败，请检查 API Key 是否正确");
    } finally {
      setLoading(false);
    }
  });

  const handleDisconnect = useCallback(() => {
    updateMinimaxApiKey("");
    setMinimaxEnabled(false);
  }, [updateMinimaxApiKey, setMinimaxEnabled]);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    setApiKeyValue(minimax.apiKey);
    setErrorMessage("");
  }, [minimax.apiKey]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        handleModalClose();
      }
    },
    [handleModalClose],
  );

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`relative group rounded-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden h-[280px] flex flex-col ${themeColors.cardBgClass} ${themeColors.cardBorderClass} border`}
      >
        {/* Status Badge */}
        <div className="absolute top-4 right-4">
          <div
            className={`flex items-center gap-2 px-3 py-1 rounded-full ${themeColors.inputBgClass}`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                minimax.enabled ? "bg-green-500" : "bg-gray-400"
              }`}
            />
            <span className={`text-xs font-medium ${themeColors.textClass}`}>
              {minimax.enabled ? "已连接" : "未连接"}
            </span>
          </div>
        </div>

        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-linear-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold shadow-sm">
              M
            </div>
            <div className="flex-1 min-w-0">
              <h3
                className={`text-base font-semibold truncate ${themeColors.activeTextClass}`}
              >
                Minimax
              </h3>
              <p
                className={`text-xs truncate ${themeColors.secondaryTextClass}`}
              >
                AI 语音和图像生成
              </p>
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="px-6 py-2 flex-1 overflow-hidden">
          {minimax.enabled && (
            <div className="space-y-1">
              <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
                API 已配置
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-6 pt-4 mt-auto space-y-2">
          {!minimax.enabled ? (
            <button
              onClick={() => setModalOpen(true)}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-purple-500 hover:bg-purple-600 rounded-lg transition-colors"
            >
              连接 Minimax
            </button>
          ) : (
            <>
              <button
                onClick={() => setModalOpen(true)}
                className={`w-full px-4 py-2 text-sm font-medium rounded-lg transition-colors ${themeColors.inputBgClass} ${themeColors.textClass} ${themeColors.hoverClass}`}
              >
                管理集成
              </button>
              <button
                onClick={handleDisconnect}
                className="w-full px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              >
                断开连接
              </button>
            </>
          )}
        </div>
      </motion.div>

      {/* Modal */}
      {modalOpen &&
        createPortal(
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 backdrop-blur-sm"
              onClick={handleModalClose}
              onKeyDown={handleKeyDown}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: "spring", duration: 0.3 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-[460px] m-4"
              >
                <div className="rounded-2xl p-6 shadow-2xl bg-white dark:bg-slate-900/95 border border-gray-200 dark:border-slate-800">
                  <div className="flex items-start gap-3 mb-5">
                    <div className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-purple-50 dark:bg-purple-500/20 border border-purple-200 dark:border-purple-500/30">
                      <span className="text-lg font-bold text-purple-500">
                        M
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-bold m-0 text-gray-800 dark:text-white">
                        Minimax 集成
                      </h2>
                      <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                        配置 API Key 以使用 Minimax 服务
                      </p>
                    </div>
                    <button
                      className="shrink-0 w-8 h-8 rounded-lg border-none cursor-pointer flex items-center justify-center transition-all bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-200"
                      onClick={handleModalClose}
                    >
                      <svg
                        className="w-[18px] h-[18px]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                        <svg
                          className="w-3.5 h-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                        API Key
                      </label>
                      <textarea
                        value={apiKeyValue}
                        onChange={(e) => {
                          setApiKeyValue(e.target.value);
                          setErrorMessage("");
                        }}
                        placeholder="请输入 Minimax API Key..."
                        rows={4}
                        className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-purple-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(168,85,247,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(168,85,247,0.25)] disabled:opacity-60 disabled:cursor-not-allowed resize-none"
                        disabled={loading}
                      />
                    </div>

                    <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1 px-3.5 py-2.5 rounded-lg bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700">
                      <div>1. 访问 https://platform.minimaxi.com</div>
                      <div>2. 登录并进入控制台</div>
                      <div>3. 在 API 管理中创建 API Key</div>
                      <div>4. 复制 API Key 并粘贴到上方</div>
                    </div>

                    {errorMessage && (
                      <div className="px-3.5 py-2.5 rounded-lg text-[13px] bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400">
                        {errorMessage}
                      </div>
                    )}

                    <button
                      className="w-full px-5 py-3.5 rounded-xl border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all bg-purple-500 text-white shadow-[0_4px_14px_rgba(168,85,247,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-purple-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none dark:disabled:border dark:disabled:border-slate-700"
                      onClick={checkApiKey}
                      disabled={!apiKeyValue.trim() || loading}
                    >
                      {loading ? (
                        <>
                          <svg
                            className="animate-spin w-5 h-5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                          </svg>
                          验证中...
                        </>
                      ) : (
                        <>
                          <svg
                            className="w-5 h-5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M5 12h14M12 5l7 7-7 7" />
                          </svg>
                          验证并连接
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
};

export default MinimaxSetting;
