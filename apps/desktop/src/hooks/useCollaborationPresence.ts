import { useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import type { EditorCollaborationBinding } from "@tau/editor/src/collaboration/types";

export default function useCollaborationPresence(
  binding: EditorCollaborationBinding | undefined,
  readonly: boolean
) {
  const focused = useRef(false);
  const update = useMemoizedFn(() => {
    binding?.awareness.setLocalStateField(
      "activity",
      document.visibilityState === "hidden"
        ? "background"
        : focused.current && document.hasFocus() && !readonly
          ? "editing"
          : "viewing"
    );
  });
  useEffect(() => {
    update();
    window.addEventListener("blur", update);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("blur", update);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [binding, readonly, update]);
  return {
    onFocus: () => {
      focused.current = true;
      update();
    },
    onBlur: () => {
      focused.current = false;
      update();
    },
  };
}
