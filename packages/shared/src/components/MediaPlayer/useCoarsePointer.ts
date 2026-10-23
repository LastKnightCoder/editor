import { useEffect, useState } from "react";

const QUERY = "(pointer: coarse)";

const matchCoarse = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(QUERY).matches
    : false;

/** 主要输入是手指（粗指针）：播放器据此隐藏悬停类控件、放大触控区并启用触屏手势 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(matchCoarse);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(QUERY);
    const update = () => setCoarse(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return coarse;
}
