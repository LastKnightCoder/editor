import React, { useEffect, useState, PropsWithChildren } from 'react';
import classnames from "classnames";

import styles from './index.module.less';
import { useMemoizedFn } from "ahooks";

interface IWidthResizableProps {
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  onResize?: (width: number) => void;
  className?: string;
  style?: React.CSSProperties;
}

const WidthResizable: React.FC<PropsWithChildren<IWidthResizableProps>> = (props) => {
  const {
    defaultWidth,
    minWidth,
    maxWidth,
    onResize,
    className,
    style = {}
  } = props;
  const containerRef = React.useRef<HTMLDivElement>(null);

  const [width, setWidth] = useState<number>(() => {
    if (minWidth && defaultWidth < minWidth) return minWidth;
    if (maxWidth && defaultWidth > maxWidth) return maxWidth;
    return defaultWidth;
  });
  const [isResizing, setIsResizing] = useState<boolean>(false);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    setIsResizing(true);
    e.stopPropagation();
    e.preventDefault();
  }

  const handleMouseMove = useMemoizedFn((e: MouseEvent) => {
    if (isResizing) {
      const container = containerRef.current;
      if (!container) return;
      let newWidth = e.clientX - container.getBoundingClientRect().left;
      if (minWidth && newWidth < minWidth) {
        newWidth = minWidth;
      }
      if (maxWidth && newWidth > maxWidth) {
        newWidth = maxWidth;
      }
      setWidth(newWidth);
      if (onResize) onResize(newWidth);
    }
  })

  const handleMouseUp = () => {
    setIsResizing(false);
  }

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
  }, [handleMouseMove]);

  return (
    <div
      className={classnames(styles.widthResizable, className)}
      style={{
        ...style,
        width,
        minWidth,
        maxWidth
    }}
      ref={containerRef}
    >
      {props.children}
      <div
        className={styles.resizeBar}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      />
    </div>
  )
}

export default WidthResizable;