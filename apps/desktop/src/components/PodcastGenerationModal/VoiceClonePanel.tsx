import { useCallback, useRef } from "react";
import { AudioLines, Check, ChevronDown, FileAudio, Plus, Trash2, Upload, X } from "lucide-react";
import { Button, IconButton, Input, cn } from "@tau/ui";
import { Field } from "./ui";
import type { CloneVoiceItem, NoticeType } from "./types";
import type { VoiceOption } from "./types";
import { uploadReferenceAudio, cloneVoice } from "@/services/minimax";

export interface VoiceClonePanelProps {
  showCloneForm: boolean;
  setShowCloneForm: (show: boolean) => void;
  cloneItems: CloneVoiceItem[];
  setCloneItems: React.Dispatch<React.SetStateAction<CloneVoiceItem[]>>;
  cloneLoading: boolean;
  setCloneLoading: (loading: boolean) => void;
  minimaxApiKey: string;
  voices: VoiceOption[];
  addVoiceToList: (voiceId: string, voiceName: string) => void;
  notify: (type: NoticeType, text: string) => void;
}

export const VoiceClonePanel = ({
  showCloneForm,
  setShowCloneForm,
  cloneItems,
  setCloneItems,
  cloneLoading,
  setCloneLoading,
  minimaxApiKey,
  voices,
  addVoiceToList,
  notify,
}: VoiceClonePanelProps) => {
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const openFilePicker = useCallback((id: string) => {
    fileInputRefs.current[id]?.click();
  }, []);

  const validateVoiceId = useCallback(
    (voiceId: string): string => {
      if (!voiceId || voiceId.trim().length === 0) {
        return "Voice ID 不能为空";
      }

      const trimmedId = voiceId.trim();

      if (trimmedId.length < 8) {
        return "Voice ID 至少需要 8 个字符";
      }

      if (trimmedId.length > 20) {
        return "Voice ID 不能超过 20 个字符";
      }

      if (!/^[a-zA-Z0-9_-]+$/.test(trimmedId)) {
        return "Voice ID 只能包含字母、数字、下划线和连字符";
      }

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

      const maxSize = 20 * 1024 * 1024;
      const allowedExtensions = [".mp3", ".m4a", ".wav"];

      setCloneItems(prev =>
        prev.map(item => {
          if (item.id !== cloneId) return item;
          const next = [...item.audioFiles];
          for (const file of Array.from(files)) {
            if (next.length >= 5) {
              notify("warning", "每个音色最多上传 5 个音频");
              break;
            }
            if (file.size > maxSize) {
              notify("error", `文件 ${file.name} 大小不能超过 20MB`);
              continue;
            }
            const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
            if (!allowedExtensions.includes(ext)) {
              notify("error", `文件 ${file.name} 格式不支持，仅支持 mp3/m4a/wav`);
              continue;
            }
            next.push({
              id: `${Date.now()}-${Math.random()}`,
              file,
              name: file.name,
              size: file.size,
              type: file.type,
            });
          }
          return { ...item, audioFiles: next };
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
                audioFiles: item.audioFiles.filter(f => f.id !== fileId),
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
        audioFiles: [],
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

      if (!item.voiceId.trim() || item.voiceId.length < 8) {
        validationErrors.push(`克隆项 ${i + 1}: Voice ID 格式不正确`);
        continue;
      }

      if (item.audioFiles.length === 0) {
        validationErrors.push(`克隆项 ${i + 1}: 请上传至少一个音频文件`);
      }
    }

    if (validationErrors.length > 0) {
      notify("error", validationErrors[0]);
      return;
    }

    if (!minimaxApiKey) {
      notify("error", "请先配置 Minimax API Key");
      return;
    }

    setCloneLoading(true);
    let successCount = 0;
    const totalVoices = cloneItems.length;

    try {
      notify("info", `开始克隆音色，共 ${totalVoices} 个音色...`);

      for (let i = 0; i < cloneItems.length; i++) {
        const item = cloneItems[i];
        const voiceNum = i + 1;
        const voiceId = item.voiceId.trim();

        try {
          notify("info", `[${voiceNum}/${totalVoices}] 开始处理音色: ${voiceId}`);

          for (let j = 0; j < item.audioFiles.length; j++) {
            const fileItem = item.audioFiles[j];
            const fileNum = j + 1;

            notify(
              "info",
              `[${voiceNum}/${totalVoices}] 正在上传音频 ${fileNum}/${item.audioFiles.length}: ${fileItem.name}`
            );

            const fileId = await uploadReferenceAudio(fileItem.file, minimaxApiKey);

            await cloneVoice(fileId, voiceId, minimaxApiKey);
          }

          addVoiceToList(voiceId, voiceId);

          successCount++;
          notify("success", `[${voiceNum}/${totalVoices}] 音色 ${voiceId} 克隆成功`);
        } catch (error) {
          const errorMsg = (error as Error).message || "";
          if (errorMsg.includes("已存在")) {
            addVoiceToList(voiceId, voiceId);
            successCount++;
            notify(
              "info",
              `[${voiceNum}/${totalVoices}] 音色 ${voiceId} 已存在于服务端，已添加到列表`
            );
          } else {
            console.error(`处理音色 ${voiceId} 失败:`, error);
            notify("error", `[${voiceNum}/${totalVoices}] 音色 ${voiceId} 克隆失败: ${errorMsg}`);
          }
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
          audioFiles: [],
        },
      ]);
    } catch (error) {
      notify("error", (error as Error).message || "音色克隆失败");
    } finally {
      setCloneLoading(false);
    }
  }, [
    cloneItems,
    minimaxApiKey,
    addVoiceToList,
    notify,
    setCloneLoading,
    setShowCloneForm,
    setCloneItems,
  ]);

  const cloneDisabled = cloneItems.some(
    item =>
      !item.voiceId.trim() ||
      item.audioFiles.length === 0 ||
      !!item.voiceIdError ||
      item.voiceId.length < 8
  );

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
            const voiceIdOk = !!item.voiceId && !item.voiceIdError && item.voiceId.length >= 8;
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

                <Field label="Voice ID" hint="8–20 个字符，限字母、数字、下划线与连字符">
                  <Input
                    placeholder="例如：my_voice_001"
                    value={item.voiceId}
                    onChange={e => updateCloneItemVoiceId(item.id, e.target.value)}
                    maxLength={20}
                    aria-invalid={!!item.voiceIdError || undefined}
                  />
                  {item.voiceIdError && (
                    <span className="text-danger text-tau-meta">{item.voiceIdError}</span>
                  )}
                  {voiceIdOk && (
                    <span className="text-ok text-tau-meta flex items-center gap-1">
                      <Check className="size-3.5" strokeWidth={1.75} />
                      Voice ID 格式正确
                    </span>
                  )}
                </Field>

                <Field label="参考音频" hint="mp3 / m4a / wav，10 秒–5 分钟，小于 20MB">
                  <input
                    ref={el => {
                      fileInputRefs.current[item.id] = el;
                    }}
                    type="file"
                    accept=".mp3,.m4a,.wav"
                    multiple
                    className="hidden"
                    onChange={e => {
                      handleAddCloneFiles(item.id, e.target.files);
                      e.currentTarget.value = "";
                    }}
                  />
                  {item.audioFiles.length > 0 && (
                    <div className="flex flex-col">
                      {item.audioFiles.map(file => (
                        <div
                          key={file.id}
                          className="hover:bg-hover rounded-tau-sm text-tau-meta text-ink-1 -mx-1.5 flex h-8 items-center gap-2 px-1.5"
                        >
                          <FileAudio
                            className="text-ink-3 size-[15px] shrink-0"
                            strokeWidth={1.75}
                          />
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
                      ))}
                    </div>
                  )}
                  <Button
                    size="sm"
                    icon={Upload}
                    onClick={() => openFilePicker(item.id)}
                    className="self-start"
                  >
                    选择音频
                    {item.audioFiles.length > 0 && (
                      <span className="text-ink-3 tabular-nums">{item.audioFiles.length}/5</span>
                    )}
                  </Button>
                </Field>
              </div>
            );
          })}

          <ul className="text-ink-3 text-tau-meta m-0 flex list-disc flex-col gap-0.5 pl-4">
            <li>每个音色都需要独立的 Voice ID</li>
            <li>每个音色可上传多个音频（最多 5 个），会自动合并</li>
            <li>音频要求：清晰的单人语音，时长 10 秒–5 分钟</li>
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
