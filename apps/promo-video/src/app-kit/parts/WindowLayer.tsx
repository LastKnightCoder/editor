/**
 * 叠在窗口上的浮层（对话框、设置页、toast、光标）：铺满父容器、圆角同窗口，自带主题——
 * 画在 AppWindow 外面的界面必须自己带 data-theme，否则 --tau-* 全空（交接文档坑 10）。
 */
import type { ReactNode } from "react";
import { useAppTheme } from "../theme";

export function WindowLayer({ children }: { children: ReactNode }) {
  return (
    <div data-theme={useAppTheme()} data-mode="light" className="font-tau text-tau-body text-ink-1 absolute inset-0 overflow-hidden" style={{ borderRadius: 14 }}>
      {children}
    </div>
  );
}
