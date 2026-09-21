import React, { useState, useEffect, useRef, memo, useMemo } from "react";
import { Maximize2, Minimize2, Pencil, Plus, Trash2, GripVertical, X } from "lucide-react";
import { ColumnDef, RowData, CellValue } from "../../types";
import { PluginManager } from "../../PluginManager";
import { getContentById, createContent } from "@/commands/content";
import { EditorRef } from "@tau/editor/src";
import Editor from "@/components/ContentEditor";
import { Descendant } from "slate";
import { useMemoizedFn } from "ahooks";
import ColumnIcon from "@/components/Database/ColumnIcon";
import { useDrag, useDrop, DragSourceMonitor } from "react-dnd";
import classNames from "classnames";
import { ConfirmDialog } from "@tau/ui/ConfirmDialog";
import ColumnEditModal from "../../views/TableView/components/ColumnEditModal";
import { useDatabaseStore } from "../../hooks";
import CustomModal from "@/components/CustomModal";

const COLUMN_ITEM_TYPE = "rowDetailModalColumn";

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

interface RowDetailModalProps {
  row: RowData;
  columns: ColumnDef[];
  pluginManager: PluginManager;
  theme: "light" | "dark";
  onClose: () => void;
  onSave: (rowData: Partial<RowData>) => void;
  onAddColumn?: () => void;
  readonly?: boolean;
  allowDeleteColumn?: boolean;
}

