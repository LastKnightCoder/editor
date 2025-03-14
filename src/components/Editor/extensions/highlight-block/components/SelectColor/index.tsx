import useTheme from "../../../../hooks/useTheme";
import { Color } from "@/components/Editor/types";

import For from "@/components/For";
import ColorItem from "./ColorItem";

import styles from "./index.module.less";

import { colors as colorsConfig } from "../../configs.ts";

interface ISelectColorProps {
  activeColor: Color;
  onSelectColor: (color: Color) => void;
}

const SelectColor = (props: ISelectColorProps) => {
  const { activeColor, onSelectColor } = props;

  const { isDark } = useTheme();

  return (
    <div className={styles.selectColorContainer}>
      <For
        data={Object.keys(colorsConfig) as Color[]}
        renderItem={(color) => {
          const themeColor = colorsConfig[color];
          const { backgroundColor, borderColor } = isDark
            ? themeColor.dark
            : themeColor.light;
          return (
            <ColorItem
              key={color}
              backgroundColor={backgroundColor}
              borderColor={borderColor}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                onSelectColor(color);
              }}
              active={color === activeColor}
            />
          );
        }}
      />
    </div>
  );
};

export default SelectColor;
