import { useState } from "react";
import useCalendarStore from "@/stores/useCalendarStore";
import { MdClose } from "react-icons/md";
import {
  getProjectColorValue,
  PROJECT_COLORS,
  ProjectColorName,
} from "@/constants/project-colors";
import useSettingStore from "@/stores/useSettingStore";

interface CreateCalendarDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const CreateCalendarDialog = ({
  isOpen,
  onClose,
}: CreateCalendarDialogProps) => {
  const { createCalendar } = useCalendarStore();
  const { setting } = useSettingStore();
  const theme = setting.darkMode ? "dark" : "light";

  const [title, setTitle] = useState("");
  const [color, setColor] = useState<ProjectColorName>("blue");

  const handleSave = async () => {
    if (!title) return;

    await createCalendar({
      title,
      color,
      descriptionContentId: 0,
      archived: false,
      pinned: false,
      visible: true,
      orderIndex: 0,
    });

    setTitle("");
    setColor("blue");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        {/* 头部 */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">创建日历</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <MdClose className="h-5 w-5" />
          </button>
        </div>

        {/* 表单 */}
        <div className="space-y-4">
          {/* 标题 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              日历名称
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              placeholder="输入日历名称"
              autoFocus
            />
          </div>

          {/* 颜色选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              颜色
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {PROJECT_COLORS.slice(0, 12).map((c) => {
                const colorValue = getProjectColorValue(
                  c.name,
                  theme === "dark" ? "dark" : "light",
                );
                return (
                  <button
                    key={c.name}
                    onClick={() => setColor(c.name)}
                    className={`h-8 w-8 rounded-full ${color === c.name ? "ring-2 ring-blue-600 ring-offset-2" : ""}`}
                    style={{ backgroundColor: colorValue }}
                    title={c.label}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!title}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateCalendarDialog;
