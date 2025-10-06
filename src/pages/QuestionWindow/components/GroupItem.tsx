import { useState, useRef, memo } from "react";
import { Dropdown, type MenuProps } from "antd";
import { MdDragIndicator, MdMoreVert } from "react-icons/md";
import { useDrag, useDrop } from "react-dnd";
import classNames from "classnames";
import useTheme from "@/hooks/useTheme";
import {
  type ProjectColorName,
  getProjectColorValue,
} from "@/constants/project-colors";

export interface QuestionGroup {
  id: number;
  title: string;
  color?: string;
  isDefault: boolean;
}

export interface GroupStats {
  total: number;
  answered: number;
  unanswered: number;
}

type DragGroup = { type: "QUESTION_GROUP"; id: number };

interface GroupItemProps {
  id: number;
  title: string;
  color?: ProjectColorName;
  isDefault: boolean;
  active: boolean;
  onClick: () => void;
  onMove: (dragId: number, hoverId: number, place: "before" | "after") => void;
  onEditClick: () => void;
  onDeleteClick: () => void;
  stats?: GroupStats;
}

const GroupItem = memo(
  ({
    id,
    title,
    color,
    isDefault,
    active,
    onClick,
    onMove,
    onEditClick,
    onDeleteClick,
    stats,
  }: GroupItemProps) => {
    const [hover, setHover] = useState(false);
    const { theme } = useTheme();
    const ref = useRef<HTMLDivElement>(null);

    const [, drag] = useDrag(
      () => ({
        type: "QUESTION_GROUP",
        item: { id } as DragGroup,
        collect: () => ({}),
      }),
      [id],
    );

    const [, drop] = useDrop<DragGroup, void, unknown>({
      accept: "QUESTION_GROUP",
      hover: (item, monitor) => {
        if (item.id === id || !ref.current) return;
        const hoverBoundingRect = ref.current.getBoundingClientRect();
        if (!hoverBoundingRect) return;
        const hoverMiddleY =
          (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
        const clientOffset = monitor.getClientOffset();
        if (!clientOffset) return;
        const hoverClientY = clientOffset.y - hoverBoundingRect.top;
        const place = hoverClientY < hoverMiddleY ? "before" : "after";
        onMove(item.id, id, place);
      },
    });

    const menuItems: MenuProps["items"] = [
      {
        key: "edit",
        label: "编辑分组",
        onClick: () => {
          onEditClick();
        },
      },
      ...(!isDefault
        ? [
            {
              type: "divider" as const,
            },
            {
              key: "delete",
              label: "删除分组",
              danger: true,
              onClick: () => {
                onDeleteClick();
              },
            },
          ]
        : []),
    ];

    drag(drop(ref));

    return (
      <div
        className={classNames(
          "px-3 h-8 flex items-center justify-between cursor-pointer rounded-md mx-2 my-1",
          active
            ? "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-200"
            : "hover:bg-green-50 dark:hover:bg-green-900/20",
        )}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={onClick}
        ref={ref}
      >
        <div className="flex items-center gap-2">
          <span className="w-3 opacity-60">
            <MdDragIndicator size={12} />
          </span>
          {color && (
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: getProjectColorValue(color, theme) }}
            />
          )}
          <span className="truncate text-[14px]" title={title}>
            {title}
          </span>
          {isDefault && (
            <span className="text-[10px] px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-700">
              默认
            </span>
          )}
        </div>
        {!hover ? (
          <div className="flex items-center gap-1">
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-400">
              {stats?.answered || 0}/{stats?.total || 0}
            </span>
          </div>
        ) : (
          <Dropdown menu={{ items: menuItems }} trigger={["click"]}>
            <button
              className="text-sm cursor-pointer dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full p-1"
              onClick={(e) => e.stopPropagation()}
            >
              <MdMoreVert />
            </button>
          </Dropdown>
        )}
      </div>
    );
  },
);

GroupItem.displayName = "GroupItem";

export default GroupItem;
