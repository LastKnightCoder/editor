/**
 * 壳层极光背景：铺在侧栏与右列之下的三团模糊色块（取当前主题 --tau-glow-*），
 * 只透过侧栏、标题栏与大卡四周留白露出；页面大卡保持实底，页面与插件无需配合。
 * 动画只改 transform；窗口不可见或系统要求减少动态效果时静止。
 */

import clsx from "clsx";
import { useSyncExternalStore } from "react";
import useSettingStore from "@/stores/useSettingStore";

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const isDocumentVisible = () => document.visibilityState === "visible";

const BLOB = "absolute rounded-full blur-[70px] will-change-transform motion-reduce:animate-none";

export function AuroraBackdrop() {
  const backdrop = useSettingStore(s => s.setting.appearance?.backdrop);
  const visible = useSyncExternalStore(subscribeVisibility, isDocumentVisible);
  if (backdrop?.enabled === false) return null;
  const animate = backdrop?.motion !== false;
  const paused = !visible && "[animation-play-state:paused]";

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <span
        className={clsx(
          BLOB,
          "bg-[var(--tau-glow-1)] -left-[10%] -top-[20%] h-[65%] w-[50%]",
          animate && "animate-aurora-1",
          paused
        )}
      />
      <span
        className={clsx(
          BLOB,
          "bg-[var(--tau-glow-2)] -right-[11%] top-[8%] h-[60%] w-[45%]",
          animate && "animate-aurora-2",
          paused
        )}
      />
      <span
        className={clsx(
          BLOB,
          "bg-[var(--tau-glow-3)] -bottom-[28%] left-[21%] h-[60%] w-[55%]",
          animate && "animate-aurora-3",
          paused
        )}
      />
    </div>
  );
}
