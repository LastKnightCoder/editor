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
  const setting = useSettingStore(state => state.setting);
  const { aliOSS } = setting.integration;

  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState<AliOSSCredentialsForm>({
    accessKeyId: aliOSS.accessKeyId || "",
    accessKeySecret: aliOSS.accessKeySecret || "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof AliOSSCredentialsForm, string>>>({});

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
      produce(state => {
        state.setting.integration.aliOSS = {
          enabled: true,
          ...formData,
        };
      })
    );
    setModalOpen(false);
    setErrors({});
  });

  const handleDisconnect = useCallback(() => {
    useSettingStore.setState(
      produce(state => {
        state.setting.integration.aliOSS = {
          enabled: false,
          accessKeyId: "",
          accessKeySecret: "",
        };
      })
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
              className={`h-2 w-2 rounded-full ${aliOSS.enabled ? "bg-status-success" : "bg-gray-400"}`}
            />
            <span className={`text-xs font-medium ${themeColors.textClass}`}>
              {aliOSS.enabled ? "已配置" : "未配置"}
            </span>
          </div>
        </div>

        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-linear-to-br flex h-12 w-12 items-center justify-center rounded-lg from-blue-500 to-sky-600 text-xl font-bold text-white shadow-sm">
              <svg
                className="h-6 w-6"
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
            <div className="min-w-0 flex-1">
              <h3 className={`truncate text-base font-semibold ${themeColors.activeTextClass}`}>
                阿里云 OSS
              </h3>
              <p className={`truncate text-xs ${themeColors.secondaryTextClass}`}>
                阿里云对象存储服务
              </p>
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="flex-1 overflow-hidden px-6 py-2">
          {aliOSS.enabled && (
            <div className="space-y-1">
              <span className="inline-block rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                已配置
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-auto space-y-2 p-6 pt-4">
          {!aliOSS.enabled ? (
            <button
              onClick={() => setModalOpen(true)}
              className="w-full rounded-lg bg-[var(--th-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--th-btn-text)] transition-colors hover:bg-[var(--th-btn-hover)]"
            >
              配置阿里云 OSS
            </button>
          ) : (
            <>
              <button
                onClick={() => setModalOpen(true)}
                className={`w-full rounded-lg px-4 py-2 text-sm font-medium transition-colors ${themeColors.inputBgClass} ${themeColors.textClass} ${themeColors.hoverClass}`}
              >
                管理凭证
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
                    <div className="border-[var(--th-border-focus)]/30 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border bg-blue-50 dark:bg-blue-500/20">
                      <svg
                        className="h-5 w-5 text-[var(--th-accent)]"
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
                    <div className="min-w-0 flex-1">
                      <h2 className="m-0 text-base font-bold text-gray-800 dark:text-white">
                        阿里云 OSS 配置
                      </h2>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">
                        配置阿里云对象存储服务
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
                    {/* Access Key ID */}
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
                        Access Key ID
                      </label>
                      <input
                        type="text"
                        value={formData.accessKeyId}
                        onChange={e => {
                          setFormData({
                            ...formData,
                            accessKeyId: e.target.value,
                          });
                          setErrors({ ...errors, accessKeyId: undefined });
                        }}
                        placeholder="请输入 Access Key ID..."
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
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
                          className="h-3.5 w-3.5"
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
                        onChange={e => {
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
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                      />
                      {errors.accessKeySecret && (
                        <span className="text-xs text-red-600 dark:text-red-400">
                          {errors.accessKeySecret}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs text-gray-600 dark:border-slate-700 dark:bg-zinc-950 dark:text-gray-400">
                      <div>1. 访问阿里云控制台</div>
                      <div>2. 进入 AccessKey 管理</div>
                      <div>3. 创建或查看 AccessKey</div>
                    </div>

                    <button
                      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-[var(--th-btn-bg)] px-5 py-3.5 text-sm font-semibold text-[var(--th-btn-text)] shadow-sm transition-all hover:-translate-y-px hover:bg-[var(--th-btn-hover)] active:translate-y-0 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
                      onClick={handleSave}
                    >
                      <svg
                        className="h-5 w-5"
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
          document.body
        )}
    </>
  );
};

export default AliOSSSetting;
