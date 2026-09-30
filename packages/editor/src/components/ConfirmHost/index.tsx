import { ConfirmDialog } from "@tau/ui";
import useConfirmStore from "../../stores/useConfirmStore";
import { useHostedRequestLeader } from "../../stores/createHostedRequestStore";

/**
 * 默认提示服务的确认框（`@tau/ui` ConfirmDialog）。挂在编辑器内，宿主不需要额外挂载；
 * 同页多个编辑器时只由队首渲染。
 */
export default function ConfirmHost() {
  const pending = useConfirmStore(state => state.pending);
  const settle = useConfirmStore(state => state.settle);
  const isLeader = useHostedRequestLeader(useConfirmStore);

  if (!isLeader) return null;

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
