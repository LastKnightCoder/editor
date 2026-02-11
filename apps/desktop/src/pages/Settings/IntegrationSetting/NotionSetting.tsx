import React, { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { useMemoizedFn } from "ahooks";
import useSettingStore from "@/stores/useSettingStore";
import useThemeColors from "@/hooks/useThemeColors";
import { verifyNotionToken } from "@/commands/notion";

const NotionSetting: React.FC = () => {
  const themeColors = useThemeColors();
  const { setting, updateNotionToken, updateNotionUserInfo, setNotionEnabled } =
    useSettingStore();
  const { notion } = setting.integration;

  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tokenValue, setTokenValue] = useState(notion.token);
  const [errorMessage, setErrorMessage] = useState("");

  const checkToken = useMemoizedFn(async () => {
    if (!tokenValue.trim()) {
      setErrorMessage("请输入 Notion 集成密钥");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const result = await verifyNotionToken(tokenValue);

      if (result.success && result.userInfo) {
        updateNotionToken(tokenValue);
        updateNotionUserInfo({
          name: result.userInfo.name,
          email: result.userInfo.email,
          avatar: result.userInfo.avatar,
          isConnected: true,
        });
        setNotionEnabled(true);

        setModalOpen(false);
        setTokenValue("");
        setErrorMessage("");
      } else {
        setErrorMessage(result.error || "Token 验证失败，请检查是否正确");
      }
    } catch (error) {
      console.error("验证 Notion Token 失败:", error);
      setErrorMessage("验证失败，请检查 Token 是否正确");
    } finally {
      setLoading(false);
    }
  });

  const handleDisconnect = useCallback(() => {
    updateNotionToken("");
    updateNotionUserInfo({
      name: "",
      email: "",
      avatar: "",
      isConnected: false,
    });
    setNotionEnabled(false);
  }, [updateNotionToken, updateNotionUserInfo, setNotionEnabled]);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    setTokenValue(notion.token);
    setErrorMessage("");
  }, [notion.token]);

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
                notion.userInfo.isConnected ? "bg-green-500" : "bg-gray-400"
              }`}
            />
            <span className={`text-xs font-medium ${themeColors.textClass}`}>
              {notion.userInfo.isConnected ? "已连接" : "未连接"}
            </span>
          </div>
        </div>

        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-linear-to-br from-gray-900 to-gray-700 dark:from-gray-100 dark:to-gray-300 flex items-center justify-center text-white dark:text-gray-900 text-xl font-bold shadow-sm">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 4h16v16H4V4zm2 2v12h12V6H6z" />
                <path d="M8 8h8v2H8V8zm0 4h8v2H8v-2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3
                className={`text-base font-semibold truncate ${themeColors.activeTextClass}`}
              >
                Notion
              </h3>
              <p
                className={`text-xs truncate ${themeColors.secondaryTextClass}`}
              >
                笔记与协作平台
              </p>
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="px-6 py-2 flex-1 overflow-hidden">
          {notion.userInfo.isConnected && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {notion.userInfo.avatar && (
                  <img
                    src={notion.userInfo.avatar}
                    alt="avatar"
                    className="w-8 h-8 rounded-full"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-sm font-medium truncate ${themeColors.activeTextClass}`}
                  >
                    {notion.userInfo.name}
                  </div>
                  {notion.userInfo.email && (
                    <div
                      className={`text-xs truncate ${themeColors.secondaryTextClass}`}
                    >
                      {notion.userInfo.email}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-6 pt-4 mt-auto space-y-2">
          {!notion.userInfo.isConnected ? (
            <button
              onClick={() => setModalOpen(true)}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 rounded-lg transition-colors"
            >
              连接 Notion
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
                    <div className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                      <svg
                        className="w-5 h-5 text-gray-900 dark:text-gray-100"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M4 4h16v16H4V4zm2 2v12h12V6H6z" />
                        <path d="M8 8h8v2H8V8zm0 4h8v2H8v-2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-bold m-0 text-gray-800 dark:text-white">
                        Notion 集成
                      </h2>
                      <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                        配置集成密钥以连接 Notion
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
                        集成密钥 (Integration Token)
                      </label>
                      <textarea
                        value={tokenValue}
                        onChange={(e) => {
                          setTokenValue(e.target.value);
                          setErrorMessage("");
                        }}
                        placeholder="请输入 Notion 集成密钥 (secret_xxx...)..."
                        rows={4}
                        className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-gray-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(107,114,128,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(107,114,128,0.25)] disabled:opacity-60 disabled:cursor-not-allowed resize-none"
                        disabled={loading}
                      />
                    </div>

                    <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1 px-3.5 py-2.5 rounded-lg bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700">
                      <div>1. 访问 https://www.notion.so/my-integrations</div>
                      <div>2. 点击 "New integration" 创建新集成</div>
                      <div>3. 配置集成名称和权限</div>
                      <div>4. 复制 "Internal Integration Token"</div>
                      <div>5. 在 Notion 页面设置中添加该集成</div>
                    </div>

                    {errorMessage && (
                      <div className="px-3.5 py-2.5 rounded-lg text-[13px] bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400">
                        {errorMessage}
                      </div>
                    )}

                    <button
                      className="w-full px-5 py-3.5 rounded-xl border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all bg-gray-700 dark:bg-gray-600 text-white shadow-[0_4px_14px_rgba(55,65,81,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-gray-800 dark:hover:bg-gray-700 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none dark:disabled:border dark:disabled:border-slate-700"
                      onClick={checkToken}
                      disabled={!tokenValue.trim() || loading}
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

export default NotionSetting;
