import React, { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { useMemoizedFn } from "ahooks";
import useSettingStore from "@/stores/useSettingStore";
import useThemeColors from "@/hooks/useThemeColors";
import { produce } from "immer";

interface AliOSSCredentialsForm {
  accessKeyId: string;
  accessKeySecret: string;
}

const AliOSSSetting: React.FC = () => {
  const themeColors = useThemeColors();
  const setting = useSettingStore((state) => state.setting);
  const { aliOSS } = setting.integration;

  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState<AliOSSCredentialsForm>({
    accessKeyId: aliOSS.accessKeyId || "",
    accessKeySecret: aliOSS.accessKeySecret || "",
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof AliOSSCredentialsForm, string>>
  >({});

  const validateForm = useMemoizedFn(() => {
    const newErrors: Partial<Record<keyof AliOSSCredentialsForm, string>> = {};

    if (!formData.accessKeyId.trim()) {
      newErrors.accessKeyId = "请输入 Access Key ID";
    }
    if (!formData.accessKeySecret.trim()) {
      newErrors.accessKeySecret = "请输入 Access Key Secret";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  });

  const handleSave = useMemoizedFn(() => {
    if (!validateForm()) {
      return;
    }

    useSettingStore.setState(
      produce((state) => {
        state.setting.integration.aliOSS = {
          enabled: true,
          ...formData,
        };
      }),
    );
    setModalOpen(false);
    setErrors({});
  });

  const handleDisconnect = useCallback(() => {
    useSettingStore.setState(
      produce((state) => {
        state.setting.integration.aliOSS = {
          enabled: false,
          accessKeyId: "",
          accessKeySecret: "",
        };
      }),
    );
  }, []);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    setFormData({
      accessKeyId: aliOSS.accessKeyId || "",
      accessKeySecret: aliOSS.accessKeySecret || "",
    });
    setErrors({});
  }, [aliOSS.accessKeyId, aliOSS.accessKeySecret]);

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
                aliOSS.enabled ? "bg-green-500" : "bg-gray-400"
              }`}
            />
            <span className={`text-xs font-medium ${themeColors.textClass}`}>
              {aliOSS.enabled ? "已配置" : "未配置"}
            </span>
          </div>
        </div>

        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-linear-to-br from-blue-500 to-sky-600 flex items-center justify-center text-white text-xl font-bold shadow-sm">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3
                className={`text-base font-semibold truncate ${themeColors.activeTextClass}`}
              >
                阿里云 OSS
              </h3>
              <p
                className={`text-xs truncate ${themeColors.secondaryTextClass}`}
              >
                阿里云对象存储服务
              </p>
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="px-6 py-2 flex-1 overflow-hidden">
          {aliOSS.enabled && (
            <div className="space-y-1">
              <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                已配置
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-6 pt-4 mt-auto space-y-2">
          {!aliOSS.enabled ? (
            <button
              onClick={() => setModalOpen(true)}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
            >
              配置阿里云 OSS
            </button>
          ) : (
            <>
              <button
                onClick={() => setModalOpen(true)}
                className={`w-full px-4 py-2 text-sm font-medium rounded-lg transition-colors ${themeColors.inputBgClass} ${themeColors.textClass} ${themeColors.hoverClass}`}
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
                    <div className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-blue-50 dark:bg-blue-500/20 border border-blue-200 dark:border-blue-500/30">
                      <svg
                        className="w-5 h-5 text-blue-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                        />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-bold m-0 text-gray-800 dark:text-white">
                        阿里云 OSS 配置
                      </h2>
                      <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                        配置阿里云对象存储服务
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
                    {/* Access Key ID */}
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
                        Access Key ID
                      </label>
                      <input
                        type="text"
                        value={formData.accessKeyId}
                        onChange={(e) => {
                          setFormData({
                            ...formData,
                            accessKeyId: e.target.value,
                          });
                          setErrors({ ...errors, accessKeyId: undefined });
                        }}
                        placeholder="请输入 Access Key ID..."
                        className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-blue-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(59,130,246,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(59,130,246,0.25)]"
                      />
                      {errors.accessKeyId && (
                        <span className="text-xs text-red-600 dark:text-red-400">
                          {errors.accessKeyId}
                        </span>
                      )}
                    </div>

                    {/* Access Key Secret */}
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                        <svg
                          className="w-3.5 h-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        Access Key Secret
                      </label>
                      <input
                        type="password"
                        value={formData.accessKeySecret}
                        onChange={(e) => {
                          setFormData({
                            ...formData,
                            accessKeySecret: e.target.value,
                          });
                          setErrors({
                            ...errors,
                            accessKeySecret: undefined,
                          });
                        }}
                        placeholder="请输入 Access Key Secret..."
                        className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-blue-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(59,130,246,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(59,130,246,0.25)]"
                      />
                      {errors.accessKeySecret && (
                        <span className="text-xs text-red-600 dark:text-red-400">
                          {errors.accessKeySecret}
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1 px-3.5 py-2.5 rounded-lg bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700">
                      <div>1. 访问阿里云控制台</div>
                      <div>2. 进入 AccessKey 管理</div>
                      <div>3. 创建或查看 AccessKey</div>
                    </div>

                    <button
                      className="w-full px-5 py-3.5 rounded-xl border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all bg-blue-500 text-white shadow-[0_4px_14px_rgba(59,130,246,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-blue-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none"
                      onClick={handleSave}
                    >
                      <svg
                        className="w-5 h-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                      保存配置
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

export default AliOSSSetting;
