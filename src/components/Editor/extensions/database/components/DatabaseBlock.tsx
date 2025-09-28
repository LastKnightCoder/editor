import { useMemoizedFn } from "ahooks";
import classNames from "classnames";
import { Empty, Skeleton } from "antd";
import { memo, useMemo, useState, useRef, useEffect } from "react";
import {
  RenderElementProps,
  ReactEditor,
  useSlate,
  useReadOnly,
} from "slate-react";
import { Transforms } from "slate";
import AddParagraph from "@/components/Editor/components/AddParagraph";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop";
import { DatabaseElement } from "@/components/Editor/types";
import Database, { ColumnDef, RowData } from "@/components/Database";
import useEditDatabase from "@/hooks/useEditDatabase";
import styles from "../index.module.less";

interface DatabaseBlockProps {
  element: DatabaseElement;
  attributes: RenderElementProps["attributes"];
  children: RenderElementProps["children"];
}

const DatabaseBlock = memo((props: DatabaseBlockProps) => {
  const { element, attributes, children } = props;
  const editor = useSlate();
  const readOnly = useReadOnly();
  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      // @ts-ignore
      element,
    });

  const { tableId, height } = element;
  const {
    activeViewId,
    views,
    table,
    onDataChange,
    onViewConfigChange,
    onCreateView,
    onDeleteView,
    onRenameView,
    onReorderViews,
    onActiveViewIdChange,
  } = useEditDatabase(tableId);
  const [loading, setLoading] = useState(true);
  const resizeStart = useRef<number | null>(null);
  const startHeight = useRef<number>(height);

  useEffect(() => {
    if (table) {
      setLoading(false);
    }
  }, [table]);

  const handleResizeMove = useMemoizedFn((event: MouseEvent) => {
    if (resizeStart.current == null) return;
    const delta = event.clientY - resizeStart.current;
    const nextHeight = Math.max(
      12,
      Math.min(60, startHeight.current + delta / 16),
    );
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { height: nextHeight }, { at: path });
  });

  const handleResizeEnd = useMemoizedFn(() => {
    resizeStart.current = null;
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
  });

  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
    };
  }, [handleResizeMove, handleResizeEnd]);

  const handleResizeStart = useMemoizedFn(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (readOnly) return;
      event.preventDefault();
      resizeStart.current = event.clientY;
      startHeight.current = element.height;
      document.addEventListener("mousemove", handleResizeMove);
      document.addEventListener("mouseup", handleResizeEnd);
    },
  );

  const activeView = useMemo(
    () => views.find((view) => view.id === activeViewId) ?? null,
    [views, activeViewId],
  );

  const renderContent = () => {
    if (loading) {
      return (
        <Skeleton
          active
          paragraph={false}
          style={{ minHeight: `${height}em`, margin: "3em 0" }}
        />
      );
    }

    if (!table || !activeView) {
      return (
        <div className={styles.empty} style={{ minHeight: `${height}em` }}>
          <Empty description="未找到对应的数据表" />
        </div>
      );
    }

    return (
      <div style={{ minHeight: `${height}em` }}>
        <Database
          key={`${table.id}-${activeView.id}`}
          columns={table.columns as ColumnDef[]}
          data={table.rows as RowData[]}
          views={views}
          activeViewId={activeView.id}
          viewConfig={activeView.config}
          onActiveViewIdChange={onActiveViewIdChange}
          onViewConfigChange={onViewConfigChange}
          onDataChange={onDataChange}
          onCreateView={onCreateView}
          onDeleteView={onDeleteView}
          onRenameView={onRenameView}
          onReorderViews={onReorderViews}
          readonly={readOnly}
        />
      </div>
    );
  };

  return (
    <div
      ref={drop}
      className={classNames(styles.container, {
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}
    >
      <div {...attributes} contentEditable={false}>
        <div className={styles.databaseWrapper}>{renderContent()}</div>
        <div
          style={{
            height: "0.75em",
            cursor: readOnly ? "default" : "row-resize",
          }}
          onMouseDown={handleResizeStart}
        />
        {children}
        <AddParagraph element={element as DatabaseElement} />
        {!readOnly && (
          <div
            ref={drag}
            className={classNames(styles.dragHandler, {
              [styles.canDrag]: canDrag,
            })}
          />
        )}
      </div>
    </div>
  );
});

DatabaseBlock.displayName = "DatabaseBlock";

export default DatabaseBlock;
