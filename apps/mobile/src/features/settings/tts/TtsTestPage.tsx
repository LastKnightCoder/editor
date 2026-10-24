import { useEffect, useState } from "react";
import { AudioPlayer } from "@tau/shared";
import { ChevronRight, CircleAlert } from "lucide-react";
import { GroupCard, GroupNote, GroupRow } from "../components/ui";
import { ActionButton } from "../storage/fields";
import { useNavigator, usePageLifecycle } from "../../../router";
import { TtsPageShell } from "./components/TtsPageShell";
import { TtsChoiceSheet, TtsVoicePicker } from "./components/TtsSelectionSheets";
import { TtsEmpty, TtsProviderTile, TtsSection, TtsStatus } from "./components/TtsUi";
import { ttsErrorMessage } from "./errors";
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
      <TtsPageShell title="测试语音">
        <TtsEmpty title="账号不存在" description="它可能已被删除，请返回语音设置选择其他账号。" />
      </TtsPageShell>
    );
  }

  const selectedVoice = voices.data?.voices.find(voice => voice.id === voiceId);
  const footer = test.pending ? (
    <>
      <ActionButton label="取消测试" emphasis={false} onClick={test.cancel} />
      <ActionButton label="合成中" emphasis busy disabled onClick={() => undefined} />
    </>
  ) : (
    <ActionButton
      label={test.generated ? "重新生成" : "合成并试听"}
      emphasis
      disabled={!available || !modelId || !voiceId.trim() || !text.trim()}
      onClick={() => void test.synthesize(text)}
    />
  );

  return (
    <TtsPageShell title="测试语音" footer={footer}>
      <div className="page-enter">
        <GroupCard>
          <GroupRow>
            <TtsProviderTile name={account.name} />
            <span className="min-w-0 flex-1">
              <span className="text-ink-1 text-tau-body block truncate font-medium">
                {account.name}
              </span>
              <span className="text-ink-3 text-tau-sm block">已保存配置 · 不会改变当前服务</span>
            </span>
            {test.generated && <span className="text-tag-1 text-tau-sm font-medium">成功</span>}
          </GroupRow>
        </GroupCard>
        {!available && (
          <TtsStatus
            tone="warning"
            title="语音插件或模型不可用"
            action={
              <button type="button" className="text-accent-text" onClick={openPluginCenter}>
                去插件中心检查
              </button>
            }
          >
            已保存配置仍然保留，启用插件并选择模型后才能测试。
          </TtsStatus>
        )}
        {test.pending && (
          <TtsStatus tone="pending" title="正在合成语音…">
            正在请求 {provider?.definition.title ?? account.name}
            。取消后不再交付迟到结果，厂商已完成的操作仍可能计费。
          </TtsStatus>
        )}
        {test.generated && test.audio && (
          <TtsStatus tone="success" title="合成成功，可以试听">
            音频仅用于本页测试，不会插入文档或上传到附件；生成后不会自动播放。
          </TtsStatus>
        )}
        {test.error && (
          <TtsStatus
            tone="error"
            title="本次没有生成音频"
            action={
              <button
                type="button"
                className="text-accent-text inline-flex items-center gap-1"
                onClick={() => navigator.push("ttsAccount", { instanceId: account.id })}
              >
                <CircleAlert size={14} aria-hidden="true" />
                检查账号配置
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
              label="语音测试"
              info={`${test.audio.mime || "音频"} · ${(test.audio.size / 1024).toFixed(1)} KB`}
              preload="none"
            />
          </div>
        )}
        <TtsSection label="服务与音色">
          <GroupRow disabled={test.pending} onClick={() => setSheet("account")}>
            <span className="text-ink-1 text-tau-body flex-1">账号</span>
            <span className="text-ink-3 text-tau-meta max-w-[55%] truncate">{account.name}</span>
            <ChevronRight size={17} className="text-ink-3" aria-hidden="true" />
          </GroupRow>
          <GroupRow
            disabled={test.pending || !account.models.length}
            onClick={() => setSheet("model")}
          >
            <span className="text-ink-1 text-tau-body flex-1">模型</span>
            <span className="text-ink-3 text-tau-sm max-w-[55%] truncate font-mono">
              {modelId || "未设置"}
            </span>
            <ChevronRight size={17} className="text-ink-3" aria-hidden="true" />
          </GroupRow>
          <GroupRow disabled={test.pending || !available} onClick={() => setSheet("voice")}>
            <span className="min-w-0 flex-1">
              <span className="text-ink-1 text-tau-body block">音色</span>
              <span className="text-ink-3 text-tau-sm block">未找到时可手动输入音色 ID</span>
            </span>
            <span className="text-ink-3 text-tau-meta max-w-[45%] truncate">
              {selectedVoice?.name || voiceId || "未设置"}
            </span>
            <ChevronRight size={17} className="text-ink-3" aria-hidden="true" />
          </GroupRow>
        </TtsSection>
        <section className="mt-4">
          <label htmlFor="tts-test-text" className="text-ink-2 text-tau-meta mb-2 block px-1">
            测试文本
          </label>
          <textarea
            id="tts-test-text"
            value={text}
            onChange={event => setText(event.currentTarget.value)}
            maxLength={500}
            rows={6}
            disabled={test.pending}
            className="input-base w-full resize-none rounded-2xl p-4"
          />
          <div className="text-ink-3 text-tau-sm mt-1 text-right tabular-nums">
            {text.length} / 500
          </div>
        </section>
        {voices.data?.info.textInstructions && (
          <GroupNote>服务商文本提示：{voices.data.info.textInstructions}</GroupNote>
        )}
        <GroupNote>
          测试使用最近一次成功保存的配置，并产生真实服务商用量；不支持后台播放。
        </GroupNote>
      </div>
      <TtsChoiceSheet
        open={sheet === "account"}
        title="选择测试账号"
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
        title="选择测试模型"
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
        error={voices.error ? ttsErrorMessage(voices.error, account.config) : undefined}
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
