import { useProviderDraftI18n } from "../settings/storage/draft.i18n";
import { useState } from "react";
import type { JsonValue, PluginContext, ProviderForm } from "@tau/plugins";
import { isProviderFormComplete } from "@tau/plugins";
import { Button } from "@tau/ui";
import { usePageGuard } from "../../router/pageLifecycle";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";
import { MobileProviderForm } from "../settings/storage/ProviderForm";
import { useProviderDraft } from "../settings/storage/useProviderDraft";

export function ProviderConfigForm({
  form,
  context,
  stored,
  save,
  changed = false,
  onReset,
  errorText,
}: {
  errorText?: (error: unknown) => string;
  changed?: boolean;
  onReset?(): void;
  form: ProviderForm;
  context: PluginContext;
  stored: JsonValue;
  save(config: JsonValue): Promise<void>;
}) {
  const { t } = useProviderDraftI18n();
  const draft = useProviderDraft(
    form,
    stored,
    async config => {
      context.signal.throwIfAborted();
      await save(config);
    },
    errorText
  );
  const [saved, setSaved] = useState(false);
  const [leave, setLeave] = useState<{ resolve(value: boolean): void }>();
  usePageGuard(() =>
    !draft.dirty && !changed && !draft.saving
      ? true
      : new Promise<boolean>(resolve => setLeave({ resolve }))
  );
  return (
    <>
      <MobileProviderForm
        form={form}
        values={draft.values}
        errors={draft.errors}
        disabled={draft.saving}
        signal={context.signal}
        onChange={(values, key) => {
          setSaved(false);
          draft.change(values, key);
        }}
      />
      <div className="flex items-center justify-end gap-2 py-4">
        <Button
          variant="ghost"
          disabled={(!draft.dirty && !changed) || draft.saving}
          onClick={() => {
            draft.reset();
            onReset?.();
          }}
        >
          {t("reset")}
        </Button>
        <Button
          loading={draft.saving}
          disabled={!draft.dirty && !changed && isProviderFormComplete(form, stored)}
          onClick={async () => {
            if (await draft.save()) setSaved(true);
          }}
        >
          {t("save")}
        </Button>
      </div>
      {(draft.error || saved) && (
        <p role={draft.error ? "alert" : "status"} className="text-tau-meta">
          {draft.error || t("saved")}
        </p>
      )}
      <MobileConfirmDialog
        open={!!leave}
        title={t("leave.title")}
        description={t("leave.description")}
        confirmText={t("leave.confirm")}
        loading={draft.saving}
        onCancel={() => {
          leave?.resolve(false);
          setLeave(undefined);
        }}
        onConfirm={() => {
          draft.reset();
          leave?.resolve(true);
          setLeave(undefined);
        }}
      />
    </>
  );
}
