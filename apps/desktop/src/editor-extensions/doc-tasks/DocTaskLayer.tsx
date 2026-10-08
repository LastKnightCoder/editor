/**
 * 文档待办的编辑器图层：`#` 项目候选（贴光标）与胶囊小菜单（贴胶囊）。
 * 都是非模态浮层，经 OverlayBackDismiss 接宿主 Esc 仲裁。
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ReactEditor, useSlateStatic } from "slate-react";
import { Plus } from "lucide-react";
import { AnchoredPanel, cn } from "@tau/ui";
import { OverlayBackDismiss, type ExtensionLayerProps } from "@tau/editor/api";
import { startOfDay, DAY_MS } from "@/utils/dayWords";
import { docTaskGroupsOf } from "./service";
import {
  closeTagPicker,
  selectTagPickerItem,
  useTagPickerStore,
  type TagPickerItem,
} from "./store";
import { closeChipMenu, removeChip, setChipDate, setChipGroup, useChipMenuStore } from "./chipMenu";

const MAX_ITEMS = 8;
const NO_GROUPS: never[] = [];

export function DocTaskLayer({ readOnly }: ExtensionLayerProps) {
  const editor = useSlateStatic();
  const groups = docTaskGroupsOf(editor);
  useEffect(() => {
    const dismiss = () => {
      if (useTagPickerStore.getState().editor === editor) closeTagPicker();
      if (useChipMenuStore.getState().editor === editor) closeChipMenu();
    };
    if (readOnly) dismiss();
    return dismiss;
  }, [editor, readOnly]);
  if (!groups || readOnly) return null;
  return (
    <>
      <TagPicker />
      <ChipMenu />
    </>
  );
}

function useGroups() {
  const editor = useSlateStatic();
  const service = docTaskGroupsOf(editor);
  return useSyncExternalStore(
    listener => service?.subscribe(listener) ?? (() => {}),
    () => service?.list() ?? NO_GROUPS
  );
}

/** 光标所在位置的一个 0 宽锚点（AnchoredPanel 要 HTMLElement） */
function useCaretAnchor(active: boolean) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const query = useTagPickerStore(s => s.query);
  useEffect(() => {
    if (!active) {
      setAnchor(null);
      return;
    }
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    const el = document.createElement("span");
    Object.assign(el.style, {
      position: "fixed",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: "0px",
      height: `${rect.height || 18}px`,
      pointerEvents: "none",
    });
    document.body.appendChild(el);
    setAnchor(el);
    return () => el.remove();
  }, [active, query]);
  return anchor;
}

