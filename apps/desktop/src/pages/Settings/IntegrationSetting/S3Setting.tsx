import React, { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { useMemoizedFn } from "ahooks";
import useSettingStore from "@/stores/useSettingStore";
import useThemeColors from "@/hooks/useThemeColors";
import { produce } from "immer";

interface S3CredentialsForm {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  urlStyle: "path" | "virtualHosted";
}

const S3Setting: React.FC = () => {
  const themeColors = useThemeColors();
  const setting = useSettingStore(state => state.setting);
  const { s3 } = setting.integration;

  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState<S3CredentialsForm>({
    accessKeyId: s3.accessKeyId || "",
    secretAccessKey: s3.secretAccessKey || "",
    endpoint: s3.endpoint || "",
    urlStyle: s3.urlStyle || "path",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof S3CredentialsForm, string>>>({});

  const validateForm = useMemoizedFn(() => {
    const newErrors: Partial<Record<keyof S3CredentialsForm, string>> = {};

    if (!formData.accessKeyId.trim()) {
      newErrors.accessKeyId = "请输入 Access Key ID";
    }
    if (!formData.secretAccessKey.trim()) {
      newErrors.secretAccessKey = "请输入 Secret Access Key";
    }
    if (!formData.urlStyle) {
      newErrors.urlStyle = "请选择请求风格";
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
        state.setting.integration.s3 = {
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
        state.setting.integration.s3 = {
          enabled: false,
          accessKeyId: "",
          secretAccessKey: "",
          endpoint: "",
          urlStyle: "path",
        };
      })
    );
  }, []);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    setFormData({
      accessKeyId: s3.accessKeyId || "",
      secretAccessKey: s3.secretAccessKey || "",
      endpoint: s3.endpoint || "",
      urlStyle: s3.urlStyle || "path",
    });
    setErrors({});
  }, [s3.accessKeyId, s3.secretAccessKey, s3.endpoint, s3.urlStyle]);

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
              className={`h-2 w-2 rounded-full ${s3.enabled ? "bg-status-success" : "bg-gray-400"}`}
            />
            <span className={`text-xs font-medium ${themeColors.textClass}`}>
              {s3.enabled ? "已配置" : "未配置"}
            </span>
          </div>
        </div>

        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-linear-to-br flex h-12 w-12 items-center justify-center rounded-lg from-orange-500 to-amber-600 text-xl font-bold text-white shadow-sm">
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
              <h3 className={`truncate text-base font-semibold ${themeColors.textClass}`}>
                S3 Compatible Storage
              </h3>
              <p className={`truncate text-xs ${themeColors.secondaryTextClass}`}>
                S3 兼容对象存储
              </p>
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="flex-1 overflow-hidden px-6 py-2">
          {s3.enabled && (
            <div className="space-y-1">
              <div className={`truncate text-xs ${themeColors.secondaryTextClass}`}>
                {s3.endpoint || "AWS S3 默认端点"}
              </div>
              <span className="inline-block rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900 dark:text-orange-300">
                {s3.urlStyle === "path" ? "路径风格" : "虚拟托管风格"}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-auto space-y-2 p-6 pt-4">
          {!s3.enabled ? (
            <button
              onClick={() => setModalOpen(true)}
              className="w-full rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600"
            >
              配置 S3
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
                className="m-4 w-full max-w-[520px]"
              >
                <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-zinc-900/95">
                  <div className="mb-5 flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-orange-200 bg-orange-50 dark:border-orange-500/30 dark:bg-orange-500/20">
                      <svg
                        className="h-5 w-5 text-orange-500"
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
                        S3 兼容存储配置
                      </h2>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">
                        配置 S3 兼容的对象存储服务
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
                    {/* URL Style */}
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                        请求风格
                      </label>
                      <div className="flex gap-3">
                        <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 transition-all hover:border-orange-300 dark:border-slate-700 dark:bg-zinc-950 dark:hover:border-orange-600">
                          <input
                            type="radio"
                            name="urlStyle"
                            value="path"
                            checked={formData.urlStyle === "path"}
                            onChange={e => {
                              setFormData({
                                ...formData,
                                urlStyle: e.target.value as "path" | "virtualHosted",
                              });
                              setErrors({ ...errors, urlStyle: undefined });
                            }}
                            className="h-4 w-4 text-orange-600 focus:ring-orange-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            Path Style
                          </span>
                        </label>
                        <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 transition-all hover:border-orange-300 dark:border-slate-700 dark:bg-zinc-950 dark:hover:border-orange-600">
                          <input
                            type="radio"
                            name="urlStyle"
                            value="virtualHosted"
                            checked={formData.urlStyle === "virtualHosted"}
                            onChange={e => {
                              setFormData({
                                ...formData,
                                urlStyle: e.target.value as "path" | "virtualHosted",
                              });
                              setErrors({ ...errors, urlStyle: undefined });
                            }}
                            className="h-4 w-4 text-orange-600 focus:ring-orange-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            Virtual Hosted
                          </span>
                        </label>
                      </div>
                      {errors.urlStyle && (
                        <span className="text-xs text-red-600 dark:text-red-400">
                          {errors.urlStyle}
                        </span>
                      )}
                    </div>

                    {/* Access Key ID */}
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
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
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-orange-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(249,115,22,0.15)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(249,115,22,0.25)]"
                      />
                      {errors.accessKeyId && (
                        <span className="text-xs text-red-600 dark:text-red-400">
                          {errors.accessKeyId}
                        </span>
                      )}
                    </div>

                    {/* Secret Access Key */}
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                        Secret Access Key
                      </label>
                      <input
                        type="password"
                        value={formData.secretAccessKey}
                        onChange={e => {
                          setFormData({
                            ...formData,
                            secretAccessKey: e.target.value,
                          });
                          setErrors({
                            ...errors,
                            secretAccessKey: undefined,
                          });
                        }}
                        placeholder="请输入 Secret Access Key..."
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-orange-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(249,115,22,0.15)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(249,115,22,0.25)]"
                      />
                      {errors.secretAccessKey && (
                        <span className="text-xs text-red-600 dark:text-red-400">
                          {errors.secretAccessKey}
                        </span>
                      )}
                    </div>

                    {/* Endpoint */}
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                        Endpoint (可选)
                      </label>
                      <input
                        type="text"
                        value={formData.endpoint}
                        onChange={e => {
                          setFormData({
                            ...formData,
                            endpoint: e.target.value,
                          });
                        }}
                        placeholder="https://s3.us-west-2.amazonaws.com"
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-orange-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(249,115,22,0.15)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(249,115,22,0.25)]"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        留空使用 AWS 默认端点
                      </p>
                    </div>

                    <button
                      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-orange-500 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(249,115,22,0.35),0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:-translate-y-px hover:bg-orange-600 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
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

export default S3Setting;
