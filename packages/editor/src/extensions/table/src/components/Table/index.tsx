import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ReactEditor,
  useReadOnly,
  useSlateSelector,
  useSlateStatic,
  type RenderElementProps,
} from "slate-react";
import { Node, Path, type Editor } from "slate";
import { Menu, cn } from "@tau/ui";
import { GripHorizontal, GripVertical, Plus } from "lucide-react";
import {
  AddParagraph,
  OverlayBackDismiss,
  findPathSafely,
  useIsLastElement,
} from "@tau/editor/api";

import type { TableAlign, TableElement } from "../../types";
import {
  clearCells,
  columnCount,
  deleteColumns,
  deleteRows,
  insertColumns,
  insertRows,
  moveColumn,
  moveRow,
  selectCell,
  setColumnAlign,
} from "../../transforms";
import { getCellSelection, selectColumns, selectRows, type CellSelection } from "../../selection";
import { TableAlignContext } from "../context";
import { boundaryAt, measureTable, type TableGeometry } from "./geometry";
import HandleMenuItems, { type HandleKind } from "./HandleMenuItems";

interface ITableProps {
  attributes: RenderElementProps["attributes"];
  element: TableElement;
}

interface Range2 {
  kind: HandleKind;
  from: number;
  to: number;
}

interface DragState {
  kind: HandleKind;
  from: number;
  /** 放置边界 0..n；未越过阈值前为 null */
  target: number | null;
}

const GRIP_CLASS =
  "absolute z-[6] flex cursor-grab items-center justify-center rounded-[6px] bg-[var(--ed-bg-surface)] text-[var(--ed-text-tertiary)] shadow-[0_0_0_1px_var(--ed-border),0_1px_3px_rgba(0,0,0,.06)] transition-colors hover:bg-[var(--ed-accent)] hover:text-[var(--ed-text-inverse)] hover:shadow-none data-[on=true]:bg-[var(--ed-accent)] data-[on=true]:text-[var(--ed-text-inverse)] data-[on=true]:shadow-none";
const ADD_BAR_CLASS =
  "absolute z-[4] flex items-center justify-center rounded-[6px] text-[var(--ed-text-tertiary)] opacity-0 transition-opacity hover:bg-[var(--ed-bg-hover)] hover:text-[var(--ed-text)] group-hover/table:opacity-100";

const preventMouseDown = (event: React.MouseEvent) => event.preventDefault();

const sameCellSelection = (
  left: CellSelection | null | undefined,
  right: CellSelection | undefined
) =>
  left === right ||
  (!!left &&
    !!right &&
    left.kind === right.kind &&
    left.rowStart === right.rowStart &&
    left.rowEnd === right.rowEnd &&
    left.colStart === right.colStart &&
    left.colEnd === right.colEnd &&
    Path.equals(left.tablePath, right.tablePath));

