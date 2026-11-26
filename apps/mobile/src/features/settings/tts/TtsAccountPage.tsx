import {
  ttsText,
  ttsValue,
  useTtsSettingsI18n,
  ttsIssue,
  ttsIssueText,
  type TtsIssue,
} from "./i18n";
import { TtsSettingsError } from "./tts-settings-error";
import { useCallback, useEffect, useMemo, useState } from "react";
import { copyJson } from "@tau/plugins/host";
import { ErrorBoundary } from "@tau/ui";
import { ChevronRight, Mic, Trash2 } from "lucide-react";
import { MobileConfirmDialog } from "../../../components/MobileConfirmDialog";
import { PageHeaderTextButton } from "../../../components/PageHeader";
import { useNavigator } from "../../../router";
import {
  deleteTtsAccount,
  renameTtsAccount,
  saveTtsConfig,
  selectTtsUsage,
} from "../../../services/tts-settings";
import { GroupNote, GroupRow } from "../components/ui";
import { ActionButton } from "../storage/fields";
import { TtsAccountForm, type TtsAccountDraft } from "./components/TtsAccountForm";
import { TtsPageShell } from "./components/TtsPageShell";
import { TtsCurrentBadge, TtsEmpty, TtsSection, TtsStatus } from "./components/TtsUi";
import { useTtsDomain } from "./hooks/useTtsDomain";
import { findTtsAccount, resolveTtsModel, resolveTtsVoice, selectionForAccount } from "./model";

