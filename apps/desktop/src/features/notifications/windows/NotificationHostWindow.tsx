/**
 * 系统通知窗口页面（路由 /notification-host）：主进程 notification-window 创建的透明
 * 置顶常驻窗，承载应用失焦时路由过来的通知卡栈（NotificationHost autoDismiss=false，
 * 去留由推送端控制）。卡栈清空回报 empty() 让主进程隐藏窗口。
 *
 * 窗口默认整窗点击穿透（forward 模式保留 mousemove），渲染端按命中判定临时关闭穿透：
 * 鼠标落在卡片区（target 不是文档根 / 根容器）时才可交互，离开或失焦即恢复穿透。
 */

import { useEffect, useRef } from "react";
import { NotificationHost, notify } from "@tau/ui";
import type { SystemNotificationPayload } from "@tau/platform";
import { isMac, platform } from "@/platform";
import { useThemeRuntime } from "@/app/useThemeRuntime";
import { useCancelPageZoom } from "@/features/pomodoro/windows/useAuxWindow";
import { toNotifyOptions } from "../payload";
import "@/app/base.css";

export default function NotificationHostWindow() {
  // 主题跟随其它窗口切换（不锁深暗），卡片区背景随用户明暗偏好
  useThemeRuntime();
  const zoom = useCancelPageZoom();

  // 透明窗口必须整层去掉文档底色：base.css 给 html 上了主题页底色，body 保险一并处理
  useEffect(() => {
    const { documentElement: html, body } = document;
    const htmlPrev = { background: html.style.background, overflow: html.style.overflow };
    const bodyPrev = { background: body.style.background, overflow: body.style.overflow };
    html.style.background = "transparent";
    body.style.background = "transparent";
    // 卡片阴影 / 入场位移会让文档溢出，出现的滚动条既占宽挤压卡栈又在透明窗里露底
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      Object.assign(html.style, htmlPrev);
      Object.assign(body.style, bodyPrev);
    };
  }, []);

  // 最近一份 payload：onCardClick 需知道该卡有没有待答按钮（有则保留，无则点击即消）
  const payloadsRef = useRef(new Map<string, SystemNotificationPayload>());

  // 订阅推送与关闭指令；订阅完成后冲 flush 主进程 ready 前排队的通知
  useEffect(() => {
    const offPush = platform.notification.onPush(payload => {
      payloadsRef.current.set(payload.id, payload);
      // 同 id 再推由 notify 原位更新；按钮执行经主进程转回来源端并等待回报
      notify(toNotifyOptions(payload, index => platform.notification.action(payload.id, index)));
    });
    const offDismiss = platform.notification.onDismiss(id => {
      if (id === undefined) payloadsRef.current.clear();
      else payloadsRef.current.delete(id);
      notify.dismiss(id);
    });
    void platform.notification.ready();
    return () => {
      offPush();
      offDismiss();
    };
  }, []);

  // 卡栈增减桥接：消失的逐条上报 closed（主进程清登记）；清空回报 empty 隐藏窗口。
  // 挂载时的首次回报只记录不 diff（初始为空不该报 empty，冲 flush 的卡不误报 closed）
  const lastIdsRef = useRef<string[] | null>(null);
  const onItemsChange = (ids: string[]) => {
    const prev = lastIdsRef.current;
    lastIdsRef.current = ids;
    if (prev === null) return;
    const current = new Set(ids);
    for (const id of prev) {
      if (current.has(id)) continue;
      payloadsRef.current.delete(id);
      void platform.notification.closed(id);
    }
    if (ids.length === 0 && prev.length > 0) void platform.notification.empty();
  };

  // 卡主体点击：激活来源窗口；无待答按钮的卡随即关闭（与原生通知「点击即消」一致）
  const onCardClick = (id: string) => {
    void platform.notification.activate(id);
    if (!payloadsRef.current.get(id)?.actions?.length) notify.dismiss(id);
  };

  // 点击穿透仲裁：命中值变化才发 IPC（ref 去重）；离开文档与窗口失焦恢复穿透
  const rootRef = useRef<HTMLDivElement>(null);
  const interactiveRef = useRef(false);
  useEffect(() => {
    const apply = (hit: boolean) => {
      if (interactiveRef.current === hit) return;
      interactiveRef.current = hit;
      void platform.notification.setInteractive(hit);
    };
    const onMouseMove = (e: MouseEvent) => {
      const target = e.target as Element | null;
      apply(
        target !== null &&
          target !== document.documentElement &&
          target !== document.body &&
          target !== rootRef.current
      );
    };
    const reset = () => apply(false);
    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseleave", reset);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", reset);
      window.removeEventListener("blur", reset);
    };
  }, []);

  return (
    // 根容器只作穿透命中判定的承接层（.app 锚点提供 reset / focus-ring）：无底色边框阴影
    // 页面缩放按 origin 共享，主窗口放大会连带撑大这里的卡栈、溢出固定宽度窗口左缘，CSS zoom 反向抵消
    <div ref={rootRef} className="app h-screen w-screen" style={{ zoom }}>
      <NotificationHost
        autoDismiss={false}
        placement={isMac ? "top-right" : "bottom-right"}
        // macOS 窗口无标题栏：去掉应用内 42px 偏移直接贴顶
        className={isMac ? "top-[6px] max-h-[calc(100vh-12px)]" : undefined}
        onItemsChange={onItemsChange}
        onCardClick={onCardClick}
      />
    </div>
  );
}
