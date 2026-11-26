import { TranscriptionSettingsError } from "./transcription-settings-error";
import {
  transcriptionText,
  transcriptionValue,
  useTranscriptionI18n,
  transcriptionLanguageText,
  transcriptionErrorText,
} from "./i18n-transcription";
import { useEffect, useState } from "react";
import { Button, Dialog, DialogBody, Select, SettingRow, toast } from "@tau/ui";
import {
  downloadModel,
  getModels,
  onDownloadProgress,
  type ModelInfo,
} from "@/commands/model-downloader";
import useSettingStore from "@/stores/useSettingStore";
import { openLLMSettingsSection, checkLLMOptimizationConfig } from "@/utils/transcription";
import { useQwenHardware } from "./useQwenHardware";
import { TranscriptionFields } from "./TranscriptionFields";
import { TRANSCRIPTION_LANGUAGES } from "./transcription-language";
import {
  requiredModels,
  qwenAlignedLanguages,
  type LocalTranscriptionSelection,
} from "../../../shared/local-transcription";

interface Props {
  initialSelection: LocalTranscriptionSelection;
  language: string;
  onClose: () => void;
  onStart: (language: string, selection: LocalTranscriptionSelection) => void;
}
export function TranscriptionOptionsDialog({
  language,
  initialSelection,
  onClose,
  onStart,
}: Props) {
  useTranscriptionI18n();

  const [selection, setSelection] = useState(initialSelection);
  const [lang, setLanguage] = useState(language);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const hardware = useQwenHardware(selection.engine, models);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ message: string; percent: number } | null>(null);
  const [error, setError] = useState<string | { code: "modelsLoadFailed" }>("");
  const errorMessage =
    typeof error === "string" ? error : transcriptionText("error.modelsLoadFailed");
  const [reload, setReload] = useState(0);
  const llmReady = useSettingStore(s => checkLLMOptimizationConfig(s.setting).isConfigured);
  const source = useSettingStore(s => s.setting.transcription.downloadSource);
  useEffect(() => {
    let active = true;
    getModels()
      .then(result => {
        if (!active) return;
        if (result.success && result.data) setModels(result.data);
        else setError(result.error || { code: "modelsLoadFailed" });
      })
      .catch(e => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [reload]);
  const required = requiredModels(selection, models);
  const missing = required.filter(id => !models.some(m => m.name === id && m.downloaded));
  const known = required.every(id => models.some(m => m.name === id));
  const alignmentUnsupported =
    selection.engine === "qwen" &&
    selection.output === "subtitles" &&
    lang !== "auto" &&
    !qwenAlignedLanguages.has(lang);
  const canStart =
    !alignmentUnsupported &&
    known &&
    !missing.length &&
    !(selection.output === "subtitles" && selection.optimize && !llmReady);
  async function download() {
    setBusy(true);
    const unsubscribe = onDownloadProgress(event => {
      if (missing.includes(event.modelName))
        setProgress({ message: event.message ?? "", percent: event.percentage });
    });
    try {
      for (const id of missing) {
        const result = await downloadModel(id, source);
        if (!result.success)
          throw result.error ? new Error(result.error) : new TranscriptionSettingsError();
        setModels(prev => prev.map(m => (m.name === id ? { ...m, downloaded: true } : m)));
      }
    } catch (e) {
      toast.error(transcriptionErrorText(e));
    } finally {
      unsubscribe();
      setBusy(false);
      setProgress(null);
    }
  }
  return (
    <Dialog
      title={transcriptionText("ui.transcriptionOptionsForThisRun")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {transcriptionText("ui.cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={busy || !canStart}
            onClick={() => {
              onClose();
              onStart(lang, selection);
            }}
          >
            {transcriptionText("ui.startTranscription")}
          </Button>
        </>
      }
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogBody>
        <TranscriptionFields
          value={selection}
          models={models}
          hardware={hardware}
          onConfigureLLM={() => {
            onClose();
            openLLMSettingsSection();
          }}
          onChange={patch => setSelection(prev => ({ ...prev, ...patch }))}
        />
        <SettingRow
          title={transcriptionText("ui.recognitionLanguage")}
          description={
            alignmentUnsupported
              ? transcriptionText("ui.usePlainTextOrWhisperSubtitlesFor")
              : undefined
          }
        >
          <Select
            aria-label={transcriptionText("ui.recognitionLanguage")}
            value={lang}
            options={TRANSCRIPTION_LANGUAGES.map(option => ({
              ...option,
              label: transcriptionLanguageText(option.value, option.label),
            }))}
            onValueChange={setLanguage}
          />
        </SettingRow>
        {error && (
          <SettingRow title={errorMessage}>
            <Button
              size="sm"
              onClick={() => {
                setError("");
                setReload(n => n + 1);
              }}
            >
              {transcriptionText("ui.retry")}
            </Button>
          </SettingRow>
        )}
        {known && missing.length > 0 && (
          <SettingRow
            title={transcriptionText("ui.downloadRequired")}
            description={missing
              .map(id => models.find(m => m.name === id)?.label)
              .join(transcriptionText("format.listSeparator"))}
          >
            <Button
              size="sm"
              loading={busy}
              loadingText={
                progress
                  ? transcriptionText("download.progress", {
                      message: progress.message,
                      percent: transcriptionValue(progress.percent),
                    })
                  : transcriptionText("download.preparing")
              }
              onClick={() => void download()}
            >
              {transcriptionText("ui.downloadRequiredResources")}
            </Button>
          </SettingRow>
        )}
      </DialogBody>
    </Dialog>
  );
}
