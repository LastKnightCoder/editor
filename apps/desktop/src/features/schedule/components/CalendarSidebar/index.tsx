/**
 * 日历清单（「管理日历」弹窗内容）：我的日历（分组 + 未分组）/ 系统日历（番茄钟、待办清单子组）/ 归档。
 * 行首色块勾选框 = 显隐；⋯ 菜单 = 编辑 / 归档 / 删除（系统日历只能改颜色）；
 * 合并模式下行首换成合并勾选。分组与过滤逻辑保持 legacy 口径。
 */

import { memo, useEffect, useState, type ReactNode } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Merge,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button, ConfirmDialog, IconButton, Menu, Tooltip, cn, useEdgeFade, toast } from "@tau/ui";
import { useScheduleStore } from "../../uiStore";
import { useCalendarCatalog, useScheduleMutations } from "../../queries";
import type { Calendar, CalendarGroup } from "@/types";
import { TONE, toneStyle } from "../../eventTone";
import CalendarFormDialog from "../CalendarFormDialog";
import CreateGroupDialog from "../CreateGroupDialog";
import MergeCalendarsDialog from "../MergeCalendarsDialog";

type PendingConfirm =
  { kind: "calendar"; calendar: Calendar } | { kind: "group"; group: CalendarGroup; count: number };

