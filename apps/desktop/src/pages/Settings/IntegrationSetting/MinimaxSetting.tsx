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
  const setting = useSettingStore(state => state.setting);
  const updateMinimaxApiKey = useSettingStore(state => state.updateMinimaxApiKey);
  const setMinimaxEnabled = useSettingStore(state => state.setMinimaxEnabled);
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
    [handleModalClose]
  );

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`group relative flex h-[280px] flex-col overflow-hidden rounded-xl shadow-sm transition-all duration-300 hover:shadow-md ${themeColors.cardBgClass} ${themeColors.cardBorderClass} border`}
      >
        {/* Status Badge */}
        <div className="absolute right-4 top-4">
          <div
            className={`flex items-center gap-2 rounded-full px-3 py-1 ${themeColors.inputBgClass}`}
          >
            <div
              className={`h-2 w-2 rounded-full ${
                minimax.enabled ? "bg-status-success" : "bg-gray-400"
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
            <div className="bg-linear-to-br flex h-12 w-12 items-center justify-center rounded-lg from-[var(--th-accent)] to-[var(--th-accent-hover)] text-xl font-bold text-white shadow-sm">
              M
            </div>
            <div className="min-w-0 flex-1">
              <h3 className={`truncate text-base font-semibold ${themeColors.activeTextClass}`}>
                Minimax
              </h3>
              <p className={`truncate text-xs ${themeColors.secondaryTextClass}`}>
                AI 语音和图像生成
              </p>
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="flex-1 overflow-hidden px-6 py-2">
          {minimax.enabled && (
            <div className="space-y-1">
              <span className="inline-block rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                API 已配置
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-auto space-y-2 p-6 pt-4">
          {!minimax.enabled ? (
            <button
              onClick={() => setModalOpen(true)}
              className="w-full rounded-lg bg-[var(--th-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--th-btn-text)] transition-colors hover:bg-[var(--th-btn-hover)]"
            >
              连接 Minimax
            </button>
          ) : (
            <>
              <button
                onClick={() => setModalOpen(true)}
                className={`w-full rounded-lg px-4 py-2 text-sm font-medium transition-colors ${themeColors.inputBgClass} ${themeColors.textClass} ${themeColors.hoverClass}`}
              >
                管理集成
              </button>
              <button
                onClick={handleDisconnect}
                className="w-full rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-900/20"
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
              className="z-9999 fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
              onClick={handleModalClose}
              onKeyDown={handleKeyDown}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: "spring", duration: 0.3 }}
                onClick={e => e.stopPropagation()}
                className="m-4 w-full max-w-[460px]"
              >
                <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-zinc-900/95">
                  <div className="mb-5 flex items-start gap-3">
                    <div className="border-[var(--th-border-focus)]/30 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border bg-[var(--th-accent-soft)]">
                      <span className="text-lg font-bold text-[var(--th-accent)]">M</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="m-0 text-base font-bold text-gray-800 dark:text-white">
                        Minimax 集成
                      </h2>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">
                        配置 API Key 以使用 Minimax 服务
                      </p>
                    </div>
                    <button
                      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-gray-100 text-gray-500 transition-all hover:bg-gray-200 hover:text-gray-700 dark:bg-zinc-800 dark:text-slate-400 dark:hover:bg-zinc-700 dark:hover:text-slate-200"
                      onClick={handleModalClose}
                    >
                      <svg
                        className="h-[18px] w-[18px]"
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
                          className="h-3.5 w-3.5"
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
                        onChange={e => {
                          setApiKeyValue(e.target.value);
                          setErrorMessage("");
                        }}
                        placeholder="请输入 Minimax API Key..."
                        rows={4}
                        className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                        disabled={loading}
                      />
                    </div>

                    <div className="space-y-1 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs text-gray-600 dark:border-slate-700 dark:bg-zinc-950 dark:text-gray-400">
                      <div>1. 访问 https://platform.minimaxi.com</div>
                      <div>2. 登录并进入控制台</div>
                      <div>3. 在 API 管理中创建 API Key</div>
                      <div>4. 复制 API Key 并粘贴到上方</div>
                    </div>

                    {errorMessage && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                        {errorMessage}
                      </div>
                    )}

                    <button
                      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-[var(--th-btn-bg)] px-5 py-3.5 text-sm font-semibold text-[var(--th-btn-text)] shadow-sm transition-all hover:-translate-y-px hover:bg-[var(--th-btn-hover)] active:translate-y-0 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:border dark:disabled:border-slate-700 dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
                      onClick={checkApiKey}
                      disabled={!apiKeyValue.trim() || loading}
                    >
                      {loading ? (
                        <>
                          <svg
                            className="h-5 w-5 animate-spin"
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
                            className="h-5 w-5"
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
          document.body
        )}
    </>
  );
};

export default MinimaxSetting;