function TagPicker() {
  const editor = useSlateStatic();
  const open = useTagPickerStore(s => s.editor === editor);
  const query = useTagPickerStore(s => s.query);
  const activeIndex = useTagPickerStore(s => s.activeIndex);
  const groups = useGroups();
  const anchor = useCaretAnchor(open);

  const items = useMemo<TagPickerItem[]>(() => {
    const q = query.trim();
    const matched: TagPickerItem[] = groups
      .filter(g => !q || g.title.includes(q))
      .slice(0, MAX_ITEMS)
      .map(g => ({ kind: "group", id: g.id, title: g.title }));
    if (q && !groups.some(g => g.title === q)) matched.push({ kind: "create", title: q });
    return matched;
  }, [groups, query]);

  useEffect(() => {
    if (open) useTagPickerStore.setState({ items });
  }, [open, items]);

  if (!open || !anchor) return null;
  return (
    <>
      <OverlayBackDismiss open={open} onDismiss={closeTagPicker} />
      <AnchoredPanel
        anchor={anchor}
        placement="bottom-start"
        className="w-[240px] p-1.5"
        onMouseDown={e => e.preventDefault()}
      >
        <div className="text-ink-3 px-2 pb-1 pt-0.5 text-[11.5px]">移到项目</div>
        {items.length === 0 && (
          <div className="text-ink-3 px-2 py-1.5 text-[12.5px]">还没有项目，输入名字新建</div>
        )}
        <div role="listbox" aria-label="项目候选">
          {items.map((item, index) => (
            <button
              key={item.kind === "group" ? item.id : `create:${item.title}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => useTagPickerStore.setState({ activeIndex: index })}
              onClick={() => void selectTagPickerItem(item)}
              className={cn(
                "text-tau-body flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left",
                index === activeIndex ? "bg-accent-soft text-accent-text" : "hover:bg-hover",
                item.kind === "create" && "text-ink-2"
              )}
            >
              {item.kind === "group" ? (
                <GroupDot groupId={item.id} />
              ) : (
                <Plus className="size-[13px]" strokeWidth={1.75} />
              )}
              <span className="min-w-0 flex-1 truncate">
                {item.kind === "create" ? `新建项目「${item.title}」` : item.title}
              </span>
              {index === activeIndex && <span className="text-ink-3 text-[11px]">回车</span>}
            </button>
          ))}
        </div>
      </AnchoredPanel>
    </>
  );
}

function GroupDot({ groupId }: { groupId: number }) {
  const editor = useSlateStatic();
  return (
    <span
      aria-hidden
      className={cn(
        "size-[7px] shrink-0 rounded-[2px]",
        docTaskGroupsOf(editor)?.dotClass(groupId)
      )}
    />
  );
}

function ChipMenu() {
  const editor = useSlateStatic();
  const open = useChipMenuStore(s => s.editor === editor);
  const anchor = useChipMenuStore(s => s.anchor);
  const kind = useChipMenuStore(s => s.kind);
  const groups = useGroups();

  // 点菜单外或继续输入即收起：胶囊所在文字可能已变，旧锚点不再可信
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.target instanceof Node && anchor?.parentElement?.contains(event.target)) return;
      if ((event.target as HTMLElement | null)?.closest?.("[data-float-card]")) return;
      closeChipMenu();
    };
    document.addEventListener("pointerdown", close, true);
    const closeOnInput = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && !event.isComposing) closeChipMenu();
    };
    document.addEventListener("keydown", closeOnInput, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", closeOnInput, true);
    };
  }, [open, anchor]);

  if (!open || !anchor) return null;
  const today = startOfDay(Date.now());
  const nextMonday = today + ((8 - new Date(today).getDay()) % 7 || 7) * DAY_MS;
  const item =
    "text-tau-body hover:bg-hover flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left";

  return (
    <>
      <OverlayBackDismiss
        open={open}
        onDismiss={() => {
          closeChipMenu();
          ReactEditor.focus(editor);
        }}
      />
      <AnchoredPanel
        anchor={anchor}
        placement="bottom-start"
        className="w-[220px] p-1.5"
        onMouseDown={e => e.preventDefault()}
      >
        {kind === "date" ? (
          <>
            <div className="text-ink-3 px-2 pb-1 pt-0.5 text-[11.5px]">日期</div>
            <button type="button" className={item} onClick={() => setChipDate(today)}>
              今天
            </button>
            <button type="button" className={item} onClick={() => setChipDate(today + DAY_MS)}>
              明天
            </button>
            <button type="button" className={item} onClick={() => setChipDate(nextMonday)}>
              下周一
            </button>
          </>
        ) : (
          <>
            <div className="text-ink-3 px-2 pb-1 pt-0.5 text-[11.5px]">换项目</div>
            {groups.map(g => (
              <button
                key={g.id}
                type="button"
                className={item}
                onClick={() => setChipGroup(g.title, g.id)}
              >
                <GroupDot groupId={g.id} />
                <span className="min-w-0 truncate">{g.title}</span>
              </button>
            ))}
          </>
        )}
        <div className="bg-line-1 mx-2 my-1 h-px" />
        <button type="button" className={cn(item, "text-ink-2")} onClick={removeChip}>
          {kind === "date" ? "清除日期" : "移出项目"}
        </button>
      </AnchoredPanel>
    </>
  );
}
