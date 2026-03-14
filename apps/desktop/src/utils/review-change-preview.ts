import type { AppliedPatch } from "@/services/content-editing/types";

export interface ChangePreview {
  operationId: string;
  op: "insert" | "delete" | "replace";
  beforeTextPreview: string;
  afterTextPreview: string;
  charDelta: number;
  location: string;
}

export const generateChangePreviews = (
  patches: AppliedPatch[],
): ChangePreview[] => {
  return patches.map((patch, index) => {
    const maxLength = 60;
    const truncate = (text: string) => {
      if (text.length <= maxLength) return text;
      return text.substring(0, maxLength) + "...";
    };

    return {
      operationId: patch.operationId,
      op: patch.op,
      beforeTextPreview: truncate(patch.beforeText),
      afterTextPreview: truncate(patch.afterText),
      charDelta: patch.charDelta,
      location: `第 ${index + 1} 处`,
    };
  });
};
