import { Dialog, DialogBody } from "@tau/ui";
import { useUpgradePromptStore } from "@/app/upgradePromptStore";
import { UpgradePromptBody, UpgradePromptFooter } from "./UpgradePromptContent";
import { useResolvedUpgradeCopy, useUpgradePromptController } from "./useUpgradePromptController";
import type { UpgradePromptRequest } from "@tau/shared/upgrade-prompt";

/** 全局通用升级提示弹窗宿主：挂载于 AutoUpdateChecker，与 ReleaseNotesDialog 同族。 */
export function UpgradePromptHost() {
  const open = useUpgradePromptStore(s => s.open);
  const request = useUpgradePromptStore(s => s.request);
  const close = useUpgradePromptStore(s => s.close);
  const clear = useUpgradePromptStore(s => s.clear);

  if (!request) return null;
  return <UpgradePromptDialog open={open} request={request} onClose={close} onAfterClose={clear} />;
}

function UpgradePromptDialog({
  open,
  request,
  onClose,
  onAfterClose,
}: {
  open: boolean;
  request: UpgradePromptRequest;
  onClose: () => void;
  onAfterClose: () => void;
}) {
  const copy = useResolvedUpgradeCopy(request);
  const controller = useUpgradePromptController({ active: open });

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) onClose();
      }}
      onAfterClose={onAfterClose}
      title={copy.title}
      context={request.context}
      critical={Boolean(request.critical)}
      width={468}
      footer={<UpgradePromptFooter request={request} controller={controller} onClose={onClose} />}
    >
      <DialogBody>
        <UpgradePromptBody
          request={request}
          copy={copy}
          controller={controller}
          onClose={onClose}
        />
      </DialogBody>
    </Dialog>
  );
}
