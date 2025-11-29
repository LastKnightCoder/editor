import { memo, useRef, useEffect } from "react";
import { Tooltip } from "antd";
import classnames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";

interface IColorSelectItemProps {
  isDark: boolean;
  label?: string;
  lightColor?: string;
  darkColor?: string;
  onClick: (color?: string, darkColor?: string) => void;
}

const ColorSelectItem = memo((props: IColorSelectItemProps) => {
  const { label, lightColor, darkColor, onClick, isDark } = props;
  const themeColors = useThemeColors();

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

  const color = isDark ? darkColor : lightColor;
  const isDefault = !lightColor && !darkColor;

  return (
    <Tooltip title={label} key={label} placement="bottom">
      <div
        ref={itemRef}
        className={classnames(
          "w-6 h-6 rounded-full cursor-pointer flex items-center justify-center transition-all duration-200 border border-transparent hover:scale-110",
          isDefault
            ? "bg-transparent border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
            : "hover:shadow-md",
        )}
        style={{ backgroundColor: isDefault ? undefined : color }}
      >
        {isDefault && (
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
            A
          </span>
        )}
      </div>
    </Tooltip>
  );
});

export default ColorSelectItem;
