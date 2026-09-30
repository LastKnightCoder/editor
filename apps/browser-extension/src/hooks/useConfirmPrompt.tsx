import { useCallback, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@tau/ui";

interface ConfirmPromptOptions {
  title: string;
  description?: ReactNode;
  danger?: boolean;
  confirmText?: string;
}

interface PendingPrompt extends ConfirmPromptOptions {
  resolve: (ok: boolean) => void;
}

/**
 * antd `modal.confirm` 的 Promise 语义桥接（D-073 ext 侧）：
 * `const { confirm, confirmDialog } = useConfirmPrompt()`——confirm() 返回
 * Promise<boolean>，confirmDialog 放进渲染树，关闭（含 Esc/遮罩）按取消结算。
 */
export function useConfirmPrompt() {
  const [pending, setPending] = useState<PendingPrompt | null>(null);

  const confirm = useCallback((options: ConfirmPromptOptions) => {
    return new Promise<boolean>(resolve => {
      setPending(previous => {
        previous?.resolve(false);
        return { ...options, resolve };
      });
    });
  }, []);

  const settle = (ok: boolean) => {
    setPending(current => {
      current?.resolve(ok);
      return null;
    });
  };

  const confirmDialog = pending ? (
    <ConfirmDialog
      open
      onOpenChange={open => {
        if (!open) settle(false);
      }}
      title={pending.title}
      description={pending.description ?? ""}
      danger={pending.danger}
      confirmText={pending.confirmText}
      onConfirm={() => settle(true)}
    />
  ) : null;

  return { confirm, confirmDialog };
}
