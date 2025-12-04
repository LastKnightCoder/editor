import React, { useMemo, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import { PomodoroPreset, PomodoroStatus } from "@/types";
import { AiOutlinePauseCircle, AiOutlinePlayCircle } from "react-icons/ai";
import { Dropdown } from "antd";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";

type DragPreset = { type: "POMODORO_PRESET"; id: number };

interface PresetItemProps {
  active: boolean;
  selected: boolean;
  status?: PomodoroStatus;
  preset: PomodoroPreset;
  onStart: (p: PomodoroPreset) => void;
  onPause: () => void;
  onResume: () => void;
  onEdit: (p: PomodoroPreset) => void;
  onArchiveToggle: (p: PomodoroPreset, archived: boolean) => void;
  onDelete: (p: PomodoroPreset) => void;
  onReorder: (
    dragId: number,
    hoverId: number,
    place: "before" | "after",
  ) => void;
  onClick: () => void;
}

const PresetItem: React.FC<PresetItemProps> = ({
  active,
  selected,
  status,
  preset,
  onStart,
  onPause,
  onResume,
  onEdit,
  onArchiveToggle,
  onDelete,
  onReorder,
  onClick,
}) => {
  const themeColors = useThemeColors();
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

  const menuItems = useMemo(() => {
    const menuItems = [
      {
        key: "edit",
        label: "编辑",
        onClick: () => onEdit(preset),
      },
    ];
    if (preset.archived) {
      menuItems.push({
        key: "unarchive",
        label: "取消归档",
        onClick: () => onArchiveToggle(preset, false),
      });
    }
    menuItems.push({
      key: "delete",
      label: "删除",
      onClick: () => onDelete(preset),
    });
    menuItems.push({
      key: "archive",
      label: "归档",
      onClick: () => onArchiveToggle(preset, true),
    });

    return menuItems;
  }, [preset, onEdit, onArchiveToggle, onDelete]);

  return (
    <Dropdown trigger={["contextMenu"]} menu={{ items: menuItems }}>
      <li
        ref={ref}
        className={classNames(
          "flex rounded-lg items-center justify-between px-3 py-2 transition-colors",
          selected ? themeColors.activeClass : themeColors.hoverClass,
        )}
        onClick={onClick}
      >
        <div className="truncate">
          <div
            className={classNames(
              "text-sm font-medium truncate transition-colors",
              selected ? themeColors.activeTextClass : themeColors.textClass,
            )}
          >
            {preset.name}
          </div>
          <div
            className={classNames(
              "text-xs transition-colors",
              themeColors.textClass,
              "opacity-80",
            )}
          >
            {preset.mode === "countdown"
              ? `${preset.durationMin} 分钟倒计时`
              : "正计时"}
          </div>
        </div>
        <div>
          {active && status === "running" ? (
            <button
              className={classNames(
                "inline-flex items-center gap-1 text-sm cursor-pointer transition-colors",
                selected
                  ? themeColors.activeTextClass
                  : [themeColors.textClass, themeColors.hoverTextClass],
              )}
              onClick={() => {
                if (active && status === "running") {
                  onPause();
                }
              }}
            >
              <AiOutlinePauseCircle className="text-lg" />
            </button>
          ) : (
            <button
              className={classNames(
                "inline-flex items-center gap-1 text-sm cursor-pointer transition-colors",
                selected
                  ? themeColors.activeTextClass
                  : [themeColors.textClass, themeColors.hoverTextClass],
              )}
              onClick={() => {
                if (active && status === "paused") {
                  onResume();
                } else {
                  onStart(preset);
                }
              }}
            >
              <AiOutlinePlayCircle className="text-lg" />
            </button>
          )}
        </div>
      </li>
    </Dropdown>
  );
};

export default PresetItem;
