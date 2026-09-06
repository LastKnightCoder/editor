import React, { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { useMemoizedFn } from "ahooks";
import useSettingStore from "@/stores/useSettingStore";
import useThemeColors from "@/hooks/useThemeColors";
import { produce } from "immer";

interface WebDavCredentialsForm {
  url: string;
  username: string;
  password: string;
}

const WebDavSetting: React.FC = () => {
  const themeColors = useThemeColors();
  const setting = useSettingStore(state => state.setting);
  const { webdav } = setting.integration;

  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState<WebDavCredentialsForm>({
    url: webdav.url || "",
    username: webdav.username || "",
    password: webdav.password || "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof WebDavCredentialsForm, string>>>({});

  const validateForm = useMemoizedFn(() => {
    const newErrors: Partial<Record<keyof WebDavCredentialsForm, string>> = {};

    if (!formData.url.trim()) {
      newErrors.url = "请输入 WebDAV URL";
    } else if (!/^https?:\/\/.+/.test(formData.url)) {
      newErrors.url = "请输入有效的 URL";
    }
    if (!formData.username.trim()) {
      newErrors.username = "请输入用户名";
    }
    if (!formData.password.trim()) {
      newErrors.password = "请输入密码";
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
        state.setting.integration.webdav = {
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
        state.setting.integration.webdav = {
          enabled: false,
          url: "",
          username: "",
          password: "",
        };
      })
    );
  }, []);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    setFormData({
      url: webdav.url || "",
      username: webdav.username || "",
      password: webdav.password || "",
    });
    setErrors({});
  }, [webdav.url, webdav.username, webdav.password]);

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
              className={`h-2 w-2 rounded-full ${webdav.enabled ? "bg-green-500" : "bg-gray-400"}`}
            />
            <span className={`text-xs font-medium ${themeColors.textClass}`}>
              {webdav.enabled ? "已配置" : "未配置"}
            </span>
          </div>
        </div>

        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-linear-to-br flex h-12 w-12 items-center justify-center rounded-lg from-[var(--th-accent)] to-[var(--th-accent-hover)] text-xl font-bold text-white shadow-sm">
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
                  d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
                />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className={`truncate text-base font-semibold ${themeColors.activeTextClass}`}>
                WebDAV
              </h3>
              <p className={`truncate text-xs ${themeColors.secondaryTextClass}`}>WebDAV 服务器</p>
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="flex-1 overflow-hidden px-6 py-2">
          {webdav.enabled && (
            <div className="space-y-1">
              <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                {webdav.username}
              </div>
              <div className={`truncate text-xs ${themeColors.secondaryTextClass}`}>
                {webdav.url}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-auto space-y-2 p-6 pt-4">
          {!webdav.enabled ? (
            <button
              onClick={() => setModalOpen(true)}
              className="w-full rounded-lg bg-[var(--th-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--th-btn-text)] transition-colors hover:bg-[var(--th-btn-hover)]"
            >
              配置 WebDAV
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
                    <div className="border-[var(--th-border-focus)]/30 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border bg-[var(--th-accent-soft)]">
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
                          d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
                        />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="m-0 text-base font-bold text-gray-800 dark:text-white">
                        WebDAV 配置
                      </h2>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">
                        配置 WebDAV 服务器连接
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
                    {/* URL */}
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                        <svg
                          className="h-3.5 w-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        WebDAV URL
                      </label>
                      <input
                        type="text"
                        value={formData.url}
                        onChange={e => {
                          setFormData({ ...formData, url: e.target.value });
                          setErrors({ ...errors, url: undefined });
                        }}
                        placeholder="https://dav.jianguoyun.com/dav/"
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                      />
                      {errors.url && (
                        <span className="text-xs text-red-600 dark:text-red-400">{errors.url}</span>
                      )}
                    </div>

                    {/* Username */}
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                        <svg
                          className="h-3.5 w-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        用户名
                      </label>
                      <input
                        type="text"
                        value={formData.username}
                        onChange={e => {
                          setFormData({
                            ...formData,
                            username: e.target.value,
                          });
                          setErrors({ ...errors, username: undefined });
                        }}
                        placeholder="请输入用户名..."
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                      />
                      {errors.username && (
                        <span className="text-xs text-red-600 dark:text-red-400">
                          {errors.username}
                        </span>
                      )}
                    </div>

                    {/* Password */}
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
                        密码
                      </label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={e => {
                          setFormData({
                            ...formData,
                            password: e.target.value,
                          });
                          setErrors({ ...errors, password: undefined });
                        }}
                        placeholder="请输入密码..."
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                      />
                      {errors.password && (
                        <span className="text-xs text-red-600 dark:text-red-400">
                          {errors.password}
                        </span>
                      )}
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

export default WebDavSetting;
