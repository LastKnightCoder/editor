/**
 * 番茄专注页 · 时间账本：工具栏（标题 + 今日摘要 + 区间分段 + 已归档 + 新建预设）→
 * 常驻控制条（空闲 = 预设快速开始；专注中 = 播放器）→ 账本大面板（左：日 × 时账本 + 时段分布 +
 * 预设图例，或「全部」概览；右：选中日明细）。账本窗口由标题旁的时间导航决定
 * （翻页、快捷范围含「全部」、任意起止）。
 *
 * 计时在主进程：页面只镜像会话（timerStore），离开页面计时照常，侧栏入口挂实时计时。
 * 删除（记录 / 预设）不二次确认：立即从视图消失 + Toast 撤销，UNDO_MS 后才落库，离开页面立即落库。
 * 键盘（仅本页在栈顶、焦点不在输入 / 按钮上）：空格暂停继续、1–9 开始第 N 个预设、I 进入沉浸。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArchiveRestore, Plus, Trash2 } from "lucide-react";
import { Button, IconButton, Loading, Menu, toast } from "@tau/ui";
import { usePage } from "@/page/PageProvider";
import { isEditableTarget } from "@/page/dom";
import { isElectron } from "@/electron";
import { openPomodoroImmersiveWindow } from "@/commands/window";
import type { PomodoroPreset, PomodoroSession } from "@/types";
import {
  HOUR_MS,
  formatDuration,
  formatDurationCN,
  groupByDay,
  isEarlyStop,
  startOfDay,
  streakDays,
  sumFocus,
} from "../model";
import {
  WINDOW_DAYS,
  useInvalidateOnSessionEnd,
  usePomodoroMutations,
  usePomodoroPresets,
  usePomodoroSessions,
  useAllSessions,
  useEarliestDay,
  useWindowSessions,
  type PresetDraft,
} from "../queries";
import {
  lastDays,
  lastDaysKey,
  resolveQuick,
  windowAround,
  windowDays,
  type DayWindow,
  type QuickKey,
} from "../range";
import { pomodoroActions, useLiveTiming, usePomodoroTimer } from "../timerStore";
import { ControlStrip } from "../components/ControlStrip";
import { DayDetail } from "../components/DayDetail";
import { FocusEditorPopover } from "../components/FocusEditorPopover";
import { Ledger, LedgerHeader, PresetLegend } from "../components/Ledger";
import { AllOverview } from "../components/AllOverview";
import { RangeNav } from "../components/RangeNav";
import { PresetDot } from "../components/PomodoroBits";
import { PresetEditorPopover } from "../components/PresetEditorPopover";
import { SessionPeekPopover } from "../components/SessionPeekPopover";

const UNDO_MS = 5000;
/** 账本视图：按天窗口（快捷项滚动跟随今天，手选为固定起止）或「全部」概览 */
type LedgerView = { kind: "all" } | { kind: "days"; key: QuickKey | null; manual: DayWindow };

