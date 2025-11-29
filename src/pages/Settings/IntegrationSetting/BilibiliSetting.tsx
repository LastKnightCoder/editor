import React, { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useMemoizedFn } from "ahooks";
import useSettingStore from "@/stores/useSettingStore";
import {
  getBilibiliQRCode,
  checkBilibiliQRStatus,
  extractCredentialsFromQR,
  checkBilibiliLogin,
  BilibiliQRCodeStatus,
} from "@/utils/bilibili";

const BilibiliSetting: React.FC = () => {
  const {
    setting,
    updateBilibiliCredentials,
    updateBilibiliUserInfo,
    setBilibiliEnabled,
  } = useSettingStore();
  const { bilibili } = setting.integration;

  const [credentialsModalOpen, setCredentialsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessdata, setSessdata] = useState(bilibili.credentials.SESSDATA);
  const [bfeId, setBfeId] = useState(bilibili.credentials.bfe_id || "");
  const [errorMessage, setErrorMessage] = useState("");

  // QR code login state
  const [activeTab, setActiveTab] = useState<"qrcode" | "manual">("qrcode");
  const [qrLoading, setQrLoading] = useState(false);
  const [qrData, setQrData] = useState<{
    qrcodeKey: string;
    url: string;
  } | null>(null);
  const [qrStatus, setQrStatus] = useState<string>("");
  const [qrError, setQrError] = useState<string>("");
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [qrExpired, setQrExpired] = useState(false);

  const checkLoginStatus = useMemoizedFn(async () => {
    if (!sessdata.trim()) {
      setErrorMessage("请输入 SESSDATA");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const credentials = { SESSDATA: sessdata, bfe_id: bfeId };
      const userInfo = await checkBilibiliLogin(credentials);

      if (userInfo.isLogin) {
        updateBilibiliCredentials(credentials);
        updateBilibiliUserInfo(userInfo);
        setBilibiliEnabled(true);

        setCredentialsModalOpen(false);
        setSessdata("");
        setBfeId("");
        setErrorMessage("");
      } else {
        setErrorMessage("凭证无效，请检查 SESSDATA 是否正确");
      }
    } catch (error) {
      console.error("验证凭证失败:", error);
      setErrorMessage("验证失败，请检查凭证是否正确");
    } finally {
      setLoading(false);
    }
  });

  // Get QR code
  const getQRCode = useCallback(async () => {
    setQrLoading(true);
    setQrError("");
    setQrExpired(false);

    try {
      const qrInfo = await getBilibiliQRCode();
      setQrData(qrInfo);
      setQrStatus("请使用 Bilibili 手机客户端扫描二维码");

      // Start polling QR status
      startQRPolling(qrInfo.qrcodeKey);
    } catch (error) {
      console.error("获取二维码失败:", error);
      setQrError("获取二维码失败，请重试");
    } finally {
      setQrLoading(false);
    }
  }, []);

  const startQRPolling = useCallback(
    (qrcodeKey: string) => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }

      pollTimerRef.current = setInterval(async () => {
        try {
          const statusResult = await checkBilibiliQRStatus(qrcodeKey);

          switch (statusResult.code) {
            case BilibiliQRCodeStatus.SUCCESS:
              if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
              }

              if (statusResult.url) {
                try {
                  const credentials = await extractCredentialsFromQR(
                    statusResult.url,
                  );
                  const userInfo = await checkBilibiliLogin(credentials);

                  updateBilibiliCredentials(credentials);
                  updateBilibiliUserInfo(userInfo);
                  setBilibiliEnabled(true);

                  setQrStatus("登录成功！");
                  setCredentialsModalOpen(false);
                  setQrData(null);
                } catch (error) {
                  console.error("处理登录结果失败:", error);
                  setQrError("登录处理失败，请重试");
                }
              }
              break;

            case BilibiliQRCodeStatus.EXPIRED:
              if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
              }
              setQrExpired(true);
              setQrStatus("二维码已过期，请刷新重试");
              break;

            case BilibiliQRCodeStatus.NOT_CONFIRMED:
              setQrStatus("扫码成功，请在手机上确认登录");
              break;

            case BilibiliQRCodeStatus.NOT_SCANNED:
              break;

            default:
              setQrStatus(statusResult.message || "未知状态");
          }
        } catch (error) {
          console.error("检查二维码状态失败:", error);
        }
      }, 2000);
    },
    [updateBilibiliCredentials, updateBilibiliUserInfo, setBilibiliEnabled],
  );

  // Clean up polling timer
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  const refreshQRCode = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    getQRCode();
  }, [getQRCode]);

  const handleDisconnect = useCallback(() => {
    updateBilibiliCredentials({ SESSDATA: "", bfe_id: "" });
    updateBilibiliUserInfo({
      name: "",
      avatar: "",
      isLogin: false,
      vipStatus: 0,
    });
    setBilibiliEnabled(false);
  }, [updateBilibiliCredentials, updateBilibiliUserInfo, setBilibiliEnabled]);

  const handleModalClose = useCallback(() => {
    setCredentialsModalOpen(false);
    setSessdata(bilibili.credentials.SESSDATA);
    setBfeId(bilibili.credentials.bfe_id || "");
    setErrorMessage("");
    setQrData(null);
    setQrStatus("");
    setQrError("");
    setActiveTab("qrcode");
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, [bilibili.credentials.SESSDATA, bilibili.credentials.bfe_id]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        handleModalClose();
      }
    },
    [handleModalClose],
  );

  const getVipStatusText = (vipStatus: number) => {
    switch (vipStatus) {
      case 0:
        return "普通用户";
      case 1:
        return "大会员";
      default:
        return "未知";
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative group bg-white dark:bg-[#333] rounded-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden h-[280px] flex flex-col"
      >
        <div className="absolute top-4 right-4">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700">
            <div
              className={`w-2 h-2 rounded-full ${
                bilibili.userInfo.isLogin ? "bg-green-500" : "bg-gray-400"
              }`}
            />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {bilibili.userInfo.isLogin ? "已连接" : "未连接"}
            </span>
          </div>
        </div>

        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-linear-to-br from-pink-500 to-pink-600 flex items-center justify-center text-white text-xl font-bold shadow-sm">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373Z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
                Bilibili
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                哔哩哔哩
              </p>
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="px-6 py-2 flex-1 overflow-hidden">
          {bilibili.userInfo.isLogin && (
            <div className="flex items-center gap-2">
              {bilibili.userInfo.avatar && (
                <img
                  src={bilibili.userInfo.avatar}
                  alt="avatar"
                  className="w-8 h-8 rounded-full"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {bilibili.userInfo.name}
                </div>
                <span
                  className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${
                    bilibili.userInfo.vipStatus === 1
                      ? "bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300"
                      : "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                  }`}
                >
                  {getVipStatusText(bilibili.userInfo.vipStatus)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-6 pt-4 mt-auto space-y-2">
          {!bilibili.userInfo.isLogin ? (
            <button
              onClick={() => setCredentialsModalOpen(true)}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-pink-500 hover:bg-pink-600 dark:bg-pink-500 dark:hover:bg-pink-600 rounded-lg transition-colors"
            >
              连接 Bilibili
            </button>
          ) : (
            <>
              <button
                onClick={() => setCredentialsModalOpen(true)}
                className="w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                管理凭证
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
      {credentialsModalOpen &&
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
                    <div className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-pink-50 dark:bg-pink-500/20 border border-pink-200 dark:border-pink-500/30">
                      <svg
                        className="w-5 h-5 text-pink-500"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373Z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-bold m-0 text-gray-800 dark:text-white">
                        Bilibili 登录
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
                          ? "bg-pink-50 dark:bg-pink-500/20 text-pink-600 dark:text-pink-400 border border-pink-200 dark:border-pink-500/30"
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
                      onClick={() => setActiveTab("manual")}
                      className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        activeTab === "manual"
                          ? "bg-pink-50 dark:bg-pink-500/20 text-pink-600 dark:text-pink-400 border border-pink-200 dark:border-pink-500/30"
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
                      手动输入
                    </button>
                  </div>

                  {/* Tab Content */}
                  <div className="flex flex-col gap-4">
                    {activeTab === "qrcode" ? (
                      <>
                        {!qrData && !qrLoading && (
                          <div className="text-center py-8">
                            <button
                              onClick={getQRCode}
                              className="px-6 py-3 rounded-xl border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 mx-auto transition-all bg-pink-500 text-white shadow-[0_4px_14px_rgba(236,72,153,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-pink-600 hover:-translate-y-px active:translate-y-0"
                            >
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
                              获取登录二维码
                            </button>
                            <div className="mt-4 text-xs text-gray-500 dark:text-slate-500">
                              使用 Bilibili 手机客户端扫码登录，更安全便捷
                            </div>
                          </div>
                        )}

                        {qrLoading && (
                          <div className="text-center py-8">
                            <svg
                              className="animate-spin w-8 h-8 mx-auto text-pink-500"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                            <div className="mt-4 text-sm text-gray-600 dark:text-slate-400">
                              正在获取二维码...
                            </div>
                          </div>
                        )}

                        {qrData && (
                          <div className="text-center">
                            <div className="inline-block p-4 bg-white rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm mb-4">
                              <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData.url)}`}
                                alt="QR Code"
                                className="w-[200px] h-[200px]"
                              />
                            </div>

                            <div className="text-sm text-gray-600 dark:text-slate-400 mb-4">
                              {qrStatus}
                            </div>

                            {qrExpired && (
                              <button
                                onClick={refreshQRCode}
                                className="px-4 py-2 rounded-lg text-sm font-medium bg-pink-500 text-white hover:bg-pink-600 transition-colors"
                              >
                                <svg
                                  className="w-4 h-4 inline-block mr-1.5"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                                </svg>
                                刷新二维码
                              </button>
                            )}
                          </div>
                        )}

                        {qrError && (
                          <div className="px-3.5 py-2.5 rounded-lg text-[13px] bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400">
                            {qrError}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                            SESSDATA
                          </label>
                          <textarea
                            value={sessdata}
                            onChange={(e) => {
                              setSessdata(e.target.value);
                              setErrorMessage("");
                            }}
                            placeholder="请输入 SESSDATA..."
                            rows={3}
                            className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-pink-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(236,72,153,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(236,72,153,0.25)] disabled:opacity-60 disabled:cursor-not-allowed resize-none"
                            disabled={loading}
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                            bfe_id (可选)
                          </label>
                          <input
                            type="text"
                            value={bfeId}
                            onChange={(e) => {
                              setBfeId(e.target.value);
                              setErrorMessage("");
                            }}
                            placeholder="请输入 bfe_id..."
                            className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-pink-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(236,72,153,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(236,72,153,0.25)] disabled:opacity-60 disabled:cursor-not-allowed"
                            disabled={loading}
                          />
                        </div>

                        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1 px-3.5 py-2.5 rounded-lg bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700">
                          <div>1. 打开 Bilibili 网站并登录</div>
                          <div>2. 按 F12 打开开发者工具</div>
                          <div>3. 切换到 Application/Storage 标签</div>
                          <div>4. 在 Cookies 中找到 SESSDATA 值</div>
                        </div>

                        {errorMessage && (
                          <div className="px-3.5 py-2.5 rounded-lg text-[13px] bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400">
                            {errorMessage}
                          </div>
                        )}

                        <button
                          className="w-full px-5 py-3.5 rounded-xl border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all bg-pink-500 text-white shadow-[0_4px_14px_rgba(236,72,153,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-pink-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none dark:disabled:border dark:disabled:border-slate-700"
                          onClick={checkLoginStatus}
                          disabled={!sessdata.trim() || loading}
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
                              验证并登录
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

export default BilibiliSetting;
