import useTheme from "../../../../hooks/useTheme";
import { Color } from "../../../types";

import { For } from "@tau/shared";
import ColorItem from "./ColorItem";

import { colors as colorsConfig } from "../../configs";

interface ISelectColorProps {
  activeColor: Color;
  onSelectColor: (color: Color) => void;
}

const SelectColor = (props: ISelectColorProps) => {
  const { activeColor, onSelectColor } = props;

  const { isDark } = useTheme();

  return (
    <div className="flex cursor-pointer gap-[10px] rounded-[12px] bg-[var(--ed-bg-page)] p-[10px] shadow-[var(--ed-shadow-card)]">
      <For
        data={Object.keys(colorsConfig) as Color[]}
        renderItem={color => {
          const themeColor = colorsConfig[color];
          const { backgroundColor, borderColor } = isDark ? themeColor.dark : themeColor.light;
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
