import { useMemoizedFn } from "ahooks";
import classNames from "classnames";
import { Empty, Skeleton } from "antd";
import { memo, useMemo, useState, useRef, useEffect } from "react";
import {
  RenderElementProps,
  ReactEditor,
  useSlateStatic,
  useReadOnly,
} from "slate-react";
import { Transforms } from "slate";
import { useEditDatabaseWithContext } from "@tau/shared";
import AddParagraph from "../../../components/AddParagraph";
import useDragAndDrop from "../../../hooks/useDragAndDrop";
import useIsLastElement from "../../../hooks/useIsLastElement";
import type { DatabaseElement } from "../../../types";
import styles from "../index.module.less";

interface DatabaseBlockProps {
  element: DatabaseElement;
  attributes: RenderElementProps["attributes"];
  children: RenderElementProps["children"];
}

const DatabaseBlock = memo((props: DatabaseBlockProps) => {
  const { element, attributes, children } = props;
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      // @ts-ignore
      element,
    });
  const isLast = useIsLastElement(element);
  const { tableId, height } = element;
  const databaseState = useEditDatabaseWithContext(tableId);
  const DatabaseComponent = editor.services?.components?.Database;
  const [loading, setLoading] = useState(!databaseState?.table);
  const resizeStart = useRef<number | null>(null);
  const startHeight = useRef<number>(height);

  useEffect(() => {
    setLoading(!databaseState?.table);
  }, [databaseState?.table]);

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

  const activeViewId = databaseState?.activeViewId ?? null;
  const views = databaseState?.views ?? [];
  const activeView = useMemo(() => {
    return views.find((view) => view.id === activeViewId) ?? null;
  }, [views, activeViewId]);

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

    if (!DatabaseComponent) {
      return (
        <div className={styles.empty} style={{ minHeight: `${height}em` }}>
          <Empty description="当前平台未提供数据库组件" />
        </div>
      );
    }

    if (!databaseState?.table || !activeView) {
      return (
        <div className={styles.empty} style={{ minHeight: `${height}em` }}>
          <Empty description="未找到对应的数据表" />
        </div>
      );
    }

    return (
      <div style={{ minHeight: `${height}em` }}>
        {DatabaseComponent && (
          <DatabaseComponent
            key={`${databaseState.table.id}-${activeView.id}`}
            columns={databaseState.table.columns}
            data={databaseState.table.rows}
            views={views}
            activeViewId={activeView.id}
            viewConfig={activeView.config}
            onActiveViewIdChange={databaseState?.onActiveViewIdChange}
            onViewConfigChange={databaseState?.onViewConfigChange}
            onDataChange={databaseState?.onDataChange}
            onCreateView={databaseState?.onCreateView}
            onDeleteView={databaseState?.onDeleteView}
            onRenameView={databaseState?.onRenameView}
            onUpdateView={databaseState?.onUpdateView}
            onReorderViews={databaseState?.onReorderViews}
            readonly={readOnly}
          />
        )}
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
        {!(readOnly && isLast) && (
          <AddParagraph element={element as DatabaseElement} />
        )}
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
