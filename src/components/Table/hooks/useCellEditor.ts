import { useState, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { CellValue } from "../types";

/**
 * 用于管理单元格编辑状态的钩子
 */
export function useCellEditor(
  initialValue: CellValue,
  onSave: (value: CellValue) => void,
) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState<CellValue>(initialValue);

  // 当初始值变化时重置草稿值
  useEffect(() => {
    setDraftValue(initialValue);
  }, [initialValue]);

  // 开始编辑
  const startEditing = useMemoizedFn(() => {
    setIsEditing(true);
    setDraftValue(initialValue);
  });

  // 保存更改
  const handleSave = useMemoizedFn(() => {
    if (draftValue !== initialValue) {
      onSave(draftValue);
    }
    setIsEditing(false);
  });

  // 取消编辑
  const handleCancel = useMemoizedFn(() => {
    setIsEditing(false);
    setDraftValue(initialValue);
  });

  // 更新草稿值
  const handleChange = useMemoizedFn((newValue: CellValue) => {
    setDraftValue(newValue);
  });

  return {
    isEditing,
    draftValue,
    startEditing,
    handleSave,
    handleCancel,
    handleChange,
  };
}

export default useCellEditor;
