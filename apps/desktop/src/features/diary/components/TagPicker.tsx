/**
 * 标签选择器（Popover）：搜索 / 多选 / 新建 + 单个标签的改色与清理（二级视图）。
 * 列表按使用次数排序（rankTags）；键盘 ↑↓ 选择、↵ 切换或创建、输入为空时 ⌫ 摘掉最后一个。
 * 条目上的标签编辑与输入条的「# 标签」按钮共用本件。
 */

import { useMemo, useState, type ReactElement } from "react";
import { Check, ChevronLeft, Eraser, Hash, MoreHorizontal, Plus } from "lucide-react";
import {
  ConfirmDialog,
  IconButton,
  Popover,
  Tag,
  TAG_COLORS,
  cn,
  type PopoverProps,
  type TagColor,
} from "@tau/ui";
import { COLOR_LABEL, type DiaryTag } from "../model";
import { TagDot } from "./bits";

export interface TagPickerProps {
  trigger: ReactElement;
  selected: string[];
  onChange: (next: string[]) => void;
  /** 已按使用次数排好的标签（rankTags） */
  tags: DiaryTag[];
  counts: Map<string, number>;
  onRecolor: (name: string, color: TagColor) => void;
  onClear: (name: string) => void;
  placement?: PopoverProps["placement"];
}

export function TagPicker({ trigger, placement = "bottom-start", ...rest }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      trigger={trigger}
      open={open}
      onOpenChange={setOpen}
      placement={placement}
      arrow={false}
      className="w-[264px]"
    >
      {open && <TagPickerPanel {...rest} />}
    </Popover>
  );
}

