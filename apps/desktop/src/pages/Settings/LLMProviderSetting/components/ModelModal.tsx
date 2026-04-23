import { useEffect, useState } from "react";
import classNames from "classnames";
import { ModelFormData, ModelItem } from "../types";
import {
  SettingInput,
  SettingButton,
  SettingModalShell,
} from "../../components";
import useThemeColors from "@/hooks/useThemeColors";

interface ModelModalProps {
  open: boolean;
  onFinish: (data: ModelFormData) => void;
  onCancel: () => void;
  initialData?: ModelItem;
  action?: "create" | "edit";
}

const featureOptions = [
  { label: "联网", value: "online" },
  { label: "思考", value: "thinking" },
  { label: "图片", value: "image" },
  { label: "视频", value: "video" },
  { label: "音频", value: "audio" },
  { label: "文件", value: "file" },
];

const ModelModal = ({
  open,
  onFinish,
  onCancel,
  initialData,
  action = "create",
}: ModelModalProps) => {
  const [modelName, setModelName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [messageFormat, setMessageFormat] = useState<"openai" | "claude">(
    "openai",
  );
  const themeColors = useThemeColors();

  useEffect(() => {
    if (initialData && open) {
      setModelName(initialData.name);
      setDescription(initialData.description);
      setMessageFormat(initialData.messageFormat ?? "openai");
      const normalizedFeatures = {
        online: initialData.features?.online ?? false,
        thinking: initialData.features?.thinking ?? false,
        image:
          initialData.features?.image ??
          initialData.features?.multimodal ??
          false,
        video: initialData.features?.video ?? false,
        audio: initialData.features?.audio ?? false,
        file: initialData.features?.file ?? false,
      };
      const initialFeatures = Object.entries(normalizedFeatures)
        .filter(([, value]) => value)
        .map(([key]) => key);
      setSelectedFeatures(initialFeatures);
    } else if (!open) {
      setSelectedFeatures([]);
      setMessageFormat("openai");
    }
  }, [initialData, open]);

  const handleFinish = () => {
    const features = {
      online: selectedFeatures.includes("online"),
      thinking: selectedFeatures.includes("thinking"),
      image: selectedFeatures.includes("image"),
      video: selectedFeatures.includes("video"),
      audio: selectedFeatures.includes("audio"),
      file: selectedFeatures.includes("file"),
    };
    onFinish({
      name: modelName,
      description,
      features,
      messageFormat,
    });
    setModelName("");
    setDescription("");
    setSelectedFeatures([]);
    setMessageFormat("openai");
  };

  const handleCancel = () => {
    onCancel();
    setModelName("");
    setDescription("");
    setSelectedFeatures([]);
    setMessageFormat("openai");
  };

  const toggleFeature = (value: string) => {
    setSelectedFeatures((prev) =>
      prev.includes(value) ? prev.filter((f) => f !== value) : [...prev, value],
    );
  };

  const isEdit = action === "edit";

  if (!open) return null;

  return (
    <SettingModalShell
      open={open}
      title={isEdit ? "编辑模型" : "添加模型"}
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
        label="模型名称"
        value={modelName}
        onChange={(e) => setModelName(e.target.value)}
        placeholder="请输入模型名称"
      />
      <SettingInput
        label="模型描述"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="请输入模型描述"
      />
      <div>
        <label
          className={classNames(
            "block text-sm font-medium mb-2",
            themeColors.textClass,
          )}
        >
          支持的特性
        </label>
        <div className="flex flex-wrap gap-2">
          {featureOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => toggleFeature(option.value)}
              className={classNames(
                "px-3 py-1.5 text-sm rounded-lg transition-colors",
                selectedFeatures.includes(option.value)
                  ? [themeColors.activeBgClass, themeColors.activeTextClass]
                  : [
                      themeColors.cardBgClass,
                      themeColors.textClass,
                      themeColors.hoverClass,
                    ],
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label
          className={classNames(
            "block text-sm font-medium mb-2",
            themeColors.textClass,
          )}
        >
          消息格式
        </label>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { label: "OpenAI", value: "openai" },
              { label: "Claude", value: "claude" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMessageFormat(option.value)}
              className={classNames(
                "px-3 py-1.5 text-sm rounded-lg transition-colors",
                messageFormat === option.value
                  ? [themeColors.activeBgClass, themeColors.activeTextClass]
                  : [
                      themeColors.cardBgClass,
                      themeColors.textClass,
                      themeColors.hoverClass,
                    ],
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </SettingModalShell>
  );
};

export default ModelModal;
