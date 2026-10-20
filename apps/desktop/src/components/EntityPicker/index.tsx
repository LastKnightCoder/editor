/**
 * EntityPicker —— 「关联已有」的公共检索弹窗：类型分段 + 关键字检索（空关键字按最近更新）。
 *
 * - 数据：主进程 `entity:search`（卡片 / 文章 / 项目文档 / 项目 / 白板 / 日记，以及问题页用的划线 / PDF 标注 / 剪藏 / 对话），调用方用 kinds 限定可选类型
 * - 多种类型时首项为「全部」（各类型合并按最近更新），默认选中
 * - 选项（含「全部」）不超过 5 个用分段，更多时改为按钮 + 菜单（分段放不下）
 * - 多选（默认）：勾选跨类型累积，底部「已选 N 项」+ 确认；单选：点行即确认
 * - isLinked 判定的项置灰并标「已关联」，不可再选
 * - 键盘：焦点留在搜索框，↑↓ 移动、⏎ 勾选（单选即确认）、⌘/Ctrl+⏎ 确认
 * - onConfirm 抛错时弹窗保持打开（失败提示由调用方给出）
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, LayoutGrid, Search } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDebounce } from "ahooks";
import {
  Button,
  Dialog,
  DialogBody,
  Input,
  Loading,
  Menu,
  Segmented,
  cn,
  useEdgeFade,
} from "@tau/ui";
import { searchEntities } from "@/commands";
import type { EntityCandidate, EntityKind } from "@/types";
import { ENTITY_KIND_META, entityKey, entityTime } from "./meta";
import { EntityKindIcon } from "@/components/EntityKind/EntityKindIcon";

const MAX_SEGMENTS = 5;

const ALL = "all";
type KindTab = EntityKind | typeof ALL;
const ALL_META = { label: "全部", noun: "内容", icon: LayoutGrid };
const tabMeta = (tab: KindTab) =>
  tab === ALL ? ALL_META : { ...ENTITY_KIND_META[tab], noun: ENTITY_KIND_META[tab].label };

export interface EntityPickerProps {
  open: boolean;
  onClose(): void;
  title: string;
  /** 关联对象（问题标题、任务标题等） */
  subtitle?: string;
  /** 可选类型，顺序即分段顺序；只有一种时不显示分段 */
  kinds: EntityKind[];
  /** 默认 true */
  multiple?: boolean;
  isLinked?(candidate: EntityCandidate): boolean;
  /** 确认按钮文案（默认「关联」） */
  confirmLabel?: string;
  /** 底部左侧说明（多选时位于已选计数之后） */
  hint?: ReactNode;
  onConfirm(picked: EntityCandidate[]): Promise<void> | void;
}

