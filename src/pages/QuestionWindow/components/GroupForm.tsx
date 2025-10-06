import { useState, useEffect, memo } from "react";
import { Input } from "antd";
import classNames from "classnames";
import { MdClose } from "react-icons/md";
import { useMemoizedFn } from "ahooks";
import useTheme from "@/hooks/useTheme";
import { type ProjectColorName } from "@/constants/project-colors";
import ColorPicker from "@/components/Todo/Sidebar/components/ColorPicker";

interface GroupFormProps {
  title: string;
  initialData?: {
    title: string;
    color?: ProjectColorName;
    isDefault?: boolean;
  };
  onCancel: () => void;
  onSubmit: (title: string, color: ProjectColorName) => void;
  submitText?: string;
}

const GroupForm = memo(
  ({
    title,
    initialData,
    onCancel,
    onSubmit,
    submitText = "添加",
  }: GroupFormProps) => {
    const [value, setValue] = useState(initialData?.title || "");
    const [selectedColor, setSelectedColor] = useState<ProjectColorName>(
      initialData?.color || "charcoal",
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
      if (value.trim() || initialData?.isDefault) {
        onSubmit(value.trim(), selectedColor);
      }
    });

    const handleCancel = useMemoizedFn(() => {
      onCancel();
    });

    return (
      <div className="flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            {title}
          </h3>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg"
          >
            <MdClose />
          </button>
        </div>

        {/* 表单内容 */}
        <div className="space-y-6">
          {/* 名称输入 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              名称
            </label>
            <Input
              placeholder="输入分组名称"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onPressEnter={handleSubmit}
              autoFocus
              className="h-10"
              maxLength={120}
              disabled={initialData?.isDefault}
            />
            <div className="text-right text-xs text-gray-400 mt-1">
              {value.length}/120
            </div>
          </div>

          {/* 颜色选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              颜色
            </label>
            <ColorPicker
              value={selectedColor}
              onChange={setSelectedColor}
              theme={theme}
            />
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end space-x-3 mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!value.trim() && !initialData?.isDefault}
            className={classNames(
              "px-6 py-2 text-sm font-medium text-white rounded-lg transition-colors",
              value.trim() || initialData?.isDefault
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-gray-300 dark:bg-gray-600 cursor-not-allowed",
            )}
          >
            {submitText}
          </button>
        </div>
      </div>
    );
  },
);

GroupForm.displayName = "GroupForm";

export default GroupForm;
