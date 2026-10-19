import { useEffect, useState } from "react";
import { MonitorPlay } from "lucide-react";
import { Button, Dialog, DialogBody, Select } from "@tau/ui";
import {
  ResourceSelectError,
  ResourceSelectField,
  ResourceSelectInput,
  ResourceSelectPreview,
} from "@/components/ResourceSelectDialog";
import { useOnlineVideoResolver, type OnlineVideoSelection } from "@/hooks/useOnlineVideoResolver";
import { useVideoProviderName } from "@/hooks/useVideoProviders";

export type { OnlineVideoSelection } from "@/hooks/useOnlineVideoResolver";

interface OnlineVideoSelectModalProps {
  /** 视频插件 ID，弹窗只用该插件解析 */
  providerId: string;
  open: boolean;
  onCancel: () => void;
  onConfirm: (result: OnlineVideoSelection) => void;
  initialUrl?: string;
}

/** 添加某个视频插件的视频：粘贴链接由该插件解析，解析后选择清晰度。 */
export default function OnlineVideoSelectModal({
  providerId,
  open,
  onCancel,
  onConfirm,
  initialUrl = "",
}: OnlineVideoSelectModalProps) {
  const [url, setUrl] = useState(initialUrl);
  const resolver = useOnlineVideoResolver(providerId);
  const name = useVideoProviderName(providerId);
  const { analyzing, error, resolved, variant, reset } = resolver;

  useEffect(() => {
    if (!open) return;
    setUrl(initialUrl);
    reset();
  }, [open, initialUrl, providerId, reset]);

  const analyze = () => {
    if (!url.trim()) {
      resolver.setError("请输入视频链接");
      return;
    }
    void resolver.analyze(url);
  };

  const confirm = () => {
    const selection = resolver.selection();
    if (selection) onConfirm(selection);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onCancel()}
      title={`添加 ${name} 视频`}
      subtitle={resolved ? undefined : "粘贴视频链接，解析后选择清晰度"}
      icon={<MonitorPlay className="size-4" strokeWidth={1.75} />}
      locked={analyzing}
      footer={
        resolved ? (
          <>
            <Button variant="secondary" size="sm" onClick={reset}>
              返回
            </Button>
            <Button variant="primary" size="sm" onClick={confirm}>
              确认添加
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" size="sm" disabled={analyzing} onClick={onCancel}>
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={analyzing}
              loadingText="正在解析…"
              disabled={!url.trim()}
              onClick={analyze}
            >
              解析视频
            </Button>
          </>
        )
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-3.5">
          {resolved ? (
            <>
              <ResourceSelectPreview
                cover={resolved.cover}
                title={resolved.title}
                meta={resolved.providerName}
              />
              {resolved.variants.length > 1 && (
                <ResourceSelectField label="清晰度">
                  <Select
                    aria-label="清晰度"
                    value={variant}
                    onValueChange={value => resolver.setVariant(value)}
                    options={resolved.variants.map((item, index) => ({
                      value: index,
                      label: item.hint ? `${item.label} · ${item.hint}` : item.label,
                    }))}
                  />
                </ResourceSelectField>
              )}
            </>
          ) : (
            <ResourceSelectField label="视频链接">
              <ResourceSelectInput
                data-autofocus
                type="url"
                value={url}
                onChange={event => {
                  setUrl(event.target.value);
                  resolver.setError(null);
                }}
                placeholder="https://"
                disabled={analyzing}
                onKeyDown={event => event.key === "Enter" && !analyzing && analyze()}
              />
            </ResourceSelectField>
          )}
          {error && <ResourceSelectError text={error} />}
        </div>
      </DialogBody>
    </Dialog>
  );
}
