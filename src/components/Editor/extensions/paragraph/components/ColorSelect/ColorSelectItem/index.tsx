import { memo, useRef, useEffect } from "react";

import styles from "./index.module.less";
import { Tooltip } from "antd";

interface IColorSelectItemProps {
  isDark: boolean;
  label?: string;
  lightColor?: string;
  darkColor?: string;
  onClick: (color?: string, darkColor?: string) => void;
}

const ColorSelectItem = memo((props: IColorSelectItemProps) => {
  const { label, lightColor, darkColor, onClick, isDark } = props;

  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!itemRef.current) return;
    const handleClick = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onClick(lightColor, darkColor);
    };
    itemRef.current.addEventListener("click", handleClick);
    return () => {
      itemRef.current?.removeEventListener("click", handleClick);
    };
  }, [lightColor, darkColor, onClick]);
  return (
    <Tooltip title={label} key={label} placement="bottom">
      <div
        className={styles.item}
        ref={itemRef}
        style={{ color: isDark ? darkColor : lightColor }}
      >
        A
      </div>
    </Tooltip>
  );
});

export default ColorSelectItem;
