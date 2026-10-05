import { Dialog, DialogBody } from "@tau/ui";
import { ReleaseNotesContent } from "./ReleaseNotesContent";
import { useReleaseNotesStore } from "./releaseNotesStore";

export function ReleaseNotesDialog() {
  const open = useReleaseNotesStore(s => s.open);
  const title = useReleaseNotesStore(s => s.title);
  const notes = useReleaseNotesStore(s => s.notes);
  const close = useReleaseNotesStore(s => s.close);

  return (
    <Dialog open={open} onOpenChange={next => !next && close()} title={title} size="lg">
      <DialogBody>
        <ReleaseNotesContent notes={notes} />
      </DialogBody>
    </Dialog>
  );
}