const CalendarSidebar = memo(() => {
  const { calendars, calendarGroups } = useCalendarCatalog();
  const showSystemSection = useScheduleStore(s => s.showSystemSection);
  const showMyCalendarSection = useScheduleStore(s => s.showMyCalendarSection);
  const showArchivedSection = useScheduleStore(s => s.showArchivedSection);
  const mergeModeEnabled = useScheduleStore(s => s.mergeModeEnabled);
  const selectedCalendarsForMerge = useScheduleStore(s => s.selectedCalendarsForMerge);
  const {
    toggleCalendarVisibility,
    deleteCalendar,
    archiveCalendar,
    unarchiveCalendar,
    deleteCalendarGroup,
  } = useScheduleMutations();
  const {
    setShowSystemSection,
    setShowMyCalendarSection,
    setShowArchivedSection,
    toggleMergeMode,
    toggleCalendarForMerge,
  } = useScheduleStore.getState();

  const [createGroupId, setCreateGroupId] = useState<number | null | undefined>(undefined);
  const [editingCalendar, setEditingCalendar] = useState<Calendar | null>(null);
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(() => new Set());
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl);

  // 分组被删除后清理折叠记录
  useEffect(() => {
    setCollapsedGroups(
      prev => new Set([...prev].filter(id => calendarGroups.some(g => g.id === id)))
    );
  }, [calendarGroups]);

  // 系统分组（顶层，parentGroupId 为 null）与其子分组（如待办清单）
  const systemGroup = calendarGroups.find(g => g.isSystem && !g.parentGroupId);
  const systemSubGroups = calendarGroups.filter(g => g.parentGroupId === systemGroup?.id);
  // 用户分组（非系统且无 parent）
  const userGroups = calendarGroups.filter(g => !g.isSystem && !g.parentGroupId);

  const inGroup = (groupId: number, archived: boolean) =>
    calendars.filter(cal => cal.groupId === groupId && cal.archived === archived);
  const ungrouped = (archived: boolean) =>
    calendars.filter(cal => !cal.groupId && !cal.isInSystemGroup && cal.archived === archived);
  const hasArchived = calendars.some(c => c.archived);

  const toggleGroup = (groupId: number) =>
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });

  const renderCalendar = (calendar: Calendar, indent: boolean) => {
    const visible = calendar.visible;
    const canMerge = !calendar.isInSystemGroup && !calendar.archived;
    const mergeRow = mergeModeEnabled && canMerge;
    const checked = mergeRow ? selectedCalendarsForMerge.includes(calendar.id) : visible;

    return (
      <div
        key={calendar.id}
        style={toneStyle(calendar.color)}
        className={cn(
          "group/row hover:bg-hover flex h-[30px] items-center gap-2 rounded-[8px] pr-1 text-[12.5px]",
          indent ? "pl-[22px]" : "pl-1.5",
          TONE
        )}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={mergeRow ? `选择合并：${calendar.title}` : `显示 ${calendar.title}`}
          disabled={mergeModeEnabled && !canMerge}
          onClick={() =>
            mergeRow
              ? toggleCalendarForMerge(calendar.id)
              : void toggleCalendarVisibility(calendar.id).catch(() =>
                  toast.error("更新日历显隐失败")
                )
          }
          className={cn(
            "grid size-3.5 shrink-0 place-items-center rounded-[4px] transition-colors",
            "outline-none focus-visible:shadow-[var(--tau-focus-ring)] disabled:opacity-40",
            checked ? "bg-[var(--cal)]" : "shadow-[inset_0_0_0_1.5px_var(--cal)]",
            mergeRow && checked && "bg-accent",
            mergeRow && !checked && "shadow-[inset_0_0_0_1.5px_var(--tau-bg-track)]"
          )}
        >
          {checked && (
            <span className="border-surface mb-px h-1 w-[7px] -rotate-45 border-b-[1.6px] border-l-[1.6px]" />
          )}
        </button>
        <span className={cn("min-w-0 flex-1 truncate", !checked && !mergeRow && "text-ink-3")}>
          {calendar.title}
        </span>
        {!mergeModeEnabled && (
          <Menu
            align="end"
            trigger={
              <IconButton
                className="size-6 opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 aria-expanded:opacity-100"
                title="更多"
                aria-label={`${calendar.title} 更多操作`}
              >
                <MoreHorizontal className="size-3.5" strokeWidth={1.75} />
              </IconButton>
            }
          >
            {calendar.isInSystemGroup ? (
              <Menu.Item
                icon={<Pencil className="size-[15px]" strokeWidth={1.75} />}
                onSelect={() => setEditingCalendar(calendar)}
              >
                编辑颜色
              </Menu.Item>
            ) : (
              <>
                <Menu.Item
                  icon={<Pencil className="size-[15px]" strokeWidth={1.75} />}
                  onSelect={() => setEditingCalendar(calendar)}
                >
                  编辑
                </Menu.Item>
                {calendar.archived ? (
                  <Menu.Item
                    icon={<ArchiveRestore className="size-[15px]" strokeWidth={1.75} />}
                    onSelect={() =>
                      void unarchiveCalendar(calendar.id).catch(() => toast.error("取消归档失败"))
                    }
                  >
                    取消归档
                  </Menu.Item>
                ) : (
                  <Menu.Item
                    icon={<Archive className="size-[15px]" strokeWidth={1.75} />}
                    onSelect={() =>
                      void archiveCalendar(calendar.id).catch(() => toast.error("归档失败"))
                    }
                  >
                    归档
                  </Menu.Item>
                )}
                <Menu.Separator />
                <Menu.Item
                  danger
                  icon={<Trash2 className="size-[15px]" strokeWidth={1.75} />}
                  onSelect={() => setPendingConfirm({ kind: "calendar", calendar })}
                >
                  删除
                </Menu.Item>
              </>
            )}
          </Menu>
        )}
      </div>
    );
  };

  const renderGroup = (group: CalendarGroup, archived: boolean, editable: boolean) => {
    const list = inGroup(group.id, archived);
    // 归档段不显示空分组；非归档分组即使为空也显示
    if (archived && list.length === 0) return null;
    const expanded = !collapsedGroups.has(group.id);
    return (
      <div key={group.id}>
        <div className="group/row hover:bg-hover flex h-[30px] items-center gap-1 rounded-[8px] pl-0.5 pr-1">
          <button
            type="button"
            onClick={() => toggleGroup(group.id)}
            className="text-ink-2 flex min-w-0 flex-1 items-center gap-1 text-[12.5px]"
          >
            {expanded ? (
              <ChevronDown className="text-ink-3 size-3.5 shrink-0" strokeWidth={1.75} />
            ) : (
              <ChevronRight className="text-ink-3 size-3.5 shrink-0" strokeWidth={1.75} />
            )}
            <span className="truncate">{group.name}</span>
          </button>
          {editable && !mergeModeEnabled && (
            <Menu
              align="end"
              trigger={
                <IconButton
                  className="size-6 opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 aria-expanded:opacity-100"
                  title="更多"
                  aria-label={`${group.name} 更多操作`}
                >
                  <MoreHorizontal className="size-3.5" strokeWidth={1.75} />
                </IconButton>
              }
            >
              <Menu.Item
                icon={<Plus className="size-[15px]" strokeWidth={1.75} />}
                onSelect={() => setCreateGroupId(group.id)}
              >
                添加日历
              </Menu.Item>
              <Menu.Separator />
              <Menu.Item
                danger
                icon={<Trash2 className="size-[15px]" strokeWidth={1.75} />}
                onSelect={() =>
                  setPendingConfirm({
                    kind: "group",
                    group,
                    count: inGroup(group.id, false).length,
                  })
                }
              >
                删除分组
              </Menu.Item>
            </Menu>
          )}
        </div>
        {expanded &&
          (list.length > 0 ? (
            list.map(cal => renderCalendar(cal, true))
          ) : (
            <p className="text-ink-3 text-tau-sm py-1 pl-[22px]">暂无日历</p>
          ))}
      </div>
    );
  };

  return (
    <div
      ref={setScrollEl}
      className="edge-fade-scroll -mx-1 flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-1 pb-3"
    >
      <Section
        title="我的日历"
        count={calendars.filter(c => !c.isInSystemGroup && !c.archived).length}
        open={showMyCalendarSection}
        onToggle={() => setShowMyCalendarSection(!showMyCalendarSection)}
        actions={
          mergeModeEnabled ? (
            <Tooltip content="退出合并">
              <IconButton className="size-6" aria-label="退出合并" onClick={toggleMergeMode}>
                <X className="size-3.5" strokeWidth={1.75} />
              </IconButton>
            </Tooltip>
          ) : (
            <>
              <Tooltip content="合并日历">
                <IconButton className="size-6" aria-label="合并日历" onClick={toggleMergeMode}>
                  <Merge className="size-3.5" strokeWidth={1.75} />
                </IconButton>
              </Tooltip>
              <Menu
                align="end"
                trigger={
                  <IconButton className="size-6" title="新建" aria-label="新建日历或分组">
                    <Plus className="size-3.5" strokeWidth={1.75} />
                  </IconButton>
                }
              >
                <Menu.Item
                  icon={<Plus className="size-[15px]" strokeWidth={1.75} />}
                  onSelect={() => setCreateGroupId(null)}
                >
                  新建日历
                </Menu.Item>
                <Menu.Item
                  icon={<FolderPlus className="size-[15px]" strokeWidth={1.75} />}
                  onSelect={() => setShowCreateGroupDialog(true)}
                >
                  新建分组
                </Menu.Item>
              </Menu>
            </>
          )
        }
      >
        {mergeModeEnabled && (
          <div className="bg-accent-soft mb-1.5 flex flex-col gap-2 rounded-[10px] px-3 py-2.5">
            <p className="text-accent-text text-tau-meta">勾选至少 2 个日历进行合并</p>
            {selectedCalendarsForMerge.length >= 2 && (
              <Button variant="primary" size="sm" block onClick={() => setShowMergeDialog(true)}>
                合并选中的 {selectedCalendarsForMerge.length} 个日历
              </Button>
            )}
          </div>
        )}
        {userGroups.map(group => renderGroup(group, false, true))}
        {ungrouped(false).map(cal => renderCalendar(cal, false))}
        {userGroups.length === 0 && ungrouped(false).length === 0 && (
          <p className="text-ink-3 text-tau-meta px-1.5 py-1 leading-[1.7]">
            还没有日历。日历用来给日程分类，比如「工作」「学习」。
          </p>
        )}
      </Section>

      {systemGroup && (
        <Section
          title="系统日历"
          count={calendars.filter(c => c.isInSystemGroup && !c.archived).length}
          open={showSystemSection}
          onToggle={() => setShowSystemSection(!showSystemSection)}
        >
          {inGroup(systemGroup.id, false).map(cal => renderCalendar(cal, false))}
          {systemSubGroups.map(group => renderGroup(group, false, false))}
        </Section>
      )}

      {hasArchived && (
        <Section
          title="归档"
          count={calendars.filter(c => c.archived).length}
          open={showArchivedSection}
          onToggle={() => setShowArchivedSection(!showArchivedSection)}
        >
          {systemGroup && renderGroup(systemGroup, true, false)}
          {userGroups.map(group => renderGroup(group, true, false))}
          {ungrouped(true).map(cal => renderCalendar(cal, false))}
        </Section>
      )}

      <CalendarFormDialog
        open={createGroupId !== undefined || editingCalendar !== null}
        calendar={editingCalendar}
        defaultGroupId={createGroupId ?? null}
        onClose={() => {
          setCreateGroupId(undefined);
          setEditingCalendar(null);
        }}
      />
      <CreateGroupDialog
        open={showCreateGroupDialog}
        onClose={() => setShowCreateGroupDialog(false)}
      />
      <MergeCalendarsDialog
        open={showMergeDialog}
        onClose={() => setShowMergeDialog(false)}
        sourceCalendarIds={selectedCalendarsForMerge}
      />
      <ConfirmDialog
        open={pendingConfirm !== null}
        onOpenChange={next => {
          if (!next) setPendingConfirm(null);
        }}
        danger
        title={pendingConfirm?.kind === "group" ? "删除分组" : "删除日历"}
        context={
          pendingConfirm?.kind === "group"
            ? pendingConfirm.group.name
            : pendingConfirm?.calendar.title
        }
        description={
          pendingConfirm?.kind === "group"
            ? pendingConfirm.count > 0
              ? `分组内的 ${pendingConfirm.count} 个日历会移出分组，日历本身不删除。`
              : "分组为空。"
            : "该日历下的所有日程会一并删除。"
        }
        impact={pendingConfirm?.kind === "calendar" ? "删除后不可恢复" : undefined}
        confirmText="删除"
        onConfirm={async () => {
          if (!pendingConfirm) return;
          if (pendingConfirm.kind === "group") await deleteCalendarGroup(pendingConfirm.group.id);
          else await deleteCalendar(pendingConfirm.calendar.id);
          setPendingConfirm(null);
        }}
      />
    </div>
  );
});

CalendarSidebar.displayName = "CalendarSidebar";

function Section({
  title,
  count,
  open,
  onToggle,
  actions,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex h-7 items-center gap-1 pl-0.5 pr-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1 text-[12.5px] font-semibold"
        >
          {open ? (
            <ChevronDown className="text-ink-3 size-3.5 shrink-0" strokeWidth={1.75} />
          ) : (
            <ChevronRight className="text-ink-3 size-3.5 shrink-0" strokeWidth={1.75} />
          )}
          {title}
          <small className="text-ink-3 font-tau-mono ml-1 text-[11px] font-normal">{count}</small>
        </button>
        {actions}
      </div>
      {open && <div className="flex flex-col pl-4">{children}</div>}
    </section>
  );
}

export default CalendarSidebar;
