import { useState, useEffect } from "react";
import { AutoComplete } from "antd";
import { MdClose } from "react-icons/md";
import useCalendarStore from "@/stores/useCalendarStore";
import { Calendar } from "@/types";
import {
  PROJECT_COLORS,
  getProjectColorValue,
  ProjectColorName,
} from "@/constants/project-colors";
import useSettingStore from "@/stores/useSettingStore";

interface EditCalendarDialogProps {
  calendar: Calendar | null;
  onClose: () => void;
}

const EditCalendarDialog = ({ calendar, onClose }: EditCalendarDialogProps) => {
  const { updateCalendar, createCalendarGroup, calendarGroups } =
    useCalendarStore();
  const { setting } = useSettingStore();
  const theme = setting.darkMode ? "dark" : "light";

  const [title, setTitle] = useState("");
  const [color, setColor] = useState<ProjectColorName>("blue");
  const [groupInput, setGroupInput] = useState("");

  // 获取用户分组（非系统分组）
  const userGroups = calendarGroups.filter((g) => !g.isSystem);

  useEffect(() => {
    if (calendar) {
      setTitle(calendar.title);
      setColor(calendar.color);
      // 设置分组输入框的初始值
      if (calendar.groupId) {
        const group = calendarGroups.find((g) => g.id === calendar.groupId);
        if (group) {
          setGroupInput(group.name);
        }
      } else {
        setGroupInput("");
      }
    }
  }, [calendar, calendarGroups]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      alert("请输入日历名称");
      return;
    }

    if (!calendar) return;

    let groupId: number | undefined;

    // 如果输入了分组名称
    if (groupInput.trim()) {
      // 检查分组是否已存在
      const existingGroup = userGroups.find(
        (g) => g.name === groupInput.trim(),
      );
      if (existingGroup) {
        groupId = existingGroup.id;
      } else {
        // 创建新分组
        const newGroup = await createCalendarGroup({
          name: groupInput.trim(),
          isSystem: false,
          orderIndex: userGroups.length,
        });
        groupId = newGroup.id;
      }
    }

    await updateCalendar({
      ...calendar,
      title: title.trim(),
      color,
      groupId,
    });

    onClose();
  };

  if (!calendar) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        {/* 头部 */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            编辑日历
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <MdClose className="h-5 w-5" />
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 日历名称 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              日历名称
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入日历名称"
              disabled={calendar?.isInSystemGroup}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:focus:border-blue-400"
              autoFocus={!calendar?.isInSystemGroup}
            />
            {calendar?.isInSystemGroup && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                系统日历名称不可修改
              </p>
            )}
          </div>

          {/* 分组选择 - 仅非系统日历显示 */}
          {!calendar?.isInSystemGroup && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                分组（可选）
              </label>
              <AutoComplete
                value={groupInput}
                onChange={setGroupInput}
                options={userGroups.map((group) => ({
                  value: group.name,
                  label: group.name,
                }))}
                placeholder="选择或输入新分组名称"
                size="large"
                className="w-full"
                filterOption={(inputValue, option) =>
                  option!.value
                    .toUpperCase()
                    .indexOf(inputValue.toUpperCase()) !== -1
                }
              />
            </div>
          )}

          {/* 颜色选择 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              颜色
            </label>
            <div className="grid grid-cols-5 gap-2">
              {PROJECT_COLORS.map((colorItem) => {
                const colorValue = getProjectColorValue(
                  colorItem.name as ProjectColorName,
                  theme === "dark" ? "dark" : "light",
                );
                const isSelected = color === colorItem.name;

                return (
                  <button
                    key={colorItem.name}
                    type="button"
                    onClick={() => setColor(colorItem.name as ProjectColorName)}
                    className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 transition-all ${
                      isSelected
                        ? "border-gray-900 dark:border-gray-100 scale-110"
                        : "border-transparent hover:scale-105"
                    }`}
                    title={colorItem.label}
                  >
                    <div
                      className="h-6 w-6 rounded-full"
                      style={{ backgroundColor: colorValue }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* 按钮 */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              取消
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditCalendarDialog;
