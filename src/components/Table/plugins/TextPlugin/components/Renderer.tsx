import React, { memo } from "react";
import EditText from "@/components/EditText";
import { ColumnDef } from "../../../types";

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
      className="px-4 py-2 h-full w-full flex items-center overflow-hidden text-ellipsis whitespace-nowrap box-border"
    />
  );
});

export default TextRenderer;