/** 分钟级「现在」：跨零点后今天 / 账本窗口自动滚动 */
function useMinuteNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** 延迟落库的删除：立即隐藏，UNDO_MS 后执行 commit；撤销即取消；卸载时立即落库 */
function useDeferredDelete(commit: (id: number) => Promise<unknown>, errorText: string) {
  const [pending, setPending] = useState<ReadonlySet<number>>(() => new Set());
  const timers = useRef(new Map<number, number>());
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const drop = (id: number) =>
    setPending(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  const flush = (id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    commitRef
      .current(id)
      .catch(() => toast.error(errorText))
      .finally(() => drop(id));
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(
    () => () => {
      for (const id of [...timers.current.keys()]) flushRef.current(id);
    },
    []
  );

  const schedule = (id: number, message: string) => {
    setPending(prev => new Set(prev).add(id));
    timers.current.set(
      id,
      window.setTimeout(() => flushRef.current(id), UNDO_MS)
    );
    toast.info(message, {
      duration: UNDO_MS,
      action: {
        label: "撤销",
        onClick: () => {
          window.clearTimeout(timers.current.get(id));
          timers.current.delete(id);
          drop(id);
        },
      },
    });
  };
  return { pending, schedule };
}

export function PomodoroView() {
  const { navigator } = usePage();
  const minuteNow = useMinuteNow();
  const { session: live, timing, now: secondNow } = useLiveTiming();
  const now = live ? secondNow : minuteNow;
  const presets = usePomodoroPresets();
  const recent = usePomodoroSessions(minuteNow);
  const earliest = useEarliestDay();
  const mutations = usePomodoroMutations();
  useInvalidateOnSessionEnd();

  const [ledger, setLedger] = useState<LedgerView>(() => ({
    kind: "days",
    key: "last14",
    manual: lastDays(14, Date.now()),
  }));
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(Date.now()));
  const [highlight, setHighlight] = useState<number | null>(null);
  const [editor, setEditor] = useState<{
    preset: PomodoroPreset | null;
    anchor: HTMLElement;
  } | null>(null);
  const [focusEdit, setFocusEdit] = useState<{
    session: PomodoroSession;
    anchor: HTMLElement;
  } | null>(null);
  const [peek, setPeek] = useState<{ session: PomodoroSession; anchor: HTMLElement } | null>(null);

  const sessionDeletes = useDeferredDelete(mutations.deleteSession, "删除记录失败");
  const presetDeletes = useDeferredDelete(mutations.deletePreset, "删除预设失败");

  /* ---------- 结束回报（仅本页可见时；Activity 恢复时不补报旧结果） ---------- */
  const lastResult = usePomodoroTimer(s => s.lastResult);
  const seenSeq = useRef(lastResult?.seq ?? 0);
  useEffect(() => {
    if (!lastResult || lastResult.seq <= seenSeq.current) return;
    seenSeq.current = lastResult.seq;
    if (Date.now() - lastResult.endedAt > 10_000) return;
    const name = presets.byId.get(lastResult.presetId)?.name ?? "专注";
    if (!lastResult.saved) toast.info("不足 5 分钟，本次未记录");
    else if (isEarlyStop(lastResult))
      toast.info(`「${name}」提前结束 · 记录 ${formatDurationCN(lastResult.focusMs)}`);
    else toast.success(`完成「${name}」· ${formatDurationCN(lastResult.focusMs)}`);
  }, [lastResult, presets.byId]);

  /* ---------- 键盘 ---------- */
  const keyState = useRef({ live, active: presets.active });
  keyState.current = { live, active: presets.active };
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      if (navigator.current()?.key !== "pomodoro") return;
      const target = e.target;
      if (
        isEditableTarget(target) ||
        (target instanceof Element &&
          target.closest("button, [role=button], [role=menu], [role=dialog], [data-float-card]"))
      )
        return;
      const { live: current, active } = keyState.current;
      if (e.key === " " && current) {
        e.preventDefault();
        void pomodoroActions.toggle();
      } else if (/^[1-9]$/.test(e.key) && !current) {
        const preset = active[Number(e.key) - 1];
        if (preset) void pomodoroActions.start(preset);
      } else if ((e.key === "i" || e.key === "I") && current && isElectron) {
        void openPomodoroImmersiveWindow();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigator]);

  /* ---------- 派生 ---------- */
  const today = startOfDay(minuteNow);
  // 快捷项窗口随日期滚动（跨零点后「近 14 天」自动前移），手选窗口固定
  const dayWindow: DayWindow =
    ledger.kind === "days"
      ? ((ledger.key && resolveQuick(ledger.key, minuteNow, earliest)) ?? ledger.manual)
      : lastDays(14, minuteNow);
  const windowed = useWindowSessions(dayWindow, recent, ledger.kind === "days");
  const all = useAllSessions(ledger.kind === "all");

  const hideDeleted = (list: PomodoroSession[] | undefined) =>
    (list ?? []).filter(s => !sessionDeletes.pending.has(s.id));
  const recentVisible = useMemo(
    () => hideDeleted(recent.sessions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recent.sessions, sessionDeletes.pending]
  );
  const windowVisible = useMemo(
    () => hideDeleted(windowed.sessions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [windowed.sessions, sessionDeletes.pending]
  );
  const allVisible = useMemo(
    () => hideDeleted(all.sessions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all.sessions, sessionDeletes.pending]
  );
  const recentDays = useMemo(() => groupByDay(recentVisible), [recentVisible]);
  const windowDaysMap = useMemo(() => groupByDay(windowVisible), [windowVisible]);
  const allDays = useMemo(() => groupByDay(allVisible), [allVisible]);
  const todaySessions = recentDays.get(today) ?? [];
  const streak = streakDays(recentVisible, minuteNow);

  // 选中日滑出窗口（换窗口 / 跨零点）时落到窗口最新的一天
  useEffect(() => {
    if (ledger.kind !== "days") return;
    if (selectedDay > dayWindow.to || selectedDay < dayWindow.from) setSelectedDay(dayWindow.to);
  }, [ledger.kind, selectedDay, dayWindow.from, dayWindow.to]);

  const openWindow = (window: DayWindow, key: QuickKey | null) => {
    setLedger({ kind: "days", key, manual: window });
    setSelectedDay(day => (day >= window.from && day <= window.to ? day : window.to));
  };
  const jumpToDay = (day: number) => {
    const length = ledger.kind === "days" ? Math.min(30, windowDays(dayWindow)) : 14;
    const window = windowAround(day, Math.max(7, length), minuteNow);
    setLedger({ kind: "days", key: lastDaysKey(window, minuteNow), manual: window });
    setSelectedDay(day);
  };

  if (presets.loading || recent.loading) return <Loading />;

  const activePresets = presets.active;
  const archivedPresets = presets.archived.filter(p => !presetDeletes.pending.has(p.id));
  const liveName = live ? (presets.byId.get(live.presetId)?.name ?? "专注") : "";

  const submitPreset = (draft: PresetDraft) =>
    editor?.preset
      ? mutations.updatePreset(editor.preset.id, draft).then(() => toast.success("预设已保存"))
      : mutations.createPreset(draft).then(() => toast.success(`已创建「${draft.name}」`));

  const archivePreset = (preset: PomodoroPreset) => {
    if (live?.presetId === preset.id) return toast.info("正在专注的预设不能归档");
    void mutations.setArchived(preset.id, true).then(() =>
      toast.success(`已归档「${preset.name}」`, {
        action: { label: "撤销", onClick: () => void mutations.setArchived(preset.id, false) },
      })
    );
  };

  const rangeNav = (
    <RangeNav
      window={dayWindow}
      quickKey={ledger.kind === "days" ? (ledger.key ?? lastDaysKey(dayWindow, minuteNow)) : null}
      now={minuteNow}
      earliest={earliest}
      all={ledger.kind === "all"}
      onChange={openWindow}
      onPickAll={() => setLedger({ kind: "all" })}
      onJumpToDay={jumpToDay}
      onToday={() => {
        const length = Math.min(30, windowDays(dayWindow));
        const window = lastDays(length, minuteNow);
        openWindow(window, lastDaysKey(window, minuteNow));
        setSelectedDay(today);
      }}
    />
  );

  const toggleHighlight = (id: number) => setHighlight(h => (h === id ? null : id));

  const deleteSession = (session: PomodoroSession) =>
    sessionDeletes.schedule(session.id, "已删除 1 条记录");

  return (
    <div className="mx-auto flex h-full max-w-[1720px] flex-col px-[26px] pb-4">
      <div className="flex h-[48px] flex-none items-center gap-3">
        <h1 className="text-[19px] font-semibold tracking-[-0.01em]">番茄专注</h1>
        <span className="text-ink-2 text-tau-meta tabular-nums">
          今天 <b className="text-ink-1 font-semibold">{todaySessions.length}</b> 个
          <span className="text-ink-3 mx-2">·</span>
          <b className="text-ink-1 font-semibold">{formatDuration(sumFocus(todaySessions))}</b>
          {streak > 0 && (
            <>
              <span className="text-ink-3 mx-2">·</span>连续{" "}
              <b className="text-ink-1 font-semibold">
                {streak >= WINDOW_DAYS ? `${WINDOW_DAYS}+` : streak}
              </b>{" "}
              天
            </>
          )}
        </span>
        <span className="flex-1" />
        <Menu
          align="end"
          trigger={
            <IconButton aria-label="已归档的预设" title="已归档的预设">
              <Archive className="size-4" strokeWidth={1.75} />
            </IconButton>
          }
        >
          {archivedPresets.length === 0 ? (
            <Menu.Item disabled>没有归档的预设</Menu.Item>
          ) : (
            archivedPresets.map(preset => (
              <Menu.Submenu
                key={preset.id}
                label={preset.name}
                icon={<PresetDot presetId={preset.id} />}
              >
                <Menu.Item
                  icon={<ArchiveRestore className="size-[15px]" strokeWidth={1.75} />}
                  onSelect={() =>
                    void mutations
                      .setArchived(preset.id, false)
                      .then(() => toast.success(`已恢复「${preset.name}」`))
                  }
                >
                  恢复
                </Menu.Item>
                <Menu.Separator />
                <Menu.Item
                  danger
                  icon={<Trash2 className="size-[15px]" strokeWidth={1.75} />}
                  onSelect={() =>
                    presetDeletes.schedule(preset.id, `已删除「${preset.name}」，历史记录保留`)
                  }
                >
                  删除
                </Menu.Item>
              </Menu.Submenu>
            ))
          )}
        </Menu>
        <Button
          variant="primary"
          size="sm"
          icon={Plus}
          onClick={e => setEditor({ preset: null, anchor: e.currentTarget })}
        >
          新建预设
        </Button>
      </div>

      <ControlStrip
        presets={activePresets}
        session={live}
        timing={timing}
        presetName={liveName}
        onCreate={anchor => setEditor({ preset: null, anchor })}
        onEdit={(preset, anchor) => setEditor({ preset, anchor })}
        onArchive={archivePreset}
        onReorder={ids => void mutations.reorder(ids).catch(() => toast.error("排序失败"))}
      />

      <div className="bg-surface shadow-card mt-3.5 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px] overflow-hidden rounded-[18px]">
        {ledger.kind === "days" ? (
          <Ledger
            window={dayWindow}
            nav={rangeNav}
            now={now}
            days={windowDaysMap}
            presetsById={presets.byId}
            live={live}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            highlight={highlight}
            onToggleHighlight={toggleHighlight}
            onOpenSession={(session, anchor) => setPeek({ session, anchor })}
          />
        ) : (
          <section className="flex min-h-0 flex-col pb-3 pl-5 pr-2 pt-4">
            <LedgerHeader
              title="时间账本"
              nav={rangeNav}
              summary={`${allVisible.length} 个 · ${Math.round(sumFocus(allVisible) / HOUR_MS)} 小时`}
            />
            {all.loading ? (
              <Loading />
            ) : (
              <AllOverview
                sessions={allVisible}
                now={minuteNow}
                presetsById={presets.byId}
                highlight={highlight}
                selectedDay={selectedDay}
                onJumpToDay={jumpToDay}
                onOpenWindow={openWindow}
              />
            )}
            <PresetLegend
              sessions={allVisible}
              presetsById={presets.byId}
              highlight={highlight}
              onToggle={toggleHighlight}
              hint="点格子跳到那天 · 点年份 / 月份看那段时间 · 点图例高亮"
            />
          </section>
        )}
        <DayDetail
          dayStart={selectedDay}
          now={now}
          sessions={
            (ledger.kind === "all" ? allDays : windowDaysMap).get(selectedDay) ??
            recentDays.get(selectedDay) ??
            []
          }
          presetsById={presets.byId}
          live={selectedDay === today ? live : null}
          liveTiming={selectedDay === today ? timing : null}
          onEditFocus={(session, anchor) => setFocusEdit({ session, anchor })}
          onDelete={deleteSession}
        />
      </div>

      <PresetEditorPopover
        preset={editor?.preset ?? null}
        anchor={editor?.anchor ?? null}
        open={editor !== null}
        onOpenChange={open => !open && setEditor(null)}
        placement={editor?.preset ? "bottom-start" : "bottom-end"}
        onSubmit={submitPreset}
      />
      <FocusEditorPopover
        session={focusEdit?.session ?? null}
        anchor={focusEdit?.anchor ?? null}
        onClose={() => setFocusEdit(null)}
        onSubmit={(session, focusMs) => mutations.updateFocus(session.id, focusMs)}
      />
      <SessionPeekPopover
        session={peek?.session ?? null}
        anchor={peek?.anchor ?? null}
        now={now}
        preset={peek ? presets.byId.get(peek.session.presetId) : undefined}
        onClose={() => setPeek(null)}
        onEditFocus={(session, anchor) => setFocusEdit({ session, anchor })}
        onDelete={deleteSession}
      />
    </div>
  );
}
