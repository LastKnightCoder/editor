import { useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { CellValue, ValidationRule } from "../types";
import { validateCellValue } from "./useValidation";

export function useCellEditor(
  initialValue: CellValue,
  onSave: (value: CellValue) => void,
  validation?: ValidationRule
) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState<CellValue>(initialValue);
  // 编辑器常在同一事件里先回调新值、再结束编辑，保存必须读到同一拍的最新草稿
  const latestDraftRef = useRef<CellValue>(initialValue);

  const updateDraft = (value: CellValue) => {
    latestDraftRef.current = value;
    setDraftValue(value);
  };

  const startEditing = useMemoizedFn(() => {
    setIsEditing(true);
    updateDraft(initialValue);
  });

  const handleSave = useMemoizedFn(() => {
    if (latestDraftRef.current !== initialValue) {
      onSave(latestDraftRef.current);
    }
    setIsEditing(false);
  });

  const handleCancel = useMemoizedFn(() => {
    setIsEditing(false);
    updateDraft(initialValue);
  });

  const handleChange = useMemoizedFn((newValue: CellValue) => {
    updateDraft(newValue);
  });

  /** 结束编辑：最新草稿校验通过则保存，否则还原 */
  const finishEdit = useMemoizedFn(() => {
    if (validateCellValue(latestDraftRef.current, validation)) handleCancel();
    else handleSave();
  });

  return {
    isEditing,
    draftValue,
    startEditing,
    handleSave,
    handleCancel,
    handleChange,
    finishEdit,
  };
}

export default useCellEditor;
