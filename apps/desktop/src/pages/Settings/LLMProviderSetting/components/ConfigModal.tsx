import { useState, useEffect } from "react";
import classNames from "classnames";
import { ConfigFormData, ConfigItem } from "../types";
import {
  SettingInput,
  SettingButton,
  SettingModalShell,
} from "../../components";
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
    <SettingModalShell
      open
      title={action === "create" ? "添加配置" : "编辑配置"}
      onCancel={onCancel}
      footer={
        <>
          <SettingButton variant="secondary" onClick={onCancel}>
            取消
          </SettingButton>
          <SettingButton variant="primary" onClick={handleFinish}>
            {action === "create" ? "添加" : "保存"}
          </SettingButton>
        </>
      }
    >
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
    </SettingModalShell>
  );
};

export default ConfigModal;
