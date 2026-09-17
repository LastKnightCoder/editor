/**
 * Toast 基础件 —— 轻量内联胶囊。
 *
 * 单行胶囊：类型语义色只落图标（ok/danger/warn/info，深浅主题同构），一句话 +
 * 可选动作；无关闭钮——整条点击关闭（Sonner 惯例），悬停冻结自动关闭，
 * 同一位置上限 4 条（挤掉最老）。
 * 位置四选一：top-center（默认）/ top-right / bottom-right / bottom-center，
 * 全局默认可经 toast.config 调整、单条可覆写；层级 z-[200]，高于命令面板
 * （z-[101]），搜索报错等反馈在面板打开时仍可见。不接 Esc（浮层退场注册表
 * 只登记阻断后退的浮层，见 D-003）。
 *
 * 用法：app 壳层挂载 <ToastHost /> 一次；任意处调用 toast.success("已保存")、
 * toast.error("失败")、toast.loading → toast.resolve(id) 或 toast.promise(p, {...})。
 */

import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { CircleAlert, CircleCheck, CircleX, Info, LoaderCircle } from "lucide-react";
import clsx from "clsx";

export type ToastType = "success" | "error" | "warning" | "info" | "loading";
export type ToastPosition = "top-center" | "top-right" | "bottom-right" | "bottom-center";

export interface ToastOptions {
  /** 内联动作（如「撤销」），点击后 toast 关闭 */
  action?: { label: string; onClick: () => void };
  position?: ToastPosition;
  /** 自动关闭毫秒数；0 表示不自动关（loading 默认 0） */
  duration?: number;
}

/**
 * 单条胶囊（受 item 驱动的纯展示件）。导出供样板间（src/showcase）构造
 * duration=0 的常显标本——产品代码仍应只消费 toast 命令式 API 与 ToastHost。
 */
export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  action?: ToastOptions["action"];
  position: ToastPosition;
  duration: number;
}

const MAX_VISIBLE = 4;

interface ToastState {
  items: ToastItem[];
  push: (item: ToastItem) => void;
  update: (id: number, patch: Partial<ToastItem>) => void;
  remove: (id: number) => void;
}

const useToastStore = create<ToastState>()(set => ({
  items: [],
  push: item =>
    set(s => {
      // 同位置超限：挤掉最老的（顶部新者在下方入场，老者本就在顶/底边缘）
      const samePos = s.items.filter(i => i.position === item.position);
      const overflow = samePos.length - MAX_VISIBLE + 1;
      const drop = overflow > 0 ? new Set(samePos.slice(0, overflow).map(i => i.id)) : null;
      return { items: [...(drop ? s.items.filter(i => !drop.has(i.id)) : s.items), item] };
    }),
  update: (id, patch) =>
    set(s => ({ items: s.items.map(i => (i.id === id ? { ...i, ...patch } : i)) })),
  remove: id => set(s => ({ items: s.items.filter(i => i.id !== id) })),
}));

/* ---------- 命令式 API ---------- */

const defaults = { position: "top-center" as ToastPosition, duration: 3200 };
let seq = 1;

export const toast = {
  /** 调整全局默认（位置 / 时长） */
  config(patch: Partial<typeof defaults>) {
    Object.assign(defaults, patch);
  },

  show(type: ToastType, message: string, opts: ToastOptions = {}): number {
    const id = seq++;
    useToastStore.getState().push({
      id,
      type,
      message,
      action: opts.action,
      position: opts.position ?? defaults.position,
      duration: opts.duration ?? (type === "loading" ? 0 : defaults.duration),
    });
    return id;
  },

  success(message: string, opts?: ToastOptions) {
    return this.show("success", message, opts);
  },
  error(message: string, opts?: ToastOptions) {
    return this.show("error", message, opts);
  },
  warning(message: string, opts?: ToastOptions) {
    return this.show("warning", message, opts);
  },
  info(message: string, opts?: ToastOptions) {
    return this.show("info", message, opts);
  },
  /** 加载中不自动关；结束后 resolve（转成功）或 reject（转失败） */
  loading(message: string, opts?: ToastOptions) {
    return this.show("loading", message, opts);
  },
  resolve(id: number, message?: string) {
    useToastStore.getState().update(id, { type: "success", message: message ?? "完成" });
  },
  dismiss(id?: number) {
    if (id === undefined) useToastStore.setState({ items: [] });
    else useToastStore.getState().remove(id);
  },

  /** promise 形态：loading → 成功/失败（文案支持按结果取值） */
  promise<T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success?: string | ((data: T) => string);
      error?: string | ((err: unknown) => string);
    },
    opts?: ToastOptions
  ): Promise<T> {
    const id = this.loading(messages.loading, opts);
    promise.then(
      data =>
        void this.resolve(
          id,
          typeof messages.success === "function"
            ? messages.success(data)
            : (messages.success ?? messages.loading)
        ),
      err =>
        useToastStore.getState().update(id, {
          type: "error",
          message:
            typeof messages.error === "function" ? messages.error(err) : (messages.error ?? "失败"),
        })
    );
    return promise;
  },
};

