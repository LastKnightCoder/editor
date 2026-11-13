/**
 * 壳层极光背景：铺在侧栏与右列之下的四团径向渐变色（取当前主题 --tau-glow-*），
 * 只透过侧栏、标题栏与大卡四周留白露出；页面大卡保持实底，页面与插件无需配合。
 * 色团中心只到七成浓度且彼此错开，侧栏任一处都不落在单个色团的峰值上。
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

const BLOB = "absolute rounded-full blur-[40px] will-change-transform motion-reduce:animate-none";

// 径向渐变自中心淡出到透明：比实心圆加模糊铺得更开，峰值也更低
const BLOBS = [
  // 顶部偏中：主要从标题栏透出，侧栏头部只接到边缘
  {
    shape:
      "bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--tau-glow-1)_70%,transparent),transparent)] left-[18%] -top-[38%] h-[85%] w-[70%]",
    motion: "animate-aurora-1",
  },
  // 右上
  {
    shape:
      "bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--tau-glow-2)_70%,transparent),transparent)] -right-[22%] -top-[10%] h-[80%] w-[55%]",
    motion: "animate-aurora-2",
  },
  // 左下：侧栏下半与底部留白
  {
    shape:
      "bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--tau-glow-3)_70%,transparent),transparent)] -left-[25%] bottom-[-30%] h-[85%] w-[60%]",
    motion: "animate-aurora-3",
  },
  // 右下：补齐大卡右侧与底边留白，复用主色但更淡
  {
    shape:
      "bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--tau-glow-1)_50%,transparent),transparent)] -bottom-[35%] right-[5%] h-[75%] w-[55%]",
    motion: "animate-aurora-2 [animation-direction:alternate-reverse]",
  },
] as const;

export function AuroraBackdrop() {
  const backdrop = useSettingStore(s => s.setting.appearance?.backdrop);
  const visible = useSyncExternalStore(subscribeVisibility, isDocumentVisible);
  if (backdrop?.enabled === false) return null;
  const animate = backdrop?.motion !== false;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {BLOBS.map(blob => (
        <span
          key={blob.shape}
          className={clsx(
            BLOB,
            blob.shape,
            animate && blob.motion,
            !visible && "[animation-play-state:paused]"
          )}
        />
      ))}
    </div>
  );
}
