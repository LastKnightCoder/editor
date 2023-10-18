import React, {useCallback, useEffect, useState, PropsWithChildren} from 'react';
import { useMouse, useMemoizedFn } from "ahooks";
import classnames from "classnames";

import styles from './index.module.less';

interface IWidthResizableProps {
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  onResize?: (width: number) => void;
  shrinkAble?: boolean;
  className?: string;
  hide?: boolean;
  style?: React.CSSProperties;
}

const WidthResizable: React.FC<PropsWithChildren<IWidthResizableProps>> = (props) => {
  const {
    defaultWidth,
    minWidth,
    maxWidth,
    onResize,
    className,
    shrinkAble = false,
    hide = false,
    style = {}
  } = props;
  const containerRef = React.useRef<HTMLDivElement>(null);

  const [width, setWidth] = useState<number>(defaultWidth);
  const widthBeforeHide = React.useRef<number>(width);
  const [isResizing, setIsResizing] = useState<boolean>(false);

  const mouse = useMouse(containerRef.current);

  const hideEle = useMemoizedFn(() => {
    widthBeforeHide.current = width;
    if (!containerRef.current) return;
    containerRef.current.animate([
      { width: `${width}px` },
      { width: '0px' },
    ], {
      duration: 200,
      iterations: 1,
    });
    containerRef.current.style.width = '0px';
    containerRef.current.style.overflow = 'hidden';
  });

  const showEle = useMemoizedFn(() => {
    if (!containerRef.current) return;
    containerRef.current.style.overflow = 'auto';
    containerRef.current.animate([
      { width: '0px' },
      { width: `${widthBeforeHide.current}px` },
    ], {
      duration: 200,
      iterations: 1,
    })

    containerRef.current.style.width = `${widthBeforeHide.current}px`;
  });

  useEffect(() => {
    if (hide) hideEle();
    else showEle();
  }, [hide, hideEle, showEle]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    e.preventDefault();
    setIsResizing(true);
  }

  const handleMouseMove = useCallback(() => {
    if (isResizing) {
      const newWidth = mouse.elementX;
      if (minWidth && newWidth < minWidth) return;
      if (maxWidth && newWidth > maxWidth) return;
      setWidth(newWidth);
      if (onResize) onResize(newWidth);
    }
  }, [isResizing, mouse.elementX, minWidth, maxWidth, onResize])

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
      className={classnames(styles.widthResizable, {[styles.shrink]: shrinkAble}, className)}
      style={{ ...style, width }}
      ref={containerRef}
    >
      {props.children}
      <div
        className={styles.resizeBar}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />
    </div>
  )
}

export default WidthResizable;