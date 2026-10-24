// 日记标签浮层：编辑单条日记（segment）的标签（勾选式，即时落库）+ 标签库管理
// （新增 / 改名 / 改色 / 删除，删除与改名由后端事务级联到所有日记片段）。
// 对齐桌面端设计：日记、周记、月记只是日记的标签，筛选与管理均以标签库为单一数据源。
// 产品设计：标签与具体 segment 绑定，一天的多条日记各自独立打标签；
// 落库走 diary_update_tags(segmentId)，不要改回按 entry 更新（旧模型会整天共享标签）。

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMemoizedFn } from "ahooks";
import { Check, Palette, Plus, TagIcon, Trash2 } from "lucide-react";
import type { DiaryEntry, DiarySegment, DiaryTagSetting } from "../../types";
import { BottomSheet } from "../../components/BottomSheet";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";
import * as tauri from "../../services/tauri";
import { writeDiaryEntries, writeDiaryTagSettings } from "./queries";

/** 与桌面端 MomentCard 一致的预设色板 */
export const PRESET_TAG_COLORS = [
  "#1890ff",
  "#52c41a",
  "#fa8c16",
  "#eb2f96",
  "#722ed1",
  "#13c2c2",
  "#f5222d",
  "#faad14",
  "#2f54eb",
  "#a0d911",
  "#fadb14",
  "#ff7a45",
];

export const FALLBACK_TAG_COLOR = "#8c8c8c";

export function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 浅色标签直接当文字色会看不清：亮度高的色改用主题墨色文字、底色加深 */
export function isLightColor(hex: string): boolean {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}

/** 新标签按名字哈希取色，同名稳定不闪烁 */
export function pickPresetColor(name: string): string {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return PRESET_TAG_COLORS[hash % PRESET_TAG_COLORS.length] ?? "#1890ff";
}

/** 带色标签 chip：卡片展示与浮层内共用，onclick 存在时可点击 */
export function DiaryTagChip({
  tag,
  color,
  onClick,
  trailing,
  muted = false,
}: {
  tag: string;
  color: string;
  onClick?: () => void;
  trailing?: ReactNode;
  muted?: boolean;
}) {
  const content = (
    <>
      <span
        aria-hidden
        className="h-[6px] w-[6px] shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      {tag}
      {trailing}
    </>
  );
  const light = isLightColor(color);
  const className = `inline-flex items-center gap-[5px] rounded-full px-2.5 py-[3px] text-[10.5px] font-bold transition-colors ${
    muted ? "bg-page text-ink-3" : light ? "text-ink-1" : ""
  }`;
  const style = muted
    ? undefined
    : { backgroundColor: hexToRgba(color, light ? 0.32 : 0.14), color: light ? undefined : color };
  return onClick ? (
    <button type="button" onClick={onClick} className={className} style={style}>
      {content}
    </button>
  ) : (
    <span className={className} style={style}>
      {content}
    </span>
  );
}

function ColorPalette({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {PRESET_TAG_COLORS.map(color => (
        <button
          key={color}
          type="button"
          aria-label={`颜色 ${color}`}
          onClick={() => onChange(color)}
          className={`active:scale-88 grid h-[30px] w-[30px] place-items-center rounded-full transition-transform ${
            value.toLowerCase() === color
              ? "ring-accent ring-offset-surface ring-2 ring-offset-2"
              : ""
          }`}
          style={{ backgroundColor: color }}
        >
          {value.toLowerCase() === color ? (
            <Check size={14} strokeWidth={3} className="text-white" aria-hidden />
          ) : null}
        </button>
      ))}
    </div>
  );
}

type SheetErrorReporter = (error: unknown, fallback: string) => void;

type DiaryTagEditorSheetProps = {
  open: boolean;
  /** segment 所属 entry，仅用于在缓存中定位并回写该片段 */
  entry: DiaryEntry | null;
  segment: DiarySegment | null;
  tagSettings: DiaryTagSetting[];
  onClose: () => void;
  onOpenManage: () => void;
  onError: SheetErrorReporter;
};