/* ---------- Host：壳层挂载一次 ---------- */

const POSITION_ZONE: Record<ToastPosition, string> = {
  "top-center": "top-[62px] left-1/2 -translate-x-1/2 items-center",
  "top-right": "top-[62px] right-[18px] items-end",
  "bottom-right": "bottom-[44px] right-[18px] flex-col-reverse items-end",
  "bottom-center": "bottom-[44px] left-1/2 -translate-x-1/2 flex-col-reverse items-center",
};
const POSITION_ENTER: Record<ToastPosition, string> = {
  "top-center": "-translate-y-3.5",
  "top-right": "translate-x-[18px]",
  "bottom-right": "translate-x-[18px]",
  "bottom-center": "translate-y-3.5",
};
const POSITION_LEAVE: Record<ToastPosition, string> = {
  "top-center": "-translate-y-2.5 scale-[0.97]",
  "top-right": "translate-x-3.5 scale-[0.97]",
  "bottom-right": "translate-x-3.5 scale-[0.97]",
  "bottom-center": "translate-y-2.5 scale-[0.97]",
};
const TYPE_ICON: Record<ToastType, typeof CircleCheck> = {
  success: CircleCheck,
  error: CircleX,
  warning: CircleAlert,
  info: Info,
  loading: LoaderCircle,
};
const TYPE_COLOR: Record<ToastType, string> = {
  success: "text-ok",
  error: "text-danger",
  warning: "text-warn",
  info: "text-info",
  loading: "text-ink-2",
};
const POSITION_ORDER: ToastPosition[] = [
  "top-center",
  "top-right",
  "bottom-right",
  "bottom-center",
];

export function ToastHost() {
  const items = useToastStore(s => s.items);
  return (
    <>
      {POSITION_ORDER.map(pos => {
        const list = items.filter(i => i.position === pos);
        if (!list.length) return null;
        return (
          <div
            key={pos}
            className={clsx(
              "pointer-events-none fixed z-[200] flex flex-col gap-[9px]",
              POSITION_ZONE[pos]
            )}
          >
            {list.map(item => (
              <ToastPill key={item.id} item={item} />
            ))}
          </div>
        );
      })}
    </>
  );
}

export function ToastPill({ item }: { item: ToastItem }) {
  const remove = useToastStore(s => s.remove);
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const Icon = TYPE_ICON[item.type];

  const close = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => remove(item.id), 220);
  };

  // 入场（双 rAF 让初始 transform 先落帧）
  useEffect(() => {
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, []);

  // 自动关闭 + 悬停冻结（记录剩余时间；loading / duration=0 不排程）
  const remainRef = useRef(item.duration);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  useEffect(() => {
    if (item.type === "loading" || item.duration <= 0) return;
    startedAtRef.current = Date.now();
    timerRef.current = window.setTimeout(close, item.duration);
    return () => {
      if (timerRef.current === null) return;
      clearTimeout(timerRef.current);
      remainRef.current -= Date.now() - startedAtRef.current;
      timerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.type, item.duration]);

  const pause = () => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    remainRef.current -= Date.now() - startedAtRef.current;
    timerRef.current = null;
  };
  const resume = () => {
    if (timerRef.current !== null || leaving) return;
    if (item.type === "loading" || item.duration <= 0) return;
    startedAtRef.current = Date.now();
    timerRef.current = window.setTimeout(close, Math.max(remainRef.current, 400));
  };

  return (
    <div
      role="status"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onClick={close}
      title="点击关闭"
      className={clsx(
        "border-line-1 bg-surface text-ink-1 shadow-float text-tau-sm ease-tau-out pointer-events-auto flex min-h-[36px] max-w-[420px] cursor-pointer items-center gap-2.5 rounded-full border px-[15px] transition-[opacity,transform] duration-200",
        leaving
          ? clsx("opacity-0", POSITION_LEAVE[item.position])
          : entered
            ? "opacity-100"
            : clsx("opacity-0", POSITION_ENTER[item.position])
      )}
    >
      <Icon
        size={15}
        strokeWidth={2}
        className={clsx(
          "flex-none",
          TYPE_COLOR[item.type],
          item.type === "loading" && "animate-spin"
        )}
      />
      {/* 竖直 padding 只在这一层（模板同款 7px），胶囊本身不叠 py——否则高度胀到 ~40px */}
      <span className="truncate py-[7px]">{item.message}</span>
      {item.action && (
        <button
          type="button"
          className="text-accent-text hover:bg-accent-soft flex-none cursor-pointer rounded-[7px] px-[7px] py-1 text-[12px] font-semibold"
          onClick={e => {
            e.stopPropagation();
            item.action!.onClick();
            close();
          }}
        >
          {item.action.label}
        </button>
      )}
    </div>
  );
}
