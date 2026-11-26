import { useMediaUrlSelectorI18n } from "@/services/media-url-selector.i18n";
import React, { useState, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { Music } from "lucide-react";
import { Button, Dialog, DialogBody } from "@tau/ui";
import {
  ResourceSelectError,
  ResourceSelectField,
  ResourceSelectInput,
} from "@/components/ResourceSelectDialog";

interface RemoteAudioSelectModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (url: string) => void;
  initialUrl?: string;
}

const RemoteAudioSelectModal: React.FC<RemoteAudioSelectModalProps> = ({
  open,
  onCancel,
  onConfirm,
  initialUrl = "",
}) => {
  const { t } = useMediaUrlSelectorI18n();
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState<"empty" | "protocol" | "invalid" | null>(null);

  useEffect(() => {
    if (open) {
      setUrl(initialUrl);
      setError(null);
    }
  }, [open, initialUrl]);

  const handleSubmit = useMemoizedFn(() => {
    if (!url.trim()) {
      setError("empty");
      return;
    }

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setError("protocol");
        return;
      }
    } catch {
      setError("invalid");
      return;
    }

    onConfirm(url.trim());
  });

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onCancel()}
      title={t("audio.title")}
      subtitle={t("audio.hint")}
      icon={<Music className="size-4" strokeWidth={1.75} />}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="sm" disabled={!url.trim()} onClick={handleSubmit}>
            {t("confirm")}
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-3.5">
          <ResourceSelectField label={t("audio.url")} hint={t("audio.formats")}>
            <ResourceSelectInput
              data-autofocus
              type="url"
              value={url}
              onChange={e => {
                setUrl(e.target.value);
                setError(null);
              }}
              placeholder="https://example.com/audio.mp3"
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </ResourceSelectField>
          {error ? (
            <ResourceSelectError text={t(`audio.error.${error}`)} />
          ) : (
            <p className="text-tau-sm text-ink-3">{t("publicLink")}</p>
          )}
        </div>
      </DialogBody>
    </Dialog>
  );
};

export default RemoteAudioSelectModal;
