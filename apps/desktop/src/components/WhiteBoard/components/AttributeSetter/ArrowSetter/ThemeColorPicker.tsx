import { Tooltip } from "antd";
import { THEME_COLORS, ThemeColorPair } from "../../../constants/theme-colors";
import useTheme from "@/hooks/useTheme";
import styles from "./ThemeColorPicker.module.less";

interface ThemeColorPickerProps {
  selectedColorId?: string;
  onSelect: (colorId: string) => void;
}

/**
 * 主题颜色选择器组件
 * 显示预设的主题颜色，每个颜色在当前主题下显示对应的颜色值
 */
const ThemeColorPicker = (props: ThemeColorPickerProps) => {
  const { selectedColorId, onSelect } = props;
  const { isDark } = useTheme();

  const handleColorClick = (color: ThemeColorPair) => {
    onSelect(color.id);
  };

  return (
    <div className={styles.container}>
      <div className={styles.colorGrid}>
        {THEME_COLORS.map((color) => {
          const displayColor = isDark ? color.dark : color.light;
          const isSelected = selectedColorId === color.id;

          return (
            <Tooltip key={color.id} title={color.label} placement="top">
              <div
                className={`${styles.colorItem} ${isSelected ? styles.selected : ""}`}
                onClick={() => handleColorClick(color)}
              >
                <div
                  className={styles.colorBlock}
                  style={{ backgroundColor: displayColor }}
                />
                {isSelected && (
                  <div className={styles.checkmark}>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M10 3L4.5 8.5L2 6"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
              </div>
            </Tooltip>
          );
        })}
      </div>
      <div className={styles.hint}>
        提示：主题颜色会随深浅色模式自动调整
      </div>
    </div>
  );
};

export default ThemeColorPicker;
