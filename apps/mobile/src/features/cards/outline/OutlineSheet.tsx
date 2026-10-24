import { useEffect, useRef, useState, type RefObject } from "react";
import {
  ChevronDown,
  ChevronRight,
  GripHorizontal,
  Heading,
  Heading1,
  Heading2,
  Heading3,
  Image,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Sigma,
  Square,
  SquareCheck,
  SquareCode,
  Table,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { EditorRef } from "@tau/editor";
import type { Descendant } from "slate";
import { SnapSheet } from "../../../components/SnapSheet";
import { toast } from "../../../components/toast";
import { getSlateEditor } from "../blockSelection/measureBlocks";
import {
  applyOrder,
  buildOutlineRows,
  isCollapsibleRow,
  isSnapshotStale,
  moveUnit,
  visibleUnits,
  type OutlineRow,
  type OutlineUnit,
} from "./outlineModel";
import { usePointerReorder, type ItemRect } from "./usePointerReorder";

const ROW_HEIGHT = 46;
const SHEET_STATES = ["full" as const];

type OutlineSheetProps = {
  open: boolean;
  editorRef: RefObject<EditorRef | null>;
  onClose: () => void;
};

/** 一次打开的会话：打开时的顶层块快照、当前排列（原始下标）与折叠的标题（原始下标） */
type OutlineSession = {
  snapshot: Descendant[];
  order: number[];
  collapsed: ReadonlySet<number>;
};

const TYPE_ICONS: Record<string, LucideIcon> = {
  paragraph: Pilcrow,
  "check-list": SquareCheck,
  "bulleted-list": List,
  "numbered-list": ListOrdered,
  blockquote: Quote,
  image: Image,
  "code-block": SquareCode,
  table: Table,
  "block-math": Sigma,
  mermaid: Workflow,
  "divide-line": Minus,
};

const HEADING_ICONS: LucideIcon[] = [Heading1, Heading2, Heading3];

function rowIcon(row: OutlineRow): LucideIcon {
  if (row.level !== null) return HEADING_ICONS[row.level - 1] ?? Heading;
  return TYPE_ICONS[row.type] ?? Square;
}

/** 非被拖单元按 from / to 关系让位一行 */
function shiftFor(index: number, from: number, to: number): number {
  if (index > from && index <= to) return -ROW_HEIGHT;
  if (index < from && index >= to) return ROW_HEIGHT;
  return 0;
}

/** 「整理结构」：底部全屏 Sheet 中按顶层块重排，标题可折叠整节移动，「完成」时作为一个撤销步写入 */
export function OutlineSheet(props: OutlineSheetProps) {
  const { open, editorRef, onClose } = props;
  const [session, setSession] = useState<OutlineSession | null>(null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const rowElsRef = useRef<Array<HTMLDivElement | null>>([]);

  // 关闭时保留会话供退场动画显示，下次打开重新快照
  useEffect(() => {
    if (!open) return;
    const snapshot = getSlateEditor(editorRef)?.children ?? [];
    setSession({
      snapshot,
      order: snapshot.map((_, index) => index),
      collapsed: new Set(),
    });
  }, [open, editorRef]);

  const order = session?.order ?? [];
  const rows = session ? buildOutlineRows(order.map(index => session.snapshot[index])) : [];
  const units = session ? visibleUnits(rows, session.collapsed, position => order[position]) : [];
  const collapsibleKeys = rows.filter(isCollapsibleRow).map(row => order[row.index]);
  const allCollapsed = session !== null && collapsibleKeys.every(key => session.collapsed.has(key));

  const getItemRects = (): ItemRect[] => {
    const containerTop = scrollEl?.getBoundingClientRect().top ?? 0;
    const scrollTop = scrollEl?.scrollTop ?? 0;
    return units.map((_, index) => {
      const rect = rowElsRef.current[index]?.getBoundingClientRect();
      return rect
        ? { top: rect.top - containerTop + scrollTop, height: rect.height }
        : { top: index * ROW_HEIGHT, height: ROW_HEIGHT };
    });
  };

  const { dragging, startDrag } = usePointerReorder({
    scrollContainer: scrollEl,
    getItemRects,
    onDrop: (from, to) => {
      setSession(prev => (prev ? { ...prev, order: moveUnit(prev.order, units, from, to) } : prev));
    },
  });

  const setCollapsed = (collapsed: ReadonlySet<number>) => {
    setSession(prev => (prev ? { ...prev, collapsed } : prev));
  };

  const toggleCollapsed = (key: number) => {
    if (!session) return;
    const next = new Set(session.collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsed(next);
  };

  const handleDone = () => {
    const editor = getSlateEditor(editorRef);
    if (session && editor) {
      // 打开期间正文被外部改动（如协作）时快照已失效，不应用并关闭
      if (isSnapshotStale(editor, session.snapshot)) {
        toast({ type: "warning", text: "内容已变化，请重新整理" });
      } else {
        applyOrder(editor, session.order);
      }
    }
    onClose();
  };

  const renderUnit = (unit: OutlineUnit, position: number) => {
    const { row } = unit;
    const isHeading = row.level !== null;
    const collapsible = isCollapsibleRow(row);
    const collapsed = collapsible && session?.collapsed.has(unit.key);
    const lifted = dragging?.from === position;
    const offset = dragging
      ? lifted
        ? dragging.offsetY
        : shiftFor(position, dragging.from, dragging.to)
      : 0;
    const Icon = rowIcon(row);
    return (
      <div
        key={unit.key}
        ref={node => {
          rowElsRef.current[position] = node;
        }}
        data-outline-row={unit.key}
        className={`border-line-2 bg-surface text-ink-1 flex h-[46px] items-center gap-2.5 border-b pl-2.5 pr-1.5 text-[14px] ${
          isHeading ? "font-bold" : ""
        } ${
          lifted
            ? "shadow-float relative z-10 scale-[1.03] rounded-xl border-b-0"
            : dragging
              ? "ease-tau-out transition-transform duration-150"
              : ""
        }`}
        style={{
          paddingLeft: isHeading ? 10 + ((row.level ?? 1) - 1) * 12 : undefined,
          transform: offset ? `translateY(${offset}px)` : undefined,
        }}
      >
        {collapsible ? (
          <button
            type="button"
            aria-label={collapsed ? "展开" : "折叠"}
            onClick={() => toggleCollapsed(unit.key)}
            className="text-ink-3 active:bg-press -ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          >
            {collapsed ? <ChevronRight size={17} /> : <ChevronDown size={17} />}
          </button>
        ) : (
          <Icon size={isHeading ? 17 : 16} className="text-ink-3 shrink-0" aria-hidden />
        )}
        <span className="flex min-w-0 flex-1 items-center">
          <span className="truncate">{row.label}</span>
          {collapsed ? (
            <span className="bg-page text-ink-3 ml-1.5 shrink-0 rounded-full px-[7px] py-px text-[11px] font-normal">
              含 {unit.childCount} 个块
            </span>
          ) : null}
        </span>
        <span
          role="button"
          aria-label="拖动排序"
          data-pan-ignore-drag="true"
          onPointerDown={event => startDrag(position, event)}
          className={`flex h-9 w-9 shrink-0 touch-none items-center justify-center ${
            lifted ? "text-accent-text" : "text-ink-3"
          }`}
        >
          <GripHorizontal size={18} />
        </span>
      </div>
    );
  };

  return (
    <SnapSheet open={open} state="full" states={SHEET_STATES} onClose={onClose}>
      <>
        <SnapSheet.Handle />
        <header className="flex items-center justify-between px-4 pb-1">
          <button type="button" onClick={onClose} className="text-ink-2 py-1 text-[15px]">
            取消
          </button>
          <span className="text-ink-1 text-[15px] font-semibold">整理结构</span>
          <button
            type="button"
            onClick={handleDone}
            className="text-accent-text py-1 text-[15px] font-semibold"
          >
            完成
          </button>
        </header>
        <div className="flex h-8 items-center justify-end px-4">
          {collapsibleKeys.length > 0 ? (
            <button
              type="button"
              onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(collapsibleKeys))}
              className="text-ink-2 text-[12.5px]"
            >
              {allCollapsed ? "全部展开" : "全部折叠"}
            </button>
          ) : null}
        </div>
        <SnapSheet.Scroll ref={setScrollEl} className="px-3">
          {units.map(renderUnit)}
        </SnapSheet.Scroll>
      </>
    </SnapSheet>
  );
}

export default OutlineSheet;