export function TtsAccountPage({ instanceId }: { instanceId: string }) {
  useTtsSettingsI18n();

  const navigator = useNavigator();
  const { runtime, setting, usage, database, providerFor, applySnapshot, isPageActive } =
    useTtsDomain();
  const account = findTtsAccount(setting, instanceId);
  const provider = account ? providerFor(account.pluginId) : undefined;
  const available = !!account && !!provider && !!runtime?.active(provider.context);
  const [name, setName] = useState(account?.name ?? "");
  const [busy, setBusy] = useState<"name" | "current" | "delete" | null>(null);
  const [failure, setFailure] = useState<TtsIssue | null>(null);
  const error = ttsIssueText(failure);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [draft, setDraft] = useState<TtsAccountDraft | null>(null);
  const onDraft = useCallback((next: TtsAccountDraft) => setDraft(next), []);
  const accountConfig = account?.config;
  const config = useMemo(() => (accountConfig ? copyJson(accountConfig) : {}), [accountConfig]);
  const modelId = resolveTtsModel(account, usage);
  const isCurrent = usage?.providerId === instanceId;
  const accountName = account?.name;
  useEffect(() => {
    if (accountName) setName(accountName);
  }, [accountName]);

  const saveName = async () => {
    const nextName = name.trim();
    if (!account || !nextName || nextName === account.name || busy) return;
    setBusy("name");
    setFailure(null);
    try {
      await applySnapshot(() => renameTtsAccount(database, account.id, nextName));
    } catch (issue) {
      setFailure(ttsIssue(issue, account.config, "error.nameSaveFailed"));
    } finally {
      setBusy(null);
    }
  };

  const activate = async () => {
    if (!account || !available || !modelId || isCurrent || busy) return;
    setBusy("current");
    setFailure(null);
    try {
      await applySnapshot(() =>
        selectTtsUsage(database, selectionForAccount(account, usage, modelId))
      );
    } catch (issue) {
      setFailure(ttsIssue(issue, account.config, "error.currentSetFailed"));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!account || busy) return;
    setBusy("delete");
    setFailure(null);
    try {
      const saved = await applySnapshot(() => deleteTtsAccount(database, account.id));
      if (!saved || !isPageActive()) return;
      setDeleteOpen(false);
      navigator.pop();
    } catch (issue) {
      setFailure(ttsIssue(issue, account.config, "error.accountDeleteFailed"));
      setDeleteOpen(false);
    } finally {
      setBusy(null);
    }
  };

  if (!account) {
    return (
      <TtsPageShell title={ttsText("ui.voiceAccounts")}>
        <TtsEmpty
          title={ttsText("ui.accountNotFound")}
          description={ttsText("ui.itMayHaveBeenDeletedReturnTo2")}
        />
      </TtsPageShell>
    );
  }

  const Component = provider?.definition.component;
  const form = provider?.definition.form;
  const saveConfig = async (
    nextConfig: import("@tau/plugins").JsonValue,
    models: readonly { id: string; label?: string }[]
  ) => {
    if (!provider || !runtime?.active(provider.context))
      throw new TtsSettingsError("PLUGIN_SETTINGS_EXPIRED");
    await applySnapshot(() =>
      saveTtsConfig(
        database,
        account.id,
        account.pluginId,
        copyJson(nextConfig),
        models.map(model => ({ ...model }))
      )
    );
  };
  return (
    <TtsPageShell
      title={account.name}
      actions={
        available && form && draft ? (
          <PageHeaderTextButton
            disabled={!draft.dirty || draft.saving || !!busy}
            onClick={() => void draft.save()}
          >
            {draft.saving ? ttsText("ui.saving") : ttsText("ui.save")}
          </PageHeaderTextButton>
        ) : undefined
      }
      footer={
        <>
          <ActionButton
            label={ttsText("ui.testThisService")}
            emphasis={false}
            disabled={!available || !modelId || !!busy}
            onClick={() =>
              navigator.push("ttsTest", {
                instanceId: account.id,
                modelId,
                ...(resolveTtsVoice(account, usage, modelId)
                  ? { voiceId: resolveTtsVoice(account, usage, modelId) }
                  : {}),
              })
            }
          />
          <ActionButton
            label={
              isCurrent ? ttsText("ui.currentVoiceService") : ttsText("ui.setAsCurrentVoiceService")
            }
            emphasis
            busy={busy === "current"}
            disabled={!available || !modelId || isCurrent || !!busy}
            onClick={() => void activate()}
          />
        </>
      }
    >
      <div className="page-enter">
        {!available && (
          <TtsStatus
            tone="warning"
            title={ttsText("ui.voicePluginUnavailable")}
            action={
              <button
                type="button"
                className="text-accent-text"
                onClick={() => navigator.push("plugins", { tab: "installed" })}
              >
                {ttsText("ui.enableInPluginCenter")}
              </button>
            }
          >
            {ttsText("ui.savedAccountsModelsAndTheCurrentSelection2")}
          </TtsStatus>
        )}
        <TtsSection label={ttsText("ui.displayName")}>
          <div className="p-3.5">
            <label htmlFor="tts-account-name" className="sr-only">
              {ttsText("ui.displayName")}
            </label>
            <div className="flex gap-2">
              <input
                id="tts-account-name"
                className="input-base min-w-0 flex-1 rounded-xl px-3"
                value={name}
                maxLength={80}
                disabled={busy === "delete"}
                onChange={event => setName(event.currentTarget.value)}
              />
              <button
                type="button"
                className="bg-accent-soft text-accent-text text-tau-meta min-h-11 shrink-0 rounded-xl px-3 font-semibold disabled:opacity-50"
                disabled={!name.trim() || name.trim() === account.name || !!busy}
                onClick={() => void saveName()}
              >
                {busy === "name" ? ttsText("ui.saving") : ttsText("ui.saveName")}
              </button>
            </div>
          </div>
        </TtsSection>
        {available && form ? (
          <TtsAccountForm
            key={account.id}
            form={form}
            stored={config}
            disabled={!!busy}
            onDraft={onDraft}
            persist={nextConfig =>
              saveConfig(
                nextConfig,
                account.models.length ? account.models : (provider.definition.models ?? [])
              )
            }
          />
        ) : available && Component ? (
          <ErrorBoundary key={account.id}>
            <Component
              context={provider.context}
              ttsConfig={{
                instanceId: account.id,
                value: config,
                models: account.models,
                save: saveConfig,
              }}
            />
          </ErrorBoundary>
        ) : (
          <GroupNote>{ttsText("ui.credentialsAreManagedByThePluginIts")}</GroupNote>
        )}
        {error && (
          <TtsStatus tone="error" title={ttsText("ui.operationFailed")}>
            {error}
          </TtsStatus>
        )}
        <TtsSection label={ttsText("message.models", { count: ttsValue(account.models.length) })}>
          {account.models.slice(0, 3).map(model => (
            <GroupRow key={model.id}>
              <span className="min-w-0 flex-1">
                <span className="text-ink-1 text-tau-sm block truncate font-mono">{model.id}</span>
                {model.label && <span className="text-ink-3 text-tau-sm block">{model.label}</span>}
              </span>
              {isCurrent && usage?.modelId === model.id && <TtsCurrentBadge />}
            </GroupRow>
          ))}
          {!account.models.length && (
            <GroupRow>
              <span className="text-ink-3">{ttsText("ui.noSavedModels")}</span>
            </GroupRow>
          )}
          <GroupRow onClick={() => navigator.push("ttsModels", { instanceId: account.id })}>
            <span className="text-accent-text text-tau-body flex-1 font-medium">
              {ttsText("ui.manageModels")}
            </span>
            <ChevronRight size={17} className="text-ink-3" aria-hidden="true" />
          </GroupRow>
        </TtsSection>
        <TtsSection label={ttsText("ui.more")}>
          <GroupRow
            disabled={!available || !modelId}
            onClick={() => navigator.push("ttsClone", { instanceId: account.id, modelId })}
          >
            <Mic size={18} className="text-tag-1" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="text-ink-1 text-tau-body block font-medium">
                {ttsText("ui.voiceCloning")}
              </span>
              <span className="text-ink-3 text-tau-sm block">
                {ttsText("ui.createAVoiceFromReferenceAudio")}
              </span>
            </span>
            <ChevronRight size={17} className="text-ink-3" aria-hidden="true" />
          </GroupRow>
          <GroupRow disabled={!!busy} onClick={() => setDeleteOpen(true)}>
            <Trash2 size={18} className="text-danger" aria-hidden="true" />
            <span className="text-danger text-tau-body flex-1 font-medium">
              {ttsText("ui.deleteThisAccount")}
            </span>
          </GroupRow>
        </TtsSection>
      </div>
      <MobileConfirmDialog
        open={deleteOpen}
        title={ttsText("message.delete", { name: ttsValue(account.name) })}
        description={ttsText("ui.deleteThisAccountAndItsModelConfiguration")}
        confirmText={ttsText("ui.delete")}
        danger
        loading={busy === "delete"}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void remove()}
      />
    </TtsPageShell>
  );
}
