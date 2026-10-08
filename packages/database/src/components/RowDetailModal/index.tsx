import React, {
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Plus, ChevronDown, ChevronUp } from "lucide-react";
import { useMemoizedFn } from "ahooks";
import { cn, ConfirmDialog, Dialog, FADE_SCROLL_CLASS, ImagePreview, useEdgeFade } from "@tau/ui";
import { isEditableTarget } from "@tau/ui";
import {
  BrowserImage,
  useDatabaseSlots,
  type RowDetailBodyHandle,
} from "../../DatabaseHostContext";
import type { CellValue, ColumnDef } from "../../types";
import type PluginManager from "../../PluginManager";
import ColumnEditModal from "../../views/TableView/components/ColumnEditModal";
import { useDatabaseStore } from "../../hooks";
import PropertyRow from "./PropertyRow";
import RowCover from "./RowCover";
import { DatabaseWriteContext } from "../../DatabaseWriteContext";
import RowDetailHeader from "./RowDetailHeader";
import TitleField from "./TitleField";
import {
  collectFoldedColumnIds,
  coverImagesOf,
  isEmptyCellValue,
  neighborRowIds,
  orderVisibleColumns,
} from "./utils";

interface RowDetailModalProps {
  rowId: string;
  columns: ColumnDef[];
  pluginManager: PluginManager;
  theme: "light" | "dark";
  onClose: () => void;
  onAddColumn?: () => void;
  /** 删除行的入口（确认流程由视图负责）；行消失后详情自动关闭 */
  onDeleteRow?: (rowId: string) => void;
  readonly?: boolean;
  allowDeleteColumn?: boolean;
}

/**
 * 行详情：左正文、右属性栏；弹窗内容宽度不足 960 时退化为单栏（标题 → 属性 → 正文），
 * 两种形态是同一棵树，只靠容器查询与 order / display:contents 重排，编辑器不会重挂载。
 * 属性与标题实时写回 store；正文由宿主提供，离开时调用 flush。
 * 上一条 / 下一条按当前视图投影后的行序。
 */
