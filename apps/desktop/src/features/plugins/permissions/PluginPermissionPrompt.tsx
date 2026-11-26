import { pluginControlsTranslator, usePluginControlsI18n } from "../controls.i18n";
import { ShieldCheck } from "lucide-react";
import { Button, Dialog, DialogBody } from "@tau/ui";
import { usePluginPermissionUi } from "@/app/plugins/permissions";
import { PERMISSION_LABELS } from "./labels";
const t = pluginControlsTranslator.t;

/**
 * 插件授权弹窗（壳层挂载）：一次只显示队首请求；关闭、Esc 与拒绝同义。
 * 说明如实告知插件能联网，不把授权描述成数据隔离。
 */
export function PluginPermissionPrompt() {
  usePluginControlsI18n();
  const prompt = usePluginPermissionUi(state => state.prompts[0]);
  return (
    <Dialog
      key={prompt?.id}
      open={Boolean(prompt)}
      onOpenChange={open => {
        if (!open) prompt?.settle("deny");
      }}
      title={t("permission.request")}
      icon={<ShieldCheck size={16} strokeWidth={1.75} />}
      context={prompt?.plugin.name}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={() => prompt?.settle("deny")}>
            {t("permission.deny")}
          </Button>
          <Button variant="secondary" onClick={() => prompt?.settle("once")}>
            {t("permission.once")}
          </Button>
          <Button variant="primary" data-autofocus onClick={() => prompt?.settle("always")}>
            {t("permission.always")}
          </Button>
        </>
      }
    >
      {prompt && (
        <DialogBody className="text-tau-body text-ink-2">
          <p className="mb-3">{t("permission.intro", { name: prompt.plugin.name })}</p>
          <ul className="mb-4 flex flex-col gap-2">
            {prompt.permissions.map(permission => (
              <li key={permission} className="flex flex-col">
                <span className="text-ink-1 font-medium">
                  {PERMISSION_LABELS[permission].label}
                </span>
                <span className="text-tau-meta text-ink-3">
                  {PERMISSION_LABELS[permission].detail}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-tau-meta text-ink-3">{t("permission.notice")}</p>
        </DialogBody>
      )}
    </Dialog>
  );
}
