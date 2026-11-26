import { useEffect, useLayoutEffect, useState } from "react";
import useSettingStore from "@/stores/useSettingStore";
import {
  applyPageMargin,
  normalizePageMargin,
  outlineFitsInPageMargin,
  type PageMarginPreset,
} from "@/utils/pageMargin";

export function usePageMargin(): PageMarginPreset {
  return useSettingStore(state => normalizePageMargin(state.setting.appearance?.pageMargin));
}

export function useSyncPageMargin(): void {
  const preset = usePageMargin();
  useEffect(() => applyPageMargin(preset), [preset]);
}

/**
 * 监听纸面滚动容器的实测内宽，结合当前留白档位返回右侧留白是否足以直接容纳常驻大纲列。
 */
export function usePageMarginOutlineFits(containerEl: HTMLElement | null): boolean {
  const preset = usePageMargin();
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    if (!containerEl) {
      setWidth(0);
      return;
    }
    const update = () => setWidth(containerEl.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(containerEl);
    return () => observer.disconnect();
  }, [containerEl]);

  return outlineFitsInPageMargin(width, preset);
}
