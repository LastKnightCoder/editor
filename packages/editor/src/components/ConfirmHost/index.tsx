import { useEffect, useState } from "react";
import { ConfirmDialog } from "@tau/ui";
import useConfirmStore from "../../stores/useConfirmStore";

/**
 * 默认提示服务的确认框（`@tau/ui` ConfirmDialog）。挂在编辑器内，宿主不需要额外挂载。
 * 同页多个编辑器各挂一个：按挂载顺序只让队首渲染，队首卸载后下一个接手，避免叠出两层对话框。
 */
export default function ConfirmHost() {
  const pending = useConfirmStore(state => state.pending);
  const settle = useConfirmStore(state => state.settle);
  const hosts = useConfirmStore(state => state.hosts);
  const [token] = useState(() => Symbol("confirm-host"));

  useEffect(() => {
    const { attachHost, detachHost } = useConfirmStore.getState();
    attachHost(token);
    return () => detachHost(token);
  }, [token]);

  if (hosts[0] !== token) return null;

  return (
    <ConfirmDialog
      open={!!pending}
      onOpenChange={open => {
        if (!open) settle(false);
      }}
      title={pending?.title ?? ""}
      description={pending?.description}
      confirmText={pending?.confirmText ?? "确认"}
      cancelText={pending?.cancelText ?? "取消"}
      danger={pending?.danger}
      onConfirm={() => settle(true)}
    />
  );
}
