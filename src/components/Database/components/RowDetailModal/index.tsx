import React, { useState, useEffect, useRef, memo, useMemo } from "react";
import {
  MdAdd,
  MdDragIndicator,
  MdDeleteOutline,
  MdOutlineEdit,
} from "react-icons/md";
import { ColumnDef, RowData, CellValue } from "../../types";
import { PluginManager } from "../../PluginManager";
import {
  getContentById,
  createContent,
  updateContent,
} from "@/commands/content";
import Editor, { EditorRef } from "@/components/Editor";
import { Descendant } from "slate";
import { useMemoizedFn } from "ahooks";
import ColumnIcon from "@/components/Database/ColumnIcon";
import { App, Modal } from "antd";
import { useDrag, useDrop, DragSourceMonitor } from "react-dnd";
import classNames from "classnames";
import ColumnEditModal from "../../views/TableView/components/ColumnEditModal";
import { useDatabaseStore } from "../../hooks";

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
    const [description, setDescription] =
      useState<Descendant[]>(DEFAULT_CONTENT);
    const [rowData, setRowData] = useState<RowData>({ ...row });
    const [editingColumn, setEditingColumn] = useState<string | null>(null);
    const [editingColumnId, setEditingColumnId] = useState<string | null>(null);

    const { modal } = App.useApp();

    const {
      columnOrder,
      moveColumn,
      editColumn,
      deleteColumnWithCleanup,
      columnWidths,
    } = useDatabaseStore((state) => ({
      columnOrder: state.viewConfig.columnOrder,
      moveColumn: state.moveColumn,
      editColumn: state.editColumn,
      deleteColumnWithCleanup: state.deleteColumnWithCleanup,
      columnWidths: state.columnWidths,
    }));

    const orderedColumns = useMemo(() => {
      const visibleColumns = columns.filter((col) => !col.hidden);
      const orderIndexMap = new Map(
        columnOrder.map((id, index) => [id, index]),
      );
      return [...visibleColumns].sort((a, b) => {
        const indexA = orderIndexMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const indexB = orderIndexMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return indexA - indexB;
      });
    }, [columns, columnOrder]);

    const primaryColumn = orderedColumns.find((col) => col.isPrimary);
    const otherColumns = orderedColumns.filter((col) => !col.isPrimary);

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
      const hasContent =
        JSON.stringify(description) !== JSON.stringify(DEFAULT_CONTENT);
      let detailContentId = row.detailContentId || 0;

      if (hasContent) {
        if (row.detailContentId && row.detailContentId > 0) {
          await updateContent(row.detailContentId, description);
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

    const handleColumnValueChange = useMemoizedFn(
      (columnId: string, value: CellValue) => {
        setRowData((prev: RowData) => ({
          ...prev,
          [columnId]: value,
        }));
      },
    );

    const handleOpenColumnEditor = useMemoizedFn((columnId: string) => {
      if (readonly) return;
      setEditingColumnId(columnId);
    });

    const handleCloseColumnEditor = useMemoizedFn(() => {
      setEditingColumnId(null);
    });

    const handleSaveColumnConfig = useMemoizedFn(
      (columnData: Partial<ColumnDef>) => {
        if (!editingColumnId) return;
        editColumn(editingColumnId, columnData);
        handleCloseColumnEditor();
      },
    );

    const handleDeleteColumn = useMemoizedFn((column: ColumnDef) => {
      if (readonly || column.isPrimary || !allowDeleteColumn) {
        return;
      }

      modal.confirm({
        title: "确认删除属性",
        content: `删除属性“${column.title}”将移除所有相关数据，是否继续？`,
        okText: "删除",
        cancelText: "取消",
        okButtonProps: {
          danger: true,
        },
        onOk: async () => {
          await deleteColumnWithCleanup(column.id, pluginManager);
          setRowData((prev: RowData) => {
            const next = { ...prev } as RowData;
            delete next[column.id];
            return next;
          });
        },
      });
    });

    const handleColumnConfigChange = useMemoizedFn((updated: ColumnDef) => {
      // 将在选择器中编辑产生的新列配置同步到全局 store
      editColumn(updated.id, updated);
    });

    const editingColumnData = useMemo(() => {
      if (!editingColumnId) return null;
      const found = columns.find((col) => col.id === editingColumnId);
      if (!found) return null;
      const width = columnWidths[editingColumnId] || found.width || 200;
      return { ...found, width } as ColumnDef;
    }, [editingColumnId, columns, columnWidths]);

    return (
      <Modal
        open
        width={720}
        onCancel={handleClose}
        footer={null}
        destroyOnClose
        keyboard={false}
        styles={{
          body: {
            height: 800,
            maxHeight: "calc(100vh - 200px)",
            overflow: "hidden",
            padding: 0,
          },
        }}
      >
        <div className="flex flex-col h-full px-10">
          {primaryColumn && (
            <div className="mb-6">
              <input
                type="text"
                value={String(rowData[primaryColumn.id] || "")}
                onChange={(e) =>
                  handleColumnValueChange(primaryColumn.id, e.target.value)
                }
                disabled={readonly || primaryColumn.readonly}
                className="w-full border-0 px-0 py-2 text-2xl font-bold bg-transparent focus:outline-none dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                placeholder={`输入${primaryColumn.title}`}
              />
            </div>
          )}
          {otherColumns.length > 0 && (
            <div className="mb-6">
              <div className="space-y-1">
                {otherColumns.map((column) => (
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddColumn();
                  }}
                  className="flex items-center gap-2 h-10 px-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded transition-colors cursor-pointer"
                >
                  <MdAdd className="w-[14px] h-[14px] mr-1.5" />
                  <span>添加属性</span>
                </button>
              )}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto">
            <Editor
              ref={editorRef}
              initValue={DEFAULT_CONTENT}
              onChange={setDescription}
              readonly={readonly}
              placeHolder="添加详细描述..."
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
      </Modal>
    );
  },
);

RowDetailModal.displayName = "RowDetailModal";

export default RowDetailModal;

interface ColumnPropertyRowProps {
  column: ColumnDef;
  columnOrder: string[];
  moveColumn: (fromIndex: number, toIndex: number) => void;
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
    [column.id, orderIndex, readonly],
  );

  const [, drop] = useDrop(
    () => ({
      accept: COLUMN_ITEM_TYPE,
      hover: (item: DragItem) => {
        if (!ref.current || readonly) return;
        if (item.id === column.id) return;

        const hoverIndex = columnOrder.indexOf(column.id);
        if (hoverIndex === -1 || item.orderIndex === hoverIndex) return;

        moveColumn(item.orderIndex, hoverIndex);
        item.orderIndex = hoverIndex;
      },
    }),
    [column.id, readonly, columnOrder, moveColumn],
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
          onCellValueChange={(value: CellValue) =>
            onColumnValueChange(column.id, value)
          }
        />
      );
    }

    return (
      <span className="text-sm text-gray-900 dark:text-gray-100">
        {String(rowData[column.id] || "")}
      </span>
    );
  };

  return (
    <div
      ref={ref}
      className={classNames(
        "flex items-center gap-3 rounded px-2 py-1 transition-colors",
        {
          "hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer":
            !readonly,
          "opacity-50": isDragging,
        },
      )}
      onClick={handleRowClick}
    >
      {!readonly && (
        <span className="text-gray-400 dark:text-gray-500 cursor-grab">
          <MdDragIndicator />
        </span>
      )}
      <div className="flex items-center gap-2 w-32 flex-shrink-0">
        <ColumnIcon type={column.type} pluginManager={pluginManager} />
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {column.title}
        </span>
      </div>
      <div className="flex-1 min-h-[40px] flex items-center">
        <div className="w-full">{valueRenderer()}</div>
      </div>
      {!readonly && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            onClick={(e) => {
              e.stopPropagation();
              onEditColumnConfig(column.id);
            }}
            title="编辑属性"
          >
            <MdOutlineEdit className="w-4 h-4" />
          </button>
          {allowDeleteColumn && (
            <button
              type="button"
              className="text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteColumn(column);
              }}
              title="删除属性"
            >
              <MdDeleteOutline className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
