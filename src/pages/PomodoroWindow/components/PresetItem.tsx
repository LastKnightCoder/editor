import React, { useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import { PomodoroPreset } from "@/types";
import { AiOutlinePlayCircle } from "react-icons/ai";

type DragPreset = { type: "POMODORO_PRESET"; id: number };

interface PresetItemProps {
  preset: PomodoroPreset;
  onStart: (p: PomodoroPreset) => void;
  onEdit: (p: PomodoroPreset) => void;
  onArchiveToggle: (p: PomodoroPreset, archived: boolean) => void;
  onDelete: (p: PomodoroPreset) => void;
  onReorder: (
    dragId: number,
    hoverId: number,
    place: "before" | "after",
  ) => void;
}

const PresetItem: React.FC<PresetItemProps> = ({
  preset,
  onStart,
  onEdit,
  onArchiveToggle,
  onDelete,
  onReorder,
}) => {
  const ref = useRef<HTMLLIElement>(null);
  const [, drag] = useDrag(
    () => ({ type: "POMODORO_PRESET", item: { id: preset.id } as DragPreset }),
    [preset.id],
  );
  const [, drop] = useDrop<DragPreset, void, unknown>({
    accept: "POMODORO_PRESET",
    hover: (item, monitor) => {
      if (item.id === preset.id || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const middleY = (rect.bottom - rect.top) / 2;
      const c = monitor.getClientOffset();
      if (!c) return;
      const place = c.y - rect.top < middleY ? "before" : "after";
      onReorder(item.id, preset.id, place);
    },
  });
  drag(drop(ref));

  return (
    <li
      ref={ref}
      className="flex items-center justify-between px-3 py-2 hover:bg-gray-50"
    >
      <div className="truncate">
        <div className="text-sm font-medium text-gray-900 truncate">
          {preset.name}
        </div>
        <div className="text-xs text-gray-500">
          {preset.mode === "countdown"
            ? `${preset.durationMin} 分钟倒计时`
            : "正计时"}
        </div>
      </div>
      <button
        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-500 text-sm"
        onClick={() => onStart(preset)}
      >
        <AiOutlinePlayCircle className="text-lg" /> 开始
      </button>
      <div className="flex items-center gap-2 ml-3">
        <button
          className="text-xs text-gray-500 hover:text-gray-700"
          onClick={() => onEdit(preset)}
        >
          编辑
        </button>
        <button
          className="text-xs text-rose-600 hover:text-rose-700"
          onClick={() => onDelete(preset)}
        >
          删除
        </button>
        {preset.archived ? (
          <button
            className="text-xs text-gray-500 hover:text-gray-700"
            onClick={() => onArchiveToggle(preset, false)}
          >
            取消归档
          </button>
        ) : (
          <button
            className="text-xs text-gray-500 hover:text-gray-700"
            onClick={() => onArchiveToggle(preset, true)}
          >
            归档
          </button>
        )}
      </div>
    </li>
  );
};

export default PresetItem;