export function EntityPicker({
  open,
  onClose,
  title,
  subtitle,
  kinds,
  multiple = true,
  isLinked,
  confirmLabel = "关联",
  hint,
  onConfirm,
}: EntityPickerProps) {
  const tabs: KindTab[] = kinds.length > 1 ? [ALL, ...kinds] : kinds;
  const [kind, setKind] = useState<KindTab>(tabs[0]);
  const [keyword, setKeyword] = useState("");
  const debounced = useDebounce(keyword, { wait: 200 });
  const [picked, setPicked] = useState<Map<string, EntityCandidate>>(() => new Map());
  const [active, setActive] = useState(0);
  const [saving, setSaving] = useState(false);
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(listEl);
  const now = useRef(Date.now());

  const { data, isPending } = useQuery({
    queryKey: ["entity-search", kind === ALL ? kinds : kind, debounced],
    queryFn: async () => ({
      kind,
      list: await searchEntities({ kind: kind === ALL ? kinds : kind, keyword: debounced }),
    }),
    enabled: open,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
  // 切类型时旧类型的结果不作占位（keepPreviousData 只用于连续输入）
  const items = data?.kind === kind ? data.list : undefined;

  useEffect(() => {
    if (!open) return;
    setKeyword("");
    setPicked(new Map());
    setKind(tabs[0]);
    now.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => setActive(0), [kind, debounced]);

  /* 键盘移动后把活动行滚入视野 */
  useEffect(() => {
    listEl?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, listEl]);

  const confirm = async (targets: EntityCandidate[]) => {
    if (!targets.length) return;
    setSaving(true);
    try {
      await onConfirm(targets);
      onClose();
    } catch {
      // 失败提示由调用方给出，弹窗保持打开以便重试
    } finally {
      setSaving(false);
    }
  };

  const choose = (candidate: EntityCandidate) => {
    if (isLinked?.(candidate)) return;
    if (!multiple) {
      void confirm([candidate]);
      return;
    }
    const key = entityKey(candidate);
    setPicked(prev => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, candidate);
      return next;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    const count = items?.length ?? 0;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (count) setActive(i => (i + (e.key === "ArrowDown" ? 1 : count - 1)) % count);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (multiple && (e.metaKey || e.ctrlKey)) void confirm([...picked.values()]);
      else if (items?.[active]) choose(items[active]);
    }
  };

  const meta = tabMeta(kind);

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onClose()}
      title={title}
      subtitle={subtitle}
      locked={saving}
      width={720}
      footer={
        <>
          <span className="text-ink-2 mr-auto flex items-center gap-3 text-[12.5px]">
            {multiple && (picked.size ? `已选 ${picked.size} 项` : "未选择")}
            {hint && <span className="text-ink-3 text-[12px]">{hint}</span>}
          </span>
          <Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>
            取消
          </Button>
          {multiple && (
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              disabled={!picked.size}
              onClick={() => void confirm([...picked.values()])}
            >
              {confirmLabel}
            </Button>
          )}
        </>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <Input
              data-autofocus
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={`搜索${meta.noun}…`}
              aria-label={`搜索${meta.noun}`}
              lead={Search}
              wrapperClassName="flex-1"
            />
            {tabs.length > MAX_SEGMENTS ? (
              <Menu
                align="end"
                trigger={
                  <Button variant="secondary" size="sm" icon={meta.icon} className="shrink-0">
                    {meta.label}
                    <ChevronDown className="size-3" strokeWidth={1.75} />
                  </Button>
                }
              >
                {tabs.map(k => {
                  const { label, icon: KindIcon } = tabMeta(k);
                  return (
                    <Menu.Item
                      key={k}
                      icon={<KindIcon className="size-[15px]" strokeWidth={1.75} />}
                      onSelect={() => setKind(k)}
                    >
                      {label}
                    </Menu.Item>
                  );
                })}
              </Menu>
            ) : (
              tabs.length > 1 && (
                <Segmented
                  label="类型"
                  size="sm"
                  value={kind}
                  onValueChange={(v: KindTab) => setKind(v)}
                >
                  {tabs.map(k => (
                    <Segmented.Item key={k} value={k} label={tabMeta(k).label} />
                  ))}
                </Segmented>
              )
            )}
          </div>
          {/* 列表直接铺在弹窗正文上（不套卡片）；-mr/pr 借位把滚动条挪进正文右侧留白，
            与行内容隔开 8px，行右缘仍与搜索框对齐 */}
          <div
            ref={setListEl}
            role="listbox"
            aria-multiselectable={multiple || undefined}
            className="edge-fade-scroll scrollbar-inset -mr-3.5 h-[400px] overflow-y-auto border-r-4 border-r-transparent pr-2"
          >
            {isPending || !items ? (
              <Loading />
            ) : !items.length ? (
              <p className="text-ink-3 py-10 text-center text-[12.5px]">
                {debounced ? `没有匹配的${meta.noun}` : `还没有${meta.noun}`}
              </p>
            ) : (
              items.map((candidate, index) => {
                const key = entityKey(candidate);
                const on = picked.has(key);
                const linked = isLinked?.(candidate) ?? false;
                return (
                  <button
                    key={key}
                    type="button"
                    role="option"
                    aria-selected={on}
                    aria-disabled={linked || undefined}
                    data-index={index}
                    tabIndex={-1}
                    onClick={() => choose(candidate)}
                    onMouseMove={() => index !== active && setActive(index)}
                    className={cn(
                      "flex w-full items-center gap-[11px] rounded-[10px] px-2.5 py-[9px] text-left outline-none",
                      on ? "bg-selected" : index === active && !linked && "bg-hover",
                      linked && "cursor-default opacity-50"
                    )}
                  >
                    {multiple && (
                      <span
                        className={cn(
                          "grid size-4 shrink-0 place-items-center rounded-[5px] border-[1.5px]",
                          on
                            ? "bg-accent border-accent text-ink-inverse"
                            : "border-ink-3 text-transparent"
                        )}
                      >
                        <Check className="size-[11px]" strokeWidth={3} />
                      </span>
                    )}
                    <EntityKindIcon
                      entityRef={candidate}
                      fallback={ENTITY_KIND_META[candidate.kind]}
                      className="text-ink-3 size-[14px] shrink-0"
                      strokeWidth={1.75}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px] font-medium">{candidate.title}</span>
                      {candidate.excerpt && (
                        <span className="text-ink-3 truncate text-[12px]">{candidate.excerpt}</span>
                      )}
                    </span>
                    <span className="text-ink-3 shrink-0 text-[11.5px]">
                      {linked
                        ? "已关联"
                        : [candidate.meta, entityTime(candidate.time, now.current)]
                            .filter(Boolean)
                            .join(" · ")}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </DialogBody>
    </Dialog>
  );
}
