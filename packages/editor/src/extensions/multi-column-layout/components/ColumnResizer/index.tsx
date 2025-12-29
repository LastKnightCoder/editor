import React, { memo } from "react";
import classnames from "classnames";
import styles from "./index.module.less";

interface IColumnResizerProps {
  isResizing: boolean;
  onResizeStart: (e: React.PointerEvent) => void;
  onMouseResizeStart?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}

const ColumnResizer: React.FC<IColumnResizerProps> = memo(
  ({ isResizing, onResizeStart, onMouseResizeStart, style }) => {
    return (
      <div
        contentEditable={false}
        className={classnames(styles.columnResizer, {
          [styles.resizing]: isResizing,
        })}
        style={style}
        onPointerDown={onResizeStart}
        onMouseDown={onMouseResizeStart}
      />
    );
  },
);

ColumnResizer.displayName = "ColumnResizer";

export default ColumnResizer;
