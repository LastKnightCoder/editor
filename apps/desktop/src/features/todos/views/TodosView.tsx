/**
 * 待办页视图 · 议程流 B3「两块板」（mockups/todos/plan-b-agenda.html?v=panels 定稿）：
 * 一整张纸：纸顶固定工具栏（标题 + 今日摘要 + 按日期/按项目分段切换）与自然语言快速添加，
 * 纸内议程（时间分段）占满宽度；「今日」概览（今日打卡 / 本周负荷 / 最近完成）与任务详情都是右侧非模态抽屉，
 * 今日由工具栏按钮开关，打开任务时详情接替、关掉详情回到今日。
 * 项目筛选在侧栏「待办」入口的子项里（TodosNav，页面参数 id），页内不放项目 pills。
 *
 * 裁决（DECISIONS D-040）：不并入日程页、不放页面状态栏 PageStatusBar（计数在工具栏摘要与 pills）、删除不二次
 * 确认（立即从列表消失 + Toast 撤销，5 秒后才真正落库）、不保留独立 /todo 小窗口。
 *
 * 带日期的子任务按自己的日期进议程（行尾标父任务），不再只藏在父任务抽屉里。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArchiveRestore,
  ArrowRightLeft,
  CalendarClock,
  CalendarDays,
  Check,
  Folder,
  ListChecks,
  PanelRightOpen,
  Plus,
  Sunrise,
  Sun,
  Trash2,
} from "lucide-react";
import { MotionConfig } from "motion/react";
import { Button, Loading, Menu, Segmented, toast } from "@tau/ui";
import { usePage, usePageParams } from "@/page/PageProvider";
import type { TodoGroup } from "@/types";
import {
  DAY_MS,
  bucketOf,
  doneToday,
  isOpen,
  isOverdue,
  liveEntries,
  scheduledToday,
  startOfDay,
  WEEKDAY_CN,
} from "../model";
import { useNow, useTodoMutations, useTodoSnapshot } from "../queries";
import type { QuickAddResult } from "../quickAdd";
import type { TodoEntry } from "../types";
import { AgendaPanel, type AgendaMode } from "../components/AgendaPanel";
import { GroupDialog } from "@/components/GroupDialog";
import { QuickAddBar } from "../components/QuickAddBar";
import { TodayDrawer } from "../components/TodayDrawer";
import { TodoDrawer } from "../components/TodoDrawer";
import { GroupDot } from "../components/TodoBits";
import { useAppContextProvider } from "@/hooks/useAppContextProvider";

const UNDO_MS = 5000;

export function TodosView() {
  const { navigator } = usePage();
  const { snapshot, loading } = useTodoSnapshot();
  const mutations = useTodoMutations();
  const now = useNow();

  const params = usePageParams<{ id?: string; selectedId?: number }>();
  const [mode, setMode] = useState<AgendaMode>("date");
  // 项目筛选 = 侧栏子项选中的项目（0 = 全部）；项目被归档 / 删除后自然回到全部
  const groupFilter =
    params.id && snapshot?.groups.some(g => g.id === Number(params.id)) ? Number(params.id) : 0;
  const setGroupFilter = (groupId: number) =>
    navigator.push("todos", { id: groupId ? String(groupId) : "" });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [todayOpen, setTodayOpen] = useState(false);
  const [groupDialog, setGroupDialog] = useState<{ group: TodoGroup | null } | null>(null);
  const quickAddRef = useRef<HTMLInputElement>(null);
  const agendaAnchor = useRef<HTMLDivElement>(null);

  /* 删除暂存：立即从视图消失，UNDO_MS 后真正落库；撤销即取消；离开页面时立刻落库。
     落库成功后不清暂存——条目由失效重拉从快照中消失，提前清除会在重拉完成前闪现（列表抖动） */
  const [pendingDelete, setPendingDelete] = useState<ReadonlySet<number>>(() => new Set());
  const deleteTimers = useRef(new Map<number, number>());
  const commitDelete = (id: number) => {
    window.clearTimeout(deleteTimers.current.get(id));
    deleteTimers.current.delete(id);
    mutations.remove(id).catch(() => {
      toast.error("删除失败");
      setPendingDelete(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  };
  const commitRef = useRef(commitDelete);
  commitRef.current = commitDelete;
  useEffect(
    () => () => {
      for (const id of [...deleteTimers.current.keys()]) commitRef.current(id);
    },
    []
  );

  const scheduleDelete = (entry: TodoEntry) => {
    if (selectedId === entry.id || entry.childIds.includes(selectedId ?? -1)) setSelectedId(null);
    setPendingDelete(prev => new Set(prev).add(entry.id));
    deleteTimers.current.set(
      entry.id,
      window.setTimeout(() => commitRef.current(entry.id), UNDO_MS)
    );
    const children = entry.childIds.length;
    toast.info(`已删除「${entry.title}」${children ? `及 ${children} 个子任务` : ""}`, {
      duration: UNDO_MS,
      action: {
        label: "撤销",
        onClick: () => {
          window.clearTimeout(deleteTimers.current.get(entry.id));
          deleteTimers.current.delete(entry.id);
          setPendingDelete(prev => {
            const next = new Set(prev);
            next.delete(entry.id);
            return next;
          });
        },
      },
    });
  };

  /* 外部带 selectedId 进入（今日页待办卡等）：选中并滚到该行；目标不在当前项目筛选内时回到全部。
     参数随即消费掉（原位更新），关掉详情后再次从外部进入同一条仍能定位 */
  useEffect(() => {
    const id = params.selectedId;
    if (id == null || !snapshot) return;
    const target = snapshot.byId.get(id);
    const outOfFilter = target != null && groupFilter !== 0 && target.groupId !== groupFilter;
    navigator.push("todos", { id: outOfFilter ? "" : (params.id ?? "") });
    if (!target) return;
    setSelectedId(id);
    // 双帧：等筛选回到全部后的重渲染落定再找行
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document
          .querySelector(`[data-row-id="${id}"]`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" })
      )
    );
    // 只响应 selectedId 参数本身
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.selectedId, snapshot != null]);

  /* ⌘/Ctrl+/ 聚焦快速添加（仅本页在栈顶时生效） */
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== "/" || e.altKey) return;
      if (navigator.current()?.key !== "todos") return;
      e.preventDefault();
      quickAddRef.current?.focus();
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [navigator]);

  /* ---------- 派生 ---------- */

  const derived = useMemo(() => {
    if (!snapshot) return null;
    // 已删除暂存的子孙一并隐藏
    const hidden = new Set<number>();
    const hide = (id: number) => {
      hidden.add(id);
      snapshot.byId.get(id)?.childIds.forEach(hide);
    };
    pendingDelete.forEach(hide);
    const live = liveEntries(snapshot, hidden);
    const allRoots = live.filter(e => e.parentId == null);
    const roots = groupFilter ? allRoots.filter(e => e.groupId === groupFilter) : allRoots;
    // 带日期的子任务按自己的日期进议程（按日期模式）
    const datedChildren = live.filter(
      e =>
        e.parentId != null &&
        (e.type === "deadline" || e.type === "planned") &&
        (e.dueAt ?? e.startAt) != null &&
        (!groupFilter || e.groupId === groupFilter)
    );
    const timed = [...roots, ...datedChildren];
    return {
      live,
      allRoots,
      roots,
      timed,
      completed: live.filter(
        e => e.type !== "recurring" && e.isCompleted && (!groupFilter || e.groupId === groupFilter)
      ),
      todayCount: timed.filter(e => bucketOf(e, now) === "today" && isOpen(e, now)).length,
      overdueCount: timed.filter(e => isOverdue(e, now)).length,
      habitsToday: roots.filter(e => scheduledToday(e, now)),
    };
  }, [snapshot, pendingDelete, groupFilter, now]);

  // AI 上下文：当前打开的待办详情（selectedId 经 ref 保鲜，详情抽屉关闭时返回 null）
  useAppContextProvider("todo-detail", "待办详情", () => {
    if (selectedId == null || !snapshot) return null;
    const entry = snapshot.byId.get(selectedId);
    if (!entry) return null;
    return {
      id: entry.id,
      title: entry.title,
      type: entry.type,
      isCompleted: entry.isCompleted,
      groupId: entry.groupId,
      parentId: entry.parentId,
      startAt: entry.startAt ?? null,
      dueAt: entry.dueAt ?? null,
      completedAt: entry.completedAt ?? null,
    };
  });

  if (loading || !snapshot || !derived) return <Loading />;

  const selected = selectedId != null ? (snapshot.byId.get(selectedId) ?? null) : null;
  const groups = snapshot.groups;

  /* ---------- 操作 ---------- */

  const toggle = (entry: TodoEntry) => {
    if (entry.type === "recurring") {
      if (!scheduledToday(entry, now)) {
        toast.info("今天不是计划打卡日——可在详情的打卡格里补打过去的日子");
        return;
      }
      const done = doneToday(entry, now);
      void mutations.setOccurrence(entry, now, done ? null : "done");
      if (!done)
        toast.success(`已打卡「${entry.title}」`, {
          action: { label: "撤销", onClick: () => void mutations.setOccurrence(entry, now, null) },
        });
      return;
    }
    const next = !entry.isCompleted;
    void mutations.setCompleted(entry, next);
    if (next)
      toast.success(`已完成「${entry.title}」`, {
        action: { label: "撤销", onClick: () => void mutations.setCompleted(entry, false) },
      });
  };

  const reschedule = (entry: TodoEntry, day: number) => {
    const base = entry.type === "planned" ? entry.startAt : entry.dueAt;
    const timeOfDay = base != null ? base - startOfDay(base) : 0;
    if (entry.type === "planned" && entry.startAt != null) {
      const length = (entry.dueAt ?? entry.startAt) - entry.startAt;
      const startAt = day + timeOfDay;
      void mutations.updateItem(entry, { startAt, dueAt: startAt + length });
    } else if (entry.type === "deadline") {
      void mutations.updateItem(entry, { dueAt: day + timeOfDay });
    } else {
      // 普通任务改期 = 转为截止任务（全天）
      void mutations.updateItem(entry, { type: "deadline", dueAt: day });
    }
  };

  const createFromQuickAdd = async (parsed: QuickAddResult, groupId: number) => {
    try {
      const item = await mutations.createFromQuickAdd(parsed, groupId);
      toast.success(`已添加「${item.title}」`);
    } catch {
      toast.error("添加失败");
      throw new Error("create failed");
    }
  };

  const renderMenu = (entry: TodoEntry) => {
    const today = startOfDay(now);
    const nextMonday = today + ((8 - new Date(now).getDay()) % 7 || 7) * DAY_MS;
    return (
      <>
        <Menu.Item
          icon={<Check className="size-[15px]" strokeWidth={1.75} />}
          kbd="Space"
          onSelect={() => toggle(entry)}
        >
          {entry.type === "recurring"
            ? doneToday(entry, now)
              ? "撤销今日打卡"
              : "今日打卡"
            : entry.isCompleted
              ? "标记未完成"
              : "完成"}
        </Menu.Item>
        <Menu.Item
          icon={<PanelRightOpen className="size-[15px]" strokeWidth={1.75} />}
          kbd="⏎"
          onSelect={() => setSelectedId(entry.id)}
        >
          打开详情
        </Menu.Item>
        {entry.type !== "recurring" && (
          <Menu.Submenu
            label="改期"
            icon={<CalendarClock className="size-[15px]" strokeWidth={1.75} />}
          >
            <Menu.Item
              icon={<Sun className="size-[15px]" strokeWidth={1.75} />}
              onSelect={() => reschedule(entry, today)}
            >
              今天
            </Menu.Item>
            <Menu.Item
              icon={<Sunrise className="size-[15px]" strokeWidth={1.75} />}
              onSelect={() => reschedule(entry, today + DAY_MS)}
            >
              明天
            </Menu.Item>
            <Menu.Item
              icon={<CalendarDays className="size-[15px]" strokeWidth={1.75} />}
              onSelect={() => reschedule(entry, nextMonday)}
            >
              下周一
            </Menu.Item>
          </Menu.Submenu>
        )}
        {groups.length > 1 && (
          <Menu.Submenu
            label="移动到"
            icon={<ArrowRightLeft className="size-[15px]" strokeWidth={1.75} />}
          >
            {groups
              .filter(g => g.id !== entry.groupId)
              .map(g => (
                <Menu.Item
                  key={g.id}
                  icon={<GroupDot color={g.color} className="size-[7px]" />}
                  onSelect={() => void mutations.moveToGroup(entry, g.id)}
                >
                  {g.title}
                </Menu.Item>
              ))}
          </Menu.Submenu>
        )}
        <Menu.Separator />
        <Menu.Item
          danger
          icon={<Trash2 className="size-[15px]" strokeWidth={1.75} />}
          onSelect={() => scheduleDelete(entry)}
        >
          删除
        </Menu.Item>
      </>
    );
  };

  const jumpTo = (offset: number) => {
    const key =
      offset < 0 ? "overdue" : offset === 0 ? "today" : offset === 1 ? "tomorrow" : "week";
    setMode("date");
    requestAnimationFrame(() =>
      agendaAnchor.current
        ?.querySelector(`[data-bucket="${key}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  };

  const habitsDone = derived.habitsToday.filter(e => doneToday(e, now)).length;
  const currentGroup = groupFilter ? groups.find(g => g.id === groupFilter) : undefined;

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pb-4 pt-1">
        {/* 一整张纸：工具栏与快速添加固定在纸顶，议程与右栏在纸内各自滚动（同 Skill 页） */}
        <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-none flex-col px-8 pt-5">
            {/* 工具栏：计数摘要在此（不注册状态栏）；分段方式切换 */}
            <div className="mb-3 flex h-10 flex-none items-center gap-3">
              <h1 className="text-tau-title-lg shrink-0 whitespace-nowrap font-semibold tracking-[-0.01em]">
                {currentGroup ? currentGroup.title : "待办"}
              </h1>
              <span className="text-ink-2 text-tau-meta w-0 flex-1 truncate whitespace-nowrap tabular-nums">
                今天 <b className="text-ink-1 font-semibold">{derived.todayCount}</b> 项
                {derived.overdueCount > 0 && (
                  <>
                    {" · "}
                    <span className="text-danger font-medium">{derived.overdueCount} 项逾期</span>
                  </>
                )}
                {derived.habitsToday.length > 0 && (
                  <>
                    {" · "}打卡{" "}
                    <b className="text-ink-1 font-semibold">
                      {habitsDone}/{derived.habitsToday.length}
                    </b>
                  </>
                )}
              </span>
              <Button
                variant={todayOpen ? "soft" : "ghost"}
                size="sm"
                icon={ListChecks}
                aria-pressed={todayOpen}
                title="今日打卡 · 本周负荷 · 最近完成"
                className="shrink-0 whitespace-nowrap"
                onClick={() => {
                  setTodayOpen(open => !open);
                  setSelectedId(null);
                }}
              >
                今日
              </Button>
              <Segmented
                label="分段方式"
                value={mode}
                onValueChange={(v: AgendaMode) => setMode(v)}
              >
                <Segmented.Item value="date" icon={CalendarDays} label="按日期" />
                <Segmented.Item value="group" icon={Folder} label="按项目" />
              </Segmented>
            </div>
            {groups.length > 0 && (
              <QuickAddBar
                groups={groups}
                fallbackGroupId={groupFilter || groups[0].id}
                now={now}
                onSubmit={createFromQuickAdd}
                inputRef={quickAddRef}
              />
            )}
          </div>

          {groups.length === 0 ? (
            <EmptyGroups
              archivedGroups={snapshot.archivedGroups}
              onCreate={() => setGroupDialog({ group: null })}
              onRestore={group => void mutations.setGroupArchived(group.id, false)}
            />
          ) : (
            // 议程占满；今日 / 详情抽屉在此绝对定位盖在右侧
            <div className="relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)]">
              <div ref={agendaAnchor} className="flex min-h-0 flex-col pl-2.5">
                <AgendaPanel
                  entries={mode === "date" ? derived.timed : derived.roots}
                  snapshot={snapshot}
                  groups={groupFilter ? groups.filter(g => g.id === groupFilter) : groups}
                  mode={mode}
                  now={now}
                  showGroup={mode === "date" && groupFilter === 0}
                  selectedId={selectedId}
                  onOpen={entry => setSelectedId(entry.id)}
                  onToggle={toggle}
                  renderMenu={renderMenu}
                />
              </div>
              <TodayDrawer
                open={todayOpen && selected === null}
                onClose={() => setTodayOpen(false)}
                subtitle={`${new Date(now).getMonth() + 1}月${new Date(now).getDate()}日 ${WEEKDAY_CN[new Date(now).getDay()]}`}
                roots={derived.timed}
                completed={derived.completed}
                now={now}
                selectedId={selectedId}
                onOpen={entry => setSelectedId(entry.id)}
                onToggleHabit={toggle}
                onJump={jumpTo}
              />
              <TodoDrawer
                entry={selected}
                snapshot={snapshot}
                groups={groups}
                now={now}
                mutations={mutations}
                onClose={() => setSelectedId(null)}
                onOpen={entry => setSelectedId(entry.id)}
                onToggle={toggle}
                onDelete={scheduleDelete}
              />
            </div>
          )}
        </div>

        <GroupDialog
          open={groupDialog !== null}
          group={groupDialog?.group ?? null}
          onClose={() => setGroupDialog(null)}
          onSubmit={async (title, color) => {
            if (groupDialog?.group) {
              await mutations.updateGroup(groupDialog.group.id, title, color);
              toast.success("项目已更新");
            } else {
              const created = await mutations.createGroup(title, color);
              setGroupFilter(created.id);
              toast.success(`已创建项目「${title}」`);
            }
          }}
        />
      </div>
    </MotionConfig>
  );
}

function EmptyGroups({
  archivedGroups,
  onCreate,
  onRestore,
}: {
  archivedGroups: TodoGroup[];
  onCreate(): void;
  onRestore(group: TodoGroup): void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 pb-16 text-center">
      <p className="text-ink-2 text-[15px] font-medium">还没有进行中的项目</p>
      <p className="text-ink-3 text-[12.5px]">任务归属于项目——先建一个，比如「工作」「生活」</p>
      <div className="mt-3 flex gap-2">
        <Button variant="primary" size="sm" icon={Plus} onClick={onCreate}>
          新建项目
        </Button>
        {archivedGroups.length > 0 && (
          <Menu
            trigger={
              <Button variant="secondary" size="sm" icon={ArchiveRestore}>
                恢复已归档（{archivedGroups.length}）
              </Button>
            }
          >
            {archivedGroups.map(group => (
              <Menu.Item
                key={group.id}
                icon={<GroupDot color={group.color} className="size-[7px]" />}
                onSelect={() => onRestore(group)}
              >
                {group.title}
              </Menu.Item>
            ))}
          </Menu>
        )}
      </div>
    </div>
  );
}