const Table: React.FC<React.PropsWithChildren<ITableProps>> = props => {
  const { attributes, element, children } = props;
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const isLast = useIsLastElement(element);

  const boxRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const suppressClickRef = useRef(false);
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);
  const [menu, setMenu] = useState<Range2 | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [geometry, setGeometry] = useState<TableGeometry | null>(null);

  const cellSelection = useSlateSelector(
    useCallback(
      (current: Editor) => {
        const selection = getCellSelection(current);
        return selection && Node.get(current, selection.tablePath) === element
          ? selection
          : undefined;
      },
      [element]
    ),
    sameCellSelection
  );

  const handleSelection: Range2 | undefined =
    cellSelection?.kind === "row"
      ? { kind: "row", from: cellSelection.rowStart, to: cellSelection.rowEnd }
      : cellSelection?.kind === "col"
        ? { kind: "col", from: cellSelection.colStart, to: cellSelection.colEnd }
        : undefined;

  // 手柄锚在哪一行 / 列：菜单与拖动期间冻结，整行整列选中时跟随选区，否则跟随悬停
  const anchorOf = (kind: HandleKind): number | undefined => {
    if (menu || drag) return (menu ?? drag)?.kind === kind ? (menu?.to ?? drag?.from) : undefined;
    if (handleSelection) return handleSelection.kind === kind ? handleSelection.to : undefined;
    return kind === "row" ? hover?.row : hover?.col;
  };
  const rowAnchor = anchorOf("row");
  const colAnchor = anchorOf("col");
  const chromeVisible = !readOnly && (rowAnchor !== undefined || colAnchor !== undefined);

  const measure = useCallback(() => measureTable(boxRef.current, tableRef.current), []);

  useLayoutEffect(() => {
    setGeometry(chromeVisible || cellSelection ? measure() : null);
  }, [chromeVisible, cellSelection, element, hover, measure]);

  /** 动作执行时现取路径：渲染期的 element 可能已过期 */
  const withPath = useCallback(
    (action: (path: Path) => void, focus = true) => {
      const path = findPathSafely(editor, element);
      if (!path || readOnly) return;
      action(path);
      if (focus) ReactEditor.focus(editor);
    },
    [editor, element, readOnly]
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  const openMenu = (kind: HandleKind) => {
    const anchor = kind === "row" ? rowAnchor : colAnchor;
    if (anchor === undefined) return;
    // 已有格选区覆盖手柄所在行 / 列时，作用于选区覆盖的全部行 / 列
    let [from, to] = [anchor, anchor];
    if (cellSelection?.kind === "cells") {
      const [start, end] =
        kind === "row"
          ? [cellSelection.rowStart, cellSelection.rowEnd]
          : [cellSelection.colStart, cellSelection.colEnd];
      if (anchor >= start && anchor <= end) [from, to] = [start, end];
    }
    withPath(path => {
      if (kind === "row") selectRows(editor, path, from, to);
      else selectColumns(editor, path, from, to);
    }, false);
    setMenu({ kind, from, to });
  };

  const removeRange = useCallback(
    ({ kind, from, to }: Range2) =>
      withPath(path => {
        const removed =
          kind === "row"
            ? deleteRows(editor, path, from, to)
            : deleteColumns(editor, path, from, to);
        if (removed && Path.equals(findPathSafely(editor, element) ?? [], path)) {
          selectCell(editor, path, kind === "row" ? from : 0, kind === "col" ? from : 0, "start");
        }
      }),
    [editor, element, withPath]
  );

  // 菜单打开时焦点在菜单里：⌫ / Delete 直接删除所选行列
  useEffect(() => {
    if (!menu) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      event.preventDefault();
      event.stopPropagation();
      setMenu(null);
      removeRange(menu);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [menu, removeRange]);

  useEffect(() => {
    if (readOnly) setMenu(null);
  }, [readOnly]);

  const menuActions = (range: Range2) => {
    const { kind, from, to } = range;
    const insert = (index: number) =>
      withPath(path => {
        if (kind === "row") {
          insertRows(editor, path, index);
          selectCell(editor, path, index, 0, "start");
        } else {
          insertColumns(editor, path, index);
          selectCell(editor, path, 0, index, "start");
        }
      });
    return {
      insertBefore: () => insert(from),
      insertAfter: () => insert(to + 1),
      setAlign: (align: TableAlign) =>
        withPath(path => {
          setColumnAlign(editor, path, from, to, align);
          selectColumns(editor, path, from, to);
        }),
      clear: () =>
        withPath(path => {
          const cols = columnCount(element) - 1;
          const rows = element.children.length - 1;
          clearCells(
            editor,
            path,
            kind === "row"
              ? { rowStart: from, rowEnd: to, colStart: 0, colEnd: cols }
              : { rowStart: 0, rowEnd: rows, colStart: from, colEnd: to }
          );
          if (kind === "row") selectRows(editor, path, from, to);
          else selectColumns(editor, path, from, to);
        }),
      remove: () => removeRange(range),
    };
  };

  /** 手柄按下：越过 4px 进入拖动排序，否则视为点击（交给 Menu 开合） */
  const startDrag = (kind: HandleKind, event: React.PointerEvent) => {
    const from = kind === "row" ? rowAnchor : colAnchor;
    if (event.button !== 0 || readOnly || from === undefined) return;
    const origin = { x: event.clientX, y: event.clientY };
    let moved = false;
    let target: number | null = null;

    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < 4) return;
      if (!moved) {
        moved = true;
        withPath(
          path =>
            kind === "row" ? selectRows(editor, path, from) : selectColumns(editor, path, from),
          false
        );
      }
      const box = boxRef.current?.getBoundingClientRect();
      const current = measure();
      if (!box || !current) return;
      target =
        kind === "col"
          ? boundaryAt(
              current.cols.map(c => ({ start: c.left, end: c.right })),
              ev.clientX - box.left
            )
          : boundaryAt(
              current.rows.map(r => ({ start: r.top, end: r.bottom })),
              ev.clientY - box.top
            );
      setGeometry(current);
      setDrag({ kind, from, target });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      setDrag(null);
      if (!moved) return;
      // 拖动结束后的 click 不应再打开菜单
      suppressClickRef.current = true;
      setTimeout(() => (suppressClickRef.current = false));
      if (target === null || target === from || target === from + 1) return;
      const to = target > from ? target - 1 : target;
      withPath(path => {
        if (kind === "row") {
          moveRow(editor, path, from, to);
          selectRows(editor, path, to);
        } else {
          moveColumn(editor, path, from, to);
          selectColumns(editor, path, to);
        }
      });
    };

    setDrag({ kind, from, target: null });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    if (readOnly || drag) return;
    const cell = (event.target as HTMLElement).closest("td");
    if (!cell || cell.closest("table") !== tableRef.current) return;
    const row = (cell.parentElement as HTMLTableRowElement).sectionRowIndex;
    const col = cell.cellIndex;
    if (hover?.row !== row || hover?.col !== col) setHover({ row, col });
  };

  const appendColumn = () =>
    withPath(path => {
      const index = columnCount(element);
      insertColumns(editor, path, index);
      selectCell(editor, path, 0, index, "start");
    });
  const appendRow = () =>
    withPath(path => {
      const index = element.children.length;
      insertRows(editor, path, index);
      selectCell(editor, path, index, 0, "start");
    });

  const renderGrip = (kind: HandleKind, anchor: number | undefined) => {
    if (anchor === undefined || !geometry) return null;
    const col = geometry.cols[anchor];
    const row = geometry.rows[anchor];
    const style =
      kind === "col"
        ? col && { left: (col.left + col.right) / 2 - 13, top: -7 }
        : row && { top: (row.top + row.bottom) / 2 - 13, left: -7 };
    if (!style) return null;
    const range = menu?.kind === kind ? menu : undefined;
    const align = range && kind === "col" ? commonAlign(element, range.from, range.to) : undefined;
    const on = menu?.kind === kind || drag?.kind === kind || handleSelection?.kind === kind;
    return (
      <Menu
        open={!!range}
        onOpenChange={open => (open ? openMenu(kind) : closeMenu())}
        trigger={
          <button
            type="button"
            contentEditable={false}
            aria-label={kind === "col" ? "列操作" : "行操作"}
            title="点击打开菜单 · 拖动排序"
            data-on={on}
            className={cn(GRIP_CLASS, kind === "col" ? "h-[14px] w-[26px]" : "h-[26px] w-[14px]")}
            style={style}
            onMouseDown={preventMouseDown}
            onPointerDown={event => startDrag(kind, event)}
            onClick={event => {
              if (suppressClickRef.current) event.preventDefault();
            }}
          >
            {kind === "col" ? <GripHorizontal size={13} /> : <GripVertical size={13} />}
          </button>
        }
      >
        {range && (
          <HandleMenuItems
            kind={kind}
            from={range.from}
            to={range.to}
            align={align}
            actions={menuActions(range)}
          />
        )}
      </Menu>
    );
  };

  const dropLine = (() => {
    if (!drag || drag.target === null || !geometry) return null;
    const { cols, rows, width, height } = geometry;
    const style =
      drag.kind === "col"
        ? {
            left: (drag.target < cols.length ? cols[drag.target].left : width) - 1.5,
            top: 0,
            width: 3,
            height,
          }
        : {
            top: (drag.target < rows.length ? rows[drag.target].top : height) - 1.5,
            left: 0,
            height: 3,
            width,
          };
    return (
      <div
        className="pointer-events-none absolute z-[7] rounded-[2px] bg-[var(--ed-accent)]"
        style={style}
      />
    );
  })();

  const selectionOverlay = (() => {
    if (!cellSelection || !geometry) return null;
    const top = geometry.rows[cellSelection.rowStart]?.top;
    const bottom = geometry.rows[cellSelection.rowEnd]?.bottom;
    const left = geometry.cols[cellSelection.colStart]?.left;
    const right = geometry.cols[cellSelection.colEnd]?.right;
    if (top === undefined || bottom === undefined || left === undefined || right === undefined)
      return null;
    return (
      <div
        className="pointer-events-none absolute z-[3] rounded-[3px] bg-[var(--ed-accent-soft)] shadow-[0_0_0_1.5px_var(--ed-accent)]"
        style={{ top, left, width: right - left, height: bottom - top }}
      />
    );
  })();

  return (
    <div className="group/table relative">
      <div
        ref={boxRef}
        className="relative"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        <div className="overflow-x-auto rounded-[10px] border border-solid border-[var(--ed-border)]">
          <table
            {...attributes}
            ref={node => {
              attributes.ref(node);
              tableRef.current = node;
            }}
            className={cn(
              "w-full border-separate border-spacing-0",
              "[&_td]:min-w-[4.5em] [&_td]:border-0 [&_td]:border-b [&_td]:border-r [&_td]:border-solid [&_td]:border-[var(--ed-border)] [&_td]:px-3 [&_td]:py-[7px] [&_td]:text-left [&_td]:align-top [&_td]:[word-break:break-word]",
              "[&_td:last-child]:border-r-0 [&_tr:last-child_td]:border-b-0",
              "[&_tr:first-child_td]:bg-[var(--ed-bg-hover)] [&_tr:first-child_td]:font-semibold",
              cellSelection && "caret-transparent [&_*::selection]:bg-transparent"
            )}
          >
            <TableAlignContext.Provider value={element.align}>
              <tbody>{children}</tbody>
            </TableAlignContext.Provider>
          </table>
        </div>
        {selectionOverlay}
        {!readOnly && (
          <div contentEditable={false} className="select-none">
            {renderGrip("col", colAnchor)}
            {renderGrip("row", rowAnchor)}
            {dropLine}
            <button
              type="button"
              aria-label="添加列"
              title="添加列"
              className={cn(ADD_BAR_CLASS, "-right-6 bottom-0 top-0 w-[18px]")}
              onMouseDown={preventMouseDown}
              onClick={appendColumn}
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              aria-label="添加行"
              title="添加行"
              className={cn(ADD_BAR_CLASS, "left-0 right-0 top-[calc(100%+3px)] h-[16px]")}
              onMouseDown={preventMouseDown}
              onClick={appendRow}
            >
              <Plus size={14} />
            </button>
            <OverlayBackDismiss open={!!menu} onDismiss={closeMenu} />
          </div>
        )}
      </div>
      {!(readOnly && isLast) && <AddParagraph element={element} />}
    </div>
  );
};

/** 所选列的共同对齐；不一致时为 undefined */
function commonAlign(table: TableElement, from: number, to: number): TableAlign | undefined {
  const values = Array.from({ length: to - from + 1 }, (_, i) => table.align?.[from + i] ?? null);
  return values.every(value => value === values[0]) ? values[0] : undefined;
}

export default Table;
