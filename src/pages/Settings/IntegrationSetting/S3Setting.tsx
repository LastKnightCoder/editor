import React, { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useMemoizedFn } from "ahooks";
import useSettingStore from "@/stores/useSettingStore";
import { produce } from "immer";

interface S3CredentialsForm {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  urlStyle: "path" | "virtualHosted";
}

const S3Setting: React.FC = () => {
  const { setting } = useSettingStore();
  const { s3 } = setting.integration;

  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState<S3CredentialsForm>({
    accessKeyId: s3.accessKeyId || "",
    secretAccessKey: s3.secretAccessKey || "",
    endpoint: s3.endpoint || "",
    urlStyle: s3.urlStyle || "path",
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof S3CredentialsForm, string>>
  >({});

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
      produce((state) => {
        state.setting.integration.s3 = {
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
        state.setting.integration.s3 = {
          enabled: false,
          accessKeyId: "",
          secretAccessKey: "",
          endpoint: "",
          urlStyle: "path",
        };
      }),
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
                s3.enabled ? "bg-green-500" : "bg-gray-400"
              }`}
            />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {s3.enabled ? "已配置" : "未配置"}
            </span>
          </div>
        </div>

        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-linear-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white text-xl font-bold shadow-sm">
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
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
                S3 Compatible Storage
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                S3 兼容对象存储
              </p>
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="px-6 py-2 flex-1 overflow-hidden">
          {s3.enabled && (
            <div className="space-y-1">
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {s3.endpoint || "AWS S3 默认端点"}
              </div>
              <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300">
                {s3.urlStyle === "path" ? "路径风格" : "虚拟托管风格"}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-6 pt-4 mt-auto space-y-2">
          {!s3.enabled ? (
            <button
              onClick={() => setModalOpen(true)}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
            >
              配置 S3
            </button>
          ) : (
            <>
              <button
                onClick={() => setModalOpen(true)}
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
                    <div className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-orange-50 dark:bg-orange-500/20 border border-orange-200 dark:border-orange-500/30">
                      <svg
                        className="w-5 h-5 text-orange-500"
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
                        S3 兼容存储配置
                      </h2>
                      <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                        配置 S3 兼容的对象存储服务
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
                    {/* URL Style */}
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                        请求风格
                      </label>
                      <div className="flex gap-3">
                        <label className="flex items-center gap-2 cursor-pointer px-4 py-3 rounded-lg border transition-all bg-gray-50 dark:bg-slate-950 border-gray-200 dark:border-slate-700 hover:border-orange-300 dark:hover:border-orange-600 flex-1">
                          <input
                            type="radio"
                            name="urlStyle"
                            value="path"
                            checked={formData.urlStyle === "path"}
                            onChange={(e) => {
                              setFormData({
                                ...formData,
                                urlStyle: e.target.value as
                                  | "path"
                                  | "virtualHosted",
                              });
                              setErrors({ ...errors, urlStyle: undefined });
                            }}
                            className="w-4 h-4 text-orange-600 focus:ring-orange-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            Path Style
                          </span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer px-4 py-3 rounded-lg border transition-all bg-gray-50 dark:bg-slate-950 border-gray-200 dark:border-slate-700 hover:border-orange-300 dark:hover:border-orange-600 flex-1">
                          <input
                            type="radio"
                            name="urlStyle"
                            value="virtualHosted"
                            checked={formData.urlStyle === "virtualHosted"}
                            onChange={(e) => {
                              setFormData({
                                ...formData,
                                urlStyle: e.target.value as
                                  | "path"
                                  | "virtualHosted",
                              });
                              setErrors({ ...errors, urlStyle: undefined });
                            }}
                            className="w-4 h-4 text-orange-600 focus:ring-orange-500"
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
                        onChange={(e) => {
                          setFormData({
                            ...formData,
                            accessKeyId: e.target.value,
                          });
                          setErrors({ ...errors, accessKeyId: undefined });
                        }}
                        placeholder="请输入 Access Key ID..."
                        className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-orange-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(249,115,22,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(249,115,22,0.25)]"
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
                        onChange={(e) => {
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
                        className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-orange-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(249,115,22,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(249,115,22,0.25)]"
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
                        onChange={(e) => {
                          setFormData({
                            ...formData,
                            endpoint: e.target.value,
                          });
                        }}
                        placeholder="https://s3.us-west-2.amazonaws.com"
                        className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-orange-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(249,115,22,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(249,115,22,0.25)]"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        留空使用 AWS 默认端点
                      </p>
                    </div>

                    <button
                      className="w-full px-5 py-3.5 rounded-xl border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all bg-orange-500 text-white shadow-[0_4px_14px_rgba(249,115,22,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-orange-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none"
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

export default S3Setting;
