import { useState, useEffect, useCallback, memo } from "react";
import {
  Modal,
  Button,
  Space,
  Select,
  Input,
  // Switch,
  Progress,
  Typography,
  Collapse,
  message,
  Spin,
  Slider,
  Upload,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  SoundOutlined,
  FileTextOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import type { UploadFile } from "antd";
import { usePodcastGeneration } from "@/hooks/usePodcastGeneration";
import type { PodcastSpeaker } from "@/types/podcast";
import { SpeakerRole } from "@/types/podcast";
import type { Descendant } from "slate";
import { getMarkdown } from "@/utils/markdown";
import { uploadReferenceAudio, cloneVoice } from "@/services/minimax";
import useSettingStore from "@/stores/useSettingStore";

const { Title, Text } = Typography;
const { Option } = Select;
const { Panel } = Collapse;

interface PodcastGenerationModalProps {
  open: boolean;
  cardContent: Descendant[];
  onSuccess: (
    audioUrl: string,
    script: string,
    duration: number,
    speakers: PodcastSpeaker[],
  ) => void;
  onCancel: () => void;
}

interface CloneVoiceItem {
  id: string;
  voiceId: string;
  voiceIdError: string;
  audioFiles: UploadFile[];
}

const PodcastGenerationModal = memo<PodcastGenerationModalProps>(
  ({ open, cardContent, onSuccess, onCancel }) => {
    const [speakers, setSpeakers] = useState<PodcastSpeaker[]>([
      { name: "Speaker1", voiceId: "", voiceName: "", role: SpeakerRole.Host },
      { name: "Speaker2", voiceId: "", voiceName: "", role: SpeakerRole.Guest },
    ]);
    const [generateMusic, setGenerateMusic] = useState(false);
    const [durationRange, setDurationRange] = useState<[number, number]>([
      3, 5,
    ]);

    // 音色克隆相关状态
    const [showCloneForm, setShowCloneForm] = useState(false);
    const [cloneItems, setCloneItems] = useState<CloneVoiceItem[]>([
      {
        id: Date.now().toString(),
        voiceId: "",
        voiceIdError: "",
        audioFiles: [],
      },
    ]);
    const [cloneLoading, setCloneLoading] = useState(false);

    const minimaxApiKey = useSettingStore(
      (state) => state.setting.integration.minimax.apiKey,
    );

    const {
      status,
      stage,
      stageProgress,
      ttsTotal,
      ttsCompleted,
      logs,
      script,
      audioUrl,
      duration,
      voices,
      voicesLoading,
      loadVoices,
      addVoiceToList,
      generatePodcast,
      reset,
    } = usePodcastGeneration();

    // 加载音色列表
    useEffect(() => {
      if (open && voices.length === 0) {
        loadVoices();
      }
    }, [open, voices.length, loadVoices]);

    const stageNames: Record<string, string> = {
      parsing: "解析内容",
      script: "生成脚本",
      tts: "合成语音",
      music: "生成音乐",
      merging: "合并音频",
      upload: "上传音频",
      complete: "完成",
    };

    const addSpeaker = useCallback(() => {
      if (speakers.length >= 5) {
        message.warning("最多支持 5 个说话人");
        return;
      }
      const newIndex = speakers.length + 1;
      // 默认新增的说话人为嘉宾
      setSpeakers([
        ...speakers,
        {
          name: `Speaker${newIndex}`,
          voiceId: "",
          voiceName: "",
          role: SpeakerRole.Guest,
        },
      ]);
    }, [speakers]);

    const removeSpeaker = useCallback(
      (index: number) => {
        if (speakers.length <= 2) {
          message.warning("至少需要 2 个说话人");
          return;
        }
        setSpeakers(speakers.filter((_, i) => i !== index));
      },
      [speakers],
    );

    const updateSpeaker = useCallback(
      (
        index: number,
        field: keyof PodcastSpeaker,
        value: string | SpeakerRole,
      ) => {
        const newSpeakers = [...speakers];
        newSpeakers[index] = { ...newSpeakers[index], [field]: value };

        // 如果更新了 voiceId，同时更新 voiceName
        if (field === "voiceId") {
          const voice = voices.find((v) => v.voice_id === (value as string));
          if (voice) {
            newSpeakers[index].voiceName = voice.voice_name || voice.voice_id;
          }
        }

        setSpeakers(newSpeakers);
      },
      [speakers, voices],
    );

    const handleGenerate = useCallback(async () => {
      // 验证
      if (speakers.some((s) => !s.voiceId)) {
        message.error("请为所有说话人选择音色");
        return;
      }

      // 提取卡片内容
      const content = getMarkdown(cardContent);
      if (!content || content.trim().length === 0) {
        message.error("卡片内容为空");
        return;
      }

      await generatePodcast({
        content,
        speakers,
        generateMusic,
        durationMin: durationRange[0],
        durationMax: durationRange[1],
      });
    }, [speakers, generateMusic, durationRange, cardContent, generatePodcast]);

    const handleSuccess = useCallback(() => {
      if (audioUrl) {
        onSuccess(audioUrl, script, duration, speakers);
        handleClose();
      }
    }, [audioUrl, script, duration, speakers, onSuccess]);

    const handleClose = useCallback(() => {
      reset();
      setSpeakers([
        {
          name: "Speaker1",
          voiceId: "",
          voiceName: "",
          role: SpeakerRole.Host,
        },
        {
          name: "Speaker2",
          voiceId: "",
          voiceName: "",
          role: SpeakerRole.Guest,
        },
      ]);
      setGenerateMusic(false);
      setDurationRange([3, 5]);
      setShowCloneForm(false);
      setCloneItems([
        {
          id: Date.now().toString(),
          voiceId: "",
          voiceIdError: "",
          audioFiles: [],
        },
      ]);
      onCancel();
    }, [reset, onCancel]);

    // 验证 voice_id
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

        // 检查是否只包含字母、数字、下划线和连字符
        if (!/^[a-zA-Z0-9_-]+$/.test(trimmedId)) {
          return "Voice ID 只能包含字母、数字、下划线和连字符";
        }

        // 检查是否与已有音色重复
        const existingVoice = voices.find((v) => v.voice_id === trimmedId);
        if (existingVoice) {
          return "该 Voice ID 已存在，请使用不同的 ID";
        }

        return "";
      },
      [voices],
    );

    // 添加克隆项
    const addCloneItem = useCallback(() => {
      if (cloneItems.length >= 5) {
        message.warning("最多支持同时克隆 5 个音色");
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
    }, [cloneItems]);

    // 删除克隆项
    const removeCloneItem = useCallback(
      (id: string) => {
        if (cloneItems.length <= 1) {
          message.warning("至少需要保留一个克隆项");
          return;
        }
        setCloneItems(cloneItems.filter((item) => item.id !== id));
      },
      [cloneItems],
    );

    // 更新克隆项的 voice_id
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
      [validateVoiceId],
    );

    // 更新克隆项的音频文件
    const updateCloneItemFiles = useCallback(
      (id: string, files: UploadFile[]) => {
        setCloneItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, audioFiles: files } : item,
          ),
        );
      },
      [],
    );

    // 处理音色克隆
    const handleCloneVoice = useCallback(async () => {
      // 1. 验证所有克隆项
      const validationErrors: string[] = [];

      for (let i = 0; i < cloneItems.length; i++) {
        const item = cloneItems[i];

        // 验证 voice_id
        if (item.voiceIdError) {
          validationErrors.push(`克隆项 ${i + 1}: ${item.voiceIdError}`);
          continue;
        }

        if (!item.voiceId.trim() || item.voiceId.length < 8) {
          validationErrors.push(`克隆项 ${i + 1}: Voice ID 格式不正确`);
          continue;
        }

        // 验证音频文件
        if (item.audioFiles.length === 0) {
          validationErrors.push(`克隆项 ${i + 1}: 请上传至少一个音频文件`);
        }
      }

      if (validationErrors.length > 0) {
        message.error(validationErrors[0]);
        return;
      }

      // 2. 验证 API Key
      if (!minimaxApiKey) {
        message.error("请先配置 Minimax API Key");
        return;
      }

      setCloneLoading(true);
      let successCount = 0;
      const totalVoices = cloneItems.length;

      try {
        message.info(`开始克隆音色，共 ${totalVoices} 个音色...`);

        // 3. 逐个处理每个克隆项
        for (let i = 0; i < cloneItems.length; i++) {
          const item = cloneItems[i];
          const voiceNum = i + 1;
          const voiceId = item.voiceId.trim();

          try {
            message.info(
              `[${voiceNum}/${totalVoices}] 开始处理音色: ${voiceId}`,
            );

            // 处理该音色的所有音频文件
            for (let j = 0; j < item.audioFiles.length; j++) {
              const file = item.audioFiles[j];
              const fileNum = j + 1;

              message.info(
                `[${voiceNum}/${totalVoices}] 正在上传音频 ${fileNum}/${item.audioFiles.length}: ${file.name}`,
              );

              // 上传音频文件
              const fileId = await uploadReferenceAudio(
                file.originFileObj as File,
                minimaxApiKey,
              );

              // 克隆音色
              await cloneVoice(fileId, voiceId, minimaxApiKey);
            }

            // 手动添加到音色列表
            addVoiceToList(voiceId, voiceId);

            successCount++;
            message.success(
              `[${voiceNum}/${totalVoices}] 音色 ${voiceId} 克隆成功`,
            );
          } catch (error) {
            console.error(`处理音色 ${voiceId} 失败:`, error);
            message.error(
              `[${voiceNum}/${totalVoices}] 音色 ${voiceId} 克隆失败: ${(error as Error).message}`,
            );
          }
        }

        // 4. 显示最终结果
        if (successCount === 0) {
          throw new Error("所有音色都克隆失败");
        }

        if (successCount === totalVoices) {
          message.success(`成功克隆 ${successCount} 个音色！`);
        } else {
          message.warning(
            `部分成功：成功克隆 ${successCount}/${totalVoices} 个音色`,
          );
        }

        // 5. 重置表单
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
        message.error((error as Error).message || "音色克隆失败");
      } finally {
        setCloneLoading(false);
      }
    }, [cloneItems, minimaxApiKey, addVoiceToList]);

    return (
      <Modal
        title="生成播客"
        open={open}
        onCancel={handleClose}
        width={800}
        footer={
          status === "complete" ? (
            <Space>
              <Button onClick={handleClose}>关闭</Button>
              <Button type="primary" onClick={handleSuccess}>
                保存到卡片
              </Button>
            </Space>
          ) : status === "loading" ? null : (
            <Space>
              <Button onClick={handleClose}>取消</Button>
              <Button
                type="primary"
                onClick={handleGenerate}
                disabled={speakers.some((s) => !s.voiceId)}
              >
                开始生成
              </Button>
            </Space>
          )
        }
        maskClosable={false}
        keyboard={status !== "loading"}
      >
        <div className="space-y-6">
          {status === "idle" && (
            <div className="space-y-4">
              <Title level={5}>说话人配置</Title>
              <Spin spinning={voicesLoading}>
                <Space
                  direction="vertical"
                  style={{ width: "100%" }}
                  size="middle"
                >
                  {speakers.map((speaker, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        placeholder="名称"
                        value={speaker.name}
                        onChange={(e) =>
                          updateSpeaker(index, "name", e.target.value)
                        }
                        className="w-[120px]! flex-shrink-0"
                      />
                      <Select
                        value={speaker.role}
                        onChange={(value) =>
                          updateSpeaker(index, "role", value)
                        }
                        className="w-[100px] flex-shrink-0"
                      >
                        <Option value={SpeakerRole.Host}>
                          {SpeakerRole.Host}
                        </Option>
                        <Option value={SpeakerRole.Guest}>
                          {SpeakerRole.Guest}
                        </Option>
                      </Select>
                      <Select
                        placeholder="选择音色"
                        value={speaker.voiceId || undefined}
                        onChange={(value) =>
                          updateSpeaker(index, "voiceId", value)
                        }
                        className="flex-1 min-w-0 h-auto"
                        showSearch
                        optionFilterProp="children"
                      >
                        {voices.map((voice) => (
                          <Option key={voice.voice_id} value={voice.voice_id}>
                            <div>
                              <div>{voice.voice_name || voice.voice_id}</div>
                              {voice.description &&
                                voice.description.length > 0 && (
                                  <Text type="secondary" className="text-xs">
                                    {voice.description[0]}
                                  </Text>
                                )}
                            </div>
                          </Option>
                        ))}
                      </Select>
                      {speakers.length > 2 && (
                        <Button
                          icon={<DeleteOutlined />}
                          danger
                          onClick={() => removeSpeaker(index)}
                        />
                      )}
                    </div>
                  ))}
                </Space>
              </Spin>

              {speakers.length < 5 && (
                <Button
                  icon={<PlusOutlined />}
                  onClick={addSpeaker}
                  style={{ marginTop: 16 }}
                  block
                >
                  添加说话人
                </Button>
              )}

              {/* 音色克隆功能 */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <Button
                  icon={<SoundOutlined />}
                  onClick={() => setShowCloneForm(!showCloneForm)}
                  type="dashed"
                  block
                >
                  {showCloneForm ? "隐藏音色克隆" : "克隆自定义音色"}
                </Button>

                {showCloneForm && (
                  <div className="mt-4 p-4 bg-gray-50 rounded space-y-4">
                    <Text strong className="block mb-2">
                      音色克隆列表
                    </Text>

                    <Space
                      direction="vertical"
                      style={{ width: "100%" }}
                      size="middle"
                    >
                      {cloneItems.map((item, index) => (
                        <div
                          key={item.id}
                          className="p-4 bg-white rounded border border-gray-200 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <Text strong>音色 {index + 1}</Text>
                            {cloneItems.length > 1 && (
                              <Button
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => removeCloneItem(item.id)}
                              >
                                删除
                              </Button>
                            )}
                          </div>

                          <div>
                            <Text strong className="text-sm">
                              Voice ID
                            </Text>
                            <Text type="secondary" className="text-xs ml-2">
                              （8-20字符，字母数字下划线连字符）
                            </Text>
                            <Input
                              placeholder="例如: my_voice_001"
                              value={item.voiceId}
                              onChange={(e) =>
                                updateCloneItemVoiceId(item.id, e.target.value)
                              }
                              maxLength={20}
                              className="mt-1"
                              status={item.voiceIdError ? "error" : ""}
                            />
                            {item.voiceIdError && (
                              <Text
                                type="danger"
                                className="text-xs block mt-1"
                              >
                                {item.voiceIdError}
                              </Text>
                            )}
                            {item.voiceId &&
                              !item.voiceIdError &&
                              item.voiceId.length >= 8 && (
                                <Text
                                  type="success"
                                  className="text-xs block mt-1"
                                >
                                  ✓ Voice ID 格式正确
                                </Text>
                              )}
                          </div>

                          <div>
                            <Text strong className="text-sm">
                              参考音频
                            </Text>
                            <Text type="secondary" className="text-xs ml-2">
                              (mp3/m4a/wav, 10秒-5分钟, &lt;20MB)
                            </Text>
                            <Upload
                              accept=".mp3,.m4a,.wav"
                              multiple
                              maxCount={5}
                              fileList={item.audioFiles}
                              beforeUpload={(file) => {
                                // 验证文件大小
                                const maxSize = 20 * 1024 * 1024;
                                if (file.size > maxSize) {
                                  message.error(
                                    `文件 ${file.name} 大小不能超过 20MB`,
                                  );
                                  return false;
                                }

                                // 验证文件格式
                                const allowedTypes = [
                                  "audio/mpeg",
                                  "audio/mp4",
                                  "audio/x-m4a",
                                  "audio/wav",
                                ];
                                if (!allowedTypes.includes(file.type)) {
                                  message.error(`文件 ${file.name} 格式不支持`);
                                  return false;
                                }

                                // 添加到该克隆项的文件列表
                                updateCloneItemFiles(item.id, [
                                  ...item.audioFiles,
                                  {
                                    uid: file.uid,
                                    name: file.name,
                                    status: "done",
                                    originFileObj: file,
                                  } as UploadFile,
                                ]);
                                return false;
                              }}
                              onRemove={(file) => {
                                updateCloneItemFiles(
                                  item.id,
                                  item.audioFiles.filter(
                                    (f) => f.uid !== file.uid,
                                  ),
                                );
                              }}
                              className="mt-1"
                            >
                              <Button icon={<UploadOutlined />} size="small">
                                选择音频{" "}
                                {item.audioFiles.length > 0 &&
                                  `(${item.audioFiles.length}/5)`}
                              </Button>
                            </Upload>
                          </div>
                        </div>
                      ))}
                    </Space>

                    {cloneItems.length < 5 && (
                      <Button
                        icon={<PlusOutlined />}
                        onClick={addCloneItem}
                        block
                        type="dashed"
                      >
                        添加音色克隆项 ({cloneItems.length}/5)
                      </Button>
                    )}

                    <Text type="secondary" className="text-xs block">
                      <div className="space-y-1">
                        <div>✓ 每个音色都需要独立的 Voice ID</div>
                        <div>
                          ✓ 每个音色可上传多个音频（最多5个），会自动合并
                        </div>
                        <div>✓ 音频要求：清晰的单人语音，时长 10秒-5分钟</div>
                        <div>✓ 可同时克隆最多 5 个不同的音色</div>
                      </div>
                    </Text>

                    <Button
                      type="primary"
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
            </div>
          )}

          {status === "idle" && (
            <div className="space-y-4">
              <Title level={5}>其他选项</Title>

              <div className="flex items-start gap-4">
                <Text className="whitespace-nowrap pt-2">播客时长（分钟）</Text>
                <div className="flex-1 px-4">
                  <Slider
                    range
                    min={1}
                    max={15}
                    value={durationRange}
                    onChange={(value) =>
                      setDurationRange(value as [number, number])
                    }
                    marks={{
                      1: "1",
                      3: "3",
                      5: "5",
                      10: "10",
                      15: "15",
                    }}
                    tooltip={{
                      formatter: (value) => `${value} 分钟`,
                    }}
                  />
                  <Text type="secondary" className="text-xs">
                    当前: {durationRange[0]} - {durationRange[1]} 分钟
                  </Text>
                </div>
              </div>

              {/* <div className="flex items-center justify-between">
              <Text>生成背景音乐</Text>
              <Switch
                checked={generateMusic}
                onChange={setGenerateMusic}
              />
            </div>
            <Text type="secondary" className="text-xs mt-2">
              注意：背景音乐功能待实现
            </Text> */}
            </div>
          )}

          {/* 进度显示 */}
          {status === "loading" && (
            <div className="space-y-4">
              <Title level={5}>
                {stageNames[stage] || stage}
                {stage === "tts" && ` (${ttsCompleted}/${ttsTotal})`}
              </Title>
              <Progress percent={stageProgress} status="active" />

              <Collapse ghost className="mt-4" defaultActiveKey={["logs"]}>
                <Panel header="详细日志" key="logs">
                  <div className="max-h-64 overflow-y-auto space-y-1 bg-gray-50 p-2 rounded">
                    {logs.map((log, index) => (
                      <div key={index} className="text-sm text-gray-700">
                        {log}
                      </div>
                    ))}
                  </div>
                </Panel>
              </Collapse>
            </div>
          )}

          {/* 结果预览 */}
          {status === "complete" && audioUrl && (
            <div className="space-y-4">
              <Title level={5}>
                <SoundOutlined /> 播客音频
              </Title>
              <audio controls className="w-full mb-4">
                <source src={audioUrl} type="audio/wav" />
              </audio>
              <Text type="secondary">
                时长: {Math.floor(duration / 60)}:
                {(duration % 60).toString().padStart(2, "0")}
              </Text>

              <Collapse ghost className="mt-4">
                <Panel
                  header={
                    <>
                      <FileTextOutlined /> 查看脚本
                    </>
                  }
                  key="script"
                >
                  <div className="max-h-96 overflow-y-auto space-y-2 bg-gray-50 p-4 rounded whitespace-pre-wrap">
                    {script.split("\n").map((line, index) => (
                      <div key={index}>{line}</div>
                    ))}
                  </div>
                </Panel>
              </Collapse>
            </div>
          )}

          {/* 错误显示 */}
          {status === "error" && (
            <div className="space-y-4">
              <Title level={5}>生成失败</Title>
              <Text type="danger">请查看日志了解详情</Text>
              <Collapse ghost className="mt-4" defaultActiveKey={["logs"]}>
                <Panel header="详细日志" key="logs">
                  <div className="max-h-64 overflow-y-auto space-y-1 bg-gray-50 p-2 rounded">
                    {logs.map((log, index) => (
                      <div key={index} className="text-sm text-gray-700">
                        {log}
                      </div>
                    ))}
                  </div>
                </Panel>
              </Collapse>
            </div>
          )}
        </div>
      </Modal>
    );
  },
);

export default PodcastGenerationModal;
