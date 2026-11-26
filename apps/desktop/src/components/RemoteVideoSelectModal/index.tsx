import { useMediaUrlSelectorI18n } from "@/services/media-url-selector.i18n";
import React, { useState, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { Link2 } from "lucide-react";
import { Button, Dialog, DialogBody } from "@tau/ui";
import {
  ResourceSelectError,
  ResourceSelectField,
  ResourceSelectInput,
} from "@/components/ResourceSelectDialog";

export interface RemoteVideoSelectResult {
  url: string;
}

interface RemoteVideoSelectModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (result: RemoteVideoSelectResult) => void;
  initialUrl?: string;
}

const RemoteVideoSelectModal: React.FC<RemoteVideoSelectModalProps> = ({
  open,
  onCancel,
  onConfirm,
  initialUrl = "",
}) => {
  const { t } = useMediaUrlSelectorI18n();
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState<"empty" | "invalid" | null>(null);

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
      new URL(url);
    } catch {
      setError("invalid");
      return;
    }

    onConfirm({ url: url.trim() });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onCancel()}
      title={t("video.title")}
      subtitle={t("video.hint")}
      icon={<Link2 className="size-4" strokeWidth={1.75} />}
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
          <ResourceSelectField label={t("video.url")} hint={t("video.formats")}>
            <ResourceSelectInput
              data-autofocus
              type="url"
              value={url}
              onChange={e => {
                setUrl(e.target.value);
                setError(null);
              }}
              placeholder="https://example.com/video.mp4"
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </ResourceSelectField>
          {error ? (
            <ResourceSelectError text={t(`video.error.${error}`)} />
          ) : (
            <p className="text-tau-sm text-ink-3">{t("publicLink")}</p>
          )}
        </div>
      </DialogBody>
    </Dialog>
  );
};

export default RemoteVideoSelectModal;
