import {
  ttsText,
  ttsErrorText,
  useTtsSettingsI18n,
  ttsIssue,
  ttsIssueText,
  type TtsIssue,
} from "../../settings/tts/i18n";
import { useEffect, useMemo, useState } from "react";
import { AudioPlayer } from "@tau/shared";
import { ChevronRight, CircleAlert, RefreshCw, Sparkles } from "lucide-react";
import { BottomSheet } from "../../../components/BottomSheet";
import { MobileConfirmDialog } from "../../../components/MobileConfirmDialog";
import { useNavigator } from "../../../router";
import { useSheetBackDismiss } from "../../../router/useSheetBackDismiss";
import { GroupCard, GroupRow } from "../../settings/components/ui";
import { ActionButton } from "../../settings/storage/fields";
import { TtsChoiceSheet, TtsVoicePicker } from "../../settings/tts/components/TtsSelectionSheets";
import { TtsEmpty } from "../../settings/tts/components/TtsUi";
import { useTtsAudioTest } from "../../settings/tts/hooks/useTtsAudioTest";
import { useTtsDomain } from "../../settings/tts/hooks/useTtsDomain";
import { useTtsVoices } from "../../settings/tts/hooks/useTtsVoices";
import { findTtsAccount, resolveTtsModel, resolveTtsVoice } from "../../settings/tts/model";
import {
  TTS_MAX_TEXT_LENGTH,
  TTS_SPEEDS,
  ttsIntentText,
  type TtsInsertTarget,
} from "./ttsInsertTarget";

type TtsGenerateSheetProps = {
  target: TtsInsertTarget | null;
  onClose: () => void;
  /** 写入文档成功（插入或替换）后回调，面板随即关闭 */
  onInserted: (kind: TtsInsertTarget["intent"]["kind"]) => void;
};

export function TtsGenerateSheet({ target, onClose, onInserted }: TtsGenerateSheetProps) {
  useTtsSettingsI18n();

  // 退场动画期间 target 已置空，沿用上一次的内容避免面板先变空再滑走
  const [shown, setShown] = useState(target);
  if (target && target !== shown) setShown(target);
  // 生成中或有未插入的结果时，遮罩与下拉不关闭，返回手势由面板内确认
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (!target) setLocked(false);
  }, [target]);
  return (
    <BottomSheet
      open={target !== null}
      title={
        shown?.intent.kind === "replace"
          ? ttsText("ui.generateAudioFromText")
          : ttsText("ui.textToSpeech")
      }
      onClose={onClose}
      dismissible={!locked}
    >
      {shown && (
        <TtsGenerateBody
          key={shown.id}
          target={shown}
          onClose={onClose}
          onInserted={onInserted}
          onLockedChange={setLocked}
        />
      )}
    </BottomSheet>
  );
}

