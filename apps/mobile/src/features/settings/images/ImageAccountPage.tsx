import { ImageAccountFieldsError } from "./errors";
import {
  imageText,
  useImageSettingsI18n,
  imageSettingsErrorText,
  type ImageSettingsMessageKey,
} from "./i18n";
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
  useImageSettingsI18n();
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
  const [error, setError] = useState<ImageSettingsMessageKey | "">("");
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
      setError("error.deleteFailed");
    } finally {
      setRemoving(false);
    }
  };
  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 flex flex-col">
      <PageHeader title={imageText("accountTitle")} onBack={() => void navigator.goBack("ui")} />
      <div className="mobile-page-scroll min-h-0 flex-1 overflow-y-auto px-4">
        {deleted || (accountId && !account) ? (
          <p className="text-ink-3 py-8">{imageText("deleted")}</p>
        ) : !provider || !form ? (
          <p className="text-ink-3 py-8">{imageText("enablePlugin")}</p>
        ) : (
          <>
            <label className="text-ink-3 text-tau-sm block py-3">
              {imageText("accountName")}
              <input
                aria-label={imageText("accountName")}
                className="input-base bg-surface text-ink-1 mt-2 w-full rounded-xl p-3"
                value={name}
                onChange={event => setName(event.currentTarget.value)}
              />
            </label>
            <label className="text-ink-3 text-tau-sm block pb-3">
              {imageText("modelId")}
              <input
                aria-label={imageText("modelId")}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="input-base bg-surface text-ink-1 mt-2 w-full rounded-xl p-3"
                value={modelId}
                onChange={event => setModelId(event.currentTarget.value)}
              />
            </label>
            <ProviderConfigForm
              errorText={imageSettingsErrorText}
              form={form}
              context={provider.context}
              stored={account?.config ?? {}}
              changed={!account || name !== account.name || modelId !== account.modelId}
              onReset={() => {
                setName(account?.name ?? provider.definition.title);
                setModelId(account?.modelId ?? provider.definition.models?.[0]?.id ?? "");
              }}
              save={async config => {
                if (!name.trim() || !modelId.trim()) throw new ImageAccountFieldsError();
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
                {imageText("deleteAccount")}
              </Button>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="text-danger text-tau-meta">
            {imageText(error)}
          </p>
        )}
      </div>
      <MobileConfirmDialog
        open={removeOpen}
        title={imageText("deleteTitle")}
        description={imageText("deleteDescription")}
        confirmText={imageText("delete")}
        loading={removing}
        onCancel={() => setRemoveOpen(false)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
