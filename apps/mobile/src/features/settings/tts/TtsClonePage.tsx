import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FileAudio, Mic, RefreshCw, X } from "lucide-react";
import { GroupCard, GroupNote, GroupRow } from "../components/ui";
import { ActionButton } from "../storage/fields";
import { useNavigator, usePageLifecycle } from "../../../router";
import { TtsPageShell } from "./components/TtsPageShell";
import { TtsChoiceSheet } from "./components/TtsSelectionSheets";
import { TtsEmpty, TtsProviderTile, TtsSection, TtsStatus } from "./components/TtsUi";
import { ttsErrorMessage } from "./errors";
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
      <TtsPageShell title="音色复刻">
        <TtsEmpty title="账号不存在" description="它可能已被删除，请返回语音设置查看。" />
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
      <ActionButton label="取消复刻" emphasis={false} onClick={clone.cancel} />
      <ActionButton label="复刻中" emphasis busy disabled onClick={() => undefined} />
    </>
  ) : clone.result ? (
    <ActionButton label="完成" emphasis={false} onClick={() => void navigator.goBack("ui")} />
  ) : canClone ? (
    <>
      <ActionButton label="取消" emphasis={false} onClick={() => void navigator.goBack("ui")} />
      <ActionButton
        label={clone.error ? "重试复刻" : "开始复刻"}
        emphasis
        disabled={!file || !name.trim()}
        onClick={() => file && void clone.clone(file, name)}
      />
    </>
  ) : undefined;

  return (
    <TtsPageShell title="音色复刻" footer={footer}>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        aria-label="选择参考音频文件"
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
                {modelId || "未选择模型"} · 使用已保存配置
              </span>
            </span>
          </GroupRow>
        </GroupCard>
        <TtsSection label="复刻模型">
          <GroupRow
            disabled={clone.pending || !account.models.length}
            onClick={() => setModelSheet(true)}
          >
            <span className="text-ink-1 text-tau-body flex-1">模型</span>
            <span className="text-ink-3 text-tau-sm max-w-[60%] truncate font-mono">
              {modelId || "未设置"}
            </span>
            <ChevronRight size={17} className="text-ink-3" aria-hidden="true" />
          </GroupRow>
        </TtsSection>
        {!available && (
          <TtsStatus
            tone="warning"
            title="语音插件或模型不可用"
            action={
              <button
                type="button"
                className="text-accent-text"
                onClick={() => navigator.push("plugins", { tab: "installed" })}
              >
                去插件中心检查
              </button>
            }
          >
            已保存配置仍然保留，启用插件并选择模型后才能复刻。
          </TtsStatus>
        )}
        {available && info.isPending && <TtsStatus tone="pending" title="正在检查复刻能力…" />}
        {info.error && (
          <TtsStatus tone="error" title="无法检查复刻能力">
            {ttsErrorMessage(info.error, account.config)}
          </TtsStatus>
        )}
        {available && info.data && !info.data.canClone && (
          <GroupCard>
            <TtsEmpty
              title="当前模型不支持音色复刻"
              description="可选择其他模型，或使用支持复刻的语音服务；宿主不会伪造复刻入口或结果。"
            />
          </GroupCard>
        )}
        {canClone && (
          <>
            {setting?.imageBed.active !== "plugin" && (
              <TtsStatus
                tone="warning"
                title="部分服务商需要公网地址"
                action={
                  <button type="button" className="text-accent-text" onClick={openUploadSettings}>
                    去上传设置
                  </button>
                }
              >
                当前图片与附件保存在本机。若服务商需要远程读取参考音频，请先配置公开可访问的上传服务；直传厂商的服务仍可继续。
              </TtsStatus>
            )}
            {clone.pending && (
              <TtsStatus tone="pending" title="正在创建复刻音色…">
                插件正在处理参考音频，请保持此页打开。取消后不再交付迟到结果。
              </TtsStatus>
            )}
            {clone.error && (
              <TtsStatus
                tone="error"
                title="复刻失败"
                action={
                  <button
                    type="button"
                    className="text-accent-text"
                    onClick={() => navigator.push("ttsAccount", { instanceId: account.id })}
                  >
                    检查账号配置
                  </button>
                }
              >
                {clone.error}
              </TtsStatus>
            )}
            {clone.result && (
              <>
                <TtsStatus tone="success" title="复刻音色已创建">
                  已收到服务商返回的真实音色身份，可刷新音色目录后用于合成。
                </TtsStatus>
                <TtsSection label="新音色">
                  <GroupRow>
                    <Mic size={18} className="text-tag-1" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="text-ink-1 text-tau-body block font-medium">
                        {clone.result.name}
                      </span>
                      <span className="text-ink-3 text-tau-sm block break-all font-mono">
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
                      刷新音色并测试
                    </span>
                  </GroupRow>
                </TtsSection>
              </>
            )}
            {!clone.result && (
              <>
                <section className="mt-4">
                  <h2 className="text-ink-2 text-tau-meta mb-2 px-1">参考音频</h2>
                  <button
                    type="button"
                    disabled={clone.pending}
                    className="bg-surface text-ink-1 flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl px-4 py-5 disabled:opacity-50"
                    onClick={() => inputRef.current?.click()}
                  >
                    <FileAudio size={28} className="text-accent-text" aria-hidden="true" />
                    <span className="text-tau-body font-medium">选择参考音频</span>
                    <span className="text-ink-3 text-tau-sm">
                      MP3 / WAV / M4A · 大小与格式由服务商校验
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
                        aria-label="移除参考音频"
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
                    音色名称
                  </label>
                  <input
                    id="tts-clone-name"
                    value={name}
                    onChange={event => setName(event.currentTarget.value)}
                    disabled={clone.pending}
                    className="input-base w-full rounded-xl px-3"
                    placeholder="为新音色命名"
                    maxLength={100}
                  />
                  <GroupNote>
                    实际音色 ID 以插件返回为准；文件大小、格式与时长限制由插件校验。
                  </GroupNote>
                </section>
              </>
            )}
          </>
        )}
      </div>
      <TtsChoiceSheet
        open={modelSheet}
        title="选择复刻模型"
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
