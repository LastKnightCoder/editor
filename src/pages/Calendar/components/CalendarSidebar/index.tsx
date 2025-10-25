import { useState, memo, useEffect } from "react";
import { App, Dropdown } from "antd";
import type { MenuProps } from "antd";
import useCalendarStore from "@/stores/useCalendarStore";
import {
  MdAdd,
  MdMoreVert,
  MdVisibility,
  MdVisibilityOff,
  MdEdit,
  MdArchive,
  MdDelete,
  MdUnarchive,
  MdKeyboardArrowDown,
  MdKeyboardArrowRight,
} from "react-icons/md";
import { getProjectColorValue } from "@/constants/project-colors";
import useSettingStore from "@/stores/useSettingStore";
import CreateCalendarDialog from "../CreateCalendarDialog";
import EditCalendarDialog from "../EditCalendarDialog";
import CreateGroupDialog from "../CreateGroupDialog";
import { Calendar, CalendarGroup } from "@/types";

const CalendarSidebar = memo(() => {
  const {
    calendars,
    calendarGroups,
    selectedCalendarIds,
    toggleCalendarVisibility,
    deleteCalendar,
    archiveCalendar,
    unarchiveCalendar,
    deleteCalendarGroup,
    showSystemSection,
    showMyCalendarSection,
    showArchivedSection,
    setShowSystemSection,
    setShowMyCalendarSection,
    setShowArchivedSection,
  } = useCalendarStore();
  const { setting } = useSettingStore();
  const { modal } = App.useApp();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<Calendar | null>(null);
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);
  const [selectedGroupForCreate, setSelectedGroupForCreate] = useState<
    number | null
  >(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(() => {
    return new Set(calendarGroups.map((g) => g.id));
  });
  const theme = setting.darkMode ? "dark" : "light";

  // 当分组列表变化时，确保新分组也被展开
  useEffect(() => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      calendarGroups.forEach((g) => newSet.add(g.id));
      return newSet;
    });
  }, [calendarGroups]);

  // 系统分组
  const systemGroup = calendarGroups.find((g) => g.isSystem);

  // 用户分组
  const userGroups = calendarGroups.filter((g) => !g.isSystem);

  // 获取分组下的日历
  const getCalendarsInGroup = (groupId: number, archived: boolean) =>
    calendars.filter(
      (cal) => cal.groupId === groupId && cal.archived === archived,
    );

  // 获取没有分组的用户日历（排除系统日历）
  const getCalendarsWithoutGroup = (archived: boolean) =>
    calendars.filter(
      (cal) =>
        !cal.groupId && !cal.isInSystemGroup && cal.archived === archived,
    );

  // 切换分组展开状态
  const toggleGroup = (groupId: number) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  // 创建日历菜单项
  const getCalendarMenuItems = (calendar: Calendar): MenuProps["items"] => {
    const items: MenuProps["items"] = [];

    if (calendar.isInSystemGroup) {
      // 系统日历只能编辑颜色
      items.push({
        key: "edit",
        label: "编辑颜色",
        icon: <MdEdit className="h-4 w-4" />,
        onClick: () => setEditingCalendar(calendar),
      });
    } else {
      // 普通日历可以编辑、归档、删除
      items.push({
        key: "edit",
        label: "编辑",
        icon: <MdEdit className="h-4 w-4" />,
        onClick: () => setEditingCalendar(calendar),
      });

      if (calendar.archived) {
        items.push({
          key: "unarchive",
          label: "取消归档",
          icon: <MdUnarchive className="h-4 w-4" />,
          onClick: async () => {
            await unarchiveCalendar(calendar.id);
          },
        });
      } else {
        items.push({
          key: "archive",
          label: "归档",
          icon: <MdArchive className="h-4 w-4" />,
          onClick: async () => {
            await archiveCalendar(calendar.id);
          },
        });
      }

      items.push({
        key: "delete",
        label: "删除",
        icon: <MdDelete className="h-4 w-4" />,
        danger: true,
        onClick: () => {
          modal.confirm({
            title: "删除日历",
            content: `确定要删除日历 "${calendar.title}" 吗？这将同时删除所有相关事件。`,
            okText: "删除",
            okType: "danger",
            cancelText: "取消",
            onOk: async () => {
              await deleteCalendar(calendar.id);
            },
          });
        },
      });
    }

    return items;
  };

  // 创建分组菜单项
  const getGroupMenuItems = (group: CalendarGroup): MenuProps["items"] => {
    return [
      {
        key: "add-calendar",
        label: "添加日历",
        icon: <MdAdd className="h-4 w-4" />,
        onClick: () => {
          setSelectedGroupForCreate(group.id);
          setShowCreateDialog(true);
        },
      },
      {
        key: "delete",
        label: "删除分组",
        icon: <MdDelete className="h-4 w-4" />,
        danger: true,
        onClick: () => {
          const groupCalendars = getCalendarsInGroup(group.id, false);
          const message =
            groupCalendars.length > 0
              ? `删除分组 "${group.name}" 将会解除其中 ${groupCalendars.length} 个日历的分组关系，日历不会被删除。确定要继续吗？`
              : `确定要删除分组 "${group.name}" 吗？`;

          modal.confirm({
            title: "删除分组",
            content: message,
            okText: "删除",
            okType: "danger",
            cancelText: "取消",
            onOk: async () => {
              await deleteCalendarGroup(group.id);
            },
          });
        },
      },
    ];
  };

  // "我的日历"标题右侧的 + 号 Dropdown 菜单
  const myCalendarAddMenuItems: MenuProps["items"] = [
    {
      key: "add-calendar",
      label: "添加日历",
      icon: <MdAdd className="h-4 w-4" />,
      onClick: () => setShowCreateDialog(true),
    },
    {
      key: "add-group",
      label: "添加分组",
      icon: <MdAdd className="h-4 w-4" />,
      onClick: () => setShowCreateGroupDialog(true),
    },
  ];

  // 渲染日历项
  const renderCalendarItem = (calendar: Calendar, indent = false) => {
    const isSelected = selectedCalendarIds.includes(calendar.id);
    const color = getProjectColorValue(
      calendar.color,
      theme === "dark" ? "dark" : "light",
    );

    return (
      <div
        key={calendar.id}
        className={`group relative flex items-center justify-between rounded-lg py-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${indent ? "pl-4 pr-3" : "px-3"}`}
      >
        <div className="flex flex-1 items-center gap-2 overflow-hidden">
          <button
            onClick={() => toggleCalendarVisibility(calendar.id)}
            className="flex-shrink-0"
          >
            {isSelected ? (
              <MdVisibility className="h-4 w-4" style={{ color }} />
            ) : (
              <MdVisibilityOff className="h-4 w-4 text-gray-400" />
            )}
          </button>
          <span
            className="truncate text-sm"
            style={{
              color: isSelected ? "inherit" : "rgb(156, 163, 175)",
            }}
          >
            {calendar.title}
          </span>
        </div>
        <Dropdown
          menu={{ items: getCalendarMenuItems(calendar) }}
          trigger={["click"]}
          placement="bottomRight"
        >
          <button
            className="flex-shrink-0 opacity-0 group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <MdMoreVert className="h-5 w-5 text-gray-400" />
          </button>
        </Dropdown>
      </div>
    );
  };

  // 渲染分组
  const renderGroup = (group: CalendarGroup, archived: boolean) => {
    const groupCalendars = getCalendarsInGroup(group.id, archived);
    // 归档日历：如果没有日历则不显示分组
    // 非归档日历：始终显示分组，即使为空
    if (groupCalendars.length === 0 && archived) {
      return null; // 归档分组为空时不显示
    }

    const isExpanded = expandedGroups.has(group.id);

    return (
      <div key={group.id} className="mb-2">
        <div className="flex items-center justify-between px-1 py-1">
          <button
            onClick={() => toggleGroup(group.id)}
            className="flex items-center gap-1 text-sm font-semibold text-gray-600 dark:text-gray-400"
          >
            {isExpanded ? (
              <MdKeyboardArrowDown className="h-4 w-4" />
            ) : (
              <MdKeyboardArrowRight className="h-4 w-4" />
            )}
            {group.name}
          </button>
          {!group.isSystem && !archived && (
            <Dropdown
              menu={{ items: getGroupMenuItems(group) }}
              trigger={["click"]}
              placement="bottomRight"
            >
              <button onClick={(e) => e.stopPropagation()}>
                <MdMoreVert className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
              </button>
            </Dropdown>
          )}
        </div>
        {isExpanded && (
          <div className="space-y-1 mt-2 ml-2">
            {groupCalendars.length > 0 ? (
              groupCalendars.map((cal) => renderCalendarItem(cal, true))
            ) : (
              <div className="pl-6 py-2 text-xs text-gray-400 dark:text-gray-500">
                暂无日历
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="hidden w-64 border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-[var(--main-bg-color)] lg:block">
      <div className="flex h-full flex-col">
        {/* 日历列表 */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* 系统日历 */}
          {systemGroup && (
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between py-1">
                <button
                  onClick={() => setShowSystemSection(!showSystemSection)}
                  className="flex items-center gap-1 text-base font-semibold text-gray-700 dark:text-gray-300"
                >
                  {showSystemSection ? (
                    <MdKeyboardArrowDown className="h-5 w-5" />
                  ) : (
                    <MdKeyboardArrowRight className="h-5 w-5" />
                  )}
                  <span>系统日历</span>
                </button>
              </div>
              {showSystemSection && (
                <div className="space-y-1 ml-2">
                  {getCalendarsInGroup(systemGroup.id, false).map((cal) =>
                    renderCalendarItem(cal, false),
                  )}
                </div>
              )}
            </div>
          )}

          {/* 我的日历 */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between py-1">
              <button
                onClick={() => setShowMyCalendarSection(!showMyCalendarSection)}
                className="flex items-center gap-1 text-base font-semibold text-gray-700 dark:text-gray-300"
              >
                {showMyCalendarSection ? (
                  <MdKeyboardArrowDown className="h-5 w-5" />
                ) : (
                  <MdKeyboardArrowRight className="h-5 w-5" />
                )}
                <span>我的日历</span>
              </button>
              <Dropdown
                menu={{ items: myCalendarAddMenuItems }}
                trigger={["click"]}
                placement="bottomRight"
              >
                <button
                  className="ml-2 rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
                  title="添加"
                >
                  <MdAdd className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                </button>
              </Dropdown>
            </div>

            {showMyCalendarSection && (
              <div className="ml-2">
                {/* 用户分组 */}
                {userGroups.map((group) => renderGroup(group, false))}
                {/* 无分组的日历 */}
                {getCalendarsWithoutGroup(false).length > 0 && (
                  <div className="space-y-1">
                    {getCalendarsWithoutGroup(false).map((cal) =>
                      renderCalendarItem(cal, false),
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 归档日历 */}
          {calendars.some((c) => c.archived) && (
            <div className="mb-4">
              <button
                onClick={() => setShowArchivedSection(!showArchivedSection)}
                className="mb-2 flex items-center gap-1 py-1 text-base font-semibold text-gray-700 dark:text-gray-300"
              >
                {showArchivedSection ? (
                  <MdKeyboardArrowDown className="h-5 w-5" />
                ) : (
                  <MdKeyboardArrowRight className="h-5 w-5" />
                )}
                <span>归档日历</span>
              </button>
              {showArchivedSection && (
                <div className="space-y-2 ml-2">
                  {/* 系统分组的归档日历 */}
                  {systemGroup && renderGroup(systemGroup, true)}

                  {/* 用户分组的归档日历 */}
                  {userGroups.map((group) => renderGroup(group, true))}

                  {/* 无分组的归档日历 */}
                  {getCalendarsWithoutGroup(true).length > 0 && (
                    <div className="space-y-1">
                      {getCalendarsWithoutGroup(true).map((cal) =>
                        renderCalendarItem(cal, false),
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 创建日历对话框 */}
      <CreateCalendarDialog
        isOpen={showCreateDialog}
        onClose={() => {
          setShowCreateDialog(false);
          setSelectedGroupForCreate(null);
        }}
        defaultGroupId={selectedGroupForCreate}
      />

      {/* 编辑日历对话框 */}
      <EditCalendarDialog
        calendar={editingCalendar}
        onClose={() => setEditingCalendar(null)}
      />

      {/* 创建分组对话框 */}
      <CreateGroupDialog
        isOpen={showCreateGroupDialog}
        onClose={() => setShowCreateGroupDialog(false)}
      />
    </div>
  );
});

CalendarSidebar.displayName = "CalendarSidebar";

export default CalendarSidebar;
