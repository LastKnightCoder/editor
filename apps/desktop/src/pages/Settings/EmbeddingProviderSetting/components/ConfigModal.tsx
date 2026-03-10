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

  return (
    <SettingModalShell
      open
      title={isEdit ? "编辑配置" : "添加配置"}
      onCancel={handleCancel}
      footer={
        <>
          <SettingButton variant="secondary" onClick={handleCancel}>
            取消
          </SettingButton>
          <SettingButton variant="primary" onClick={handleFinish}>
            {isEdit ? "保存" : "添加"}
          </SettingButton>
        </>
      }
    >
      <SettingInput
        label="配置名称"
        value={editName}
        onChange={(e) => setEditName(e.target.value)}
        placeholder="例如：OpenAI / DeepSeek / SiliconFlow"
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
