import React, { useState, useEffect, useRef, memo } from "react";
import { MdAdd } from "react-icons/md";
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
import { Modal } from "antd";

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
  }) => {
    const editorRef = useRef<EditorRef>(null);
    const [description, setDescription] =
      useState<Descendant[]>(DEFAULT_CONTENT);
    const [rowData, setRowData] = useState<RowData>({ ...row });
    const [editingColumn, setEditingColumn] = useState<string | null>(null);

    const primaryColumn = columns.find((col) => col.isPrimary);
    const otherColumns = columns.filter((col) => !col.isPrimary && !col.hidden);

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
              {otherColumns.map((column) => {
                const plugin = pluginManager.getPlugin(column.type);
                const Editor = plugin?.Editor;
                const Renderer = plugin?.Renderer;
                const isEditing = editingColumn === column.id;
                const isColumnReadonly = Boolean(readonly || column.readonly);

                return (
                  <div
                    key={column.id}
                    className="flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded px-2 py-0.5 transition-colors"
                    onClick={() => {
                      if (!isColumnReadonly && !isEditing && Editor) {
                        setEditingColumn(column.id);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2 w-32 flex-shrink-0">
                      <ColumnIcon
                        type={column.type}
                        pluginManager={pluginManager}
                      />
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {column.title}
                      </span>
                    </div>
                    <div className="flex-1 min-h-[40px] flex items-center">
                      {!isColumnReadonly && isEditing && Editor ? (
                        <div className="w-full">
                          <Editor
                            value={rowData[column.id]}
                            column={column}
                            onCellValueChange={(value: CellValue) => {
                              handleColumnValueChange(column.id, value);
                            }}
                            onFinishEdit={() => {
                              setEditingColumn(null);
                            }}
                            onColumnChange={() => {
                              /* 详情模态窗中不需要处理列变化 */
                            }}
                            theme={theme}
                            readonly={isColumnReadonly}
                          />
                        </div>
                      ) : Renderer ? (
                        <Renderer
                          value={rowData[column.id]}
                          column={column}
                          theme={theme}
                          readonly={isColumnReadonly}
                          onCellValueChange={(value: CellValue) =>
                            handleColumnValueChange(column.id, value)
                          }
                        />
                      ) : (
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {String(rowData[column.id] || "")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
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
      </Modal>
    );
  },
);

RowDetailModal.displayName = "RowDetailModal";

export default RowDetailModal;
