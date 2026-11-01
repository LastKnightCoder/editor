import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import appIcon from "../../assets/app-icon.png";
import { useAppContext } from "../../app/AppContext";
import { getNavigator, useRouterContext } from "../../router";
import { subscribeMobileSettingSnapshot } from "../../services/mobileSettingsBridge";
import { Z_INDEX } from "../../router/zIndex";
import { toast } from "../../components/toast";
import { useTodoStore } from "../todo/store/useTodoStore";
import { onReminderSourceChanged } from "./changes";
import {
  isNativeNotifyAvailable,
  notifyCancelOwner,
  notifySetForegroundBanner,
  notifySnooze,
  notifyTakeActions,
  onNotifyAction,
  onNotifyDelivered,
  type NotifyAction,
  type NotifyEntry,
} from "./native";
import { resyncReminders, scheduleResync } from "./scheduler";
import { readReminderSettings } from "./settings";

const BANNER_MS = 8000;
const KIND_LABEL: Record<NotifyEntry["kind"], string> = {
  todo: "待办",
  event: "日程",
  doc: "文档待办",
  pomodoro: "番茄专注",
};

type Owner =
  | { kind: "todo" | "event" | "pomodoro"; id: number }
  | { kind: "doc"; id: number; taskId: string };

/** `todo:<id>` / `event:<id>` / `pomodoro:<id>` / `doc:<内容 id>:<待办 id>` */
function parseOwner(owner: string): Owner | null {
  const [kind, raw, ...rest] = owner.split(":");
  const id = Number(raw);
  if (!Number.isSafeInteger(id)) return null;
  if (kind === "doc") return rest.length ? { kind, id, taskId: rest.join(":") } : null;
  return kind === "todo" || kind === "event" || kind === "pomodoro" ? { kind, id } : null;
}

const POMODORO_PAGES = new Set(["pomodoro", "pomodoroFocus"]);

/**
 * 提醒宿主（AppShell 挂载）：
 * - 启动、回到前台、影响提醒的写入后重排系统通知；
 * - 处理通知点击（打开对应待办 / 日程）与「完成」（勾选待办）；
 * - 应用在前台时到点的提醒以顶部横幅展示，替代系统横幅（设置里可关）；番茄页上不叠横幅。
 */
