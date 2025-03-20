import React, { memo } from "react";
import { CellValue, ColumnDef, SelectOption } from "../../../../types";
import styles from "./index.module.less";
import { SELECT_COLORS_CONFIG } from "../../../../constants";

interface RendererProps {
  value: CellValue;
  config?: {
    options: SelectOption[];
  };
  column: ColumnDef;
}

const Renderer: React.FC<RendererProps> = memo(({ value, config }) => {
  if (!value) {
    return (
      <div className={styles.container}>
        <span className={styles.empty}>-</span>
      </div>
    );
  }

  // 查找匹配的选项
  if (config?.options && Array.isArray(config.options)) {
    const option = config.options.find((opt) => opt.id === value);

    if (option) {
      const label = option.name;
      const color = option.color;

      if (color) {
        return (
          <div className={styles.container}>
            <span
              className={styles.tag}
              style={{
                backgroundColor:
                  SELECT_COLORS_CONFIG[color].light.backgroundColor,
                color: SELECT_COLORS_CONFIG[color].light.color,
              }}
            >
              {label}
            </span>
          </div>
        );
      }

      return (
        <div className={styles.container}>
          <span className={styles.value}>{label}</span>
        </div>
      );
    }
  }

  // 如果没有找到匹配选项，直接显示值
  return (
    <div className={styles.container}>
      <span className={styles.value}>{String(value)}</span>
    </div>
  );
});

export default Renderer;
