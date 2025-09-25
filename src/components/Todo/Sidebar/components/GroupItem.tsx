import { useState, useRef, memo } from "react";
import { App, Dropdown } from "antd";
import { MdDragIndicator, MdMoreVert } from "react-icons/md";
import { useDrag, useDrop } from "react-dnd";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";
import useTheme from "@/hooks/useTheme";
import { useTodoStore } from "@/stores/todo";
import {
  type ProjectColorName,
  getProjectColorValue,
} from "@/constants/project-colors";
import EditProjectModal from "./EditProjectModal";

type DragGroup = { type: "TODO_GROUP"; id: number };

interface GroupItemProps {
  id: number;
  title: string;
  color?: ProjectColorName;
  active: boolean;
  onClick: () => void;
  onMove: (dragId: number, hoverId: number, place: "before" | "after") => void;
  stats?: {
    total: number;
    uncompleted: number;
    overdue: number;
  };
}

const GroupItem = memo(
  ({ id, title, color, active, onClick, onMove, stats }: GroupItemProps) => {
    const [hover, setHover] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const { renameGroup, archiveGroup, pinGroupToTop, loadGroupStats } =
      useTodoStore();
    const { modal, message } = App.useApp();
    const { theme } = useTheme();
    const ref = useRef<HTMLDivElement>(null);

    const [, drag] = useDrag(
      () => ({
        type: "TODO_GROUP",
        item: { id } as DragGroup,
        collect: () => ({}),
      }),
      [id],
    );

    const [, drop] = useDrop<DragGroup, void, unknown>({
      accept: "TODO_GROUP",
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

    const handleUpdateGroup = useMemoizedFn(
      async (
        groupId: number,
        newTitle: string,
        newColor?: ProjectColorName,
      ) => {
        try {
          await renameGroup({
            id: groupId,
            title: newTitle,
            color: newColor,
          });
          await loadGroupStats();
          message.success("已更新项目");
        } catch (error) {
          message.error("更新失败");
        }
      },
    );

    const menuItems = [
      {
        key: "edit",
        label: "编辑项目",
        onClick: () => {
          setEditModalOpen(true);
        },
      },
      {
        key: "pin",
        label: "置顶项目",
        onClick: async () => {
          await pinGroupToTop(id);
        },
      },
      {
        key: "archive",
        label: "归档项目",
        onClick: async () => {
          await archiveGroup(id, true);
          await loadGroupStats();
        },
      },
      {
        key: "delete",
        danger: true,
        label: "删除项目",
        onClick: async () => {
          modal.confirm({
            title: "删除项目",
            content: "确定删除该项目？建议优先使用归档以便恢复。",
            okButtonProps: {
              danger: true,
            },
            onOk: async () => {
              await archiveGroup(id, true);
              await loadGroupStats();
              message.success("已删除项目");
            },
          });
        },
      },
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
        </div>
        {!hover ? (
          <div className="flex items-center gap-1">
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-400">
              {stats?.uncompleted || 0}/{stats?.total || 0}
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

        <EditProjectModal
          key={`edit-project-${id}`}
          open={editModalOpen}
          initialData={{ id, title, color }}
          onCancel={() => setEditModalOpen(false)}
          onUpdate={handleUpdateGroup}
        />
      </div>
    );
  },
);

GroupItem.displayName = "GroupItem";

export default GroupItem;
