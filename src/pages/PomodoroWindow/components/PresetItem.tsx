import React, { useMemo, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import { PomodoroPreset, PomodoroStatus } from "@/types";
import { AiOutlinePauseCircle, AiOutlinePlayCircle } from "react-icons/ai";
import { Dropdown } from "antd";
import classNames from "classnames";

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
  }, [preset]);

  return (
    <Dropdown trigger={["contextMenu"]} menu={{ items: menuItems }}>
      <li
        ref={ref}
        className={classNames(
          "flex rounded-lg items-center justify-between px-3 py-2",
          {
            "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-200":
              selected,
            "hover:bg-green-50 dark:hover:bg-green-900/20": !selected,
          },
        )}
        onClick={onClick}
      >
        <div className="truncate">
          <div
            className={classNames("text-sm font-medium truncate", {
              "text-gray-900 dark:text-white": selected,
              "text-gray-500 dark:text-gray-400": !selected,
            })}
          >
            {preset.name}
          </div>
          <div
            className={classNames("text-xs", {
              "text-gray-500 dark:text-gray-400": selected,
              "text-gray-400 dark:text-gray-500": !selected,
            })}
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
                "inline-flex items-center gap-1 text-sm cursor-pointer",
                {
                  "text-green-600 hover:text-green-500 dark:text-green-400 dark:hover:text-green-300":
                    selected,
                  "text-gray-600 hover:text-gray-500 dark:text-gray-400 dark:hover:text-gray-300":
                    !selected,
                },
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
                "inline-flex items-center gap-1 text-sm cursor-pointer",
                {
                  "text-green-600 hover:text-green-500 dark:text-green-400 dark:hover:text-green-300":
                    selected,
                  "text-gray-600 hover:text-gray-500 dark:text-gray-400 dark:hover:text-gray-300":
                    !selected,
                },
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
