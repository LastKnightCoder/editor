import { useCallback, useEffect, useRef, useState } from "react";
import type { DecorationHit, DecorationPreview } from "@/app/plugins/text-decorations";

interface Hover {
  hit: DecorationHit;
  anchor: HTMLElement;
  choice?: string;
  preview?: DecorationPreview;
}

export function useDecorationHover(allowPreview: boolean) {
  const [hover, setHover] = useState<Hover | null>(null);
  const request = useRef<AbortController | null>(null);
  const timer = useRef(0);
  const closeTimer = useRef(0);
  const current = useRef<Omit<Hover, "preview"> | null>(null);
  const showingCard = useRef(false);
  const clear = useCallback(() => {
    window.clearTimeout(timer.current);
    window.clearTimeout(closeTimer.current);
    current.current = null;
    request.current?.abort();
    request.current = null;
    showingCard.current = false;
    setHover(null);
  }, []);
  const show = useCallback(
    (hit: DecorationHit, anchor: HTMLElement, choice?: string) => {
      window.clearTimeout(closeTimer.current);
      if (
        current.current?.hit === hit &&
        current.current.anchor === anchor &&
        current.current.choice === choice
      )
        return;
      clear();
      if (hit.lifetime?.aborted || (!hit.label && !hit.preview)) return;
      const controller = new AbortController();
      current.current = { hit, anchor, choice };
      request.current = controller;
      hit.lifetime?.addEventListener("abort", clear, { once: true, signal: controller.signal });
      timer.current = window.setTimeout(async () => {
        let preview: DecorationPreview | undefined;
        try {
          if (allowPreview) preview = await hit.preview?.(choice, controller.signal);
        } catch {
          // 目标在悬停期间失效时仍可使用原有文字提示。
        }
        if (
          !controller.signal.aborted &&
          anchor.isConnected &&
          (preview || (choice === undefined && hit.label))
        ) {
          showingCard.current = !!preview;
          setHover({ hit, anchor, choice, preview });
        }
      }, 450);
    },
    [allowPreview, clear]
  );
  const leave = useCallback(() => {
    window.clearTimeout(timer.current);
    window.clearTimeout(closeTimer.current);
    if (showingCard.current) closeTimer.current = window.setTimeout(clear, 160);
    else clear();
  }, [clear]);
  const keep = () => window.clearTimeout(closeTimer.current);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") clear();
    };
    window.addEventListener("blur", clear);
    window.addEventListener("keydown", escape);
    return () => {
      clear();
      window.removeEventListener("blur", clear);
      window.removeEventListener("keydown", escape);
    };
  }, [clear, allowPreview]);
  return { hover, show, clear, leave, keep };
}
