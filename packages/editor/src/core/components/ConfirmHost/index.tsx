import { useEditorI18nRuntime } from "../../../i18n";
import { editorMessages, requestRuntime } from "../../../i18n-runtime";
import { useI18n } from "@tau/i18n/react";
import { ConfirmDialog } from "@tau/ui";
import useConfirmStore from "../../stores/useConfirmStore";
import { useHostedRequestLeader } from "../../stores/createHostedRequestStore";

/**
 * 默认提示服务的确认框（`@tau/ui` ConfirmDialog）。挂在编辑器内，宿主不需要额外挂载；
 * 同页多个编辑器时只由队首渲染。
 */
export default function ConfirmHost() {
  const pending = useConfirmStore(state => state.pending);
  const inheritedRuntime = useEditorI18nRuntime();
  const { t } = useI18n(editorMessages, requestRuntime(pending) ?? inheritedRuntime);
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
      confirmText={pending?.confirmText ?? t("editorCommon.confirm")}
      cancelText={pending?.cancelText ?? t("editorCommon.cancel")}
      danger={pending?.danger}
      onConfirm={() => settle(true)}
    />
  );
}
