import { useCallback, useRef, useEffect } from "react";
import { AudioLines, Check, ChevronDown, FileAudio, Plus, Trash2, Upload, X } from "lucide-react";
import { Button, IconButton, Input, cn } from "@tau/ui";
import { Field } from "./ui";
import type { CloneVoiceItem, NoticeType } from "./types";
import type { VoiceOption } from "./types";
import { TTSProviderFactory } from "@/utils/tts";
import type { VoiceCloneCapability } from "@/types/tts";

export interface VoiceClonePanelProps {
  getCloner?: () => VoiceCloneCapability | null;
  showCloneForm: boolean;
  setShowCloneForm: (show: boolean) => void;
  cloneItems: CloneVoiceItem[];
  setCloneItems: React.Dispatch<React.SetStateAction<CloneVoiceItem[]>>;
  cloneLoading: boolean;
  setCloneLoading: (loading: boolean) => void;
  voices: VoiceOption[];
  addVoiceToList: (voiceId: string, voiceName: string, providerId?: string) => void;
  notify: (type: NoticeType, text: string) => void;
}

export const VoiceClonePanel = ({
  showCloneForm,
  setShowCloneForm,
  cloneItems,
  setCloneItems,
  cloneLoading,
  setCloneLoading,
  voices,
  addVoiceToList,
  notify,
  getCloner,
}: VoiceClonePanelProps) => {
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => {
    if (!showCloneForm) controllerRef.current?.abort();
  }, [showCloneForm]);

  const openFilePicker = useCallback((id: string) => {
    fileInputRefs.current[id]?.click();
  }, []);

  const validateVoiceId = useCallback(
    (voiceId: string): string => {
      const trimmedId = voiceId.trim();
      if (!trimmedId) return "";

      const existingVoice = voices.find(v => v.id === trimmedId);
      if (existingVoice) {
        return "该 Voice ID 已存在，请使用不同的 ID";
      }

      return "";
    },
    [voices]
  );

  const handleAddCloneFiles = useCallback(
    (cloneId: string, files: FileList | null) => {
      if (!files || files.length === 0) return;

      setCloneItems(prev =>
        prev.map(item => {
          if (item.id !== cloneId) return item;
          const file = files[0];
          return {
            ...item,
            audioFile: {
              id: crypto.randomUUID(),
              file,
              name: file.name,
              size: file.size,
              type: file.type,
            },
          };
        })
      );
    },
    [notify, setCloneItems]
  );

  const handleRemoveCloneFile = useCallback(
    (cloneId: string, fileId: string) => {
      setCloneItems(prev =>
        prev.map(item =>
          item.id === cloneId
            ? {
                ...item,
                audioFile: item.audioFile?.id === fileId ? null : item.audioFile,
              }
            : item
        )
      );
    },
    [setCloneItems]
  );

  const addCloneItem = useCallback(() => {
    if (cloneItems.length >= 5) {
      notify("warning", "最多支持同时克隆 5 个音色");
      return;
    }
    setCloneItems([
      ...cloneItems,
      {
        id: Date.now().toString(),
        voiceId: "",
        voiceIdError: "",
        audioFile: null,
      },
    ]);
  }, [cloneItems, notify, setCloneItems]);

  const removeCloneItem = useCallback(
    (id: string) => {
      if (cloneItems.length <= 1) {
        notify("warning", "至少需要保留一个克隆项");
        return;
      }
      setCloneItems(cloneItems.filter(item => item.id !== id));
    },
    [cloneItems, notify, setCloneItems]
  );

  const updateCloneItemVoiceId = useCallback(
    (id: string, voiceId: string) => {
      setCloneItems(prev =>
        prev.map(item => {
          if (item.id === id) {
            const error = validateVoiceId(voiceId);
            return { ...item, voiceId, voiceIdError: error };
          }
          return item;
        })
      );
    },
    [validateVoiceId, setCloneItems]
  );

  const handleCloneVoice = useCallback(async () => {
    const validationErrors: string[] = [];

    for (let i = 0; i < cloneItems.length; i++) {
      const item = cloneItems[i];

      if (item.voiceIdError) {
        validationErrors.push(`克隆项 ${i + 1}: ${item.voiceIdError}`);
        continue;
      }

      if (!item.audioFile) {
        validationErrors.push(`克隆项 ${i + 1}: 请选择一个参考音频文件`);
      }
    }

    if (validationErrors.length > 0) {
      notify("error", validationErrors[0]);
      return;
    }

    // 克隆走当前 TTS 服务商的克隆能力（Minimax 直传文件；Qwen 经资源上传中转）
    const cloner = getCloner ? getCloner() : TTSProviderFactory.getVoiceCloner();
    if (!cloner) {
      notify("error", "请先在「设置 · 语音」配置支持音色克隆的 TTS 服务商");
      return;
    }

    setCloneLoading(true);
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    let successCount = 0;
    const totalVoices = cloneItems.length;

    try {
      notify("info", `开始克隆音色，共 ${totalVoices} 个音色...`);

      for (let i = 0; i < cloneItems.length; i++) {
        controller.signal.throwIfAborted();
        const item = cloneItems[i];
        const voiceNum = i + 1;
        const voiceId = item.voiceId.trim();

        try {
          notify("info", `[${voiceNum}/${totalVoices}] 开始处理音色: ${voiceId}`);

          const file = item.audioFile;
          if (!file) throw new Error("请选择参考音频");
          const voice = await cloner.cloneVoice(
            file.file,
            {
              voiceId,
              voiceName: voiceId || file.name,
            },
            controller.signal
          );
          controller.signal.throwIfAborted();
          const clonedVoiceId = voice.id;
          addVoiceToList(voice.id, voice.name, voice.provider);
          if (voice.description) notify("info", voice.description);

          successCount++;
          notify(
            "success",
            clonedVoiceId === voiceId
              ? `[${voiceNum}/${totalVoices}] 音色 ${voiceId} 克隆成功`
              : `[${voiceNum}/${totalVoices}] 音色克隆成功，实际音色 ID：${clonedVoiceId}`
          );
        } catch (error) {
          controller.signal.throwIfAborted();
          const errorMsg = (error as Error).message || "";
          if (error instanceof Error && error.name === "AbortError") throw error;
          console.error(`处理音色 ${voiceId} 失败:`, error);
          notify("error", `[${voiceNum}/${totalVoices}] 音色复刻失败: ${errorMsg}`);
        }
      }

      if (successCount === 0) {
        throw new Error("所有音色都克隆失败");
      }

      if (successCount === totalVoices) {
        notify("success", `成功克隆 ${successCount} 个音色！`);
      } else {
        notify("warning", `部分成功：成功克隆 ${successCount}/${totalVoices} 个音色`);
      }

      setShowCloneForm(false);
      setCloneItems([
        {
          id: Date.now().toString(),
          voiceId: "",
          voiceIdError: "",
          audioFile: null,
        },
      ]);
    } catch (error) {
      if (!controller.signal.aborted) notify("error", (error as Error).message || "音色克隆失败");
    } finally {
      await cloner.dispose?.();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setCloneLoading(false);
      }
    }
  }, [
    cloneItems,
    addVoiceToList,
    notify,
    setCloneLoading,
    setShowCloneForm,
    setCloneItems,
    getCloner,
  ]);

  const cloneDisabled = cloneItems.some(item => !item.audioFile || !!item.voiceIdError);

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="ghost"
        size="sm"
        icon={AudioLines}
        onClick={() => setShowCloneForm(!showCloneForm)}
        aria-expanded={showCloneForm}
        className="-ml-2 self-start"
      >
        {showCloneForm ? "收起音色克隆" : "克隆自定义音色"}
        <ChevronDown
          className={cn(
            "text-ink-3 ease-tau-out size-3.5 transition-transform duration-150",
            showCloneForm && "rotate-180"
          )}
          strokeWidth={1.75}
        />
      </Button>

      {showCloneForm && (
        <div className="flex flex-col gap-3">
          {cloneItems.map((item, index) => {
            const voiceIdOk = !!item.voiceId && !item.voiceIdError;
            const file = item.audioFile;
            return (
              <div
                key={item.id}
                className="border-line-1 rounded-tau-md flex flex-col gap-3 border px-3.5 py-3"
              >
                <div className="flex h-[26px] items-center justify-between">
                  <span className="text-ink-1 text-tau-meta font-medium">音色 {index + 1}</span>
                  {cloneItems.length > 1 && (
                    <IconButton
                      aria-label={`删除音色 ${index + 1}`}
                      className="enabled:hover:text-danger -mr-1.5 size-[26px]"
                      onClick={() => removeCloneItem(item.id)}
                    >
                      <Trash2 className="size-[14px]" strokeWidth={1.75} />
                    </IconButton>
                  )}
                </div>

                <Field label="Voice ID" hint="可选，具体格式由所选服务检查">
                  <Input
                    placeholder="例如：my_voice_001"
                    value={item.voiceId}
                    onChange={e => updateCloneItemVoiceId(item.id, e.target.value)}
                    aria-invalid={!!item.voiceIdError || undefined}
                  />
                  {item.voiceIdError && (
                    <span className="text-danger text-tau-meta">{item.voiceIdError}</span>
                  )}
                  {voiceIdOk && (
                    <span className="text-ok text-tau-meta flex items-center gap-1">
                      <Check className="size-3.5" strokeWidth={1.75} />
                      Voice ID 未重复，提交时由服务商校验
                    </span>
                  )}
                </Field>

                <Field label="参考音频" hint="每个音色一个参考文件，格式和时长以服务商要求为准">
                  <input
                    ref={el => {
                      fileInputRefs.current[item.id] = el;
                    }}
                    type="file"
                    accept=".mp3,.m4a,.wav"
                    className="hidden"
                    onChange={e => {
                      handleAddCloneFiles(item.id, e.target.files);
                      e.currentTarget.value = "";
                    }}
                  />
                  {file && (
                    <div className="flex flex-col">
                      <div
                        key={file.id}
                        className="hover:bg-hover rounded-tau-sm text-tau-meta text-ink-1 -mx-1.5 flex h-8 items-center gap-2 px-1.5"
                      >
                        <FileAudio className="text-ink-3 size-[15px] shrink-0" strokeWidth={1.75} />
                        <span className="min-w-0 flex-1 truncate">{file.name}</span>
                        <span className="text-ink-3 text-tau-micro shrink-0 tabular-nums">
                          {formatFileSize(file.size)}
                        </span>
                        <IconButton
                          aria-label={`移除 ${file.name}`}
                          className="size-6 shrink-0"
                          onClick={() => handleRemoveCloneFile(item.id, file.id)}
                        >
                          <X className="size-3.5" strokeWidth={1.75} />
                        </IconButton>
                      </div>
                    </div>
                  )}
                  <Button
                    size="sm"
                    icon={Upload}
                    onClick={() => openFilePicker(item.id)}
                    className="self-start"
                  >
                    选择音频
                  </Button>
                </Field>
              </div>
            );
          })}

          <ul className="text-ink-3 text-tau-meta m-0 flex list-disc flex-col gap-0.5 pl-4">
            <li>可填写期望的 Voice ID，最终以服务商返回的 ID 为准</li>
            <li>每个音色使用一个参考音频，重新选择会替换原文件</li>
            <li>建议使用清晰的单人语音</li>
            <li>可同时克隆最多 5 个不同的音色</li>
          </ul>

          <div className="flex items-center gap-2">
            {cloneItems.length < 5 && (
              <Button
                variant="ghost"
                size="sm"
                icon={Plus}
                onClick={addCloneItem}
                className="-ml-2"
              >
                添加克隆项
                <span className="text-ink-3 tabular-nums">{cloneItems.length}/5</span>
              </Button>
            )}
            <span className="flex-1" />
            <Button
              variant="soft"
              size="sm"
              onClick={handleCloneVoice}
              loading={cloneLoading}
              disabled={cloneDisabled}
            >
              开始批量克隆（{cloneItems.length} 个音色）
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

/** 字节数 → 1.2 MB / 340 KB */
function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default VoiceClonePanel;
