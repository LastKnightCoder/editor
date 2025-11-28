import React, { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useMemoizedFn } from "ahooks";
import useSettingStore from "@/stores/useSettingStore";
import weReadService from "@/services/weread";

const WeReadSetting: React.FC = () => {
  const { setting, clearWeReadCookies, setWeReadEnabled } = useSettingStore(
    (state) => ({
      setting: state.setting,
      clearWeReadCookies: state.clearWeReadCookies,
      setWeReadEnabled: state.setWeReadEnabled,
    }),
  );

  const { weread } = setting.integration;

  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"qrcode" | "cookie">("qrcode");
  const [cookieInput, setCookieInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleQrLogin = useMemoizedFn(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      await weReadService.loginWithQRCode();
      setModalOpen(false);
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error?.message || "登录失败");
    } finally {
      setLoading(false);
    }
  });

  const handleCookieLogin = useMemoizedFn(async () => {
    if (!cookieInput.trim()) {
      setErrorMessage("请输入 Cookie 内容");
      return;
    }
    setLoading(true);
    setErrorMessage("");
    try {
      await weReadService.loginWithCookieString(cookieInput.trim());
      setModalOpen(false);
      setCookieInput("");
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error?.message || "解析 Cookie 失败");
    } finally {
      setLoading(false);
    }
  });

  const handleDisconnect = useCallback(() => {
    weReadService.logout();
    setWeReadEnabled(false);
    clearWeReadCookies();
  }, [clearWeReadCookies, setWeReadEnabled]);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    setCookieInput("");
    setErrorMessage("");
    setActiveTab("qrcode");
  }, []);

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
        whileHover={{ scale: 1.02, y: -4 }}
        whileTap={{ scale: 0.98 }}
        className="relative group bg-white dark:bg-[#333] rounded-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden h-[280px] flex flex-col"
      >
        {/* Status Badge */}
        <div className="absolute top-4 right-4">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700">
            <div
              className={`w-2 h-2 rounded-full ${
                weread.userInfo.isConnected ? "bg-green-500" : "bg-gray-400"
              }`}
            />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {weread.userInfo.isConnected ? "已连接" : "未连接"}
            </span>
          </div>
        </div>

        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold shadow-sm">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
                微信读书
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                同步书籍、划线与想法
              </p>
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="px-6 py-2 flex-1 overflow-hidden">
          {weread.userInfo.isConnected && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <span className="font-medium truncate">
                  {weread.userInfo.name || "用户"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                  VID: {weread.userInfo.vid || "未知"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-6 pt-4 mt-auto space-y-2">
          {!weread.userInfo.isConnected ? (
            <button
              onClick={() => setModalOpen(true)}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
            >
              连接微信读书
            </button>
          ) : (
            <>
              <button
                onClick={() => setModalOpen(true)}
                className="w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                重新登录
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
                className="w-full max-w-[520px] m-4"
              >
                <div className="rounded-2xl p-6 shadow-2xl bg-white dark:bg-slate-900/95 border border-gray-200 dark:border-slate-800">
                  <div className="flex items-start gap-3 mb-5">
                    <div className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-blue-50 dark:bg-blue-500/20 border border-blue-200 dark:border-blue-500/30">
                      <svg
                        className="w-5 h-5 text-blue-500"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-bold m-0 text-gray-800 dark:text-white">
                        微信读书登录
                      </h2>
                      <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                        选择登录方式
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

                  {/* Tabs */}
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setActiveTab("qrcode")}
                      className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        activeTab === "qrcode"
                          ? "bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30"
                          : "bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      <svg
                        className="w-4 h-4 inline-block mr-1.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <path d="M7 7h.01M7 17h.01M17 7h.01M17 17h.01M12 12h.01" />
                      </svg>
                      扫码登录
                    </button>
                    <button
                      onClick={() => setActiveTab("cookie")}
                      className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        activeTab === "cookie"
                          ? "bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30"
                          : "bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      <svg
                        className="w-4 h-4 inline-block mr-1.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                      Cookie 登录
                    </button>
                  </div>

                  {/* Tab Content */}
                  <div className="flex flex-col gap-4">
                    {activeTab === "qrcode" ? (
                      <>
                        <div className="text-center py-4">
                          <button
                            onClick={handleQrLogin}
                            disabled={loading}
                            className="w-full px-5 py-3.5 rounded-xl border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all bg-blue-500 text-white shadow-[0_4px_14px_rgba(59,130,246,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-blue-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none"
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
                                登录中...
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
                                  <rect
                                    x="3"
                                    y="3"
                                    width="18"
                                    height="18"
                                    rx="2"
                                  />
                                  <path d="M7 7h.01M7 17h.01M17 7h.01M17 17h.01M12 12h.01" />
                                </svg>
                                打开扫码登录
                              </>
                            )}
                          </button>
                          <div className="mt-4 text-xs text-gray-500 dark:text-slate-500">
                            使用微信扫描二维码登录
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                            Cookie 内容
                          </label>
                          <textarea
                            value={cookieInput}
                            onChange={(e) => {
                              setCookieInput(e.target.value);
                              setErrorMessage("");
                            }}
                            placeholder="例如：wr_name=xxx; wr_vid=xxx; wr_skey=xxx"
                            rows={4}
                            className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-blue-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(59,130,246,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(59,130,246,0.25)] disabled:opacity-60 disabled:cursor-not-allowed resize-none"
                            disabled={loading}
                          />
                        </div>

                        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1 px-3.5 py-2.5 rounded-lg bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700">
                          <div>
                            1. 打开浏览器访问 https://weread.qq.com 并登录
                          </div>
                          <div>2. 按 F12 打开开发者工具</div>
                          <div>3. 切换到 Network 标签</div>
                          <div>4. 刷新页面，找到请求头中的 Cookie</div>
                          <div>5. 复制完整的 Cookie 内容</div>
                        </div>

                        {errorMessage && (
                          <div className="px-3.5 py-2.5 rounded-lg text-[13px] bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400">
                            {errorMessage}
                          </div>
                        )}

                        <button
                          className="w-full px-5 py-3.5 rounded-xl border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all bg-blue-500 text-white shadow-[0_4px_14px_rgba(59,130,246,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-blue-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none dark:disabled:border dark:disabled:border-slate-700"
                          onClick={handleCookieLogin}
                          disabled={!cookieInput.trim() || loading}
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
                              保存中...
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
                              保存并登录
                            </>
                          )}
                        </button>
                      </>
                    )}
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

export default WeReadSetting;
