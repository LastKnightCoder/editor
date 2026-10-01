import { useEffect, useRef } from "react";
import type { OverlayBackDismissProps } from "@tau/editor/api";
import { usePageOptional } from "../page/PageProvider";

export function DesktopEditorOverlayDismiss({ open, onDismiss }: OverlayBackDismissProps) {
  const register = usePageOptional()?.registerOverlayDismiss;
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    if (!open || !register) return;
    return register(() => dismissRef.current());
  }, [open, register]);
  return null;
}
