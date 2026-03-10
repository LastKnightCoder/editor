import { useEffect, useState } from "react";
import classNames from "classnames";
import { App } from "antd";
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

const ModelModal = ({
  open,
  onFinish,
  onCancel,
  initialData,
  action = "create",
}: ModelModalProps) => {
  const { message } = App.useApp();
  const [modelName, setModelName] = useState("");
  const [description, setDescription] = useState("");
  const [contextLength, setContextLength] = useState<number>(0);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [distance, setDistance] = useState<number>(0.6);
  const themeColors = useThemeColors();

  useEffect(() => {
    if (initialData && open) {
      setModelName(initialData.name);
      setDescription(initialData.description);
      setContextLength(initialData.contextLength || 0);
      setDistance(initialData.distance || 0.6);
      const initialFeatures = Object.entries(
        initialData.features || {
          multimodal: false,
        },
      )
        .filter(([, value]) => value)
        .map(([key]) => key);
      setSelectedFeatures(initialFeatures);
    }
  }, [initialData, open]);

  const handleFinish = () => {
    const features = {
      multimodal: selectedFeatures.includes("multimodal"),
    };
    if (contextLength === 0) {
      message.error("上下文长度不能为0");
      return;
    }
    if (distance === 0) {
      message.error("距离阈值不能为0");
      return;
    }
    onFinish({
      name: modelName,
      description,
      contextLength,
      features,
      distance,
    });
    resetForm();
  };

  const handleCancel = () => {
    onCancel();
    resetForm();
  };

  const resetForm = () => {
    setModelName("");
    setDescription("");
    setContextLength(0);
    setDistance(0.6);
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
          向量长度
        </label>
        <input
          type="number"
          min={1}
          value={contextLength}
          onChange={(e) => setContextLength(Number(e.target.value) || 0)}
          placeholder="请输入向量长度"
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
      <div>
        <label
          className={classNames(
            "block text-sm font-medium mb-2",
            themeColors.textClass,
          )}
        >
          距离阈值
        </label>
        <input
          type="number"
          min={0}
          step={0.1}
          value={distance}
          onChange={(e) => setDistance(Number(e.target.value) || 0)}
          placeholder="请输入距离阈值"
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
          <button
            type="button"
            onClick={() => toggleFeature("multimodal")}
            className={classNames(
              "px-3 py-1.5 text-sm rounded-lg border transition-colors",
              selectedFeatures.includes("multimodal")
                ? [
                    themeColors.activeBgClass,
                    themeColors.activeTextClass,
                    themeColors.focusBorderClass,
                  ]
                : [
                    themeColors.cardBgClass,
                    themeColors.borderClass,
                    themeColors.textClass,
                    themeColors.hoverClass,
                  ],
            )}
          >
            多模态
          </button>
        </div>
      </div>
    </SettingModalShell>
  );
};

export default ModelModal;
