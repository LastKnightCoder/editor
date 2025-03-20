import React, { memo } from "react";
import EditText from "@/components/EditText";
import { ColumnDef } from "../../../../types";
import styles from "./index.module.less";

/**
 * 文本单元格渲染组件（只读模式）
 */
interface TextRendererProps {
  value: string;
  config?: any;
  column: ColumnDef;
}

const TextRenderer: React.FC<TextRendererProps> = memo(({ value }) => {
  return (
    <EditText
      defaultValue={value}
      contentEditable={false}
      className={styles.content}
    />
  );
});

export default TextRenderer;