/** 编辑单条日记（segment）的标签：全部标签以 chip 呈现，点击切换选中，即时落库（串行写队列） */
export function DiaryTagEditorSheet({
  open,
  entry,
  segment,
  tagSettings,
  onClose,
  onOpenManage,
  onError,
}: DiaryTagEditorSheetProps) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  // 连续增删必须串行落库：并发写会互相用旧列表覆盖新结果
  const queueRef = useRef(Promise.resolve());
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const segmentRef = useRef(segment);
  segmentRef.current = segment;

  useEffect(() => {
    if (!open) {
      setDraft("");
    }
  }, [open]);

  const enqueue = (task: () => Promise<void>) => {
    const next = queueRef.current.then(task).catch(error => {
      onErrorRef.current(error, "标签保存失败");
    });
    queueRef.current = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  };

  /** 乐观更新缓存中该 segment 的标签（只动这一个片段，同天其他片段不受影响） */
  const patchSegmentTags = (segmentId: number, nextTags: string[]) => {
    writeDiaryEntries(prev =>
      prev.map(item =>
        item.id === entryRef.current?.id
          ? {
              ...item,
              segments: item.segments.map(seg =>
                seg.id === segmentId ? { ...seg, tags: nextTags } : seg
              ),
            }
          : item
      )
    );
  };

  const writeSegmentTags = (nextTags: string[], rollbackTags?: string[]) => {
    const currentSegment = segmentRef.current;
    if (!currentSegment) return;
    patchSegmentTags(currentSegment.id, nextTags);
    void enqueue(async () => {
      try {
        const saved = await tauri.diaryUpdateTags({
          segmentId: currentSegment.id,
          tags: nextTags,
        });
        writeDiaryEntries(prev => prev.map(item => (item.id === saved.id ? saved : item)));
      } catch (error) {
        if (rollbackTags) {
          patchSegmentTags(currentSegment.id, rollbackTags);
        }
        throw error;
      }
    });
  };

  const toggleTag = useMemoizedFn((tag: string) => {
    const currentSegment = segmentRef.current;
    if (!currentSegment) return;
    const has = currentSegment.tags.includes(tag);
    writeSegmentTags(
      has ? currentSegment.tags.filter(item => item !== tag) : [...currentSegment.tags, tag],
      currentSegment.tags
    );
  });

  const submitDraft = () => {
    const name = draft.trim().replace(/^#/, "");
    const currentSegment = segmentRef.current;
    if (!currentSegment || !name || saving) return;
    setSaving(true);
    const task = async () => {
      if (!tagSettings.some(setting => setting.name === name)) {
        const settings = await tauri.diaryUpsertTagSetting({
          name,
          color: pickPresetColor(name),
        });
        writeDiaryTagSettings(settings);
      }
      if (!currentSegment.tags.includes(name)) {
        patchSegmentTags(currentSegment.id, [...currentSegment.tags, name]);
        const saved = await tauri.diaryUpdateTags({
          segmentId: currentSegment.id,
          tags: [...currentSegment.tags, name],
        });
        writeDiaryEntries(prev => prev.map(item => (item.id === saved.id ? saved : item)));
      }
    };
    void enqueue(task).finally(() => {
      setSaving(false);
      setDraft("");
    });
  };

  // 展示集 = 标签库 + 片段上不在库里的孤儿标签（历史数据），后者也可点击摘除
  const allTagNames = useMemo(() => {
    const known = new Set(tagSettings.map(setting => setting.name));
    const orphans = (segment?.tags ?? []).filter(tag => !known.has(tag));
    return [...tagSettings.map(setting => setting.name), ...orphans];
  }, [tagSettings, segment]);
  const colorOf = useMemoizedFn(
    (tag: string) =>
      tagSettings.find(setting => setting.name === tag)?.color ?? pickPresetColor(tag)
  );

  return (
    <BottomSheet open={open} title="编辑标签" onClose={onClose}>
      {segment ? (
        <>
          <p className="text-ink-3 text-[12.5px]">点击标签为这篇日记添加或移除</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {allTagNames.map(name => {
              const selected = segment.tags.includes(name);
              return (
                <DiaryTagChip
                  key={name}
                  tag={name}
                  color={colorOf(name)}
                  muted={!selected}
                  onClick={() => toggleTag(name)}
                  trailing={selected ? <Check size={11} strokeWidth={3} aria-hidden /> : undefined}
                />
              );
            })}
            {allTagNames.length === 0 ? (
              <p className="text-ink-3 text-[12.5px]">还没有标签，先在下面创建一个</p>
            ) : null}
          </div>

          <div className="border-line-1 bg-page mt-4 flex items-center gap-[1px] rounded-full border-[1.5px] border-solid px-3 py-[7px]">
            <span className="text-accent mr-[2px] text-[11px] font-bold" aria-hidden>
              #
            </span>
            <input
              value={draft}
              disabled={saving}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitDraft();
                }
              }}
              placeholder="新标签名"
              enterKeyHint="done"
              className="text-ink-1 caret-accent placeholder:text-ink-3 input-text min-w-0 flex-1 bg-transparent outline-none"
            />
            <button
              type="button"
              onClick={submitDraft}
              disabled={saving || !draft.trim()}
              className="border-accent text-accent ml-1 inline-flex items-center gap-[3px] rounded-full border-[1.5px] border-solid px-2.5 py-[4px] text-[12px] font-semibold disabled:opacity-40"
            >
              <Plus size={12.5} strokeWidth={2.5} />
              添加
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenManage}
            className="bg-page text-ink-2 mt-4 flex w-full items-center justify-center gap-1.5 rounded-2xl py-2.5 text-[13px] font-semibold transition-transform active:scale-[0.98]"
          >
            <TagIcon size={15} strokeWidth={2} aria-hidden />
            管理标签库
          </button>
        </>
      ) : null}
    </BottomSheet>
  );
}

