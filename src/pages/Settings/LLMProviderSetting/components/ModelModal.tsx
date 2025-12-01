import { useEffect, useState } from "react";
import classNames from "classnames";
import { ModelFormData, ModelItem } from "../types";
import { SettingInput, SettingButton } from "../../components";
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
  const themeColors = useThemeColors();

  useEffect(() => {
    if (initialData && open) {
      setModelName(initialData.name);
      setDescription(initialData.description);
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
    });
    setModelName("");
    setDescription("");
    setSelectedFeatures([]);
  };

  const handleCancel = () => {
    onCancel();
    setModelName("");
    setDescription("");
    setSelectedFeatures([]);
  };

  const toggleFeature = (value: string) => {
    setSelectedFeatures((prev) =>
      prev.includes(value) ? prev.filter((f) => f !== value) : [...prev, value],
    );
  };

  const isEdit = action === "edit";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleCancel}
      />

      {/* Modal */}
      <div
        className={classNames(
          "relative w-full max-w-md mx-4 rounded-2xl shadow-2xl",
          themeColors.glassPanelBg,
        )}
      >
        {/* Header */}
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
            {isEdit ? "编辑模型" : "添加模型"}
          </h3>
          <button
            onClick={handleCancel}
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

        {/* Content */}
        <div className="p-6 space-y-4">
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
        </div>

        {/* Footer */}
        <div
          className={classNames(
            "flex items-center justify-end gap-3 px-6 py-4 border-t",
            themeColors.borderClass,
          )}
        >
          <SettingButton variant="secondary" onClick={handleCancel}>
            取消
          </SettingButton>
          <SettingButton variant="primary" onClick={handleFinish}>
            {isEdit ? "保存" : "添加"}
          </SettingButton>
        </div>
      </div>
    </div>
  );
};

export default ModelModal;