export function ReminderHost() {
  const app = useAppContext();
  const router = useRouterContext();
  const topKey = router.state.screens.entries.at(-1)?.key;
  const topKeyRef = useRef(topKey);
  topKeyRef.current = topKey;
  const [banner, setBanner] = useState<NotifyEntry | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [settings, setSettings] = useState(() => readReminderSettings());
  useEffect(() => subscribeMobileSettingSnapshot(() => setSettings(readReminderSettings())), []);

  const open = useCallback((owner: string) => {
    const parsed = parseOwner(owner);
    if (!parsed) return;
    const navigator = getNavigator();
    switch (parsed.kind) {
      case "todo":
        navigator.push("todoDetail", { todoId: parsed.id });
        break;
      case "event":
        navigator.push("calendarEventDetail", { eventId: parsed.id });
        break;
      case "doc":
        navigator.push("contentDetail", { contentId: parsed.id, taskId: parsed.taskId });
        break;
      case "pomodoro":
        // 番茄页挂载时按会话收尾（倒计时归零自动完成），这里只负责带过去
        if (!POMODORO_PAGES.has(topKeyRef.current ?? "")) navigator.push("pomodoro");
        break;
    }
  }, []);

  const complete = useCallback(
    async (owner: string) => {
      const parsed = parseOwner(owner);
      if (!parsed || parsed.kind !== "todo") return;
      try {
        await useTodoStore.getState().toggleCompleteCascade({ id: parsed.id, isCompleted: true });
        await notifyCancelOwner(owner);
        toast.success("已完成");
      } catch (error) {
        app.presentError(error, "完成待办失败");
      }
    },
    [app]
  );

  const handle = useCallback(
    async (action: NotifyAction) => {
      if (action.action === "done") await complete(action.owner);
      else open(action.owner);
    },
    [complete, open]
  );

  const drain = useCallback(async () => {
    try {
      for (const action of await notifyTakeActions()) await handle(action);
    } catch (error) {
      console.warn("读取通知动作失败:", error);
    }
  }, [handle]);

  useEffect(() => {
    if (!isNativeNotifyAvailable()) return;
    let disposed = false;
    const listeners: Array<{ unregister: () => Promise<void> }> = [];
    void Promise.all([
      onNotifyAction(() => void drain()),
      onNotifyDelivered(entry => {
        // 已在番茄页时页面自己展示完成态，不再叠一条横幅
        if (entry.kind === "pomodoro" && POMODORO_PAGES.has(topKeyRef.current ?? "")) return;
        clearTimeout(timer.current);
        setBanner(entry);
        timer.current = setTimeout(() => setBanner(null), BANNER_MS);
      }),
    ]).then(registered => {
      if (disposed) {
        registered.forEach(listener => void listener.unregister());
        return;
      }
      listeners.push(...registered);
      // 冷启动时点通知拉起的动作已在队列里，监听就绪后取一次
      void drain();
    });
    void resyncReminders();
    const offSource = onReminderSourceChanged(scheduleResync);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void drain();
      void resyncReminders();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      offSource();
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(timer.current);
      void notifySetForegroundBanner(false).catch(() => undefined);
      listeners.forEach(listener => void listener.unregister());
    };
  }, [drain]);

  // 前台横幅开关：关闭时原生在前台照常弹系统通知
  useEffect(() => {
    if (!isNativeNotifyAvailable()) return;
    void notifySetForegroundBanner(settings.foregroundBanner).catch(() => undefined);
  }, [settings.foregroundBanner]);

  // 稍后间隔变了要写给原生（排期时一并下发）
  const snoozeMinutes = settings.snoozeMinutes;
  useEffect(() => scheduleResync(), [snoozeMinutes]);

  const dismiss = () => {
    clearTimeout(timer.current);
    setBanner(null);
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {banner && (
        <motion.div
          key={banner.key}
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -24, opacity: 0 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          className="bg-surface shadow-float fixed right-2.5 left-2.5 flex items-start gap-3 rounded-[18px] p-3 pl-3.5"
          style={{
            top: "calc(var(--mobile-safe-top, env(safe-area-inset-top)) + 6px)",
            zIndex: Z_INDEX.TOAST,
          }}
          role="alert"
        >
          <img src={appIcon} alt="" className="h-8 w-8 shrink-0 rounded-[9px]" />
          <div className="min-w-0 flex-1">
            <div className="text-ink-3 text-[11.5px]">
              {KIND_LABEL[banner.kind]} · {banner.body}
            </div>
            <div className="text-ink-1 mt-px truncate text-[14px] font-semibold">
              {banner.title}
            </div>
            <div className="mt-2.5 flex gap-1.5">
              {banner.actions === "complete" && (
                <button
                  type="button"
                  className="bg-accent text-ink-inverse h-[30px] rounded-[10px] px-3 text-[12.5px] font-semibold"
                  onClick={() => {
                    dismiss();
                    void complete(banner.owner);
                  }}
                >
                  完成
                </button>
              )}
              {banner.actions !== "none" && (
                <button
                  type="button"
                  className="bg-page text-ink-1 h-[30px] rounded-[10px] px-3 text-[12.5px] font-semibold"
                  onClick={() => {
                    dismiss();
                    void notifySnooze(banner).then(() =>
                      toast.success(`${snoozeMinutes} 分钟后再提醒`)
                    );
                  }}
                >
                  {snoozeMinutes} 分钟后
                </button>
              )}
              <button
                type="button"
                className="bg-page text-ink-1 h-[30px] rounded-[10px] px-3 text-[12.5px] font-semibold"
                onClick={() => {
                  dismiss();
                  open(banner.owner);
                }}
              >
                查看
              </button>
            </div>
          </div>
          <button type="button" aria-label="关闭" className="text-ink-3 p-0.5" onClick={dismiss}>
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
