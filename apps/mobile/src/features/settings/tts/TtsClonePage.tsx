import { ttsText, ttsErrorText, useTtsSettingsI18n } from "./i18n";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FileAudio, Mic, RefreshCw, X } from "lucide-react";
import { GroupCard, GroupNote, GroupRow } from "../components/ui";
import { ActionButton } from "../storage/fields";
import { useNavigator, usePageLifecycle } from "../../../router";
import { TtsPageShell } from "./components/TtsPageShell";
import { TtsChoiceSheet } from "./components/TtsSelectionSheets";
import { TtsEmpty, TtsProviderTile, TtsSection, TtsStatus } from "./components/TtsUi";
import { useTtsClone } from "./hooks/useTtsClone";
import { useTtsDomain } from "./hooks/useTtsDomain";
import { useTtsSessionInfo } from "./hooks/useTtsVoices";
import { findTtsAccount, resolveTtsModel } from "./model";

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function TtsClonePage({
  instanceId,
  modelId: requestedModelId,
}: {
  instanceId: string;
  modelId?: string;
}) {
  useTtsSettingsI18n();

  const navigator = useNavigator();
  const queryClient = useQueryClient();
  const { runtime, setting, usage, providerFor } = useTtsDomain();
  const account = findTtsAccount(setting, instanceId);
  const [modelId, setModelId] = useState(() => resolveTtsModel(account, usage, requestedModelId));
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [modelSheet, setModelSheet] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const provider = account ? providerFor(account.pluginId) : undefined;
  const available = !!account && !!provider && !!modelId;
  const info = useTtsSessionInfo(account, modelId, available);
  const canClone = available && info.data?.canClone === true;
  const clone = useTtsClone({ runtime, account, modelId, enabled: canClone });
  usePageLifecycle({
    onResume: () => {
      if (available) void info.refetch();
    },
  });

  if (!account) {
    return (
      <TtsPageShell title={ttsText("ui.voiceCloning")}>
        <TtsEmpty
          title={ttsText("ui.accountNotFound")}
          description={ttsText("ui.itMayHaveBeenDeletedReturnTo2")}
        />
      </TtsPageShell>
    );
  }

  const openUploadSettings = () => navigator.push("settingsModule", { module: "resource" });
  const selectFile = (next: File | null) => {
    clone.reset();
    setFile(next);
    if (next && !name.trim()) setName(next.name.replace(/\.[^.]+$/, ""));
  };
  const testResult = () => {
    if (!clone.result) return;
    void queryClient.invalidateQueries({
      queryKey: ["tts", "voices", runtime?.workspaceId ?? "", account.id, modelId],
    });
    navigator.push("ttsTest", {
      instanceId: account.id,
      modelId,
      voiceId: clone.result.id,
    });
  };

  const footer = clone.pending ? (
    <>
      <ActionButton label={ttsText("ui.cancelCloning")} emphasis={false} onClick={clone.cancel} />
      <ActionButton
        label={ttsText("ui.cloning")}
        emphasis
        busy
        disabled
        onClick={() => undefined}
      />
    </>
  ) : clone.result ? (
    <ActionButton
      label={ttsText("ui.completed")}
      emphasis={false}
      onClick={() => void navigator.goBack("ui")}
    />
  ) : canClone ? (
    <>
      <ActionButton
        label={ttsText("ui.cancel")}
        emphasis={false}
        onClick={() => void navigator.goBack("ui")}
      />
      <ActionButton
        label={clone.error ? ttsText("ui.retryCloning") : ttsText("ui.startCloning")}
        emphasis
        disabled={!file || !name.trim()}
        onClick={() => file && void clone.clone(file, name)}
      />
    </>
  ) : undefined;

  return (
    <TtsPageShell title={ttsText("ui.voiceCloning")} footer={footer}>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        aria-label={ttsText("ui.chooseReferenceAudioFile")}
        accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a"
        disabled={!canClone || clone.pending}
        onChange={event => selectFile(event.currentTarget.files?.[0] ?? null)}
      />
      <div className="page-enter">
        <GroupCard>
          <GroupRow>
            <TtsProviderTile name={account.name} />
            <span className="min-w-0 flex-1">
              <span className="text-ink-1 text-tau-body block truncate font-medium">
                {account.name}
              </span>
              <span className="text-ink-3 text-tau-sm block truncate font-mono">
                {modelId || ttsText("ui.noModelSelected")} {ttsText("ui.usingSavedConfiguration")}
              </span>
            </span>
          </GroupRow>
        </GroupCard>
        <TtsSection label={ttsText("ui.cloningModel")}>
          <GroupRow
            disabled={clone.pending || !account.models.length}
            onClick={() => setModelSheet(true)}
          >
            <span className="text-ink-1 text-tau-body flex-1">{ttsText("ui.models")}</span>
            <span className="text-ink-3 text-tau-sm max-w-[60%] truncate font-mono">
              {modelId || ttsText("ui.notSet")}
            </span>
            <ChevronRight size={17} className="text-ink-3" aria-hidden="true" />
          </GroupRow>
        </TtsSection>
        {!available && (
          <TtsStatus
            tone="warning"
            title={ttsText("ui.voicePluginOrModelUnavailable")}
            action={
              <button
                type="button"
                className="text-accent-text"
                onClick={() => navigator.push("plugins", { tab: "installed" })}
              >
                {ttsText("ui.checkInThePluginCenter")}
              </button>
            }
          >
            {ttsText("ui.savedConfigurationIsRetainedEnableThePlugin2")}
          </TtsStatus>
        )}
        {available && info.isPending && (
          <TtsStatus tone="pending" title={ttsText("ui.checkingCloningSupport")} />
        )}
        {info.error && (
          <TtsStatus tone="error" title={ttsText("ui.couldNotCheckCloningSupport")}>
            {ttsErrorText(info.error, account.config)}
          </TtsStatus>
        )}
        {available && info.data && !info.data.canClone && (
          <GroupCard>
            <TtsEmpty
              title={ttsText("ui.thisModelDoesNotSupportVoiceCloning")}
              description={ttsText("ui.chooseAnotherModelOrAServiceThat")}
            />
          </GroupCard>
        )}
        {canClone && (
          <>
            {setting?.imageBed.active !== "plugin" && (
              <TtsStatus
                tone="warning"
                title={ttsText("ui.someProvidersRequireAPublicURL")}
                action={
                  <button type="button" className="text-accent-text" onClick={openUploadSettings}>
                    {ttsText("ui.openUploadSettings")}
                  </button>
                }
              >
                {ttsText("ui.imagesAndAttachmentsAreCurrentlyStoredLocally")}
              </TtsStatus>
            )}
            {clone.pending && (
              <TtsStatus tone="pending" title={ttsText("ui.creatingClonedVoice")}>
                {ttsText("ui.thePluginIsProcessingTheReferenceAudio")}
              </TtsStatus>
            )}
            {clone.error && (
              <TtsStatus
                tone="error"
                title={ttsText("ui.cloningFailed")}
                action={
                  <button
                    type="button"
                    className="text-accent-text"
                    onClick={() => navigator.push("ttsAccount", { instanceId: account.id })}
                  >
                    {ttsText("ui.checkAccountConfiguration")}
                  </button>
                }
              >
                {clone.error}
              </TtsStatus>
            )}
            {clone.result && (
              <>
                <TtsStatus tone="success" title={ttsText("ui.clonedVoiceCreated")}>
                  {ttsText("ui.theProviderReturnedAVoiceIdentityRefresh")}
                </TtsStatus>
                <TtsSection label={ttsText("ui.newVoice")}>
                  <GroupRow>
                    <Mic size={18} className="text-tag-1" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="text-ink-1 text-tau-body block font-medium">
                        {clone.result.name}
                      </span>
                      <span className="text-ink-3 text-tau-sm block font-mono break-all">
                        {clone.result.id}
                      </span>
                      {clone.result.description && (
                        <span className="text-ink-3 text-tau-sm block">
                          {clone.result.description}
                        </span>
                      )}
                    </span>
                  </GroupRow>
                  <GroupRow onClick={testResult}>
                    <RefreshCw size={17} className="text-accent-text" aria-hidden="true" />
                    <span className="text-accent-text text-tau-body flex-1 font-medium">
                      {ttsText("ui.refreshVoicesAndTest")}
                    </span>
                  </GroupRow>
                </TtsSection>
              </>
            )}
            {!clone.result && (
              <>
                <section className="mt-4">
                  <h2 className="text-ink-2 text-tau-meta mb-2 px-1">
                    {ttsText("ui.referenceAudio")}
                  </h2>
                  <button
                    type="button"
                    disabled={clone.pending}
                    className="bg-surface text-ink-1 flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl px-4 py-5 disabled:opacity-50"
                    onClick={() => inputRef.current?.click()}
                  >
                    <FileAudio size={28} className="text-accent-text" aria-hidden="true" />
                    <span className="text-tau-body font-medium">
                      {ttsText("ui.chooseReferenceAudio")}
                    </span>
                    <span className="text-ink-3 text-tau-sm">
                      {ttsText("ui.mp3WAVM4ASizeAndFormatAre")}
                    </span>
                  </button>
                  {file && (
                    <div className="bg-surface mt-2 flex items-center gap-3 rounded-2xl px-4 py-3">
                      <FileAudio size={18} className="text-tag-1 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="text-ink-1 text-tau-body block truncate">{file.name}</span>
                        <span className="text-ink-3 text-tau-sm block">
                          {formatFileSize(file.size)}
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label={ttsText("ui.removeReferenceAudio")}
                        disabled={clone.pending}
                        className="text-ink-3 grid h-10 w-10 place-items-center"
                        onClick={() => selectFile(null)}
                      >
                        <X size={17} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </section>
                <section className="mt-4">
                  <label
                    htmlFor="tts-clone-name"
                    className="text-ink-2 text-tau-meta mb-2 block px-1"
                  >
                    {ttsText("ui.voiceName")}
                  </label>
                  <input
                    id="tts-clone-name"
                    value={name}
                    onChange={event => setName(event.currentTarget.value)}
                    disabled={clone.pending}
                    className="input-base bg-surface shadow-card w-full rounded-xl px-3"
                    placeholder={ttsText("ui.nameTheNewVoice")}
                    maxLength={100}
                  />
                  <GroupNote>{ttsText("ui.thePluginDeterminesTheActualVoiceID")}</GroupNote>
                </section>
              </>
            )}
          </>
        )}
      </div>
      <TtsChoiceSheet
        open={modelSheet}
        title={ttsText("ui.chooseACloningModel")}
        choices={account.models.map(model => ({
          id: model.id,
          label: model.label ?? model.id,
          description: model.label ? model.id : undefined,
        }))}
        selectedId={modelId}
        onSelect={id => {
          setModelId(id);
          setModelSheet(false);
        }}
        onClose={() => setModelSheet(false)}
      />
    </TtsPageShell>
  );
}