const RowDetailModal: React.FC<RowDetailModalProps> = memo(
  ({
    rowId,
    columns,
    pluginManager,
    theme,
    onClose,
    onAddColumn,
    onDeleteRow,
    readonly = false,
    allowDeleteColumn = true,
  }) => {
    const [currentId, setCurrentId] = useState(rowId);
    const store = useDatabaseStore();
    const commitRowPatch = useContext(DatabaseWriteContext);
    const { RowDetailBody, Image = BrowserImage } = useDatabaseSlots();
    const bodyRef = useRef<RowDetailBodyHandle>(null);
    const {
      row,
      rowIds,
      columnOrder,
      moveColumn,
      editColumn,
      deleteColumnWithCleanup,
      columnWidths,
      updateCellValue,
      activeView,
    } = useDatabaseStore(state => ({
      row: state.rows.find(r => r.id === currentId),
      rowIds: state.projection.rowIds,
      columnOrder: state.viewConfig.columnOrder,
      moveColumn: state.moveColumn,
      editColumn: state.editColumn,
      deleteColumnWithCleanup: state.deleteColumnWithCleanup,
      columnWidths: state.columnWidths,
      updateCellValue: state.updateCellValue,
      activeView: state.views.find(view => view.id === state.activeViewId),
    }));

    const orderedColumns = useMemo(
      () => orderVisibleColumns(columns, columnOrder),
      [columns, columnOrder]
    );
    const primaryColumn = orderedColumns.find(col => col.isPrimary);
    const propertyColumns = orderedColumns.filter(col => !col.isPrimary);

    const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
    const [confirmDeleteColumn, setConfirmDeleteColumn] = useState<ColumnDef | null>(null);
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);
    const [showEmpty, setShowEmpty] = useState(false);
    // 折叠集合在进入某行时定格：填了又清空的字段留在原位，不会突然跳走
    const [fold, setFold] = useState<{ rowId: string; ids: Set<string> } | null>(null);
    if (row && fold?.rowId !== row.id) {
      setFold({ rowId: row.id, ids: collectFoldedColumnIds(row, propertyColumns, pluginManager) });
      setShowEmpty(false);
      setPreviewIndex(null);
    }

    const [bodyEl, setBodyEl] = useState<HTMLDivElement | null>(null);
    const [mainEl, setMainEl] = useState<HTMLDivElement | null>(null);
    const [railEl, setRailEl] = useState<HTMLElement | null>(null);
    useEdgeFade(bodyEl);
    useEdgeFade(mainEl);
    useEdgeFade(railEl);

    useEffect(() => {
      if (!row) onClose();
    }, [row, onClose]);

    const commitCell = useMemoizedFn((targetRowId: string, columnId: string, value: CellValue) => {
      if (commitRowPatch) {
        Promise.resolve(commitRowPatch(targetRowId, { [columnId]: value })).catch(error => {
          console.error("保存行属性失败:", error);
        });
        return;
      }
      const column = columns.find(col => col.id === columnId);
      const next = column
        ? pluginManager.transformBeforeSave(column.type, value, column.config)
        : value;
      updateCellValue(targetRowId, columnId, next);
    });

    const flushDescription = () => bodyRef.current?.flush();

    const handleClose = useMemoizedFn(async () => {
      await flushDescription();
      onClose();
    });

    const { index, prev, next } = neighborRowIds(rowIds, currentId);
    const goTo = useMemoizedFn(async (targetId: string | null) => {
      if (!targetId) return;
      await flushDescription();
      setCurrentId(targetId);
    });

    const handleKeyDown = useMemoizedFn((e: KeyboardEvent<HTMLDivElement>) => {
      if (e.nativeEvent.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        void goTo(e.key === "j" ? next : prev);
      }
    });

    const handleSaveColumnConfig = useMemoizedFn((columnData: Partial<ColumnDef>) => {
      if (!editingColumnId) return;
      editColumn(editingColumnId, columnData);
      setEditingColumnId(null);
    });

    const handleDeleteColumn = useMemoizedFn((column: ColumnDef) => {
      if (readonly || column.isPrimary || !allowDeleteColumn) return;
      setConfirmDeleteColumn(column);
    });

    const handleColumnConfigChange = useMemoizedFn((updated: ColumnDef) => {
      // 在选项编辑器里新建的选项要同步到列配置
      editColumn(updated.id, updated);
    });

    const editingColumnData = useMemo(() => {
      if (!editingColumnId) return null;
      const found = columns.find(col => col.id === editingColumnId);
      if (!found) return null;
      return { ...found, width: columnWidths[editingColumnId] || found.width || 200 } as ColumnDef;
    }, [editingColumnId, columns, columnWidths]);

    if (!row) return null;

    const title = primaryColumn ? String(row[primaryColumn.id] ?? "") : "";
    const foldedIds = fold?.ids ?? new Set<string>();
    const isHidden = (column: ColumnDef) =>
      foldedIds.has(column.id) && isEmptyCellValue(row[column.id]);
    const hiddenCount = propertyColumns.filter(isHidden).length;
    const visibleColumns = showEmpty ? propertyColumns : propertyColumns.filter(c => !isHidden(c));
    const cover = coverImagesOf(row, propertyColumns);

    return (
      <Dialog
        open
        onOpenChange={open => !open && void handleClose()}
        title={title || "行详情"}
        width={1120}
        height={880}
        onKeyDown={handleKeyDown}
        className="overflow-hidden"
        header={
          <RowDetailHeader
            viewName={activeView?.name}
            viewType={activeView?.type}
            title={title}
            index={index}
            total={rowIds.length}
            onPrev={prev ? () => void goTo(prev) : undefined}
            onNext={next ? () => void goTo(next) : undefined}
            onDeleteRow={onDeleteRow && !readonly ? () => onDeleteRow(row.id) : undefined}
            onClose={() => void handleClose()}
          />
        }
      >
        <div className="@container/row-detail flex min-h-0 flex-1 flex-col">
          <div
            ref={setBodyEl}
            className={cn(
              FADE_SCROLL_CLASS,
              "flex min-h-0 flex-1 flex-col pb-16 pl-8 pr-[26px]",
              "@min-[960px]/row-detail:grid @min-[960px]/row-detail:grid-cols-[minmax(0,1fr)_320px] @min-[960px]/row-detail:grid-rows-[minmax(0,1fr)]",
              "@min-[960px]/row-detail:overflow-hidden @min-[960px]/row-detail:border-r-0 @min-[960px]/row-detail:p-0"
            )}
          >
            <div
              ref={setMainEl}
              className={cn(
                FADE_SCROLL_CLASS,
                "contents",
                "@min-[960px]/row-detail:block @min-[960px]/row-detail:pb-[72px] @min-[960px]/row-detail:pl-[60px] @min-[960px]/row-detail:pr-[46px] @min-[960px]/row-detail:pt-2.5"
              )}
            >
              {primaryColumn && (
                <div className="@min-[960px]/row-detail:order-none order-1 mb-5 mt-2">
                  <TitleField
                    key={row.id}
                    rowId={row.id}
                    value={title}
                    placeholder={`输入${primaryColumn.title}`}
                    readonly={readonly || Boolean(primaryColumn.readonly)}
                    onCommit={(targetRowId, value) =>
                      commitCell(targetRowId, primaryColumn.id, value)
                    }
                  />
                </div>
              )}
              {RowDetailBody && (
                <div className="@min-[960px]/row-detail:order-none @min-[960px]/row-detail:mt-0 order-3 mt-7 max-w-[700px]">
                  <RowDetailBody
                    key={row.id}
                    ref={bodyRef}
                    row={row}
                    readonly={readonly}
                    isRowPresent={() => store.getState().rows.some(item => item.id === row.id)}
                    onRowChange={patch => {
                      if (!store.getState().rows.some(item => item.id === row.id)) return false;
                      if (commitRowPatch) return commitRowPatch(row.id, patch);
                      for (const [field, value] of Object.entries(patch)) {
                        if (field !== "id") commitCell(row.id, field, value);
                      }
                    }}
                  />
                </div>
              )}
            </div>

            <aside
              ref={setRailEl}
              className={cn(
                FADE_SCROLL_CLASS,
                "order-2",
                "@min-[960px]/row-detail:order-none @min-[960px]/row-detail:pb-10 @min-[960px]/row-detail:pl-[26px] @min-[960px]/row-detail:pr-4 @min-[960px]/row-detail:pt-1.5"
              )}
            >
              {cover.length > 0 && (
                <RowCover rowId={row.id} image={cover[0]} onPreview={() => setPreviewIndex(0)} />
              )}
              <div className="flex flex-col gap-px">
                {visibleColumns.map(column => (
                  <PropertyRow
                    key={`${row.id}:${column.id}`}
                    rowId={row.id}
                    column={column}
                    value={row[column.id]}
                    pluginManager={pluginManager}
                    theme={theme}
                    readonly={readonly}
                    columnOrder={columnOrder}
                    moveColumn={moveColumn}
                    allowDelete={allowDeleteColumn}
                    onCommit={commitCell}
                    onEditColumn={setEditingColumnId}
                    onDeleteColumn={handleDeleteColumn}
                    onColumnChange={handleColumnConfigChange}
                  />
                ))}
              </div>
              {((!readonly && onAddColumn) || hiddenCount > 0) && (
                <div className="mt-0.5 flex flex-wrap gap-0.5">
                  {!readonly && onAddColumn && (
                    <button type="button" onClick={onAddColumn} className={GHOST_BUTTON_CLASS}>
                      <Plus className="size-3.5" strokeWidth={1.75} />
                      添加属性
                    </button>
                  )}
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowEmpty(v => !v)}
                      className={GHOST_BUTTON_CLASS}
                    >
                      {showEmpty ? (
                        <ChevronUp className="size-3.5" strokeWidth={1.75} />
                      ) : (
                        <ChevronDown className="size-3.5" strokeWidth={1.75} />
                      )}
                      {showEmpty ? "收起空属性" : `还有 ${hiddenCount} 个空属性`}
                    </button>
                  )}
                </div>
              )}
            </aside>
          </div>
        </div>

        <ImagePreview
          images={cover.map(image => ({ src: image.url, alt: image.alt }))}
          index={previewIndex ?? 0}
          onIndexChange={setPreviewIndex}
          open={previewIndex !== null}
          onOpenChange={open => !open && setPreviewIndex(null)}
          ImageComponent={Image}
        />
        {editingColumnData && (
          <ColumnEditModal
            open
            column={editingColumnData}
            onCancel={() => setEditingColumnId(null)}
            onSave={handleSaveColumnConfig}
            theme={theme}
            pluginManager={pluginManager}
          />
        )}
        <ConfirmDialog
          open={confirmDeleteColumn !== null}
          onOpenChange={open => {
            if (!open) setConfirmDeleteColumn(null);
          }}
          title="确认删除属性"
          context={confirmDeleteColumn?.title}
          impact="删除属性将移除该列的所有数据"
          danger
          confirmText="删除"
          onConfirm={async () => {
            const column = confirmDeleteColumn;
            if (column) await deleteColumnWithCleanup(column.id, pluginManager);
          }}
        />
      </Dialog>
    );
  }
);

const GHOST_BUTTON_CLASS =
  "text-ink-3 hover:bg-hover hover:text-ink-2 text-tau-meta ease-tau-out flex h-8 items-center gap-1.5 rounded-[7px] px-2 transition-colors";

RowDetailModal.displayName = "RowDetailModal";

export default RowDetailModal;
