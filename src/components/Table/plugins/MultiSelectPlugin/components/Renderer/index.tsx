import React, { memo } from "react";
import { CellValue, ColumnDef, SelectOption } from "../../../../types";
import styles from "./index.module.less";
import { SELECT_COLORS_CONFIG } from "@/components/Table/constants";

interface RendererProps {
  value: CellValue;
  config?: {
    options: SelectOption[];
  };
  column: ColumnDef;
}

/**
 * MultiSelect单元格渲染器
 */
const Renderer: React.FC<RendererProps> = memo(({ value, config }) => {
  if (!value) {
    return <span className={styles.empty}>-</span>;
  }

  // 确保value是数组
  const values = Array.isArray(value) ? value : [value];

  // 查找匹配的选项
  if (config?.options && Array.isArray(config.options)) {
    return (
      <div className={styles.container}>
        <div className={styles.tags}>
          {values.map((val, index) => {
            const option = config.options.find((opt) => opt.id === val);

            if (option) {
              const label = option.name;
              const color = option.color;

              return (
                <span
                  key={option.id}
                  className={styles.tag}
                  style={{
                    backgroundColor:
                      SELECT_COLORS_CONFIG[color]?.light?.backgroundColor,
                    color: SELECT_COLORS_CONFIG[color]?.light?.color,
                  }}
                >
                  {label}
                </span>
              );
            }

            return (
              <span key={index} className={styles.value}>
                {String(val)}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  // 如果没有找到匹配选项，直接显示值
  return (
    <div className={styles.container}>
      <div className={styles.tags}>
        {values.map((val, index) => (
          <span key={index} className={styles.value}>
            {String(val)}
          </span>
        ))}
      </div>
    </div>
  );
});

export default Renderer;
