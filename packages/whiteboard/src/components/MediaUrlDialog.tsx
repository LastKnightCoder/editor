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
  const board = useBoard();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    let address: URL;
    try {
      address = new URL(url);
      if (!["https:", "http:", "data:"].includes(address.protocol)) throw new Error();
    } catch {
      toast.error("请输入有效的媒体地址");
      return;
    }
    setBusy(true);
    try {
      if (modal.type === "image") await ImageUtil.insertImageFromPath(address.href, board);
      else if (modal.type === "video") await VideoUtil.insertVideoFromUrl(address.href, board);
      else await AudioUtil.insertAudioFromUrl(address.href, board);
      onClose();
    } catch {
      toast.error("插入媒体失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={open => !open && !busy && onClose()}
      title="插入媒体"
      footer={
        <Button loading={busy} onClick={submit}>
          插入
        </Button>
      }
    >
      <DialogBody>
        <Input value={url} onChange={event => setUrl(event.target.value)} placeholder="媒体 URL" />
      </DialogBody>
    </Dialog>
  );
}
