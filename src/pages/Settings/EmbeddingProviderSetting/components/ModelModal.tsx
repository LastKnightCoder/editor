import { useEffect, useState } from "react";
import { App } from "antd";
import { ModelFormData, ModelItem } from "../types";
import { SettingInput, SettingButton } from "../../components";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleCancel}
      />

      <div className="relative w-full max-w-md mx-4 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            {isEdit ? "编辑模型" : "添加模型"}
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              向量长度
            </label>
            <input
              type="number"
              min={1}
              value={contextLength}
              onChange={(e) => setContextLength(Number(e.target.value) || 0)}
              placeholder="请输入向量长度"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              距离阈值
            </label>
            <input
              type="number"
              min={0}
              step={0.1}
              value={distance}
              onChange={(e) => setDistance(Number(e.target.value) || 0)}
              placeholder="请输入距离阈值"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              支持的特性
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => toggleFeature("multimodal")}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  selectedFeatures.includes("multimodal")
                    ? "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-500/20 dark:border-blue-500/50 dark:text-blue-400"
                    : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-600"
                }`}
              >
                多模态
              </button>
            </div>
          </div>
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
    </div>
  );
};

export default ModelModal;
