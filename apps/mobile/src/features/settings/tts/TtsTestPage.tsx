import { ttsText, ttsErrorText, ttsValue, useTtsSettingsI18n } from "./i18n";
import { useEffect, useState } from "react";
import { AudioPlayer } from "@tau/shared";
import { ChevronRight, CircleAlert } from "lucide-react";
import { GroupCard, GroupNote, GroupRow } from "../components/ui";
import { ActionButton } from "../storage/fields";
import { useNavigator, usePageLifecycle } from "../../../router";
import { TtsPageShell } from "./components/TtsPageShell";
import { TtsChoiceSheet, TtsVoicePicker } from "./components/TtsSelectionSheets";
import { TtsEmpty, TtsProviderTile, TtsSection, TtsStatus } from "./components/TtsUi";
import { useTtsAudioTest } from "./hooks/useTtsAudioTest";
import { useTtsDomain } from "./hooks/useTtsDomain";
import { useTtsVoices } from "./hooks/useTtsVoices";
import { findTtsAccount, resolveTtsModel, resolveTtsVoice } from "./model";

const DEFAULT_TEXT =
  "你好，这是一段来自 Tau 移动端的语音合成测试。你可以修改文本，再选择音色试听。";

export function TtsTestPage({
  instanceId,
  modelId: requestedModelId,
  voiceId: requestedVoiceId,
}: {
  instanceId: string;
  modelId?: string;
  voiceId?: string;
}) {
  useTtsSettingsI18n();

  const navigator = useNavigator();
  const { runtime, setting, accounts, usage, providerFor } = useTtsDomain();
  const [accountId, setAccountId] = useState(instanceId);
  const initialAccount = findTtsAccount(setting, instanceId);
  const [modelId, setModelId] = useState(() =>
    resolveTtsModel(initialAccount, usage, requestedModelId)
  );
  const [voiceId, setVoiceId] = useState(() =>
    resolveTtsVoice(
      initialAccount,
      usage,
      resolveTtsModel(initialAccount, usage, requestedModelId),
      requestedVoiceId
    )
  );
  const [text, setText] = useState(DEFAULT_TEXT);
  const [sheet, setSheet] = useState<"account" | "model" | "voice" | null>(null);
  const account = findTtsAccount(setting, accountId);
  const provider = account ? providerFor(account.pluginId) : undefined;
  const modelAvailable = !!account?.models.some(model => model.id === modelId);
  const available = !!account && !!provider && !!modelId && modelAvailable;
  const voices = useTtsVoices(account, modelId, available);
  const test = useTtsAudioTest({ runtime, account, modelId, voiceId, enabled: available });
  const stopTest = test.stop;
  useEffect(() => {
    if (!account || account.models.some(model => model.id === modelId)) return;
    stopTest();
    setModelId(resolveTtsModel(account, usage));
    setVoiceId("");
    setSheet(null);
  }, [account, modelId, stopTest, usage]);
  usePageLifecycle({
    onResume: () => {
      if (available) void voices.refetch();
    },
  });

  const changeAccount = (id: string) => {
    const next = accounts.find(item => item.id === id);
    if (!next) return;
    const nextModel = resolveTtsModel(next, usage);
    setAccountId(id);
    setModelId(nextModel);
    setVoiceId("");
    setSheet(null);
  };
  const changeModel = (id: string) => {
    setModelId(id);
    setVoiceId("");
    setSheet(null);
  };
  const openPluginCenter = () => navigator.push("plugins", { tab: "installed" });
  const eligibleAccounts = accounts.filter(
    item => item.models.length > 0 && !!providerFor(item.pluginId)
  );

  if (!account) {
    return (
      <TtsPageShell title={ttsText("ui.testVoice")}>
        <TtsEmpty
          title={ttsText("ui.accountNotFound")}
          description={ttsText("ui.itMayHaveBeenDeletedReturnTo")}
        />
      </TtsPageShell>
    );
  }

  const selectedVoice = voices.data?.voices.find(voice => voice.id === voiceId);
  const footer = test.pending ? (
    <>
      <ActionButton label={ttsText("ui.cancelTest")} emphasis={false} onClick={test.cancel} />
      <ActionButton
        label={ttsText("ui.synthesizing")}
        emphasis
        busy
        disabled
        onClick={() => undefined}
      />
    </>
  ) : (
    <ActionButton
      label={test.generated ? ttsText("ui.generateAgain") : ttsText("ui.synthesizeAndPreview")}
      emphasis
      disabled={!available || !modelId || !voiceId.trim() || !text.trim()}
      onClick={() => void test.synthesize(text)}
    />
  );

  return (
    <TtsPageShell title={ttsText("ui.testVoice")} footer={footer}>
      <div className="page-enter">
        <GroupCard>
          <GroupRow>
            <TtsProviderTile name={account.name} />
            <span className="min-w-0 flex-1">
              <span className="text-ink-1 text-tau-body block truncate font-medium">
                {account.name}
              </span>
              <span className="text-ink-3 text-tau-sm block">
                {ttsText("ui.savedConfigurationCurrentServiceStaysUnchanged")}
              </span>
            </span>
            {test.generated && (
              <span className="text-tag-1 text-tau-sm font-medium">{ttsText("ui.succeeded")}</span>
            )}
          </GroupRow>
        </GroupCard>
        {!available && (
          <TtsStatus
            tone="warning"
            title={ttsText("ui.voicePluginOrModelUnavailable")}
            action={
              <button type="button" className="text-accent-text" onClick={openPluginCenter}>
                {ttsText("ui.checkInThePluginCenter")}
              </button>
            }
          >
            {ttsText("ui.savedConfigurationIsRetainedEnableThePlugin")}
          </TtsStatus>
        )}
        {test.pending && (
          <TtsStatus tone="pending" title={ttsText("ui.synthesizingSpeech")}>
            {ttsText("test.requesting", { name: provider?.definition.title ?? account.name })}
          </TtsStatus>
        )}
        {test.generated && test.audio && (
          <TtsStatus tone="success" title={ttsText("ui.synthesisCompleteReadyToPreview")}>
            {ttsText("ui.audioIsOnlyForTestingOnThis")}
          </TtsStatus>
        )}
        {test.error && (
          <TtsStatus
            tone="error"
            title={ttsText("ui.noAudioGenerated")}
            action={
              <button
                type="button"
                className="text-accent-text inline-flex items-center gap-1"
                onClick={() => navigator.push("ttsAccount", { instanceId: account.id })}
              >
                <CircleAlert size={14} aria-hidden="true" />
                {ttsText("ui.checkAccountConfiguration")}
              </button>
            }
          >
            {test.error}
          </TtsStatus>
        )}
        {test.audio && (
          <div className="py-3">
            <AudioPlayer
              ref={test.audioRef}
              src={test.audio.url}
              label={ttsText("ui.voiceTest")}
              info={ttsText("message.kb", {
                mime: ttsValue(test.audio.mime || ttsText("ui.audio")),
                size: ttsValue((test.audio.size / 1024).toFixed(1)),
              })}
              preload="none"
            />
          </div>
        )}
        <TtsSection label={ttsText("ui.serviceVoice")}>
          <GroupRow disabled={test.pending} onClick={() => setSheet("account")}>
            <span className="text-ink-1 text-tau-body flex-1">{ttsText("ui.account")}</span>
            <span className="text-ink-3 text-tau-meta max-w-[55%] truncate">{account.name}</span>
            <ChevronRight size={17} className="text-ink-3" aria-hidden="true" />
          </GroupRow>
          <GroupRow
            disabled={test.pending || !account.models.length}
            onClick={() => setSheet("model")}
          >
            <span className="text-ink-1 text-tau-body flex-1">{ttsText("ui.models")}</span>
            <span className="text-ink-3 text-tau-sm max-w-[55%] truncate font-mono">
              {modelId || ttsText("ui.notSet")}
            </span>
            <ChevronRight size={17} className="text-ink-3" aria-hidden="true" />
          </GroupRow>
          <GroupRow disabled={test.pending || !available} onClick={() => setSheet("voice")}>
            <span className="min-w-0 flex-1">
              <span className="text-ink-1 text-tau-body block">{ttsText("ui.voice")}</span>
              <span className="text-ink-3 text-tau-sm block">
                {ttsText("ui.enterAVoiceIDManuallyIfIt")}
              </span>
            </span>
            <span className="text-ink-3 text-tau-meta max-w-[45%] truncate">
              {selectedVoice?.name || voiceId || ttsText("ui.notSet")}
            </span>
            <ChevronRight size={17} className="text-ink-3" aria-hidden="true" />
          </GroupRow>
        </TtsSection>
        <section className="mt-4">
          <label htmlFor="tts-test-text" className="text-ink-2 text-tau-meta mb-2 block px-1">
            {ttsText("ui.testText")}
          </label>
          <textarea
            id="tts-test-text"
            value={text}
            onChange={event => setText(event.currentTarget.value)}
            maxLength={500}
            rows={6}
            disabled={test.pending}
            className="input-base bg-surface shadow-card w-full resize-none rounded-2xl p-4"
          />
          <div className="text-ink-3 text-tau-sm mt-1 text-right tabular-nums">
            {text.length} / 500
          </div>
        </section>
        {voices.data?.info.textInstructions && (
          <GroupNote>
            {ttsText("ui.providerTextHint")}
            {voices.data.info.textInstructions}
          </GroupNote>
        )}
        <GroupNote>{ttsText("ui.testingUsesTheLastSavedConfigurationAnd")}</GroupNote>
      </div>
      <TtsChoiceSheet
        open={sheet === "account"}
        title={ttsText("ui.chooseATestAccount")}
        choices={eligibleAccounts.map(item => ({
          id: item.id,
          label: item.name,
          description: providerFor(item.pluginId)?.definition.title,
        }))}
        selectedId={accountId}
        onSelect={changeAccount}
        onClose={() => setSheet(null)}
      />
      <TtsChoiceSheet
        open={sheet === "model"}
        title={ttsText("ui.chooseATestModel")}
        choices={account.models.map(model => ({
          id: model.id,
          label: model.label ?? model.id,
          description: model.label ? model.id : undefined,
        }))}
        selectedId={modelId}
        onSelect={changeModel}
        onClose={() => setSheet(null)}
      />
      <TtsVoicePicker
        open={sheet === "voice"}
        voices={voices.data?.voices}
        loading={voices.isFetching}
        error={voices.error ? ttsErrorText(voices.error, account.config) : undefined}
        selectedId={voiceId}
        onSelect={id => {
          setVoiceId(id);
          setSheet(null);
        }}
        onRefresh={() => void voices.refetch()}
        onClose={() => setSheet(null)}
      />
    </TtsPageShell>
  );
}
