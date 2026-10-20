import { ShieldCheck } from "lucide-react";
import { Button, Dialog } from "@tau/ui";
import { usePluginPermissionUi } from "@/app/plugins/permissions";
import { PERMISSION_LABELS } from "./labels";

/**
 * 插件授权弹窗（壳层挂载）：一次只显示队首请求；关闭、Esc 与拒绝同义。
 * 说明如实告知插件能联网，不把授权描述成数据隔离。
 */
export function PluginPermissionPrompt() {
  const prompt = usePluginPermissionUi(state => state.prompts[0]);
  return (
    <Dialog
      key={prompt?.id}
      open={Boolean(prompt)}
      onOpenChange={open => {
        if (!open) prompt?.settle("deny");
      }}
      title="请求访问你的数据"
      icon={<ShieldCheck size={16} strokeWidth={1.75} />}
      context={prompt?.plugin.name}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={() => prompt?.settle("deny")}>
            拒绝
          </Button>
          <Button variant="secondary" onClick={() => prompt?.settle("once")}>
            仅这次
          </Button>
          <Button variant="primary" data-autofocus onClick={() => prompt?.settle("always")}>
            始终允许
          </Button>
        </>
      }
    >
      {prompt && (
        <div className="text-tau-body text-ink-2">
          <p className="mb-3">「{prompt.plugin.name}」想要：</p>
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
          <p className="text-tau-meta text-ink-3">
            插件可以联网，允许后读取到的内容可能被发送出去。「仅这次」在插件停用或应用重启前有效；之后可在插件详情页撤销。
          </p>
        </div>
      )}
    </Dialog>
  );
}
