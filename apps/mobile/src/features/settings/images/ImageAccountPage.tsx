import { useState } from "react";
import { Button } from "@tau/ui";
import { PageHeader } from "../../../components/PageHeader";
import { MobileConfirmDialog } from "../../../components/MobileConfirmDialog";
import { useNavigator } from "../../../router";
import { ProviderConfigForm } from "../../plugins/ProviderConfigForm";
import { useImageDomain } from "./useImageDomain";

export function ImageAccountPage({
  settingsId,
  accountId,
}: {
  settingsId: string;
  accountId?: string;
}) {
  const navigator = useNavigator();
  const { providers, accounts, mutate } = useImageDomain();
  const provider = providers.find(item => item.id === settingsId);
  const [id] = useState(() => accountId ?? crypto.randomUUID());
  const account = accounts.find(item => item.id === id);
  const [name, setName] = useState(account?.name ?? provider?.definition.title ?? "");
  const [modelId, setModelId] = useState(
    account?.modelId ?? provider?.definition.models?.[0]?.id ?? ""
  );
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const [deleted, setDeleted] = useState(false);
  const form =
    !account || account.pluginId === provider?.context.pluginId
      ? provider?.definition.form
      : undefined;
  const remove = async () => {
    setRemoving(true);
    try {
      await mutate({ type: "delete", id });
      setDeleted(true);
      setRemoveOpen(false);
    } catch {
      setError("删除失败，请稍后重试");
    } finally {
      setRemoving(false);
    }
  };
  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 flex flex-col">
      <PageHeader title="图片账号" onBack={() => void navigator.goBack("ui")} />
      <div className="mobile-page-scroll min-h-0 flex-1 overflow-y-auto px-4">
        {deleted || (accountId && !account) ? (
          <p className="text-ink-3 py-8">账号已删除，请返回图片设置。</p>
        ) : !provider || !form ? (
          <p className="text-ink-3 py-8">请先启用支持声明式配置的图片插件。</p>
        ) : (
          <>
            <label className="text-ink-3 text-tau-sm block py-3">
              账号名称
              <input
                aria-label="账号名称"
                className="input-base bg-surface text-ink-1 mt-2 w-full rounded-xl p-3"
                value={name}
                onChange={event => setName(event.currentTarget.value)}
              />
            </label>
            <label className="text-ink-3 text-tau-sm block pb-3">
              图片模型 ID
              <input
                aria-label="图片模型 ID"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="input-base bg-surface text-ink-1 mt-2 w-full rounded-xl p-3"
                value={modelId}
                onChange={event => setModelId(event.currentTarget.value)}
              />
            </label>
            <ProviderConfigForm
              form={form}
              context={provider.context}
              stored={account?.config ?? {}}
              changed={!account || name !== account.name || modelId !== account.modelId}
              onReset={() => {
                setName(account?.name ?? provider.definition.title);
                setModelId(account?.modelId ?? provider.definition.models?.[0]?.id ?? "");
              }}
              save={async config => {
                if (!name.trim() || !modelId.trim()) throw new Error("请填写账号名称和图片模型 ID");
                provider.context.signal.throwIfAborted();
                await mutate({
                  type: "save",
                  provider: {
                    id,
                    name: name.trim(),
                    pluginId: provider.context.pluginId,
                    modelId: modelId.trim(),
                    config,
                  },
                });
                setName(name.trim());
                setModelId(modelId.trim());
              }}
            />
            {account && (
              <Button variant="ghost" onClick={() => setRemoveOpen(true)}>
                删除账号
              </Button>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="text-danger text-tau-meta">
            {error}
          </p>
        )}
      </div>
      <MobileConfirmDialog
        open={removeOpen}
        title="删除图片账号？"
        description="账号配置会被删除。若它正在使用，需要重新选择图片服务。"
        confirmText="删除"
        loading={removing}
        onCancel={() => setRemoveOpen(false)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
