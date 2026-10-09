import { Download, RotateCw } from "lucide-react";
import { Button, Dialog, DialogBody } from "@tau/ui";
import { useUpdateStore } from "@/stores/useUpdateStore";
import { ReleaseNotesContent } from "./ReleaseNotesContent";
import { useReleaseNotesStore } from "./releaseNotesStore";

export function ReleaseNotesDialog() {
  const open = useReleaseNotesStore(s => s.open);
  const title = useReleaseNotesStore(s => s.title);
  const notes = useReleaseNotesStore(s => s.notes);
  const updateAction = useReleaseNotesStore(s => s.updateAction);
  const close = useReleaseNotesStore(s => s.close);
  const status = useUpdateStore(s => s.status);

  const startUpdate = () => {
    close();
    void useUpdateStore.getState().download();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && close()}
      title={title}
      size="lg"
      footer={
        updateAction ? (
          <>
            <Button variant="secondary" onClick={close}>
              稍后
            </Button>
            {status === "available" ? (
              <Button variant="primary" icon={Download} onClick={startUpdate}>
                立即更新
              </Button>
            ) : status === "ready" ? (
              <Button
                variant="primary"
                icon={RotateCw}
                onClick={() => void useUpdateStore.getState().install()}
              >
                重启并安装
              </Button>
            ) : null}
          </>
        ) : undefined
      }
    >
      <DialogBody>
        <ReleaseNotesContent notes={notes} />
      </DialogBody>
    </Dialog>
  );
}
