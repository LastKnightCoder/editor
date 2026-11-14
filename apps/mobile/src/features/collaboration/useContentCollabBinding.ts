import { useEffect, useState } from "react";
import * as tauri from "../../services/tauri";
import type { CollaborationBinding } from "../../types";

export type ContentCollabBindingState =
  | { status: "loading" | "unbound" | "error" }
  | { status: "bound"; binding: CollaborationBinding };

export function useContentCollabBinding(contentId: number | undefined, refreshKey: string) {
  const [result, setResult] = useState<{
    contentId: number;
    refreshKey: string;
    state: ContentCollabBindingState;
  }>();
  useEffect(() => {
    if (!contentId || contentId <= 0) return;
    let cancelled = false;
    const settle = (state: ContentCollabBindingState) => {
      if (!cancelled) setResult({ contentId, refreshKey, state });
    };
    tauri
      .collabGetBinding(contentId)
      .then(binding => settle(binding ? { status: "bound", binding } : { status: "unbound" }))
      .catch(() => settle({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [contentId, refreshKey]);
  if (!contentId || contentId <= 0) return { status: "unbound" } as const;
  if (result?.contentId === contentId && result.refreshKey === refreshKey) return result.state;
  // 同一正文刷新时保留已确认的共享来源，避免暂时卸载正在编辑的协作视图。
  if (result?.contentId === contentId && result.state.status === "bound") return result.state;
  return { status: "loading" } as const;
}