function TtsGenerateBody({
  target,
  onClose,
  onInserted,
  onLockedChange,
}: {
  target: TtsInsertTarget;
  onClose: () => void;
  onInserted: TtsGenerateSheetProps["onInserted"];
  onLockedChange: (locked: boolean) => void;
}) {
  useTtsSettingsI18n();

  const navigator = useNavigator();
  const { runtime, setting, accounts, usage, providerFor } = useTtsDomain();
  const eligibleAccounts = useMemo(
    () => accounts.filter(item => item.models.length > 0 && !!providerFor(item.pluginId)),
    [accounts, providerFor]
  );
  const [accountId, setAccountId] = useState(() => {
    const preferred = usage?.providerId;
    return eligibleAccounts.some(item => item.id === preferred)
      ? (preferred ?? "")
      : (eligibleAccounts[0]?.id ?? "");
  });
  const account = findTtsAccount(setting, accountId);
  const [modelId, setModelId] = useState(() => resolveTtsModel(account, usage));
  const [voiceId, setVoiceId] = useState(() => resolveTtsVoice(account, usage, modelId));
  const [speed, setSpeed] = useState<number>(1);
  const [text, setText] = useState(() => ttsIntentText(target.intent));
  const [sheet, setSheet] = useState<"account" | "voice" | null>(null);
  const [generatedText, setGeneratedText] = useState("");
  const [inserting, setInserting] = useState(false);
  const [insertFailure, setInsertFailure] = useState<TtsIssue | null>(null);
  const insertError = ttsIssueText(insertFailure);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const available = !!account && !!providerFor(account.pluginId) && !!modelId;
  const voices = useTtsVoices(account, modelId, available);
  const audio = useTtsAudioTest({
    runtime,
    account,
    modelId,
    voiceId,
    enabled: available,
    speed,
    maxLength: TTS_MAX_TEXT_LENGTH,
  });

  // 首个账号在音色列表就绪后补默认音色：当前服务没指定音色时用列表第一个
  const firstVoiceId = voices.data?.voices[0]?.id;
  useEffect(() => {
    if (!voiceId && firstVoiceId) setVoiceId(firstVoiceId);
  }, [firstVoiceId, voiceId]);

  const cleanText = text.trim();
  const overLimit = cleanText.length > TTS_MAX_TEXT_LENGTH;
  // 改了文字后旧结果与文字对不上，不能插入
  const stale = !!audio.audio && generatedText !== cleanText;
  const hasResult = !!audio.audio && !stale;
  const busy = audio.pending || inserting;

  const requestClose = () => {
    if (busy) return;
    if (hasResult) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };
  const locked = hasResult || busy;
  useEffect(() => onLockedChange(locked), [locked, onLockedChange]);
  // 有未插入的结果时返回先确认；后注册先答，优先于 BottomSheet 自身的返回关闭
  useSheetBackDismiss(locked, requestClose);

  const generate = async () => {
    setInsertFailure(null);
    setGeneratedText(cleanText);
    await audio.synthesize(cleanText);
  };

  const insert = async () => {
    if (!audio.audio || !hasResult) return;
    setInserting(true);
    setInsertFailure(null);
    try {
      const ok = await target.commit({ blob: audio.audio.blob, text: cleanText });
      if (ok) {
        audio.stop();
        onInserted(target.intent.kind);
      }
    } catch (error) {
      setInsertFailure(ttsIssue(error, undefined, "error.audioSaveFailed"));
    } finally {
      setInserting(false);
    }
  };

  const openSettings = () => {
    onClose();
    navigator.push("settingsModule", { module: "voice" });
  };

  if (!eligibleAccounts.length || !account) {
    return (
      <TtsEmpty
        title={ttsText("ui.noVoiceServicesYet")}
        description={ttsText("ui.installATextToSpeechPluginAnd")}
        actions={
          <ActionButton
            label={ttsText("ui.openTextToSpeechSettings")}
            emphasis
            onClick={openSettings}
          />
        }
      />
    );
  }

  const selectedVoice = voices.data?.voices.find(voice => voice.id === voiceId);
  const error = insertError || audio.error;

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-surface border-line-1 rounded-2xl border">
        <label htmlFor="tts-generate-text" className="sr-only">
          {ttsText("ui.textToReadAloud")}
        </label>
        <textarea
          id="tts-generate-text"
          value={text}
          onChange={event => setText(event.currentTarget.value)}
          rows={5}
          disabled={busy}
          placeholder={ttsText("ui.enterTextToConvertToSpeech")}
          className="input-base bg-surface w-full resize-none rounded-2xl border-0 px-4 pt-3 pb-1 leading-relaxed focus:shadow-none"
        />
        <div
          className={`text-tau-sm px-4 pb-2 text-right tabular-nums ${overLimit ? "text-danger" : "text-ink-3"}`}
        >
          {text.length} / {TTS_MAX_TEXT_LENGTH} {ttsText("ui.characters")}
        </div>
      </div>

      <GroupCard>
        <GroupRow disabled={busy} onClick={() => setSheet("voice")}>
          <span className="text-ink-1 text-tau-body flex-1">{ttsText("ui.voice")}</span>
          <span className="text-ink-3 text-tau-meta max-w-[55%] truncate">
            {selectedVoice?.name ||
              voiceId ||
              (voices.isFetching ? ttsText("ui.fetching") : ttsText("ui.notSet"))}
          </span>
          <ChevronRight size={17} className="text-ink-3" aria-hidden="true" />
        </GroupRow>
        <GroupRow>
          <span className="text-ink-1 text-tau-body flex-1">{ttsText("ui.speed")}</span>
          <span className="flex gap-1" role="radiogroup" aria-label={ttsText("ui.speed")}>
            {TTS_SPEEDS.map(value => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={speed === value}
                disabled={busy}
                onClick={() => setSpeed(value)}
                className={`text-tau-sm h-7 min-w-[42px] rounded-lg px-2 tabular-nums ${
                  speed === value
                    ? "bg-accent-soft text-accent-text font-semibold"
                    : "bg-hover text-ink-2"
                }`}
              >
                {value === 1 ? "1.0" : value}
              </button>
            ))}
          </span>
        </GroupRow>
        {eligibleAccounts.length > 1 && (
          <GroupRow disabled={busy} onClick={() => setSheet("account")}>
            <span className="text-ink-1 text-tau-body flex-1">{ttsText("ui.voiceService")}</span>
            <span className="text-ink-3 text-tau-meta max-w-[55%] truncate">{account.name}</span>
            <ChevronRight size={17} className="text-ink-3" aria-hidden="true" />
          </GroupRow>
        )}
      </GroupCard>

      {audio.audio && (
        <div className={stale ? "opacity-50" : undefined}>
          <AudioPlayer
            ref={audio.audioRef}
            src={audio.audio.url}
            label={ttsText("ui.preview")}
            info={
              stale
                ? ttsText("ui.textChangedGenerateTheAudioAgain")
                : `${selectedVoice?.name ?? voiceId}`
            }
            autoPlay={!stale}
            preload="auto"
          />
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="bg-danger-soft text-danger text-tau-meta flex gap-2 rounded-xl px-3 py-2.5 leading-relaxed"
        >
          <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <p className="text-ink-3 text-tau-sm px-1">{ttsText("ui.voiceAndSpeedDefaultToTextTo")}</p>

      <div className="flex gap-2.5 pt-1">
        {audio.pending ? (
          <>
            <ActionButton label={ttsText("ui.stop")} emphasis={false} onClick={audio.cancel} />
            <ActionButton
              label={ttsText("ui.generating")}
              emphasis
              busy
              disabled
              onClick={() => undefined}
            />
          </>
        ) : hasResult ? (
          <>
            <ActionButton
              label={ttsText("ui.generateAgain")}
              emphasis={false}
              disabled={inserting}
              onClick={() => void generate()}
            />
            <ActionButton
              label={
                target.intent.kind === "replace"
                  ? ttsText("ui.replaceAudio")
                  : ttsText("ui.insertIntoDocument")
              }
              emphasis
              busy={inserting}
              disabled={inserting}
              onClick={() => void insert()}
            />
          </>
        ) : (
          <button
            type="button"
            disabled={!cleanText || overLimit || !voiceId.trim() || !available}
            onClick={() => void generate()}
            className="bg-accent text-ink-inverse shadow-lift text-tau-body flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] font-semibold transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {audio.audio ? (
              <RefreshCw size={17} aria-hidden="true" />
            ) : (
              <Sparkles size={17} aria-hidden="true" />
            )}
            {audio.audio ? ttsText("ui.generateAgain") : ttsText("ui.generateAndPreview")}
          </button>
        )}
      </div>

      <TtsChoiceSheet
        open={sheet === "account"}
        title={ttsText("ui.chooseVoiceService")}
        choices={eligibleAccounts.map(item => ({
          id: item.id,
          label: item.name,
          description: providerFor(item.pluginId)?.definition.title,
        }))}
        selectedId={accountId}
        onSelect={id => {
          const next = eligibleAccounts.find(item => item.id === id);
          setSheet(null);
          if (!next || id === accountId) return;
          const nextModel = resolveTtsModel(next, usage);
          setAccountId(id);
          setModelId(nextModel);
          setVoiceId(resolveTtsVoice(next, usage, nextModel));
        }}
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
      <MobileConfirmDialog
        open={confirmDiscard}
        title={ttsText("ui.discardGeneratedAudio")}
        description={ttsText("ui.itHasNotBeenInsertedIntoThe")}
        cancelText={ttsText("ui.keepEditing")}
        confirmText={ttsText("ui.discard")}
        danger
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          audio.stop();
          onClose();
        }}
      />
    </div>
  );
}