const RowDetailModal: React.FC<RowDetailModalProps> = memo(
  ({
    row,
    columns,
    pluginManager,
    theme,
    onClose,
    onSave,
    onAddColumn,
    readonly = false,
    allowDeleteColumn = true,
  }) => {
    const editorRef = useRef<EditorRef>(null);
    const [description, setDescription] = useState<Descendant[]>(DEFAULT_CONTENT);
    const [rowData, setRowData] = useState<RowData>({ ...row });
    const [editingColumn, setEditingColumn] = useState<string | null>(null);
    const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [confirmDeleteColumn, setConfirmDeleteColumn] = useState<ColumnDef | null>(null);

    const { columnOrder, moveColumn, editColumn, deleteColumnWithCleanup, columnWidths } =
      useDatabaseStore(state => ({
        columnOrder: state.viewConfig.columnOrder,
        moveColumn: state.moveColumn,
        editColumn: state.editColumn,
        deleteColumnWithCleanup: state.deleteColumnWithCleanup,
        columnWidths: state.columnWidths,
      }));

    const orderedColumns = useMemo(() => {
      const visibleColumns = columns.filter(col => !col.hidden);
      const orderIndexMap = new Map(columnOrder.map((id, index) => [id, index]));
      return [...visibleColumns].sort((a, b) => {
        const indexA = orderIndexMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const indexB = orderIndexMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return indexA - indexB;
      });
    }, [columns, columnOrder]);

    const primaryColumn = orderedColumns.find(col => col.isPrimary);
    const otherColumns = orderedColumns.filter(col => !col.isPrimary);

    useEffect(() => {
      const loadDescription = async () => {
        if (row.detailContentId && row.detailContentId > 0) {
          try {
            const content = await getContentById(row.detailContentId);
            if (content?.content) {
              setDescription(content.content);
              editorRef.current?.setEditorValue(content.content);
            } else {
              setDescription(DEFAULT_CONTENT);
              editorRef.current?.setEditorValue(DEFAULT_CONTENT);
            }
          } catch (error) {
            console.error("Failed to load description:", error);
            setDescription(DEFAULT_CONTENT);
            editorRef.current?.setEditorValue(DEFAULT_CONTENT);
          }
        } else {
          setDescription(DEFAULT_CONTENT);
          editorRef.current?.setEditorValue(DEFAULT_CONTENT);
        }
      };

      loadDescription();
    }, [row.detailContentId]);

    const handleClose = useMemoizedFn(async () => {
      const hasContent = JSON.stringify(description) !== JSON.stringify(DEFAULT_CONTENT);
      let detailContentId = row.detailContentId || 0;

      if (hasContent) {
        if (row.detailContentId && row.detailContentId > 0) {
          detailContentId = row.detailContentId;
        } else {
          const contentId = await createContent(description, 0);
          if (contentId) {
            detailContentId = contentId;
          }
        }
      }

      onSave({
        ...rowData,
        detailContentId,
      });
      onClose();
    });

    const handleColumnValueChange = useMemoizedFn((columnId: string, value: CellValue) => {
      setRowData((prev: RowData) => ({
        ...prev,
        [columnId]: value,
      }));
    });

    const handleOpenColumnEditor = useMemoizedFn((columnId: string) => {
      if (readonly) return;
      setEditingColumnId(columnId);
    });

    const handleCloseColumnEditor = useMemoizedFn(() => {
      setEditingColumnId(null);
    });

    const handleSaveColumnConfig = useMemoizedFn((columnData: Partial<ColumnDef>) => {
      if (!editingColumnId) return;
      editColumn(editingColumnId, columnData);
      handleCloseColumnEditor();
    });

    const handleDeleteColumn = useMemoizedFn((column: ColumnDef) => {
      if (readonly || column.isPrimary || !allowDeleteColumn) {
        return;
      }

      setConfirmDeleteColumn(column);
    });

    const handleConfirmDeleteColumn = useMemoizedFn(async () => {
      const column = confirmDeleteColumn;
      if (!column) return;
      await deleteColumnWithCleanup(column.id, pluginManager);
      setRowData((prev: RowData) => {
        const next = { ...prev } as RowData;
        delete next[column.id];
        return next;
      });
    });

    const handleColumnConfigChange = useMemoizedFn((updated: ColumnDef) => {
      // 将在选择器中编辑产生的新列配置同步到全局 store
      editColumn(updated.id, updated);
    });

    const editingColumnData = useMemo(() => {
      if (!editingColumnId) return null;
      const found = columns.find(col => col.id === editingColumnId);
      if (!found) return null;
      const width = columnWidths[editingColumnId] || found.width || 200;
      return { ...found, width } as ColumnDef;
    }, [editingColumnId, columns, columnWidths]);

    const modalWidth = isExpanded ? "100vw" : 720;
    const modalContentStyle = isExpanded
      ? {
          height: "calc(100vh - var(--title-bar-height, 48px))",
          maxHeight: "calc(100vh - var(--title-bar-height, 48px))",
        }
      : {
          height: "min(800px, calc(100vh - 200px))",
        };

    const modalOverlayStyle = isExpanded
      ? {
          top: "var(--title-bar-height, 48px)",
        }
      : undefined;

    return (
      <CustomModal
        open
        width={modalWidth}
        onCancel={handleClose}
        footer={null}
        destroyOnClose
        closeOnEscape={false}
        showCloseButton={false}
        centered={!isExpanded}
        overlayClassName={isExpanded ? "!items-start !px-0 !pt-0 !pb-0" : ""}
        overlayStyle={modalOverlayStyle}
        contentClassName={classNames("p-0", isExpanded && "!rounded-none !border-0 !shadow-none")}
        bodyClassName="h-full overflow-hidden"
        contentStyle={modalContentStyle}
      >
        <div
          className={classNames(
            "flex h-full min-h-0 flex-col",
            isExpanded ? "px-12 py-6" : "px-10 py-4"
          )}
        >
          <div
            className={classNames(
              "min-h-0 flex-1 overflow-y-auto pb-4",
              isExpanded ? "pr-6" : "pr-4"
            )}
          >
            <div className="mb-5 flex shrink-0 items-start gap-4">
              <div className="min-w-0 flex-1">
                {primaryColumn && (
                  <input
                    type="text"
                    value={String(rowData[primaryColumn.id] || "")}
                    onChange={e => handleColumnValueChange(primaryColumn.id, e.target.value)}
                    disabled={readonly || primaryColumn.readonly}
                    className={classNames(
                      "text-ink-1 w-full border-0 bg-transparent px-0 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60",
                      isExpanded ? "py-1 text-[34px]" : "py-1 text-2xl"
                    )}
                    placeholder={`输入${primaryColumn.title}`}
                  />
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  className="text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm flex h-8 w-8 cursor-pointer items-center justify-center transition-colors"
                  onClick={() => setIsExpanded(prev => !prev)}
                  title={isExpanded ? "退出展开" : "展开"}
                >
                  {isExpanded ? (
                    <Minimize2 className="h-4 w-4" strokeWidth={1.75} />
                  ) : (
                    <Maximize2 className="h-4 w-4" strokeWidth={1.75} />
                  )}
                </button>
                <button
                  type="button"
                  className="text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm flex h-8 w-8 cursor-pointer items-center justify-center transition-colors"
                  onClick={handleClose}
                  title="关闭"
                >
                  <X className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>
            {otherColumns.length > 0 && (
              <div className="mb-5 shrink-0">
                <div className="space-y-1">
                  {otherColumns.map(column => (
                    <ColumnPropertyRow
                      key={column.id}
                      column={column}
                      columnOrder={columnOrder}
                      moveColumn={moveColumn}
                      pluginManager={pluginManager}
                      theme={theme}
                      rowData={rowData}
                      readonly={readonly}
                      editingColumnId={editingColumn}
                      setEditingColumnId={setEditingColumn}
                      onColumnValueChange={handleColumnValueChange}
                      allowDeleteColumn={allowDeleteColumn}
                      onDeleteColumn={handleDeleteColumn}
                      onEditColumnConfig={handleOpenColumnEditor}
                      onColumnConfigChange={handleColumnConfigChange}
                    />
                  ))}
                </div>
                {!readonly && onAddColumn && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onAddColumn();
                    }}
                    className="text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm text-tau-sm flex h-9 cursor-pointer items-center gap-2 px-2 transition-colors"
                  >
                    <Plus className="h-[14px] w-[14px]" strokeWidth={1.75} />
                    <span>添加属性</span>
                  </button>
                )}
              </div>
            )}

            <div>
              <Editor
                contentId={row.detailContentId || undefined}
                ref={editorRef}
                initValue={DEFAULT_CONTENT}
                onChange={setDescription}
                readonly={readonly}
                placeHolder="添加详细描述..."
                className="break-words [overflow-wrap:anywhere]"
                style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}
              />
            </div>
          </div>
          {editingColumnData && (
            <ColumnEditModal
              open={Boolean(editingColumnData)}
              column={editingColumnData}
              onCancel={handleCloseColumnEditor}
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
            onConfirm={() => handleConfirmDeleteColumn()}
          />
        </div>
      </CustomModal>
    );
  }
);

