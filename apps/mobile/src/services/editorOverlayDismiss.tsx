import type { OverlayBackDismissProps } from "@tau/editor/api";
import { useSheetBackDismiss } from "../router/useSheetBackDismiss";

export function MobileEditorOverlayDismiss({ open, onDismiss }: OverlayBackDismissProps) {
  useSheetBackDismiss(open, onDismiss);
  return null;
}
