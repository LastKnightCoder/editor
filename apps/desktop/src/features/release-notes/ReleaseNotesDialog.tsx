import { useReleaseNotesI18n } from "./i18n";
import { releaseNotesTitle } from "./format";
import { Download, RotateCw } from "lucide-react";
import { Button, Dialog, DialogBody } from "@tau/ui";
import { useUpdateStore } from "@/stores/useUpdateStore";
import { ReleaseNotesContent } from "./ReleaseNotesContent";
import { useReleaseNotesStore } from "./releaseNotesStore";

export function ReleaseNotesDialog() {
  const { t } = useReleaseNotesI18n();
  const open = useReleaseNotesStore(s => s.open);
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
      title={releaseNotesTitle(notes, t)}
      size="lg"
      footer={
        updateAction ? (
          <>
            <Button variant="secondary" onClick={close}>
              {t("action.later")}
            </Button>
            {status === "available" ? (
              <Button variant="primary" icon={Download} onClick={startUpdate}>
                {t("action.update")}
              </Button>
            ) : status === "ready" ? (
              <Button
                variant="primary"
                icon={RotateCw}
                onClick={() => void useUpdateStore.getState().install()}
              >
                {t("action.restart")}
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
