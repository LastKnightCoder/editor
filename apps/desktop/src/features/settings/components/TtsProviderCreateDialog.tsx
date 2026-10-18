import { Button, Dialog, DialogBody } from "@tau/ui";
import type { TTSProviderDraft } from "@/types/tts";
import { useDesktopPlugins } from "@/app/plugins/context";

export function TtsProviderCreateDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (draft: TTSProviderDraft) => void;
}) {
  const runtime = useDesktopPlugins();
  const sections =
    runtime?.listSettings().filter(section => section.definition.target === "tts") ?? [];
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="新建语音合成服务商"
      subtitle="选择已启用的语音插件"
      footer={
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          取消
        </Button>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-2">
          {sections.map(section => (
            <Button
              key={section.key}
              onClick={() => {
                onCreate({
                  pluginId: section.context.pluginId,
                  name: section.definition.title,
                  config: {},
                  models: [],
                });
                onOpenChange(false);
              }}
            >
              {section.definition.title}
            </Button>
          ))}
          {sections.length === 0 && (
            <p className="text-tau-meta text-ink-2">
              请先到插件中心安装并启用语音插件，再添加账号。
            </p>
          )}
        </div>
      </DialogBody>
    </Dialog>
  );
}
