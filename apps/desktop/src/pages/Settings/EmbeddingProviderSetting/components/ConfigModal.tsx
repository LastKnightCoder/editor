import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ConfigFormData, ConfigItem } from "../types";
import { SettingInput, SettingButton } from "../../components";

interface ConfigModalProps {
  action?: "create" | "edit";
  onFinish: (data: ConfigFormData) => void;
  onCancel: () => void;
  initialData?: ConfigItem;
}

const ConfigModal = ({
  action,
  onFinish,
  onCancel,
  initialData,
}: ConfigModalProps) => {
  const [editName, setEditName] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [editBaseUrl, setEditBaseUrl] = useState("");

  useEffect(() => {
    if (initialData && action) {
      setEditName(initialData.name || "");
      setEditApiKey(initialData.apiKey);
      setEditBaseUrl(initialData.baseUrl);
    } else if (!initialData && action) {
      setEditName("");
      setEditApiKey("");
      setEditBaseUrl("");
    }
  }, [initialData, action]);

  const handleFinish = () => {
    onFinish({
      name: editName || initialData?.name || "新 Provider",
      providerType: "remote_openai",
      source: "modelscope",
      apiKey: editApiKey,
      baseUrl: editBaseUrl,
      localModelDir: "",
      batchSize: 8,
      devicePolicy: "auto",
      id: initialData?.id,
    });
    setEditName("");
    setEditApiKey("");
    setEditBaseUrl("");
  };

  const handleCancel = () => {
    onCancel();
    setEditName("");
    setEditApiKey("");
    setEditBaseUrl("");
  };

  const isEdit = action === "edit";

  if (!action) return null;

  return createPortal(
    <div className="fixed inset-0 z-9999 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleCancel}
      />

      <div className="relative w-full max-w-md mx-4 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            {isEdit ? "编辑配置" : "添加配置"}
          </h3>
          <button
            onClick={handleCancel}
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <SettingInput
            label="配置名称"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="例如：OpenAI / DeepSeek / SiliconFlow"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              API Key
            </label>
            <input
              type="password"
              value={editApiKey}
              onChange={(e) => setEditApiKey(e.target.value)}
              placeholder="请输入 API Key"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
            />
          </div>
          <SettingInput
            label="Base URL"
            value={editBaseUrl}
            onChange={(e) => setEditBaseUrl(e.target.value)}
            placeholder="请输入 Base URL"
          />
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <SettingButton variant="secondary" onClick={handleCancel}>
            取消
          </SettingButton>
          <SettingButton variant="primary" onClick={handleFinish}>
            {isEdit ? "保存" : "添加"}
          </SettingButton>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ConfigModal;
