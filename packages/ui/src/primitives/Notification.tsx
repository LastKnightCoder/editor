/**
 * Notification 基础件 —— 右上角通知卡栈（mockups/notification/，承载方案 A + 卡片 V4）。
 *
 * 与 Toast 分工：Toast 是「你刚做了什么」的一句话回执；Notification 承载不是当下操作
 * 引发的事件（协作者、应用更新、后台任务），有来源 / 标题 / 说明，常需作答。
 *
 * 卡片：34px 身份位（人 = 派生色头像，系统 = 中性图标，成败 = soft 底语义墨）+ 文字列
 * （标题与「来源 · 相对时间」同行，说明至多 2 行）+ 横跨整卡的等宽按钮条（主按钮放最右，
 * 次要统一描边——等分格里每格都要看得出是按钮）。不描边，ring + lift + float 三层影；
 * 关闭钮悬停/聚焦时出现在左上外沿，不与时间抢右上角。
 * 卡栈：新的在上，只完整显示最新 3 张，更多按底边缩放露 8px 纸边叠 2 层；关掉一张
 * 后面的依次补位，计数标签只报数不可点，另有「全部清除」。
 * 停留：sticky（需作答）常驻；否则 8s 自动关，悬停与作答中冻结。
 * 作答：onClick 返回 promise 时该按钮 loading、整条锁定；兑现 → 有 resolvedText 收成
 * 结果行 1.6s 后退场，否则直接退场；拒绝 → 说明位换成错误文案、按钮解锁。
 * 不抢焦点（role=status + aria-live polite），不接 Esc（非阻断浮层，同 Toast）。
 * 层级 z-[190]：Toast（200）压在通知之上，回执不被卡栈挡住。
 *
 * 用法：壳层挂载 <NotificationHost /> 一次；任意处 notify({...}) 返回 id，
 * notify.update(id, patch) / notify.dismiss(id?) / notify.isActive(id)。同 id 再次
 * notify = 原位更新（去重）。
 * 锚定角默认右上，可传 placement="bottom-right" 纯镜像到右下；系统通知独立窗口另可
 * 传 autoDismiss={false} 关掉自动关闭、className 覆盖容器贴边定位，并用 onItemsChange
 * （id 列表增减）与 onCardClick（卡主体点击）把卡栈生命周期桥接到宿主窗口。
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
} from "react";
import { create } from "zustand";
import { Bell, Check, CircleAlert, X, type LucideIcon } from "lucide-react";
import { cn } from "../cn";
import { Button } from "./Button";

export type NotificationTone = "neutral" | "ok" | "danger";

export interface NotificationAction {
  label: string;
  /** 主动作（accent 实心）；至多一个，放在数组末尾（主按钮在最右） */
  primary?: boolean;
  /** 返回 promise 即进入作答中：按钮 loading、整条锁定，兑现后退场，拒绝则卡内报错 */
  onClick?: () => unknown;
  /** 作答成功后的结果行文案（如「已同意林然加入协作」）；不给则直接退场 */
  resolvedText?: string;
}

export interface NotificationOptions {
  /** 业务键：同 id 再次 notify 原位更新而非新增（如 "app-update"） */
  id?: string;
  title: string;
  body?: string;
  /** 来源（「协作」「应用更新」），与相对时间同排在标题右侧 */
  source?: string;
  /** 身份位图标；缺省按 tone 取（neutral 铃铛 / ok 对勾 / danger 警示） */
  icon?: LucideIcon;
  /** 人发起的通知：头像文字（通常取名字首字），优先于 icon */
  avatar?: string;
  /** 头像取色种子（如用户 id），同人恒同色；缺省用 avatar 本身 */
  avatarSeed?: string;
  /** 语义只染身份位；卡片本体一律中性 */
  tone?: NotificationTone;
  /** 至多 2 个 */
  actions?: NotificationAction[];
  /** 需作答：常驻到有答案为止（默认 false = 纯告知，duration 后自动关） */
  sticky?: boolean;
  duration?: number;
  /** 事件发生时间（毫秒），缺省为 notify 调用时刻 */
  timestamp?: number;
}

export interface NotificationItem extends Omit<
  NotificationOptions,
  "id" | "sticky" | "duration" | "timestamp"
> {
  id: string;
  sticky: boolean;
  duration: number;
  timestamp: number;
  /** 作答中的动作下标 */
  busy?: number;
  /** 作答成功后的结果行（卡片收成一行） */
  resolvedText?: string;
  /** 作答失败文案（替换说明位） */
  error?: string;
  leaving?: boolean;
}

