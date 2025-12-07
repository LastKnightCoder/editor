import { useState, useEffect, memo } from "react";
import classNames from "classnames";
import { MdClose } from "react-icons/md";
import { useMemoizedFn } from "ahooks";
import useTheme from "@/hooks/useTheme";
import useThemeColors from "@/hooks/useThemeColors";
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
    const themeColors = useThemeColors();

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

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleSubmit();
      }
    };

    return (
      <div className="flex flex-col">
        {/* 头部 */}
        <div
          className={classNames(
            "flex items-center justify-between pb-4 mb-6 border-b",
            themeColors.borderClass,
          )}
        >
          <h3
            className={classNames(
              "text-lg font-semibold",
              themeColors.activeTextClass,
            )}
          >
            {title}
          </h3>
          <button
            onClick={handleCancel}
            className={classNames("text-lg", themeColors.hoverTextClass)}
          >
            <MdClose />
          </button>
        </div>

        {/* 表单内容 */}
        <div className="space-y-6">
          {/* 名称输入 */}
          <div>
            <label
              className={classNames(
                "block text-sm font-medium mb-2",
                themeColors.textClass,
              )}
            >
              名称
            </label>
            <input
              type="text"
              placeholder="输入分组名称"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              maxLength={120}
              disabled={initialData?.isDefault}
              className={classNames(
                "w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all border",
                "bg-gray-50 dark:bg-slate-950 border-gray-200 dark:border-slate-700",
                "text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500",
                "focus:border-indigo-500 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.15)] dark:focus:shadow-[0_0_0_3px_rgba(99,102,241,0.25)]",
                "disabled:opacity-60 disabled:cursor-not-allowed",
              )}
            />
            <div
              className={classNames(
                "text-right text-xs mt-1",
                themeColors.secondaryTextClass,
              )}
            >
              {value.length}/120
            </div>
          </div>

          {/* 颜色选择 */}
          <div>
            <label
              className={classNames(
                "block text-sm font-medium mb-2",
                themeColors.textClass,
              )}
            >
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
        <div
          className={classNames(
            "flex justify-end space-x-3 mt-8 pt-6 border-t",
            themeColors.borderClass,
          )}
        >
          <button
            onClick={handleCancel}
            className={classNames(
              "px-4 py-2 text-sm font-medium border rounded-lg transition-colors",
              themeColors.textClass,
              themeColors.borderClass,
              themeColors.hoverClass,
            )}
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!value.trim() && !initialData?.isDefault}
            className={classNames(
              "px-6 py-2 text-sm font-medium rounded-lg transition-colors",
              value.trim() || initialData?.isDefault
                ? classNames(themeColors.buttonBg, themeColors.buttonTextClass)
                : classNames(themeColors.tagCountBg, "cursor-not-allowed"),
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