RowDetailModal.displayName = "RowDetailModal";

export default RowDetailModal;

interface ColumnPropertyRowProps {
  column: ColumnDef;
  columnOrder: string[];
  moveColumn: (columnId: string, targetId: string) => void;
  pluginManager: PluginManager;
  theme: "light" | "dark";
  rowData: RowData;
  readonly: boolean;
  editingColumnId: string | null;
  setEditingColumnId: (columnId: string | null) => void;
  onColumnValueChange: (columnId: string, value: CellValue) => void;
  allowDeleteColumn: boolean;
  onDeleteColumn: (column: ColumnDef) => void;
  onEditColumnConfig: (columnId: string) => void;
  onColumnConfigChange: (column: ColumnDef) => void;
}

interface DragItem {
  id: string;
  orderIndex: number;
  type: string;
}

const ColumnPropertyRow: React.FC<ColumnPropertyRowProps> = ({
  column,
  columnOrder,
  moveColumn,
  pluginManager,
  theme,
  rowData,
  readonly,
  editingColumnId,
  setEditingColumnId,
  onColumnValueChange,
  allowDeleteColumn,
  onDeleteColumn,
  onEditColumnConfig,
  onColumnConfigChange,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const plugin = pluginManager.getPlugin(column.type);
  const PluginEditor = plugin?.Editor;
  const Renderer = plugin?.Renderer;
  const isEditing = editingColumnId === column.id;
  const isColumnReadonly = Boolean(readonly || column.readonly);
  const orderIndex = columnOrder.indexOf(column.id);

  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: COLUMN_ITEM_TYPE,
      item: { id: column.id, orderIndex, type: COLUMN_ITEM_TYPE },
      canDrag: () => !readonly,
      collect: (monitor: DragSourceMonitor) => ({
        isDragging: monitor.isDragging(),
      }),
    }),
    [column.id, orderIndex, readonly]
  );

  const [, drop] = useDrop(
    () => ({
      accept: COLUMN_ITEM_TYPE,
      hover: (item: DragItem) => {
        if (!ref.current || readonly) return;
        if (item.id === column.id) return;

        const hoverIndex = columnOrder.indexOf(column.id);
        if (hoverIndex === -1 || item.orderIndex === hoverIndex) return;

        moveColumn(item.id, column.id);
        item.orderIndex = hoverIndex;
      },
    }),
    [column.id, readonly, columnOrder, moveColumn]
  );

  drag(drop(ref));

  const handleRowClick = () => {
    if (!isColumnReadonly && !isEditing && PluginEditor) {
      setEditingColumnId(column.id);
    }
  };

  const valueRenderer = () => {
    if (!isColumnReadonly && isEditing && PluginEditor) {
      return (
        <PluginEditor
          value={rowData[column.id]}
          column={column}
          onCellValueChange={(value: CellValue) => {
            onColumnValueChange(column.id, value);
          }}
          onFinishEdit={() => {
            setEditingColumnId(null);
          }}
          onColumnChange={(updatedColumn: ColumnDef) => {
            onColumnConfigChange(updatedColumn);
          }}
          theme={theme}
          readonly={isColumnReadonly}
        />
      );
    }

    if (Renderer) {
      return (
        <Renderer
          value={rowData[column.id]}
          column={column}
          theme={theme}
          readonly={isColumnReadonly}
          onCellValueChange={(value: CellValue) => onColumnValueChange(column.id, value)}
        />
      );
    }

    return <span className="text-tau-body text-ink-1">{String(rowData[column.id] || "")}</span>;
  };

  return (
    <div
      ref={ref}
      className={classNames(
        "rounded-tau-sm flex min-w-0 items-center gap-3 px-2 py-1 transition-colors",
        {
          "hover:bg-hover cursor-pointer": !readonly,
          "opacity-50": isDragging,
        }
      )}
      onClick={handleRowClick}
    >
      {!readonly && (
        <span className="text-ink-3 cursor-grab">
          <GripVertical className="size-4" strokeWidth={1.75} />
        </span>
      )}
      <div className="flex w-32 shrink-0 items-center gap-2">
        <ColumnIcon type={column.type} pluginManager={pluginManager} />
        <span className="text-tau-sm text-ink-2 truncate">{column.title}</span>
      </div>
      <div className="flex min-h-[40px] min-w-0 flex-1 items-center">
        <div className="w-full min-w-0">{valueRenderer()}</div>
      </div>
      {!readonly && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="text-ink-3 hover:text-ink-1 grid size-6 place-items-center rounded-[7px]"
            onClick={e => {
              e.stopPropagation();
              onEditColumnConfig(column.id);
            }}
            title="编辑属性"
          >
            <Pencil className="h-[14px] w-[14px]" strokeWidth={1.75} />
          </button>
          {allowDeleteColumn && (
            <button
              type="button"
              className="text-ink-3 hover:text-danger grid size-6 place-items-center rounded-[7px]"
              onClick={e => {
                e.stopPropagation();
                onDeleteColumn(column);
              }}
              title="删除属性"
            >
              <Trash2 className="h-[14px] w-[14px]" strokeWidth={1.75} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
