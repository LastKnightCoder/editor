import { useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { useDrag, useDrop } from "react-dnd";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { cn, Menu } from "@tau/ui";
import ColumnIcon from "../../ColumnIcon";
import type { CellValue, ColumnDef } from "../../types";
import type PluginManager from "../../PluginManager";
import useCellEditor from "../../hooks/useCellEditor";
import { useValidation } from "../../hooks/useValidation";
import { isEmptyCellValue } from "./utils";

const COLUMN_ITEM_TYPE = "rowDetailModalColumn";

interface DragItem {
  id: string;
  orderIndex: number;
}

interface PropertyRowProps {
  /** 所属行：卸载时补存草稿要写回这一行，而不是切换后的新行 */
  rowId: string;
  column: ColumnDef;
  value: CellValue;
  pluginManager: PluginManager;
  theme: "light" | "dark";
  readonly: boolean;
  columnOrder: string[];
  moveColumn: (columnId: string, targetId: string) => void;
  allowDelete: boolean;
  onCommit: (rowId: string, columnId: string, value: CellValue) => void;
  onEditColumn: (columnId: string) => void;
  onDeleteColumn: (column: ColumnDef) => void;
  onColumnChange: (column: ColumnDef) => void;
}

const PropertyRow = ({
  rowId,
  column,
  value,
  pluginManager,
  theme,
  readonly,
  columnOrder,
  moveColumn,
  allowDelete,
  onCommit,
  onEditColumn,
  onDeleteColumn,
  onColumnChange,
}: PropertyRowProps) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const gripRef = useRef<HTMLSpanElement>(null);
  const plugin = pluginManager.getPlugin(column.type);
  const PluginEditor = plugin?.editable ? plugin.Editor : undefined;
  const Renderer = plugin?.Renderer;
  const isColumnReadonly = Boolean(readonly || column.readonly);

  const commit = useMemoizedFn((next: CellValue) => onCommit(rowId, column.id, next));
  const { isEditing, draftValue, startEditing, handleChange, finishEdit } = useCellEditor(
    value,
    commit,
    column.validation
  );
  const { error } = useValidation(draftValue, column.validation);

  // 关闭弹窗或切换行时编辑器直接卸载、不会触发失焦，这里补存一次草稿（校验不过则丢弃）
  const flushRef = useRef<(() => void) | undefined>(undefined);
  flushRef.current = isEditing ? finishEdit : undefined;
  useEffect(() => () => flushRef.current?.(), []);

  const orderIndex = columnOrder.indexOf(column.id);
  const [{ isDragging }, drag, preview] = useDrag(
    () => ({
      type: COLUMN_ITEM_TYPE,
      item: { id: column.id, orderIndex },
      canDrag: () => !readonly,
      collect: monitor => ({ isDragging: monitor.isDragging() }),
    }),
    [column.id, orderIndex, readonly]
  );
  const [, drop] = useDrop(
    () => ({
      accept: COLUMN_ITEM_TYPE,
      hover: (item: DragItem) => {
        if (readonly || item.id === column.id) return;
        const hoverIndex = columnOrder.indexOf(column.id);
        if (hoverIndex === -1 || item.orderIndex === hoverIndex) return;
        moveColumn(item.id, column.id);
        item.orderIndex = hoverIndex;
      },
    }),
    [column.id, readonly, columnOrder, moveColumn]
  );
  drag(gripRef);
  drop(preview(rowRef));

  const canEdit = !isColumnReadonly && Boolean(PluginEditor);

  const renderValue = () => {
    if (isEditing && PluginEditor) {
      return (
        <PluginEditor
          value={draftValue}
          column={column}
          onCellValueChange={handleChange}
          onFinishEdit={finishEdit}
          onColumnChange={onColumnChange}
          theme={theme}
          readonly={isColumnReadonly}
          autoOpen
        />
      );
    }
    // 有 Editor 的字段空着时显示占位；星级、勾选等渲染器本身就是输入控件，照常渲染
    if (PluginEditor && isEmptyCellValue(value)) {
      return <span className="text-ink-3 px-2">空</span>;
    }
    if (Renderer) {
      return (
        <Renderer
          value={value}
          column={column}
          theme={theme}
          readonly={isColumnReadonly}
          onCellValueChange={commit}
        />
      );
    }
    return <span className="text-ink-1 px-2">{String(value ?? "")}</span>;
  };

  const label = (
    <>
      <ColumnIcon type={column.type} pluginManager={pluginManager} />
      <span className="truncate">{column.title}</span>
    </>
  );
  const labelClass =
    "text-ink-2 text-tau-meta rounded-[7px] flex h-[34px] min-w-0 items-center px-2 text-left";

  return (
    <div
      ref={rowRef}
      className={cn(
        "group/prop relative grid grid-cols-[88px_minmax(0,1fr)] items-start gap-1.5",
        isDragging && "opacity-50"
      )}
    >
      {!readonly && (
        <span
          ref={gripRef}
          aria-hidden
          title="拖动调整顺序"
          className="text-ink-3 absolute -left-5 top-[6px] grid h-[22px] w-[18px] cursor-grab place-items-center rounded-[5px] opacity-0 transition-opacity group-hover/prop:opacity-100"
        >
          <GripVertical className="size-3.5" strokeWidth={1.75} />
        </span>
      )}
      {readonly ? (
        <div className={labelClass}>{label}</div>
      ) : (
        <Menu
          trigger={
            <button
              type="button"
              className={cn(labelClass, "hover:bg-hover ease-tau-out transition-colors")}
            >
              {label}
            </button>
          }
        >
          <Menu.Item
            icon={<Pencil className="size-3.5" strokeWidth={1.75} />}
            onSelect={() => onEditColumn(column.id)}
          >
            编辑属性
          </Menu.Item>
          {allowDelete && !column.isPrimary && (
            <>
              <Menu.Separator />
              <Menu.Item
                danger
                icon={<Trash2 className="size-3.5" strokeWidth={1.75} />}
                onSelect={() => onDeleteColumn(column)}
              >
                删除属性
              </Menu.Item>
            </>
          )}
        </Menu>
      )}
      <div
        className={cn(
          "text-tau-body text-ink-1 flex min-h-[34px] min-w-0 items-center rounded-[7px]",
          canEdit && !isEditing && "hover:bg-hover ease-tau-out cursor-pointer transition-colors",
          isEditing && "ring-accent ring-2"
        )}
        onClick={() => {
          if (canEdit && !isEditing) startEditing();
        }}
      >
        <div className="w-full min-w-0">{renderValue()}</div>
      </div>
      {isEditing && error && (
        <p className="text-danger text-tau-sm col-start-2 px-2 pb-1">{error}</p>
      )}
    </div>
  );
};

export default PropertyRow;
