/**
 * Windows/Linux 窗口三键 —— 行为对齐 legacy GlobalTitlebar/WindowControls：
 * 命令走 commands/window.ts（IPC），最大化状态经 platform.window.onMaximizedChange。
 * hover 淡墨、关闭键 hover danger（平台习惯色，刻意不走主题 token）。
 */

import { useEffect, useState } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import { platform } from "@/platform";
import { minimizeWindow, maximizeWindow, closeWindow } from "@/commands";

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
