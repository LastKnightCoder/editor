import { pomoText, pomoValue, usePomodoroI18n } from "./i18n";
// 预设编辑页（P3·独立编辑页）：名称 / 模式选择卡 / 时长步进；编辑态含归档开关与删除。
// 未保存离开不拦截（字段轻量，误退可重填），保存后回主页。

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, Minus, Plus, Timer, Trash2 } from "lucide-react";
import { CheckBubble } from "../../components/CheckBubble";
import { PageHeader } from "../../components/PageHeader";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";
import { toast } from "../../components/toast";
import { useEdgeFade } from "../../hooks/useScrollState";
import type { PomodoroMode } from "../../types";
import * as tauri from "../../services/tauri";
import { invalidatePomodoroQueries, usePomodoroPresets } from "./queries";

const QUICK_MINUTES = [15, 25, 45, 60];

type PresetEditPageProps = {
  /** -1 = 新建 */
  presetId: number;
  onBack: () => void;
  onError: (error: unknown, fallback: string) => void;
};

export function PresetEditPage({ presetId, onBack, onError }: PresetEditPageProps) {
  usePomodoroI18n();

  const isNew = presetId < 0;
  const presetsQuery = usePomodoroPresets();
  const preset = useMemo(
    () => (presetsQuery.data ?? []).find(item => item.id === presetId) ?? null,
    [presetsQuery.data, presetId]
  );
  const formScrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(formScrollRef);

  const [name, setName] = useState("");
  const [mode, setMode] = useState<PomodoroMode>("countdown");
  const [durationMin, setDurationMin] = useState(25);
  const [archived, setArchived] = useState(false);
  const [hydrated, setHydrated] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 编辑态：预设加载后填充表单
  useEffect(() => {
    if (isNew || hydrated || !preset) return;
    setName(preset.name);
    setMode(preset.mode);
    setDurationMin(preset.durationMin);
    setArchived(preset.archived);
    setHydrated(true);
  }, [isNew, hydrated, preset]);

  const canSave = hydrated && name.trim().length > 0 && !saving;

  // 编辑一个不存在的预设（已删除/参数过期）：表单无内容可填，提示后返回
  if (!isNew && presetsQuery.isSuccess && !preset) {
    return (
      <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
        <PageHeader title={pomoText("ui.editPreset")} onBack={onBack} />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8">
          <p className="text-ink-2 text-[13.5px] font-semibold">
            {pomoText("ui.thisPresetIsMissingOrHasBeenDeleted")}
          </p>
          <button type="button" onClick={onBack} className="text-accent mt-2 text-[13px] font-bold">
            {pomoText("ui.back")}
          </button>
        </div>
      </div>
    );
  }

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (isNew) {
        await tauri.pomodoroCreatePreset({
          name: name.trim(),
          mode,
          durationMin: mode === "countdown" ? durationMin : undefined,
        });
        toast.success(pomoText("ui.presetCreated"));
      } else {
        await tauri.pomodoroUpdatePreset({
          id: presetId,
          name: name.trim(),
          mode,
          // 正计时不读时长，保留原值（后端对 undefined 不更新该列）
          durationMin: mode === "countdown" ? durationMin : undefined,
        });
        if (preset && preset.archived !== archived) {
          await tauri.pomodoroArchivePreset(presetId, archived);
        }
        toast.success(pomoText("ui.saved"));
      }
      invalidatePomodoroQueries();
      onBack();
    } catch (error) {
      onError(
        error,
        isNew ? pomoText("ui.couldNotCreatePreset") : pomoText("ui.couldNotSavePreset")
      );
    } finally {
      setSaving(false);
    }
  };

  const modeCards: Array<{
    value: PomodoroMode;
    icon: typeof Timer;
    title: string;
    desc: string;
  }> = [
    {
      value: "countdown",
      icon: Timer,
      get title() {
        return pomoText("mode.countdown");
      },
      get desc() {
        return pomoText("ui.finishWhenTheTimerEnds");
      },
    },
    {
      value: "countup",
      icon: Plus,
      get title() {
        return pomoText("mode.countup");
      },
      get desc() {
        return pomoText("mode.manualHint");
      },
    },
  ];

  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      <PageHeader
        title={isNew ? pomoText("ui.newPreset") : pomoText("ui.editPreset")}
        onBack={onBack}
        actions={
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave}
            className={`text-accent px-2.5 py-2 text-sm font-bold ${canSave ? "" : "opacity-40"}`}
          >
            {saving ? pomoText("ui.saving") : pomoText("ui.save")}
          </button>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={formScrollRef}
          className="edge-fade-scroll mobile-page-scroll flex-1 overflow-y-auto overscroll-contain px-[18px]"
        >
          <section className="rounded-card bg-surface shadow-card mt-3 p-4">
            <label className="text-ink-3 mb-1.5 block text-[11.5px] font-extrabold">
              {pomoText("ui.name")}
            </label>
            <input
              type="text"
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder={pomoText("ui.eGDeepWork")}
              maxLength={20}
              className="input-base w-full px-3.5 py-3 font-bold"
            />
          </section>

          <section className="rounded-card bg-surface shadow-card mt-3 p-4">
            <p className="text-ink-3 mb-2.5 text-[11.5px] font-extrabold">{pomoText("ui.mode")}</p>
            <div className="flex flex-col gap-2.5">
              {modeCards.map(card => {
                const active = mode === card.value;
                const Icon = card.icon;
                return (
                  <button
                    key={card.value}
                    type="button"
                    onClick={() => setMode(card.value)}
                    className={`flex items-center gap-3 rounded-[16px] border-2 p-3 text-left transition-transform active:scale-[0.98] ${
                      active ? "" : "border-line-1"
                    }`}
                    style={
                      active
                        ? { borderColor: "var(--tau-accent)", background: "var(--tau-accent-soft)" }
                        : undefined
                    }
                  >
                    <span
                      className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[13px]"
                      style={{ background: "var(--tau-bg-page)" }}
                    >
                      <Icon size={19} className="text-ink-2" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-ink-1 block text-[13.5px] font-extrabold">
                        {card.title}
                      </span>
                      <span className="text-ink-3 mt-0.5 block text-[10.5px] font-semibold">
                        {card.desc}
                      </span>
                    </span>
                    {active ? <CheckBubble /> : null}
                  </button>
                );
              })}
            </div>
          </section>

          {mode === "countdown" ? (
            <section className="rounded-card bg-surface shadow-card mt-3 p-4">
              <p className="text-ink-3 mb-2.5 text-[11.5px] font-extrabold">
                {pomoText("ui.durationMinutes")}
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label={pomoText("ui.subtract5Minutes")}
                  onClick={() => setDurationMin(value => Math.max(1, value - 5))}
                  className="bg-page text-ink-1 grid h-11 w-11 place-items-center rounded-[15px] text-xl font-black"
                >
                  <Minus size={18} strokeWidth={3} />
                </button>
                <span className="text-ink-1 flex-1 text-center text-[21px] font-extrabold tabular-nums">
                  {durationMin}
                  <em className="text-ink-3 ml-1 text-[12px] font-bold not-italic">
                    {pomoText("unit.minutes")}
                  </em>
                </span>
                <button
                  type="button"
                  aria-label={pomoText("ui.add5Minutes")}
                  onClick={() => setDurationMin(value => Math.min(180, value + 5))}
                  className="bg-page text-ink-1 grid h-11 w-11 place-items-center rounded-[15px] text-xl font-black"
                >
                  <Plus size={18} strokeWidth={3} />
                </button>
              </div>
              <div className="mt-2.5 flex gap-2">
                {QUICK_MINUTES.map(minutes => (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() => setDurationMin(minutes)}
                    className={`flex-1 rounded-full border-[1.5px] py-2 text-[12px] font-extrabold tabular-nums ${
                      durationMin === minutes ? "border-transparent" : "border-line-1 text-ink-2"
                    }`}
                    style={
                      durationMin === minutes
                        ? {
                            borderColor: "var(--tau-accent)",
                            color: "var(--tau-accent)",
                            background: "var(--tau-accent-soft)",
                          }
                        : undefined
                    }
                  >
                    {minutes}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {!isNew ? (
            <>
              <section className="rounded-card bg-surface shadow-card mt-3 flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-ink-1 text-[13.5px] font-extrabold">
                    {pomoText("ui.archivePreset")}
                  </p>
                  <p className="text-ink-3 mt-0.5 text-[10.5px] font-semibold">
                    {pomoText("ui.hideFromTheListAndKeepHistory")}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={archived}
                  aria-label={pomoText("ui.archivePreset")}
                  onClick={() => setArchived(value => !value)}
                  className="relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors"
                  style={{ background: archived ? "var(--tau-accent)" : "var(--tau-line-1)" }}
                >
                  <span
                    className="shadow-card absolute top-[3px] h-5 w-5 rounded-full bg-white transition-all"
                    style={{ left: archived ? "21px" : "3px" }}
                  />
                </button>
              </section>

              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="bg-tag-5-soft text-tag-5 active:bg-hover mt-3 flex w-full items-center justify-center gap-2 rounded-[16px] py-3.5 text-[13.5px] font-extrabold"
              >
                <Trash2 size={15} />
                {pomoText("ui.deletePreset")}
              </button>

              <p className="text-ink-3 mt-3 flex items-center justify-center gap-1 text-[10.5px] font-semibold">
                <Archive size={11} />
                {pomoText("ui.youCanAlsoArchiveOrDeletePresetsFromTheir")}
              </p>
            </>
          ) : null}
        </div>
      </div>

      <MobileConfirmDialog
        open={confirmDelete}
        title={pomoText("ui.deletePreset")}
        description={pomoText("confirm.delete", {
          name: pomoValue(name || preset?.name || ""),
        })}
        confirmText={pomoText("ui.delete")}
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void (async () => {
            try {
              await tauri.pomodoroDeletePreset(presetId);
              invalidatePomodoroQueries();
              toast.success(pomoText("ui.deletedPreset"));
              onBack();
            } catch (error) {
              onError(error, pomoText("ui.couldNotDeletePreset"));
            }
          })();
        }}
      />
    </div>
  );
}
