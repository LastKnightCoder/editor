import { useState, useEffect, memo } from "react";
import { Input } from "antd";
import classNames from "classnames";
import { MdClose } from "react-icons/md";
import { useMemoizedFn } from "ahooks";
import useTheme from "@/hooks/useTheme";
import { type ProjectColorName } from "@/constants/project-colors";
import ColorPicker from "./ColorPicker";

interface ProjectFormProps {
  title: string;
  initialData?: {
    title: string;
    color?: ProjectColorName;
  };
  onCancel: () => void;
  onSubmit: (title: string, color: ProjectColorName) => void;
  submitText?: string;
  disableTitleEdit?: boolean;
}

const ProjectForm = memo(
  ({
    title,
    initialData,
    onCancel,
    onSubmit,
    submitText = "添加",
    disableTitleEdit = false,
  }: ProjectFormProps) => {
    const [value, setValue] = useState(initialData?.title || "");
    const [selectedColor, setSelectedColor] = useState<ProjectColorName>(
      initialData?.color || "charcoal"
    );
    const { theme } = useTheme();

    // 如果是编辑模式且传入了新的初始数据，更新状态
    useEffect(() => {
      if (initialData) {
        setValue(initialData.title || "");
        setSelectedColor(initialData.color || "charcoal");
      }
    }, [initialData?.title, initialData?.color]);

    const handleSubmit = useMemoizedFn(() => {
      if (value.trim()) {
        onSubmit(value.trim(), selectedColor);
      }
    });

    const handleCancel = useMemoizedFn(() => {
      onCancel();
    });

    return (
      <div className="flex flex-col">
        {/* 头部 */}
        <div className="mb-6 flex items-center justify-between border-b border-gray-200 pb-4 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{title}</h3>
          <button
            onClick={handleCancel}
            className="text-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <MdClose />
          </button>
        </div>

        {/* 表单内容 */}
        <div className="space-y-6">
          {/* 名称输入 */}
          {!disableTitleEdit && (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                名称
              </label>
              <Input
                placeholder="输入项目名称"
                value={value}
                onChange={e => setValue(e.target.value)}
                onPressEnter={handleSubmit}
                autoFocus
                className="h-10"
                maxLength={120}
              />
              <div className="mt-1 text-right text-xs text-gray-400">{value.length}/120</div>
            </div>
          )}

          {/* 颜色选择 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              颜色
            </label>
            <ColorPicker value={selectedColor} onChange={setSelectedColor} theme={theme} />
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="mt-8 flex justify-end space-x-3 border-t border-gray-200 pt-6 dark:border-gray-700">
          <button
            onClick={handleCancel}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-zinc-800 dark:text-gray-400 dark:hover:bg-zinc-700"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!disableTitleEdit && !value.trim()}
            className={classNames(
              "rounded-lg px-6 py-2 text-sm font-medium text-white transition-colors",
              disableTitleEdit || value.trim()
                ? "bg-[var(--th-btn-bg)] hover:bg-[var(--th-btn-hover)]"
                : "cursor-not-allowed bg-gray-300 dark:bg-gray-600"
            )}
          >
            {submitText}
          </button>
        </div>
      </div>
    );
  }
);

ProjectForm.displayName = "ProjectForm";

export default ProjectForm;
