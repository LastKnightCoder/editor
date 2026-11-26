import { useWhiteboardUiI18n } from "../ui-i18n";
import { useState } from "react";
import { Button, Dialog, DialogBody, Input, toast } from "@tau/ui";
import { useBoard } from "../hooks/useBoard";
import { ImageUtil, VideoUtil, AudioUtil } from "../utils";
import type { ContextMenuModalPayload } from "../types";

export default function MediaUrlDialog({
  modal,
  onClose,
}: {
  modal: ContextMenuModalPayload;
  onClose(): void;
}) {
  const { t } = useWhiteboardUiI18n();
  const board = useBoard();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    let address: URL;
    try {
      address = new URL(url);
      if (!["https:", "http:", "data:"].includes(address.protocol)) throw new Error();
    } catch {
      toast.error(t("ui.media.invalid"));
      return;
    }
    setBusy(true);
    try {
      if (modal.type === "image") await ImageUtil.insertImageFromPath(address.href, board);
      else if (modal.type === "video") await VideoUtil.insertVideoFromUrl(address.href, board);
      else await AudioUtil.insertAudioFromUrl(address.href, board);
      onClose();
    } catch {
      toast.error(t("ui.media.failed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={open => !open && !busy && onClose()}
      title={t("ui.media.title")}
      footer={
        <Button loading={busy} onClick={submit}>
          {t("ui.media.insert")}
        </Button>
      }
    >
      <DialogBody>
        <Input
          aria-label={t("ui.media.url")}
          value={url}
          onChange={event => setUrl(event.target.value)}
          placeholder={t("ui.media.url")}
        />
      </DialogBody>
    </Dialog>
  );
}
