import { useMemoizedFn } from "ahooks";

// 停靠时对话输入框工具栏（添加 / 权限 / 模型 / 思考 / 发送）需要约 460px 才不溢出
export const DOCK_CHAT_MIN = 480;
export const DOCK_CHAT_MAX = 680;
export const clampDockChatWidth = (w: number) =>
  Math.min(DOCK_CHAT_MAX, Math.max(DOCK_CHAT_MIN, w));

/** 右栏对话宽度拖拽（左缘热区 onPointerDown；向左拖变宽，对话本身不因拖拽重挂） */
export function useDockResize(width: number, setWidth: (w: number) => void) {
  return useMemoizedFn((e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev: PointerEvent) => setWidth(clampDockChatWidth(startW + startX - ev.clientX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
}
