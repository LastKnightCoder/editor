import { useCallback, useRef } from "react";
import { Plus, Trash2, Upload, Volume2 } from "lucide-react";
import { Button, TextInput, TextSecondary, TextStrong } from "./ui";
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

      const existingVoice = voices.find((v) => v.id === trimmedId);
      if (existingVoice) {
        return "该 Voice ID 已存在，请使用不同的 ID";
      }

      return "";
    },
    [voices],
  );

  const handleAddCloneFiles = useCallback(
    (cloneId: string, files: FileList | null) => {
      if (!files || files.length === 0) return;

      const maxSize = 20 * 1024 * 1024;
      const allowedExtensions = [".mp3", ".m4a", ".wav"];

      setCloneItems((prev) =>
        prev.map((item) => {
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
            const ext = file.name
              .slice(file.name.lastIndexOf("."))
              .toLowerCase();
            if (!allowedExtensions.includes(ext)) {
              notify(
                "error",
                `文件 ${file.name} 格式不支持，仅支持 mp3/m4a/wav`,
              );
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
        }),
      );
    },
    [notify, setCloneItems],
  );

  const handleRemoveCloneFile = useCallback(
    (cloneId: string, fileId: string) => {
      setCloneItems((prev) =>
        prev.map((item) =>
          item.id === cloneId
            ? {
                ...item,
                audioFiles: item.audioFiles.filter((f) => f.id !== fileId),
              }
            : item,
        ),
      );
    },
    [setCloneItems],
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
      setCloneItems(cloneItems.filter((item) => item.id !== id));
    },
    [cloneItems, notify, setCloneItems],
  );

  const updateCloneItemVoiceId = useCallback(
    (id: string, voiceId: string) => {
      setCloneItems((prev) =>
        prev.map((item) => {
          if (item.id === id) {
            const error = validateVoiceId(voiceId);
            return { ...item, voiceId, voiceIdError: error };
          }
          return item;
        }),
      );
    },
    [validateVoiceId, setCloneItems],
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
          notify(
            "info",
            `[${voiceNum}/${totalVoices}] 开始处理音色: ${voiceId}`,
          );

          for (let j = 0; j < item.audioFiles.length; j++) {
            const fileItem = item.audioFiles[j];
            const fileNum = j + 1;

            notify(
              "info",
              `[${voiceNum}/${totalVoices}] 正在上传音频 ${fileNum}/${item.audioFiles.length}: ${fileItem.name}`,
            );

            const fileId = await uploadReferenceAudio(
              fileItem.file,
              minimaxApiKey,
            );

            await cloneVoice(fileId, voiceId, minimaxApiKey);
          }

          addVoiceToList(voiceId, voiceId);

          successCount++;
          notify(
            "success",
            `[${voiceNum}/${totalVoices}] 音色 ${voiceId} 克隆成功`,
          );
        } catch (error) {
          const errorMsg = (error as Error).message || "";
          if (errorMsg.includes("已存在")) {
            addVoiceToList(voiceId, voiceId);
            successCount++;
            notify(
              "info",
              `[${voiceNum}/${totalVoices}] 音色 ${voiceId} 已存在于服务端，已添加到列表`,
            );
          } else {
            console.error(`处理音色 ${voiceId} 失败:`, error);
            notify(
              "error",
              `[${voiceNum}/${totalVoices}] 音色 ${voiceId} 克隆失败: ${errorMsg}`,
            );
          }
        }
      }

      if (successCount === 0) {
        throw new Error("所有音色都克隆失败");
      }

      if (successCount === totalVoices) {
        notify("success", `成功克隆 ${successCount} 个音色！`);
      } else {
        notify(
          "warning",
          `部分成功：成功克隆 ${successCount}/${totalVoices} 个音色`,
        );
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

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-700/50">
      <Button
        icon={<Volume2 size={14} />}
        onClick={() => setShowCloneForm(!showCloneForm)}
        variant="dashed"
        block
      >
        {showCloneForm ? "隐藏音色克隆" : "克隆自定义音色"}
      </Button>

      {showCloneForm && (
        <div className="mt-3 p-4 bg-gray-50/80 dark:bg-zinc-800/30 rounded-lg space-y-4">
          <TextStrong className="block mb-2">音色克隆列表</TextStrong>

          <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
            {cloneItems.map((item, index) => (
              <div
                key={item.id}
                className="p-4 bg-white dark:bg-zinc-900 rounded-lg shadow-[0_0_0_1px_rgba(34,42,53,0.08),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06)] space-y-3"
              >
                <div className="flex items-center justify-between">
                  <TextStrong>音色 {index + 1}</TextStrong>
                  {cloneItems.length > 1 && (
                    <Button
                      size="small"
                      variant="danger"
                      icon={<Trash2 size={14} />}
                      onClick={() => removeCloneItem(item.id)}
                    >
                      删除
                    </Button>
                  )}
                </div>

                <div>
                  <TextStrong className="text-sm">Voice ID</TextStrong>
                  <TextSecondary className="text-xs ml-2">
                    （8-20字符，字母数字下划线连字符）
                  </TextSecondary>
                  <TextInput
                    placeholder="例如: my_voice_001"
                    value={item.voiceId}
                    onChange={(value) => updateCloneItemVoiceId(item.id, value)}
                    maxLength={20}
                    className="mt-1"
                    error={!!item.voiceIdError}
                  />
                  {item.voiceIdError && (
                    <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {item.voiceIdError}
                    </div>
                  )}
                  {item.voiceId &&
                    !item.voiceIdError &&
                    item.voiceId.length >= 8 && (
                      <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                        ✓ Voice ID 格式正确
                      </div>
                    )}
                </div>

                <div>
                  <TextStrong className="text-sm">参考音频</TextStrong>
                  <TextSecondary className="text-xs ml-2">
                    (mp3/m4a/wav, 10秒-5分钟, &lt;20MB)
                  </TextSecondary>

                  <input
                    ref={(el) => {
                      fileInputRefs.current[item.id] = el;
                    }}
                    type="file"
                    accept=".mp3,.m4a,.wav"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      handleAddCloneFiles(item.id, e.target.files);
                      e.currentTarget.value = "";
                    }}
                  />
                  <div className="mt-1 flex items-center gap-2">
                    <Button
                      icon={<Upload size={14} />}
                      size="small"
                      onClick={() => openFilePicker(item.id)}
                    >
                      选择音频{" "}
                      {item.audioFiles.length > 0 &&
                        `(${item.audioFiles.length}/5)`}
                    </Button>
                  </div>

                  {item.audioFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {item.audioFiles.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center justify-between gap-2 text-xs bg-gray-50 dark:bg-zinc-800/40 px-2.5 py-1.5 rounded-md"
                        >
                          <span className="truncate flex-1">{file.name}</span>
                          <Button
                            size="small"
                            variant="text"
                            icon={<Trash2 size={12} />}
                            className="w-6 h-6 px-0 rounded-md"
                            onClick={() =>
                              handleRemoveCloneFile(item.id, file.id)
                            }
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {cloneItems.length < 5 && (
            <Button
              icon={<Plus size={14} />}
              onClick={addCloneItem}
              block
              variant="dashed"
            >
              添加音色克隆项 ({cloneItems.length}/5)
            </Button>
          )}

          <TextSecondary className="text-xs block">
            <div className="space-y-1">
              <div>✓ 每个音色都需要独立的 Voice ID</div>
              <div>✓ 每个音色可上传多个音频（最多5个），会自动合并</div>
              <div>✓ 音频要求：清晰的单人语音，时长 10秒-5分钟</div>
              <div>✓ 可同时克隆最多 5 个不同的音色</div>
            </div>
          </TextSecondary>

          <Button
            variant="primary"
            onClick={handleCloneVoice}
            loading={cloneLoading}
            disabled={cloneItems.some(
              (item) =>
                !item.voiceId.trim() ||
                item.audioFiles.length === 0 ||
                !!item.voiceIdError ||
                item.voiceId.length < 8,
            )}
            block
          >
            开始批量克隆 ({cloneItems.length} 个音色)
          </Button>
        </div>
      )}
    </div>
  );
};

export default VoiceClonePanel;
