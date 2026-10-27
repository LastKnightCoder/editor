// 语音账号的插件凭据表单：插件声明字段，宿主渲染并在导航栏「保存」时写回本账号实例。

import { useEffect, useRef } from "react";
import type { JsonValue, ProviderForm } from "@tau/plugins";
import { MobileProviderForm } from "../../storage/ProviderForm";
import { useProviderDraft } from "../../storage/useProviderDraft";
import { TtsStatus } from "./TtsUi";

export interface TtsAccountDraft {
  dirty: boolean;
  saving: boolean;
  save(): Promise<JsonValue | null>;
}

export function TtsAccountForm({
  form,
  stored,
  disabled,
  persist,
  onDraft,
}: {
  form: ProviderForm;
  stored: JsonValue;
  disabled: boolean;
  persist(config: JsonValue): Promise<void>;
  /** 把草稿状态交给页面导航栏的保存按钮 */
  onDraft(draft: TtsAccountDraft): void;
}) {
  const draft = useProviderDraft(form, stored, persist);
  const saveRef = useRef(draft.save);
  saveRef.current = draft.save;
  const { dirty, saving } = draft;
  useEffect(() => {
    onDraft({ dirty, saving, save: () => saveRef.current() });
  }, [dirty, saving, onDraft]);
  return (
    <>
      <MobileProviderForm
        form={form}
        values={draft.values}
        errors={draft.errors}
        disabled={disabled || draft.saving}
        signal={draft.signal}
        onChange={draft.change}
      />
      {draft.error && (
        <TtsStatus tone="error" title="保存失败">
          {draft.error}
        </TtsStatus>
      )}
    </>
  );
}
