import { useState } from "react";
import { useMemoizedFn } from "ahooks";
import { CellValue } from "../types";

export function useCellEditor(
  initialValue: CellValue,
  onSave: (value: CellValue) => void,
) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState<CellValue>(initialValue);

  const startEditing = useMemoizedFn(() => {
    setIsEditing(true);
    setDraftValue(initialValue);
  });

  const handleSave = useMemoizedFn(() => {
    if (draftValue !== initialValue) {
      onSave(draftValue);
    }
    setIsEditing(false);
  });

  const handleCancel = useMemoizedFn(() => {
    setIsEditing(false);
    setDraftValue(initialValue);
  });

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
