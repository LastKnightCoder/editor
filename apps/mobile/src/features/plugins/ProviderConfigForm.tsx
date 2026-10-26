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
}: {
  changed?: boolean;
  onReset?(): void;
  form: ProviderForm;
  context: PluginContext;
  stored: JsonValue;
  save(config: JsonValue): Promise<void>;
}) {
  const draft = useProviderDraft(form, stored, async config => {
    context.signal.throwIfAborted();
    await save(config);
  });
  const [message, setMessage] = useState("");
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
          setMessage("");
          draft.change(values, key);
        }}
      />
      <div className="flex items-center justify-end gap-2 py-4">
        <Button
          variant="ghost"
          disabled={!draft.dirty || draft.saving}
          onClick={() => {
            draft.reset();
            onReset?.();
          }}
        >
          还原
        </Button>
        <Button
          loading={draft.saving}
          disabled={!draft.dirty && !changed && isProviderFormComplete(form, stored)}
          onClick={async () => {
            if (await draft.save()) setMessage("配置已保存");
          }}
        >
          保存配置
        </Button>
      </div>
      {(draft.error || message) && (
        <p role={draft.error ? "alert" : "status"} className="text-tau-meta">
          {draft.error || message}
        </p>
      )}
      <MobileConfirmDialog
        open={!!leave}
        title="放弃未保存的修改？"
        description="配置尚未保存，返回会放弃这次修改。"
        confirmText="放弃修改"
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
