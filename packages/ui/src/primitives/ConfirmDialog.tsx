/**
 * ConfirmDialog —— Dialog 的最薄语义预设：确认类对话一句话接线（D-011）。
 *
 * 信息一处一责：标题讲动作、context 徽标记对象、description 讲事实、impact 念
 * 后果、按钮文案不带数量。danger 两档（D-011 用户裁决）：
 *  - 轻 danger：实心红主按钮 + 初始焦点落取消（回车不误触），一步确认
 *  - 真·不可逆：typeToConfirm 传对象名，输入匹配才解锁确认按钮（每次打开重置）
 *
 * 异步确认两种接法：
 *  - 推荐：onConfirm 返回 Promise（async 函数天然满足）——自动进入 loading，
 *    resolve 后自动关闭、reject 保持打开（错误留在原地处理）；loading 态封锁
 *    一切关闭路径，回执交 Toast（D-003 家族分工）
 *  - 受控：loading prop 由调用方管理（多步进度等），完成后自行把 open 置 false。
 *    注意不能在 onConfirm 里才 set loading——props 是渲染快照，同步路径会先按
 *    false 立即关闭（样板间首版即踩此竞态，故内建 Promise 感知）
 */

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import clsx from "clsx";
import { Dialog, DialogBody } from "./Dialog";
import { Button } from "./Button";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** 操作对象（徽标） */
  context?: string;
  description?: ReactNode;
  /** 影响行（后果量化），danger 主按钮时默认走 danger 色 */
  impact?: string;
  confirmText?: string;
  cancelText?: string;
  /** 主按钮 danger 实心 + 初始焦点落取消（防回车误触） */
  danger?: boolean;
  /** 输入该名称后确认按钮才解锁——只给真·不可逆操作（档位不是装饰） */
  typeToConfirm?: string;
  critical?: boolean;
  /** 确认进行中：封锁关闭路径 + 主按钮 loading；onConfirm 返回 Promise 时自动管理 */
  loading?: boolean;
  loadingText?: string;
  onConfirm?: () => void | Promise<unknown>;
  /** 条件未满足时禁用确认位（如仍在同步），取消照常可用 */
  confirmDisabled?: boolean;
  size?: "sm" | "md" | "lg";
  width?: number;
  className?: string;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  context,
  description,
  impact,
  confirmText = "确认",
  cancelText = "取消",
  danger = false,
  typeToConfirm,
  critical,
  loading = false,
  loadingText = "处理中…",
  onConfirm,
  confirmDisabled = false,
  size = "md",
  width,
  className,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [pending, setPending] = useState(false);

  // type-to-confirm 每次打开重置（重新走输入门槛）
  useEffect(() => {
    if (open) setConfirmInput("");
  }, [open]);

  const confirmed = !typeToConfirm || confirmInput.trim() === typeToConfirm;
  const busy = loading || pending;
  const canConfirm = confirmed && !confirmDisabled && !busy;

  const handleConfirm = () => {
    if (!canConfirm) return;
    const result = onConfirm?.();
    if (result && typeof result.then === "function") {
      // 异步确认：自动 loading，resolve 自动关、reject 留在原地（错误就地处理）
      setPending(true);
      void result.then(
        () => {
          setPending(false);
          onOpenChange(false);
        },
        () => setPending(false)
      );
      return;
    }
    if (!loading) onOpenChange(false); // 受控 loading 由调用方在完成后关
  };

  // Enter 默认应答：焦点不在按钮上时转发主按钮（焦点在按钮上走原生点击）
  const onCardKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    if (e.target instanceof HTMLElement && e.target.closest("button")) return;
    e.preventDefault();
    if (canConfirm) confirmRef.current?.click();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      context={context}
      impact={impact}
      impactDanger={danger}
      critical={critical}
      locked={busy}
      size={size}
      width={width}
      onKeyDown={onCardKeyDown}
      className={className}
      footer={
        <>
          <Button
            variant="secondary"
            disabled={busy}
            data-autofocus={danger || undefined}
            onClick={() => onOpenChange(false)}
          >
            {cancelText}
          </Button>
          <Button
            ref={confirmRef}
            variant={danger ? "danger" : "primary"}
            disabled={!confirmed || confirmDisabled}
            loading={busy}
            loadingText={loadingText}
            data-autofocus={!danger || undefined}
            onClick={handleConfirm}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <DialogBody>
        {description}
        {typeToConfirm && (
          <div className="mt-3">
            <input
              type="text"
              value={confirmInput}
              onChange={e => setConfirmInput(e.target.value)}
              placeholder="输入名称以确认"
              autoComplete="off"
              disabled={busy}
              className={clsx(
                "border-line-1 bg-surface text-ink-1 placeholder:text-ink-3",
                "rounded-tau-sm focus:border-accent h-[36px] w-full border px-3 outline-none",
                "ease-tau-out transition-[border-color,box-shadow] duration-[160ms]",
                "focus:shadow-[var(--tau-focus-ring)]"
              )}
            />
            <div className="text-ink-3 mt-1.5 text-[11.5px]">
              输入 <code className="font-tau-mono text-accent-text">{typeToConfirm}</code> 解锁
              {confirmText}按钮
            </div>
          </div>
        )}
      </DialogBody>
    </Dialog>
  );
}
