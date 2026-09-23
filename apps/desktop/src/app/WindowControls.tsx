/**
 * 窗口控制按钮 —— mac 自绘信号灯 + Windows/Linux 三键，行为对齐 legacy
 * GlobalTitlebar/CustomTrafficLights：命令走 commands/window.ts（IPC），
 * 最大化状态经 platform.window.onMaximizedChange。
 * 平台习惯色（信号灯三原色 / 关闭键 danger / 符号深色）刻意不走主题 token。
 */

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Minus, Square, Copy, X } from "lucide-react";
import { platform } from "@/platform";
import { minimizeWindow, maximizeWindow, closeWindow, toggleFullScreen } from "@/commands";

const winBtnClass =
  "grid h-[26px] w-9 place-items-center rounded-tau-sm text-ink-2 hover:bg-hover hover:text-ink-1";

export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => platform.window.onMaximizedChange(setIsMaximized), []);

  return (
    <div className="ml-1 flex gap-0.5">
      <button
        type="button"
        className={winBtnClass}
        onClick={minimizeWindow}
        title="最小化"
        aria-label="最小化"
      >
        <Minus size={13} strokeWidth={2} />
      </button>
      <button
        type="button"
        className={winBtnClass}
        onClick={maximizeWindow}
        title={isMaximized ? "还原" : "最大化"}
        aria-label="最大化/还原"
      >
        {isMaximized ? <Copy size={12} strokeWidth={2} /> : <Square size={11} strokeWidth={2} />}
      </button>
      {/* 关闭键单独写：hover 覆盖为平台 danger 色，与共享串的 hover:bg-hover 同特异性，拼接不可靠 */}
      <button
        type="button"
        className="rounded-tau-sm text-ink-2 grid h-[26px] w-9 place-items-center hover:bg-[#c25450] hover:text-white"
        onClick={closeWindow}
        title="关闭"
        aria-label="关闭"
      >
        <X size={13} strokeWidth={2} />
      </button>
    </div>
  );
}

/** macOS 自绘信号灯：主进程已把原生信号灯移出屏幕（window-manager
 *  trafficLightPosition -1000），红关闭/黄最小化/绿全屏；符号常显对齐原生
 *  聚焦态观感。尺寸/间距沿 Sidebar 头部占位几何（12px 圆点、8px 间距）；
 *  collapsed 时带子撑满标题栏高度（--tau-titlebar-h）使圆点中线与右侧标题栏
 *  对齐，且 self-start 贴头部左缩进不水平居中（52px 带子居中后红点仅 3px
 *  贴窗口圆角，太局促，见 Sidebar 头部注释）。
 *  符号自绘粗笔/实心 SVG（lucide 描边图标 8px 下细弱失真），统一半透明黑
 *  ——对齐 macOS Big Sur+ 原生符号色，叠三色圆点自然融合不突兀。 */
export function MacTrafficLights({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className={clsx(
        "app-region-no-drag flex items-center gap-2",
        collapsed ? "h-[var(--tau-titlebar-h)] self-start" : "pr-1"
      )}
    >
      <button
        type="button"
        className="grid size-3 cursor-default place-items-center rounded-full bg-[#ff5f57] text-black/50 hover:bg-[#ff5f57]/90"
        onClick={closeWindow}
        title="关闭"
        aria-label="关闭"
      >
        <svg viewBox="0 0 8 8" className="size-2" aria-hidden>
          <path
            d="M2.3 2.3 5.7 5.7M5.7 2.3 2.3 5.7"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <button
        type="button"
        className="grid size-3 cursor-default place-items-center rounded-full bg-[#febc2e] text-black/50 hover:bg-[#febc2e]/90"
        onClick={minimizeWindow}
        title="最小化"
        aria-label="最小化"
      >
        <svg viewBox="0 0 8 8" className="size-2" aria-hidden>
          <path d="M2 4h4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className="grid size-3 cursor-default place-items-center rounded-full bg-[#28c840] text-black/50 hover:bg-[#28c840]/90"
        onClick={toggleFullScreen}
        title="全屏"
        aria-label="全屏"
      >
        <svg viewBox="0 0 8 8" className="size-2" aria-hidden>
          <path d="M1.5 5V1.5H5L1.5 5Z" fill="currentColor" />
          <path d="M6.5 3v3.5H3L6.5 3Z" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}
