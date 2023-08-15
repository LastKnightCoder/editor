import React, {useCallback, useEffect, useState} from 'react';
import { useMouse } from "ahooks";

import styles from './index.module.less';

interface IWidthResizableProps {
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  onResize?: (width: number) => void;
}

const WidthResizable: React.FC<React.PropsWithChildren<IWidthResizableProps>> = (props) => {
  const { defaultWidth, minWidth, maxWidth, onResize } = props;
  const ref = React.useRef<HTMLDivElement>(null);

  const [width, setWidth] = useState<number>(defaultWidth);
  const [isResizing, setIsResizing] = useState<boolean>(false);

  const mouse = useMouse(ref.current);

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
  }, [isResizing, mouse.elementX, minWidth, maxWidth])

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
      className={styles.widthResizable}
      style={{ width }}
      ref={ref}
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