function TagPickerPanel({
  selected,
  onChange,
  tags,
  counts,
  onRecolor,
  onClear,
}: Omit<TagPickerProps, "trigger" | "placement">) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [managing, setManaging] = useState<string | null>(null);

  const q = query.trim();
  const list = useMemo(
    () => tags.filter(t => t.name.toLowerCase().includes(q.toLowerCase())),
    [tags, q]
  );
  const creatable = q && !tags.some(t => t.name === q) ? q : null;
  const total = list.length + (creatable ? 1 : 0);

  const toggle = (name: string) =>
    onChange(selected.includes(name) ? selected.filter(t => t !== name) : [...selected, name]);
  const create = (name: string) => {
    setQuery("");
    setHighlight(0);
    if (!selected.includes(name)) onChange([...selected, name]);
  };

  const managed = managing ? tags.find(t => t.name === managing) : null;
  if (managed)
    return (
      <TagManagePanel
        tag={managed}
        count={counts.get(managed.name) ?? 0}
        onBack={() => setManaging(null)}
        onRecolor={color => onRecolor(managed.name, color)}
        onClear={() => onClear(managed.name)}
      />
    );

  return (
    <div className="p-1.5">
      <label className="bg-hover rounded-tau-sm mb-1.5 flex h-8 items-center gap-2 px-2.5">
        <Hash className="text-ink-3 size-[14px] shrink-0" strokeWidth={1.75} />
        <input
          data-autofocus
          value={query}
          placeholder="搜索或新建标签…"
          onChange={e => {
            setQuery(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={e => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const step = e.key === "ArrowDown" ? 1 : -1;
              setHighlight(h => (total ? (h + step + total) % total : 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (highlight < list.length) toggle(list[highlight].name);
              else if (creatable) create(creatable);
            } else if (e.key === "Backspace" && !query && selected.length) {
              onChange(selected.slice(0, -1));
            }
          }}
          className="text-tau-body placeholder:text-ink-3 min-w-0 flex-1 bg-transparent outline-none"
        />
      </label>
      <div role="listbox" aria-multiselectable className="max-h-[280px] overflow-y-auto">
        {list.map((tag, i) => (
          <div
            key={tag.name}
            role="option"
            aria-selected={selected.includes(tag.name)}
            onMouseEnter={() => setHighlight(i)}
            onClick={() => toggle(tag.name)}
            className={cn(
              "group/row text-tau-body flex h-8 cursor-pointer items-center gap-2.5 rounded-[8px] pl-2 pr-1",
              i === highlight && "bg-hover"
            )}
          >
            <span className="text-accent-text grid size-4 shrink-0 place-items-center">
              {selected.includes(tag.name) && <Check className="size-[14px]" strokeWidth={2.2} />}
            </span>
            <TagDot color={tag.color} />
            <span className="min-w-0 flex-1 truncate">{tag.name}</span>
            <span className="text-tau-sm text-ink-3 tabular-nums">{counts.get(tag.name) ?? 0}</span>
            {/* 固定槽位原位淡入：悬停不改变行宽（PREFERENCES） */}
            <IconButton
              title="颜色与清理"
              className="size-6 rounded-[7px] opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-100"
              onClick={e => {
                e.stopPropagation();
                setManaging(tag.name);
              }}
            >
              <MoreHorizontal className="size-[14px]" strokeWidth={1.75} />
            </IconButton>
          </div>
        ))}
        {creatable && (
          <div
            role="option"
            aria-selected={false}
            onMouseEnter={() => setHighlight(list.length)}
            onClick={() => create(creatable)}
            className={cn(
              "text-tau-body text-accent-text flex h-8 cursor-pointer items-center gap-2.5 rounded-[8px] px-2",
              highlight === list.length && "bg-hover"
            )}
          >
            <Plus className="size-[14px] shrink-0" strokeWidth={1.75} />
            <span className="truncate">创建「{creatable}」</span>
          </div>
        )}
        {!total && <p className="text-tau-meta text-ink-3 px-2 py-2.5">还没有标签，输入名称创建</p>}
      </div>
      <div className="text-tau-sm text-ink-3 mt-1.5 flex items-center gap-3 px-2 pb-0.5 pt-1.5">
        <span>↑↓ 选择</span>
        <span>↵ 添加</span>
        {selected.length > 0 && (
          <button
            type="button"
            className="text-accent-text ml-auto hover:underline"
            onClick={() => onChange([])}
          >
            清空已选
          </button>
        )}
      </div>
    </div>
  );
}

function TagManagePanel({
  tag,
  count,
  onBack,
  onRecolor,
  onClear,
}: {
  tag: DiaryTag;
  count: number;
  onBack: () => void;
  onRecolor: (color: TagColor) => void;
  onClear: () => void;
}) {
  return (
    <div className="p-2">
      <div className="mb-2.5 flex items-center gap-2">
        <IconButton title="返回" className="size-6 rounded-[7px]" onClick={onBack}>
          <ChevronLeft className="size-[14px]" strokeWidth={1.75} />
        </IconButton>
        <Tag color={tag.color}>{tag.name}</Tag>
        <span className="text-tau-sm text-ink-3 ml-auto">{count} 条</span>
      </div>
      <ColorRow value={tag.color} onChange={onRecolor} />
      <button
        type="button"
        onClick={onClear}
        className="text-tau-body text-danger hover:bg-danger-soft mt-2.5 flex h-8 w-full items-center gap-2 rounded-[8px] px-2"
      >
        <Eraser className="size-[14px]" strokeWidth={1.75} />
        清理这个标签…
      </button>
    </div>
  );
}

/** 七色圆点行：选中态外圈描边 + 勾 */
export function ColorRow({
  value,
  onChange,
}: {
  value: TagColor;
  onChange: (c: TagColor) => void;
}) {
  return (
    <div role="radiogroup" aria-label="标签颜色" className="flex gap-2 px-1">
      {TAG_COLORS.map(color => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={COLOR_LABEL[color]}
          title={COLOR_LABEL[color]}
          onClick={() => onChange(color)}
          className={cn(
            "ring-offset-surface grid size-5 place-items-center rounded-full ring-offset-2 focus-visible:shadow-[var(--tau-focus-ring)]",
            value === color && "ring-[1.5px] ring-current"
          )}
        >
          <TagDot color={color} className="size-5" />
        </button>
      ))}
    </div>
  );
}

/** 清理标签确认：从所有条目上摘除并删出标签库，条目本身不动 */
export function ClearTagDialog({
  name,
  count,
  onOpenChange,
  onConfirm,
}: {
  name: string | null;
  count: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: (name: string) => Promise<unknown>;
}) {
  return (
    <ConfirmDialog
      open={name != null}
      onOpenChange={onOpenChange}
      title="清理标签"
      context={name ?? undefined}
      description="标签会从标签列表里删除，并从所有碎碎念上移除；碎碎念本身不受影响。"
      impact={count ? `${count} 条碎碎念会失去这个标签` : undefined}
      confirmText="清理"
      danger
      onConfirm={() => (name ? onConfirm(name) : undefined)}
    />
  );
}