const DEFAULT_DURATION = 8000;
const RESOLVED_STAY = 1600;
const LEAVE_MS = 260;
const MAX_EXPANDED = 3;
const MAX_LAYERS = 2;
const GAP = 10;
const EDGE = 8;
/** 卡片在栈容器内的内边距：给阴影与左上外沿的关闭钮留位 */
const PAD = 12;

/* ---------- store ---------- */

interface NotificationState {
  /** 新的在前 */
  items: NotificationItem[];
  push: (item: NotificationItem) => void;
  update: (id: string, patch: Partial<NotificationItem>) => void;
  leave: (id: string) => void;
  remove: (id: string) => void;
}

const useNotificationStore = create<NotificationState>()((set, get) => ({
  items: [],
  push: item =>
    set(s =>
      s.items.some(i => i.id === item.id)
        ? { items: s.items.map(i => (i.id === item.id ? item : i)) }
        : { items: [item, ...s.items] }
    ),
  update: (id, patch) =>
    set(s => ({ items: s.items.map(i => (i.id === id ? { ...i, ...patch } : i)) })),
  leave: id => {
    const item = get().items.find(i => i.id === id);
    if (!item || item.leaving) return;
    get().update(id, { leaving: true });
    setTimeout(() => {
      // 退场缓冲期内被同 id 重新 notify 的，不再移除
      if (get().items.find(i => i.id === id)?.leaving) get().remove(id);
    }, LEAVE_MS);
  },
  remove: id => set(s => ({ items: s.items.filter(i => i.id !== id) })),
}));

/* ---------- 命令式 API ---------- */

let seq = 1;

function errorText(err: unknown) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return "操作失败，请重试";
}

function runAction(id: string, index: number) {
  const store = useNotificationStore.getState();
  const item = store.items.find(i => i.id === id);
  const action = item?.actions?.[index];
  if (!item || !action || item.busy !== undefined || item.leaving) return;

  const settle = () => {
    const s = useNotificationStore.getState();
    if (!action.resolvedText) return s.leave(id);
    s.update(id, { busy: undefined, error: undefined, resolvedText: action.resolvedText });
    setTimeout(() => useNotificationStore.getState().leave(id), RESOLVED_STAY);
  };
  const fail = (err: unknown) =>
    useNotificationStore.getState().update(id, { busy: undefined, error: errorText(err) });

  let result: unknown;
  try {
    result = action.onClick?.();
  } catch (err) {
    return fail(err);
  }
  if (result instanceof Promise) {
    store.update(id, { busy: index, error: undefined });
    result.then(settle, fail);
  } else settle();
}

export function notify(options: NotificationOptions): string {
  const { id, sticky, duration, timestamp, ...rest } = options;
  const item: NotificationItem = {
    ...rest,
    id: id ?? `n${seq++}`,
    sticky: sticky ?? false,
    duration: duration ?? DEFAULT_DURATION,
    timestamp: timestamp ?? Date.now(),
  };
  useNotificationStore.getState().push(item);
  return item.id;
}

/** 原位改内容（如「发布失败」重试成功后改成「站点已发布」）；同时清掉作答中/错误态 */
notify.update = (id: string, patch: Partial<Omit<NotificationOptions, "id">>) =>
  useNotificationStore.getState().update(id, { busy: undefined, error: undefined, ...patch });

/** 关闭一条（带退场动画）；不传 id 关闭全部 */
notify.dismiss = (id?: string) => {
  const { items, leave } = useNotificationStore.getState();
  if (id !== undefined) return leave(id);
  items.forEach(i => leave(i.id));
};

/** 该 id 是否仍在栈中展示：已 dismiss（含退场动画中）与已移除都算不在 */
notify.isActive = (id: string) => {
  const item = useNotificationStore.getState().items.find(i => i.id === id);
  return item !== undefined && !item.leaving;
};

/* ---------- 卡片（纯展示件） ---------- */

const TONE_ICON: Record<NotificationTone, LucideIcon> = {
  neutral: Bell,
  ok: Check,
  danger: CircleAlert,
};
const TONE_WELL: Record<NotificationTone, string> = {
  neutral: "bg-hover text-ink-2",
  ok: "bg-ok-soft text-ok",
  danger: "bg-danger-soft text-danger",
};
/** 头像派生色：数据色 tag 1–5，同种子恒同色 */
const AVATAR_TONES = [
  "bg-tag-1-soft text-tag-1",
  "bg-tag-2-soft text-tag-2",
  "bg-tag-3-soft text-tag-3",
  "bg-tag-4-soft text-tag-4",
  "bg-tag-5-soft text-tag-5",
];

