/**
 * 语音合成试听：用已保存的账号配置真实合成一段文本并页内播放。
 * 账号 / 模型 / 音色默认跟随「当前服务」，在这里改动只作用于本次试听，不写回设置。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import clsx from "clsx";
import { AudioPlayer } from "@tau/shared";
import { SettingRow, Button, IconButton, Select, Textarea } from "@tau/ui";
import type { TTSProviderSetting } from "@/types/tts";
import { TTSProviderFactory } from "@/utils/tts";
import { SettingsGroup } from "../components/SettingsGroup";

const DEFAULT_TEXT = "你好，这是一段语音合成试听。可以修改文本，再选择音色重新生成。";
const MAX_TEXT_LENGTH = 500;

type Usage = { providerId: string; modelId: string; voiceId: string } | null;
type Draft = { providerId?: string; modelId?: string; voiceId?: string };
type PreviewAudio = { url: string; mime: string; size: number; text: string };

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

export function TTSPreviewSection({
  providers,
  usage,
  isAvailable,
}: {
  providers: TTSProviderSetting[];
  usage: Usage;
  isAvailable: (pluginId: string) => boolean;
}) {
  const eligible = providers.filter(item => item.models.length > 0 && isAvailable(item.pluginId));
  const [draft, setDraft] = useState<Draft>({});
  const provider =
    eligible.find(item => item.id === (draft.providerId ?? usage?.providerId)) ?? eligible[0];
  const followsUsage = !!provider && provider.id === usage?.providerId;
  const modelId =
    [draft.modelId, followsUsage ? usage?.modelId : undefined].find(
      id => !!id && provider?.models.some(model => model.id === id)
    ) ??
    provider?.models[0]?.id ??
    "";
  const voiceId =
    draft.voiceId ?? (followsUsage && usage?.modelId === modelId ? usage.voiceId : "");
  const [text, setText] = useState(DEFAULT_TEXT);

  const voices = useQuery({
    queryKey: ["tts-preview", "voices", provider?.id ?? "", modelId],
    enabled: !!provider && !!modelId,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const synthesis =
        provider && TTSProviderFactory.createFromSetting(provider, modelId)?.synthesis;
      if (!synthesis) throw new Error("语音服务不可用");
      try {
        return await synthesis.getVoiceList();
      } finally {
        await synthesis.dispose?.();
      }
    },
  });

  const [audio, setAudio] = useState<PreviewAudio | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);
  const releaseAudio = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setAudio(null);
  }, []);
  const cancel = useCallback(() => {
    controllerRef.current?.abort(new DOMException("试听已取消", "AbortError"));
    controllerRef.current = null;
    setPending(false);
  }, []);

  // 换账号 / 模型 / 音色后旧音频不再对应当前选择
  const selectionKey = `${provider?.id ?? ""}:${modelId}:${voiceId}`;
  useEffect(() => {
    cancel();
    releaseAudio();
    setError("");
  }, [selectionKey, cancel, releaseAudio]);
  useEffect(
    () => () => {
      controllerRef.current?.abort(new DOMException("试听已结束", "AbortError"));
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  const synthesize = async () => {
    const content = text.trim();
    const voice = voiceId.trim();
    if (!provider || !modelId || !voice || !content) return;
    cancel();
    releaseAudio();
    setError("");
    setPending(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    const synthesis = TTSProviderFactory.createFromSetting(provider, modelId)?.synthesis;
    try {
      if (!synthesis) throw new Error("语音服务不可用");
      const result = await synthesis.synthesizeSpeech(content, voice, undefined, controller.signal);
      if (controller.signal.aborted) return;
      if (!result.audio.byteLength) throw new Error("服务商没有返回音频数据");
      const blob = new Blob([new Uint8Array(result.audio)], { type: result.mime || "audio/mpeg" });
      urlRef.current = URL.createObjectURL(blob);
      setAudio({ url: urlRef.current, mime: blob.type, size: blob.size, text: content });
    } catch (issue) {
      if (!controller.signal.aborted && !isAbort(issue)) setError(errorText(issue));
    } finally {
      void synthesis?.dispose?.().catch(() => undefined);
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setPending(false);
      }
    }
  };

  return (
    <SettingsGroup
      title="试听"
      description="使用已保存的配置真实合成并产生用量；这里的选择不会改动当前服务"
    >
      {!provider ? (
        <div className="text-tau-meta text-ink-2 px-3 py-6 text-center">
          暂无可试听的账号——添加模型并确认对应语音插件已启用
        </div>
      ) : (
        <>
          <SettingRow title="账号">
            <Select
              aria-label="试听账号"
              className="w-[240px]"
              value={provider.id}
              disabled={pending}
              options={eligible.map(item => ({ value: item.id, label: item.name || "未命名" }))}
              onValueChange={id => setDraft({ providerId: id })}
            />
          </SettingRow>
          <SettingRow title="模型">
            <Select
              aria-label="试听模型"
              className="w-[280px]"
              value={modelId}
              disabled={pending}
              options={provider.models.map(model => ({
                value: model.id,
                label: model.label ?? model.id,
              }))}
              onValueChange={id => setDraft({ providerId: provider.id, modelId: id })}
            />
          </SettingRow>
          <SettingRow
            title="音色"
            description={voices.error ? `获取音色失败：${errorText(voices.error)}` : undefined}
          >
            <Select
              aria-label="试听音色"
              className="w-[280px]"
              searchable
              creatable
              placeholder="选择或输入音色 ID"
              emptyText="暂无音色——可直接输入音色 ID"
              value={voiceId || null}
              disabled={pending}
              options={(voices.data ?? []).map(voice => ({
                value: voice.id,
                label: `${voice.name}${voice.description ? ` · ${voice.description}` : ""}`,
              }))}
              onValueChange={id => setDraft({ providerId: provider.id, modelId, voiceId: id })}
            />
            <IconButton
              aria-label="刷新试听音色列表"
              disabled={voices.isFetching}
              onClick={() => void voices.refetch()}
            >
              <RefreshCw
                size={15}
                strokeWidth={1.75}
                className={clsx(voices.isFetching && "animate-spin")}
              />
            </IconButton>
          </SettingRow>
          <div className="space-y-3 px-3 py-3">
            <Textarea
              aria-label="试听文本"
              value={text}
              rows={3}
              maxLength={MAX_TEXT_LENGTH}
              disabled={pending}
              onChange={event => setText(event.target.value)}
            />
            <div className="flex items-center justify-end gap-2">
              {error && (
                <p role="alert" className="text-tau-meta text-danger min-w-0 flex-1">
                  {error}
                </p>
              )}
              {pending && (
                <Button variant="ghost" onClick={cancel}>
                  取消
                </Button>
              )}
              <Button
                loading={pending}
                disabled={!voiceId.trim() || !text.trim()}
                onClick={() => void synthesize()}
              >
                {audio ? "重新生成" : "合成并试听"}
              </Button>
            </div>
            {audio && (
              <AudioPlayer
                src={audio.url}
                label="试听"
                info={`${audio.mime || "音频"} · ${(audio.size / 1024).toFixed(1)} KB`}
                sourceText={audio.text}
              />
            )}
          </div>
        </>
      )}
    </SettingsGroup>
  );
}
