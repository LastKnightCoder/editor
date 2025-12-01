import { useState, useEffect } from "react";
import classNames from "classnames";
import { ConfigFormData, ConfigItem } from "../types";
import { SettingInput, SettingButton } from "../../components";
import useThemeColors from "@/hooks/useThemeColors";

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
  const themeColors = useThemeColors();

  useEffect(() => {
    if (initialData && action === "edit") {
      setEditName(initialData.name);
      setEditApiKey(initialData.apiKey);
      setEditBaseUrl(initialData.baseUrl);
    } else {
      setEditName("");
      setEditApiKey("");
      setEditBaseUrl("");
    }
  }, [initialData, action]);

  const handleFinish = () => {
    onFinish({
      name: editName,
      apiKey: editApiKey,
      baseUrl: editBaseUrl,
      id: initialData?.id,
    });
  };

  if (!action) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />

      <div
        className={classNames(
          "relative w-full max-w-md mx-4 rounded-2xl shadow-2xl",
          themeColors.glassPanelBg,
        )}
      >
        <div
          className={classNames(
            "flex items-center justify-between px-6 py-4 border-b",
            themeColors.borderClass,
          )}
        >
          <h3
            className={classNames(
              "text-lg font-semibold",
              themeColors.activeTextClass,
            )}
          >
            {action === "create" ? "添加配置" : "编辑配置"}
          </h3>
          <button
            onClick={onCancel}
            className={classNames(
              "p-2 rounded-lg transition-colors",
              themeColors.secondaryTextClass,
              themeColors.hoverTextClass,
              themeColors.hoverClass,
            )}
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
            placeholder="请输入配置名称"
          />
          <div>
            <label
              className={classNames(
                "block text-sm font-medium mb-2",
                themeColors.textClass,
              )}
            >
              API Key
            </label>
            <input
              type="password"
              value={editApiKey}
              onChange={(e) => setEditApiKey(e.target.value)}
              placeholder="请输入 API Key"
              className={classNames(
                "w-full px-3 py-2 text-sm border rounded-lg transition-colors focus:outline-none",
                themeColors.inputBgClass,
                themeColors.borderClass,
                themeColors.focusBorderClass,
                themeColors.focusRingClass,
                themeColors.textClass,
              )}
            />
          </div>
          <SettingInput
            label="Base URL"
            value={editBaseUrl}
            onChange={(e) => setEditBaseUrl(e.target.value)}
            placeholder="请输入 Base URL"
          />
        </div>

        <div
          className={classNames(
            "flex items-center justify-end gap-3 px-6 py-4 border-t",
            themeColors.borderClass,
          )}
        >
          <SettingButton variant="secondary" onClick={onCancel}>
            取消
          </SettingButton>
          <SettingButton variant="primary" onClick={handleFinish}>
            {action === "create" ? "添加" : "保存"}
          </SettingButton>
        </div>
      </div>
    </div>
  );
};

export default ConfigModal;