type DiaryTagManageSheetProps = {
  open: boolean;
  tagSettings: DiaryTagSetting[];
  usageCount: (tag: string) => number;
  onClose: () => void;
  onError: SheetErrorReporter;
};

type EditState = {
  /** null = 无编辑；name = 正在编辑该标签（改名 + 改色） */
  editing: string | null;
  draftName: string;
  draftColor: string;
  creating: boolean;
};

/** 标签库管理：新增 / 改名 / 改色 / 删除（改名删除由后端事务级联所有日记） */
export function DiaryTagManageSheet({
  open,
  tagSettings,
  usageCount,
  onClose,
  onError,
}: DiaryTagManageSheetProps) {
  const [edit, setEdit] = useState<EditState>({
    editing: null,
    draftName: "",
    draftColor: FALLBACK_TAG_COLOR,
    creating: false,
  });
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const resetEdit = () =>
    setEdit({ editing: null, draftName: "", draftColor: FALLBACK_TAG_COLOR, creating: false });

  useEffect(() => {
    if (!open) {
      resetEdit();
      setDeleteTarget(null);
    }
  }, [open]);

  const run = async (fallback: string, task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await task();
    } catch (error) {
      onErrorRef.current(error, fallback);
    } finally {
      setBusy(false);
    }
  };

  const startCreate = () =>
    setEdit({
      editing: null,
      draftName: "",
      draftColor: pickPresetColor("新标签"),
      creating: true,
    });

  const submitCreate = () =>
    run("新增标签失败", async () => {
      const name = edit.draftName.trim().replace(/^#/, "");
      if (!name) return;
      const settings = await tauri.diaryUpsertTagSetting({
        name,
        color: edit.draftColor,
      });
      writeDiaryTagSettings(settings);
      resetEdit();
    });

  const startEdit = (setting: DiaryTagSetting) =>
    setEdit({
      editing: setting.name,
      draftName: setting.name,
      draftColor: setting.color,
      creating: false,
    });

  const submitRename = () =>
    run("标签修改失败", async () => {
      const current = edit.editing;
      const name = edit.draftName.trim().replace(/^#/, "");
      if (!current || !name || name === current) {
        resetEdit();
        return;
      }
      const settings = await tauri.diaryRenameTagSetting({ name: current, newName: name });
      writeDiaryTagSettings(settings);
      // 标签挂在片段上：级联改的是各 entry 内 segment.tags（去重保序）
      writeDiaryEntries(prev =>
        prev.map(entry => {
          if (!entry.segments.some(seg => seg.tags.includes(current))) return entry;
          return {
            ...entry,
            segments: entry.segments.map(seg =>
              seg.tags.includes(current)
                ? {
                    ...seg,
                    tags: [...new Set(seg.tags.map(tag => (tag === current ? name : tag)))],
                  }
                : seg
            ),
          };
        })
      );
      resetEdit();
    });

  const submitRecolor = (color: string) =>
    run("标签修改失败", async () => {
      const current = edit.editing;
      if (!current) return;
      setEdit(prev => ({ ...prev, draftColor: color }));
      const settings = await tauri.diaryUpsertTagSetting({ name: current, color });
      writeDiaryTagSettings(settings);
    });

  const submitDelete = () =>
    run("标签删除失败", async () => {
      const target = deleteTarget;
      setDeleteTarget(null);
      if (!target) return;
      const settings = await tauri.diaryDeleteTagSetting(target);
      writeDiaryTagSettings(settings);
      writeDiaryEntries(prev =>
        prev.map(entry => {
          if (!entry.segments.some(seg => seg.tags.includes(target))) return entry;
          return {
            ...entry,
            segments: entry.segments.map(seg =>
              seg.tags.includes(target)
                ? { ...seg, tags: seg.tags.filter(tag => tag !== target) }
                : seg
            ),
          };
        })
      );
      if (edit.editing === target) {
        resetEdit();
      }
    });

  const editingSetting = useMemo(
    () => tagSettings.find(setting => setting.name === edit.editing) ?? null,
    [tagSettings, edit.editing]
  );

  return (
    <BottomSheet open={open} title="管理标签" onClose={onClose}>
      <div className="space-y-2.5">
        {tagSettings.map(setting => {
          if (editingSetting?.name === setting.name) {
            return (
              <div key={setting.name} className="bg-page rounded-2xl p-3.5">
                <div className="flex items-center gap-2">
                  <input
                    value={edit.draftName}
                    autoFocus
                    onChange={event =>
                      setEdit(prev => ({ ...prev, draftName: event.target.value }))
                    }
                    onKeyDown={event => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        submitRename();
                      }
                    }}
                    placeholder="标签名"
                    enterKeyHint="done"
                    className="input-base bg-surface min-w-0 flex-1 px-3 font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(setting.name)}
                    aria-label={`删除标签 ${setting.name}`}
                    className="bg-surface text-tag-5 active:scale-88 grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-transform"
                  >
                    <Trash2 size={16} strokeWidth={2} aria-hidden />
                  </button>
                </div>
                <div className="text-ink-3 mt-3 flex items-center gap-2 text-[11.5px] font-semibold">
                  <Palette size={13} strokeWidth={2} aria-hidden />
                  颜色
                </div>
                <div className="mt-2">
                  <ColorPalette
                    value={edit.draftColor}
                    onChange={color => void submitRecolor(color)}
                  />
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={resetEdit}
                    className="bg-surface text-ink-2 flex-1 rounded-xl py-2.5 text-[13px] font-semibold transition-transform active:scale-[0.98]"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={submitRename}
                    disabled={busy || !edit.draftName.trim()}
                    className="bg-accent text-ink-inverse flex-1 rounded-xl py-2.5 text-[13px] font-semibold transition-transform active:scale-[0.98] disabled:opacity-40"
                  >
                    保存
                  </button>
                </div>
              </div>
            );
          }
          return (
            <button
              key={setting.name}
              type="button"
              onClick={() => startEdit(setting)}
              className="bg-page flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-transform active:scale-[0.985]"
            >
              <span
                aria-hidden
                className="h-[11px] w-[11px] shrink-0 rounded-full"
                style={{ backgroundColor: setting.color }}
              />
              <span className="text-ink-1 min-w-0 flex-1 truncate text-[14px] font-semibold">
                {setting.name}
              </span>
              <span className="text-ink-3 shrink-0 text-[12px] tabular-nums">
                {usageCount(setting.name)} 篇
              </span>
            </button>
          );
        })}

        {edit.creating ? (
          <div className="bg-page rounded-2xl p-3.5">
            <div className="flex items-center gap-2">
              <input
                value={edit.draftName}
                autoFocus
                onChange={event => setEdit(prev => ({ ...prev, draftName: event.target.value }))}
                onKeyDown={event => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitCreate();
                  }
                }}
                placeholder="新标签名"
                enterKeyHint="done"
                className="input-base bg-surface min-w-0 flex-1 px-3 font-semibold"
              />
            </div>
            <div className="text-ink-3 mt-3 flex items-center gap-2 text-[11.5px] font-semibold">
              <Palette size={13} strokeWidth={2} aria-hidden />
              颜色
            </div>
            <div className="mt-2">
              <ColorPalette
                value={edit.draftColor}
                onChange={color => setEdit(prev => ({ ...prev, draftColor: color }))}
              />
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={resetEdit}
                className="bg-surface text-ink-2 flex-1 rounded-xl py-2.5 text-[13px] font-semibold transition-transform active:scale-[0.98]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitCreate}
                disabled={busy || !edit.draftName.trim()}
                className="bg-accent text-ink-inverse flex-1 rounded-xl py-2.5 text-[13px] font-semibold transition-transform active:scale-[0.98] disabled:opacity-40"
              >
                添加
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={startCreate}
            className="border-line-1 text-ink-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed py-3 text-[13px] font-semibold transition-transform active:scale-[0.98]"
          >
            <Plus size={15} strokeWidth={2.2} aria-hidden />
            新增标签
          </button>
        )}

        {tagSettings.length === 0 && !edit.creating ? (
          <p className="text-ink-3 pb-1 text-center text-[12.5px]">
            还没有标签；也可以在编辑日记标签时输入新名字自动创建
          </p>
        ) : null}
      </div>

      <MobileConfirmDialog
        open={deleteTarget !== null}
        title="删除标签"
        description={`「${deleteTarget ?? ""}」将从标签库和 ${deleteTarget ? usageCount(deleteTarget) : 0} 篇日记中移除。`}
        danger
        loading={busy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void submitDelete()}
      />
    </BottomSheet>
  );
}
