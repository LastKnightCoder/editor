// 番茄专注主页（P1·清单式）：统计英雄卡 + 预设纵向列表 + 进行中横条。
// 计时 UI 由沉浸页（pomodoroFocus）承载；这里只做启动入口与进行中回跳。

import { useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { PageHeader, PageHeaderButton } from "../../components/PageHeader";
import { ActionSheet } from "../../components/ActionSheet";
import type { ActionSheetItem } from "../../components/ActionSheet";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";
import { useEdgeFade } from "../../hooks/useScrollState";
import { toast } from "../../components/toast";
import type { PomodoroPreset } from "../../types";
import * as tauri from "../../services/tauri";
import {
  splitPresets,
  usePomodoroPresets,
  usePomodoroTodaySummary,
  usePomodoroTotalSummary,
  usePomodoroWeeklySummary,
  invalidatePomodoroQueries,
} from "./queries";
import { usePomodoroController } from "./usePomodoroController";
import { formatClock, formatFocusDuration } from "./timer";

const PRESET_TONES = [
  { bg: "var(--tau-tag-1)", soft: "var(--tau-tag-1-soft)" },
  { bg: "var(--tau-tag-2)", soft: "var(--tau-tag-2-soft)" },
  { bg: "var(--tau-accent)", soft: "var(--tau-accent-soft)" },
  { bg: "var(--tau-tag-3)", soft: "var(--tau-tag-3-soft)" },
  { bg: "var(--tau-tag-4)", soft: "var(--tau-tag-4-soft)" },
  { bg: "var(--tau-tag-5)", soft: "var(--tau-tag-5-soft)" },
];

function presetTone(index: number) {
  return PRESET_TONES[index % PRESET_TONES.length];
}

type PomodoroPageProps = {
  onBack: () => void;
  onOpenFocus: () => void;
  onOpenHistory: () => void;
  onEditPreset: (presetId: number) => void;
  onCreatePreset: () => void;
  onError: (error: unknown, fallback: string) => void;
};

export function PomodoroPage({
  onBack,
  onOpenFocus,
  onOpenHistory,
  onEditPreset,
  onCreatePreset,
  onError,
}: PomodoroPageProps) {
  const listScrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(listScrollRef);

  const presetsQuery = usePomodoroPresets();
  const todaySummaryQuery = usePomodoroTodaySummary();
  const totalSummaryQuery = usePomodoroTotalSummary();
  const weeklySummaryQuery = usePomodoroWeeklySummary();

  const presets = presetsQuery.data ?? [];
  const { active: activePresets, archived: archivedPresets } = useMemo(
    () => splitPresets(presets),
    [presets]
  );
  const controller = usePomodoroController(presets, onError);

  const [morePreset, setMorePreset] = useState<PomodoroPreset | null>(null);
  const [deletePreset, setDeletePreset] = useState<PomodoroPreset | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);

  const todaySummary = todaySummaryQuery.data;
  const weeklyFocusMs = useMemo(
    () => (weeklySummaryQuery.data ?? []).reduce((sum, day) => sum + day.focusMs, 0),
    [weeklySummaryQuery.data]
  );

  const startPreset = (preset: PomodoroPreset) => {
    if (controller.session) {
      toast({ type: "info", text: "已有进行中的专注" });
      onOpenFocus();
      return;
    }
    // start 内部完成后端建会话并 refetch 活动会话；成功后再推入沉浸页
    void controller.start(preset).then(started => {
      if (started) onOpenFocus();
    });
  };

  const movePreset = async (preset: PomodoroPreset, direction: -1 | 1) => {
    const index = activePresets.findIndex(item => item.id === preset.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= activePresets.length) return;
    const next = [...activePresets];
    [next[index], next[target]] = [next[target], next[index]];
    try {
      await tauri.pomodoroReorderPresets(next.map(item => item.id));
      invalidatePomodoroQueries();
    } catch (error) {
      onError(error, "调整预设顺序失败");
    }
  };

  const toggleArchive = async (preset: PomodoroPreset) => {
    try {
      await tauri.pomodoroArchivePreset(preset.id, !preset.archived);
      invalidatePomodoroQueries();
    } catch (error) {
      onError(error, preset.archived ? "取消归档失败" : "归档预设失败");
    }
  };

  const moreItems = (preset: PomodoroPreset): ActionSheetItem[] => {
    const orderActions: ActionSheetItem[] = preset.archived
      ? [
          {
            label: "取消归档",
            icon: <ArchiveRestore size={16} />,
            onClick: () => {
              setMorePreset(null);
              void toggleArchive(preset);
            },
          },
        ]
      : [
          {
            label: "上移",
            icon: <ChevronUp size={16} />,
            onClick: () => {
              setMorePreset(null);
              void movePreset(preset, -1);
            },
          },
          {
            label: "下移",
            icon: <ChevronDown size={16} />,
            onClick: () => {
              setMorePreset(null);
              void movePreset(preset, 1);
            },
          },
          {
            label: "归档预设",
            icon: <Archive size={16} />,
            onClick: () => {
              setMorePreset(null);
              void toggleArchive(preset);
            },
          },
        ];
    return [
      {
        label: "编辑预设",
        icon: <Pencil size={16} />,
        onClick: () => {
          setMorePreset(null);
          onEditPreset(preset.id);
        },
      },
      ...orderActions,
      {
        label: "删除预设",
        icon: <Trash2 size={16} />,
        danger: true,
        onClick: () => {
          setMorePreset(null);
          setDeletePreset(preset);
        },
      },
    ];
  };

  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      <PageHeader
        title="番茄专注"
        onBack={onBack}
        actions={
          <>
            <PageHeaderButton
              icon={<Clock size={17} strokeWidth={2} />}
              aria-label="专注记录"
              onClick={onOpenHistory}
            />
            <PageHeaderButton
              icon={<Plus size={18} strokeWidth={2.6} />}
              variant="brand"
              aria-label="新建预设"
              onClick={onCreatePreset}
            />
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overscroll-contain">
        <div
          ref={listScrollRef}
          className="edge-fade-scroll mobile-page-scroll flex-1 overflow-y-auto"
        >
          {/* 进行中横条：点击回沉浸页 */}
          {controller.session ? (
            <button
              type="button"
              onClick={onOpenFocus}
              className="shadow-card mx-[18px] mt-3 flex w-[calc(100%-36px)] items-center gap-3 rounded-[18px] px-4 py-3 text-left transition-transform active:scale-[0.98]"
              style={{
                background:
                  "linear-gradient(135deg, var(--tau-accent-soft), var(--tau-bg-surface))",
              }}
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  controller.isRunning ? "animate-pulse" : ""
                }`}
                style={{
                  background: controller.isRunning ? "var(--tau-accent)" : "var(--tau-tag-4)",
                }}
              />
              <span className="text-ink-1 min-w-0 flex-1 truncate text-[13.5px] font-bold">
                {controller.preset?.name ?? "专注中"}
                <span className="text-ink-3 ml-2 text-[11px] font-semibold">
                  {controller.isPaused ? "已暂停" : "专注中"}
                </span>
              </span>
              <span className="text-accent shrink-0 text-[19px] font-extrabold tabular-nums">
                {formatClock(controller.tick?.remainMs ?? controller.tick?.elapsedMs ?? 0)}
              </span>
              <ChevronRight size={16} className="text-ink-3 shrink-0" />
            </button>
          ) : null}

          {/* 统计英雄卡 + 概览小格 */}
          <div className="grid grid-cols-2 gap-[11px] px-[18px] pt-3">
            <button
              type="button"
              onClick={onOpenHistory}
              className="rounded-bento shadow-card col-span-2 flex items-center gap-[15px] p-4 text-left transition-transform duration-200 active:scale-[0.97]"
              style={{
                background:
                  "linear-gradient(135deg, var(--tau-accent-soft), var(--tau-tag-5-soft))",
              }}
            >
              <span className="text-[30px] leading-none">🍅</span>
              <span className="min-w-0 flex-1">
                <span className="text-accent flex items-baseline gap-1 text-[30px] font-extrabold tabular-nums leading-none">
                  {todaySummary ? formatFocusDuration(todaySummary.focusMs) : "…"}
                </span>
                <span className="text-ink-2 mt-1 block text-[12px]">
                  {todaySummary
                    ? `今日 ${todaySummary.count} 个番茄${todaySummary.count === 0 ? " · 开始一次专注吧" : ""}`
                    : "加载中"}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={onOpenHistory}
              className="rounded-bento bg-tag-2-soft shadow-card p-4 text-left transition-transform duration-200 active:scale-[0.97]"
            >
              <span className="text-tag-2 block text-[21px] font-extrabold tabular-nums leading-tight">
                {weeklySummaryQuery.isLoading ? "…" : formatFocusDuration(weeklyFocusMs)}
              </span>
              <span className="text-ink-2 mt-0.5 block text-[11.5px]">本周专注</span>
            </button>
            <button
              type="button"
              onClick={onOpenHistory}
              className="rounded-bento bg-tag-3-soft shadow-card p-4 text-left transition-transform duration-200 active:scale-[0.97]"
            >
              <span className="text-tag-3 block text-[21px] font-extrabold tabular-nums leading-tight">
                {totalSummaryQuery.isLoading
                  ? "…"
                  : formatFocusDuration(totalSummaryQuery.data?.focusMs ?? 0)}
              </span>
              <span className="text-ink-2 mt-0.5 block text-[11.5px]">
                累计 {totalSummaryQuery.data?.count ?? "…"} 次
              </span>
            </button>
          </div>

          {/* 预设列表（清单式，与任务中心同构） */}
          <div className="mb-1.5 mt-5 flex items-baseline justify-between px-[19px]">
            <h2 className="text-ink-1 text-[16.5px] font-extrabold">预设</h2>
          </div>
          <div className="list-group mx-[18px]">
            {presetsQuery.isLoading ? (
              <p className="text-ink-3 px-4 py-6 text-center text-sm">正在加载预设...</p>
            ) : activePresets.length === 0 ? (
              <div className="px-4 py-7 text-center">
                <p className="text-ink-2 text-[13px] font-semibold">还没有专注预设</p>
                <button
                  type="button"
                  onClick={onCreatePreset}
                  className="text-accent mt-2 text-[13px] font-bold"
                >
                  新建一个，比如「深度工作 25 分钟」 ›
                </button>
              </div>
            ) : (
              activePresets.map((preset, index) => {
                const tone = presetTone(index);
                const running = controller.session?.presetId === preset.id;
                return (
                  <div
                    key={preset.id}
                    className="border-line-1 flex items-center gap-3 border-b border-dashed px-3.5 py-3 last:border-b-0"
                  >
                    <button
                      type="button"
                      aria-label={running ? "查看专注" : `开始 ${preset.name}`}
                      onClick={() => (running ? onOpenFocus() : startPreset(preset))}
                      className="text-ink-inverse grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full transition-transform active:scale-90"
                      style={{ background: tone.bg, boxShadow: "var(--tau-shadow-lift)" }}
                    >
                      {running ? (
                        <Pause size={15} fill="currentColor" />
                      ) : (
                        <Play size={15} fill="currentColor" className="ml-0.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => (running ? onOpenFocus() : startPreset(preset))}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="text-ink-1 flex items-center gap-1.5 text-[13.5px] font-extrabold">
                        <span className="truncate">{preset.name}</span>
                        {running ? (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[9.5px] font-bold leading-none"
                            style={{
                              background: "var(--tau-accent-soft)",
                              color: "var(--tau-accent)",
                            }}
                          >
                            {controller.isPaused ? "已暂停" : "进行中"}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-ink-3 mt-0.5 block text-[10.5px] font-semibold tabular-nums">
                        {preset.mode === "countdown"
                          ? `倒计时 · ${preset.durationMin} 分钟`
                          : "正计时 · 不限时"}
                        {running && controller.tick
                          ? ` · ${formatClock(controller.tick.remainMs ?? controller.tick.elapsedMs)}`
                          : ""}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`${preset.name} 更多操作`}
                      onClick={() => setMorePreset(preset)}
                      className="text-ink-3 grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* 已归档分区：归档预设的唯一回收入口（编辑页归档开关 / ⋯ 取消归档） */}
          {archivedPresets.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => setArchivedOpen(value => !value)}
                className="text-ink-3 mx-[19px] mt-3 flex items-center gap-1.5 text-[11.5px] font-extrabold"
              >
                <Archive size={12} />
                已归档（{archivedPresets.length}）
                <ChevronDown
                  size={13}
                  className={`transition-transform ${archivedOpen ? "" : "-rotate-90"}`}
                />
              </button>
              {archivedOpen ? (
                <div className="list-group mx-[18px] mt-2">
                  {archivedPresets.map(preset => (
                    <div
                      key={preset.id}
                      className="border-line-1 flex items-center gap-3 border-b border-dashed px-3.5 py-3 last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => onEditPreset(preset.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="text-ink-3 block truncate text-[13px] font-bold">
                          {preset.name}
                        </span>
                        <span className="text-ink-3 mt-0.5 block text-[10.5px] font-semibold tabular-nums">
                          {preset.mode === "countdown"
                            ? `倒计时 · ${preset.durationMin} 分钟`
                            : "正计时 · 不限时"}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`${preset.name} 更多操作`}
                        onClick={() => setMorePreset(preset)}
                        className="text-ink-3 grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          <button
            type="button"
            onClick={onOpenHistory}
            className="text-ink-2 active:bg-hover mx-[18px] mt-3 flex w-[calc(100%-36px)] items-center justify-center gap-1.5 rounded-[16px] py-3 text-[12.5px] font-bold"
          >
            <Clock size={14} />
            全部专注记录
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <ActionSheet
        open={morePreset != null}
        title={morePreset?.name}
        kind="预设"
        items={morePreset ? moreItems(morePreset) : []}
        onClose={() => setMorePreset(null)}
      />

      <MobileConfirmDialog
        open={deletePreset != null}
        title="删除预设"
        description={`删除「${deletePreset?.name ?? ""}」？该操作不可恢复，历史记录将显示为「已删除预设」。`}
        confirmText="删除"
        danger
        onCancel={() => setDeletePreset(null)}
        onConfirm={() => {
          const target = deletePreset;
          setDeletePreset(null);
          if (!target) return;
          void (async () => {
            try {
              await tauri.pomodoroDeletePreset(target.id);
              invalidatePomodoroQueries();
              toast.success("已删除预设");
            } catch (error) {
              onError(error, "删除预设失败");
            }
          })();
        }}
      />
    </div>
  );
}