function avatarTone(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

function formatAgo(timestamp: number, now = Date.now()) {
  const m = Math.floor((now - timestamp) / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return h < 48 ? "昨天" : `${Math.floor(h / 24)} 天前`;
}

const CARD =
  "group bg-surface text-ink-1 text-tau-meta relative grid w-[356px] grid-cols-[34px_minmax(0,1fr)] " +
  "gap-x-3 rounded-tau-lg p-[14px] text-left " +
  "shadow-[0_0_0_1px_color-mix(in_oklab,var(--tau-ink-1)_7%,transparent),var(--tau-shadow-lift),var(--tau-shadow-float)]";

export interface NotificationCardProps extends Omit<ComponentProps<"div">, "children"> {
  item: NotificationItem;
  /** 相对时间的参照时刻（Host 每 30s 刷新；样板间标本可固定） */
  now?: number;
  onAction?: (index: number) => void;
  onClose?: () => void;
  /** 关闭钮常显（样板间悬停态标本用；产品里靠 hover / focus-within 出现） */
  showClose?: boolean;
}

/**
 * 单张通知卡（受 item 驱动的纯展示件）。导出供样板间构造常显标本——产品代码只应
 * 消费 notify 命令式 API 与 NotificationHost。
 */
export function NotificationCard({
  item,
  now,
  onAction,
  onClose,
  showClose,
  className,
  ...props
}: NotificationCardProps) {
  const tone = item.tone ?? "neutral";
  const resolved = item.resolvedText !== undefined;
  const Icon = resolved ? Check : (item.icon ?? TONE_ICON[tone]);
  const actions = item.actions?.slice(0, 2) ?? [];
  const locked = item.busy !== undefined;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={locked || undefined}
      className={cn(CARD, resolved && "items-center", className)}
      {...props}
    >
      <button
        type="button"
        aria-label="关闭通知"
        onClick={onClose}
        className={cn(
          "bg-surface text-ink-2 hover:text-ink-1 absolute -left-[7px] -top-[7px] z-[1] grid size-5 cursor-pointer place-items-center rounded-full outline-none",
          "shadow-[0_0_0_1px_var(--tau-line-1),var(--tau-shadow-lift)] focus-visible:shadow-[var(--tau-focus-ring)]",
          "ease-tau-out transition-[opacity,transform,color] duration-[160ms]",
          showClose
            ? "scale-100 opacity-100"
            : "scale-[0.8] opacity-0 group-focus-within:scale-100 group-focus-within:opacity-100 group-hover:scale-100 group-hover:opacity-100"
        )}
      >
        <X size={11} strokeWidth={2.2} />
      </button>

      {item.avatar && !resolved ? (
        <span
          aria-hidden
          className={cn(
            "grid size-[34px] place-items-center rounded-full text-[14px] font-[600]",
            avatarTone(item.avatarSeed ?? item.avatar)
          )}
        >
          {item.avatar}
        </span>
      ) : (
        <span
          aria-hidden
          className={cn(
            "grid size-[34px] place-items-center rounded-[11px]",
            resolved ? TONE_WELL.ok : TONE_WELL[tone]
          )}
        >
          <Icon size={16} strokeWidth={1.75} />
        </span>
      )}

      {resolved ? (
        <div className="text-tau-body-lg min-w-0 truncate font-[500]">{item.resolvedText}</div>
      ) : (
        <div className="min-w-0">
          <div className="flex min-h-[19px] items-baseline gap-2.5">
            <span className="text-tau-body-lg min-w-0 truncate font-[600] leading-[1.4]">
              {item.title}
            </span>
            <span className="font-tau-mono text-ink-3 ml-auto shrink-0 whitespace-nowrap text-[11px]">
              {item.source && `${item.source} · `}
              {formatAgo(item.timestamp, now)}
            </span>
          </div>
          {(item.error || item.body) && (
            <p
              className={cn(
                "mt-px line-clamp-2 leading-[1.55]",
                item.error ? "text-danger" : "text-ink-2"
              )}
            >
              {item.error ?? item.body}
            </p>
          )}
        </div>
      )}

      {!resolved && actions.length > 0 && (
        <div className="col-span-2 mt-[13px] flex gap-2">
          {actions.map((action, index) => (
            <Button
              key={action.label}
              size="sm"
              variant={action.primary ? "primary" : "secondary"}
              loading={item.busy === index}
              disabled={locked && item.busy !== index}
              className="h-[30px] flex-1 rounded-[9px] px-3"
              onClick={() => onAction?.(index)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Host：壳层挂载一次 ---------- */

interface Slot {
  y: number;
  scale: number;
  opacity: number;
  layer: boolean;
}

function HostedCard({
  item,
  slot,
  index,
  now,
  placement,
  autoDismiss,
  onHeight,
  onCardClick,
}: {
  item: NotificationItem;
  slot: Slot;
  index: number;
  now: number;
  placement: "top-right" | "bottom-right";
  autoDismiss: boolean;
  onHeight: (id: string, h: number) => void;
  onCardClick?: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(false);

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

  // 高度上报（内容变化：作答收成结果行、报错换行）
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    onHeight(item.id, el.offsetHeight);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => onHeight(item.id, el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [item.id, onHeight]);

  // 自动关闭 + 悬停冻结：只对纯告知、未作答、未收尾的卡计时（剩余时间跨暂停累计）；
  // autoDismiss=false（系统通知窗口）下一律不计时
  const timed =
    autoDismiss && !item.sticky && item.busy === undefined && !item.resolvedText && !item.leaving;
  const remainRef = useRef(item.duration);
  const hoveredRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const startedRef = useRef(0);
  const stop = () => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    remainRef.current -= Date.now() - startedRef.current;
    timerRef.current = null;
  };
  const start = () => {
    if (!timed || hoveredRef.current || timerRef.current !== null) return;
    startedRef.current = Date.now();
    timerRef.current = window.setTimeout(
      () => useNotificationStore.getState().leave(item.id),
      Math.max(remainRef.current, 600)
    );
  };
  useEffect(() => {
    start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timed]);
  // 原位更新（同 id 重发 / 重试成功改内容）= 新一轮停留
  useEffect(() => {
    remainRef.current = item.duration;
  }, [item.timestamp, item.duration]);

  const dx = item.leaving ? 32 : entered ? 0 : 28;
  // bottom 锚定是排布的纯镜像：slot.y 改解释为「卡片底边到容器内底边的距离」，取负即向上排
  const dy = placement === "bottom-right" ? -slot.y : slot.y;
  const style: CSSProperties = {
    transform: `translate(${dx}px, ${dy}px) scale(${slot.scale})`,
    opacity: item.leaving || !entered ? 0 : slot.opacity,
    zIndex: 100 - index,
  };

  return (
    <NotificationCard
      ref={ref}
      item={item}
      now={now}
      inert={slot.layer || item.leaving}
      aria-hidden={slot.layer || undefined}
      style={style}
      className={cn(
        placement === "bottom-right"
          ? "absolute bottom-[12px] left-[12px] origin-top"
          : "absolute left-[12px] top-[12px] origin-bottom",
        "ease-tau-out transition-[transform,opacity] duration-300",
        item.leaving || slot.opacity === 0 ? "pointer-events-none" : "pointer-events-auto",
        slot.layer ? "[&>*]:opacity-0" : onCardClick && "cursor-pointer"
      )}
      onMouseEnter={() => {
        hoveredRef.current = true;
        stop();
      }}
      onMouseLeave={() => {
        hoveredRef.current = false;
        start();
      }}
      onClick={
        slot.layer
          ? undefined
          : e => {
              // 按钮与链接内的点击归控件自身，不算卡主体点击
              if (onCardClick && !(e.target as Element).closest("button,a")) onCardClick(item.id);
            }
      }
      onAction={i => runAction(item.id, i)}
      onClose={() => useNotificationStore.getState().leave(item.id)}
    />
  );
}

export interface NotificationHostProps {
  /** 卡栈锚定角，默认 "top-right" */
  placement?: "top-right" | "bottom-right";
  /** false 时所有卡都不自动关闭（系统通知窗口用），默认 true */
  autoDismiss?: boolean;
  /** 覆盖容器定位类（例如独立窗口里贴边 top-0/bottom-0 right-0），经 cn() 合并 */
  className?: string;
  /**
   * store 内 id 列表变化时回报（按「已从 store 移除」口径：退场动画中的卡仍在列表里，
   * 直到 LEAVE_MS 后真正移除才消失）；挂载时回报一次当前列表。经 id 串比较去抖，
   * 原位更新等内容变化不会触发。
   */
  onItemsChange?: (ids: string[]) => void;
  /** 非叠层卡主体被点击（卡内 button/a 上的点击不触发）；叠层卡不响应点击 */
  onCardClick?: (id: string) => void;
}

export function NotificationHost({
  placement = "top-right",
  autoDismiss = true,
  className,
  onItemsChange,
  onCardClick,
}: NotificationHostProps) {
  const items = useNotificationStore(s => s.items);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());
  const lastSlots = useRef(new Map<string, Slot>());
  const isBottom = placement === "bottom-right";

  // 相对时间刷新
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // id 列表回报：以拼接串为依赖，只有成员增减才回调（渲染频率与回调频率解耦）
  const onItemsChangeRef = useRef(onItemsChange);
  onItemsChangeRef.current = onItemsChange;
  const ids = items.map(i => i.id);
  const idsKey = ids.join("\n");
  useEffect(() => {
    onItemsChangeRef.current?.(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const onHeight = useRef((id: string, h: number) =>
    setHeights(prev => (prev[id] === h ? prev : { ...prev, [id]: h }))
  ).current;

  const live = items.filter(i => !i.leaving);
  const hasOverflow = live.length > MAX_EXPANDED;

  // 排布：完整显示的卡逐张下排；叠层与上一张底边对齐后下探 EDGE、按底边缩放，只露一条纸边
  const slots = new Map<string, Slot>();
  let y = 0;
  let lastTop = 0;
  let lastH = 0;
  live.forEach((item, i) => {
    const h = heights[item.id] ?? 0;
    if (i < MAX_EXPANDED) {
      slots.set(item.id, { y, scale: 1, opacity: 1, layer: false });
      lastTop = y;
      lastH = h;
      y += h + GAP;
    } else {
      const d = i - MAX_EXPANDED + 1;
      slots.set(item.id, {
        y: lastTop + lastH - h + d * EDGE,
        scale: 1 - d * 0.05,
        opacity: d > MAX_LAYERS ? 0 : 1 - d * 0.25,
        layer: true,
      });
    }
  });
  // 退场卡停在最后的位置上滑出
  items.forEach(item => {
    const s = slots.get(item.id);
    if (s) lastSlots.current.set(item.id, s);
  });
  for (const id of lastSlots.current.keys()) {
    if (!items.some(i => i.id === id)) lastSlots.current.delete(id);
  }

  const extra = live.length - MAX_EXPANDED;
  const moreTop = lastTop + lastH + Math.min(Math.max(extra, 0), MAX_LAYERS) * EDGE + 12;
  const stackHeight = PAD * 2 + (hasOverflow ? moreTop + 26 : Math.max(y - GAP, 0));

  if (!items.length) return null;

  return (
    <div
      role="region"
      aria-label="通知"
      className={cn(
        isBottom
          ? "fixed bottom-[6px] right-[6px] z-[190] w-[380px]"
          : "fixed right-[6px] top-[42px] z-[190] w-[380px]",
        "pointer-events-none",
        className
      )}
      style={{ height: stackHeight }}
    >
      {items.map((item, index) => (
        <HostedCard
          key={item.id}
          item={item}
          index={index}
          now={now}
          placement={placement}
          autoDismiss={autoDismiss}
          slot={
            slots.get(item.id) ??
            lastSlots.current.get(item.id) ?? { y: 0, scale: 1, opacity: 1, layer: false }
          }
          onHeight={onHeight}
          onCardClick={onCardClick}
        />
      ))}

      {hasOverflow && (
        <div
          className={cn(
            "text-tau-sm text-ink-2 ease-tau-out pointer-events-auto absolute right-[14px] flex gap-1 duration-300",
            isBottom ? "transition-[bottom]" : "transition-[top]"
          )}
          style={isBottom ? { bottom: PAD + moreTop } : { top: PAD + moreTop }}
        >
          <span className="bg-surface rounded-full px-2.5 py-0.5 shadow-[var(--tau-shadow-lift)]">
            还有 {extra} 条
          </span>
          <button
            type="button"
            onClick={() => notify.dismiss()}
            className="bg-surface hover:text-ink-1 cursor-pointer rounded-full px-2.5 py-0.5 shadow-[var(--tau-shadow-lift)] outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
          >
            全部清除
          </button>
        </div>
      )}
    </div>
  );
}
