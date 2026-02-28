import { useState, useCallback } from "react";
import { message } from "antd";
import type { PodcastSpeaker, PodcastScriptLine } from "@/types/podcast";
import type { PodcastGenerationProgress } from "@/types/minimax";
import type { TTSVoice } from "@/types/tts";
import { generateScriptStream, parseScript } from "@/services/podcast";
import {
  arrayBufferToAudioBuffer,
  mergeAudioBuffers,
  audioBufferToBlob,
  getAudioDuration,
} from "@/utils/audio-processor";
import { useLLMConfig } from "@/hooks/useLLMConfig";
import useUploadResource from "@/hooks/useUploadResource";
import {
  replacePodcastSegment,
  saveTempSegment,
} from "@/commands/podcast-audio";
import { readBinaryFile, getHomeDir } from "@/commands";
import { remoteResourceToLocal } from "@/utils/resouce";
import { TTSProviderFactory } from "@/utils/tts";
import useSettingStore from "@/stores/useSettingStore";

interface PodcastGenerationState {
  status: "idle" | "loading" | "error" | "complete";
  stage: PodcastGenerationProgress["stage"];
  stageProgress: number;
  ttsTotal: number;
  ttsCompleted: number;
  logs: string[];
  script: string;
  scriptLines: PodcastScriptLine[];
  segmentAudios: Blob[];
  error: string | null;
  audioUrl: string | null;
  duration: number;
}

interface PodcastGenerationParams {
  content: string;
  speakers: PodcastSpeaker[];
  generateMusic: boolean;
  durationMin?: number;
  durationMax?: number;
}

export const usePodcastGeneration = () => {
  const [state, setState] = useState<PodcastGenerationState>({
    status: "idle",
    stage: "parsing",
    stageProgress: 0,
    ttsTotal: 0,
    ttsCompleted: 0,
    logs: [],
    script: "",
    scriptLines: [],
    segmentAudios: [],
    error: null,
    audioUrl: null,
    duration: 0,
  });

  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);

  const { providerConfig, modelConfig } = useLLMConfig("podcastGeneration");
  const podcastTTS = useSettingStore(
    (state) => state.setting.integration.podcastTTS,
  );
  const uploadResource = useUploadResource();

  const addLog = useCallback((log: string) => {
    setState((prev) => ({
      ...prev,
      logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] ${log}`],
    }));
  }, []);

  const updateProgress = useCallback(
    (updates: Partial<PodcastGenerationState>) => {
      setState((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

  // 加载音色列表
  const loadVoices = useCallback(async () => {
    const ttsProvider = TTSProviderFactory.getTTSProvider();
    if (!ttsProvider) {
      message.error("请先配置 TTS 服务提供商");
      return;
    }

    if (!ttsProvider.isConfigured()) {
      message.error("TTS 服务提供商配置不完整");
      return;
    }

    setVoicesLoading(true);
    try {
      const voiceList = await ttsProvider.getVoiceList();
      setVoices(voiceList);
      addLog(
        `成功加载 ${voiceList.length} 个音色 (${ttsProvider.getProviderName()})`,
      );
    } catch (error) {
      console.error("加载音色列表失败:", error);
      message.error("加载音色列表失败");
    } finally {
      setVoicesLoading(false);
    }
  }, [addLog]);

  // 手动添加音色到列表（用于刚克隆的音色）
  const addVoiceToList = useCallback((voiceId: string, voiceName?: string) => {
    const ttsProvider = TTSProviderFactory.getTTSProvider();
    const newVoice: TTSVoice = {
      id: voiceId,
      name: voiceName || voiceId,
      description: "自定义克隆音色",
      type: "cloned",
      provider: ttsProvider?.getProviderName() ?? ("minimax" as any),
    };

    // 添加到列表最前面，并去重
    setVoices((prev) => {
      const filtered = prev.filter((v) => v.id !== voiceId);
      return [newVoice, ...filtered];
    });
  }, []);

  // 生成播客
  const generatePodcast = useCallback(
    async (params: PodcastGenerationParams) => {
      const {
        content,
        speakers,
        // generateMusic,
        durationMin = 3,
        durationMax = 5,
      } = params;

      // 验证参数
      const ttsProvider = TTSProviderFactory.getTTSProvider();
      if (!ttsProvider || !ttsProvider.isConfigured()) {
        message.error("请先配置 TTS 服务提供商");
        return;
      }

      if (!providerConfig || !modelConfig) {
        message.error("请先配置播客生成的 LLM 模型");
        return;
      }

      if (speakers.length < 2) {
        message.error("至少需要 2 个说话人");
        return;
      }

      if (speakers.some((s) => !s.voiceId)) {
        message.error("请为所有说话人选择音色");
        return;
      }

      // 重置状态
      setState({
        status: "loading",
        stage: "parsing",
        stageProgress: 0,
        ttsTotal: 0,
        ttsCompleted: 0,
        logs: [],
        script: "",
        scriptLines: [],
        segmentAudios: [],
        error: null,
        audioUrl: null,
        duration: 0,
      });

      try {
        // 1. 解析内容
        addLog("开始解析内容...");
        updateProgress({ stage: "parsing", stageProgress: 100 });
        addLog("内容解析完成");

        // 2. 生成脚本
        addLog("开始生成播客脚本...");
        updateProgress({ stage: "script", stageProgress: 0 });

        let fullScript = "";

        await new Promise<void>((resolve, reject) => {
          generateScriptStream(
            content,
            speakers,
            providerConfig,
            modelConfig,
            (chunk: string) => {
              fullScript += chunk;
              setState((prev) => ({ ...prev, script: fullScript }));
            },
            () => {
              updateProgress({ stageProgress: 100 });
              addLog("脚本生成完成");
              resolve();
            },
            (error: Error) => {
              reject(error);
            },
            {
              provider: podcastTTS.active,
              minimaxModel: podcastTTS.minimaxModel,
            },
            durationMin,
            durationMax,
          );
        });

        console.log("fullScript", fullScript);

        // 3. 解析脚本
        const scriptLines = parseScript(fullScript, speakers);
        if (scriptLines.length === 0) {
          throw new Error("脚本解析失败，未找到有效的对话行");
        }

        // 更新状态中的 scriptLines，以便用户可以编辑
        setState((prev) => ({
          ...prev,
          scriptLines,
          status: "loading", // 保持 loading 状态，等待用户确认继续
        }));

        addLog(`解析得到 ${scriptLines.length} 条对话`);

        // 自动继续生成音频 (如果不需要手动干预的话，或者这里可以暂停等待用户点击下一步)
        // 目前逻辑保持自动继续，后续 UI 层可以控制流程
        // await continueWithTTS(scriptLines, generateMusic);
        // 修改为暂停等待用户确认
        setState((prev) => ({
          ...prev,
          status: "loading",
        }));
      } catch (error) {
        console.error("播客生成失败:", error);
        const errorMessage =
          error instanceof Error ? error.message : "未知错误";
        setState((prev) => ({
          ...prev,
          status: "error",
          error: errorMessage,
        }));
        addLog(`错误: ${errorMessage}`);
        message.error(`播客生成失败: ${errorMessage}`);
      }
    },
    [
      providerConfig,
      modelConfig,
      podcastTTS,
      addLog,
      updateProgress,
      uploadResource,
    ],
  );

  // 继续 TTS 合成 (用于脚本编辑后继续)
  const continueWithTTS = useCallback(
    async (lines: typeof state.scriptLines, generateMusic: boolean) => {
      const ttsProvider = TTSProviderFactory.getTTSProvider();
      if (!ttsProvider || !ttsProvider.isConfigured()) {
        message.error("请先配置 TTS 服务提供商");
        return;
      }

      try {
        // 4. TTS 合成
        addLog(`开始合成语音 (${ttsProvider.getProviderName()})...`);
        updateProgress({
          stage: "tts",
          stageProgress: 0,
          ttsTotal: lines.length,
          ttsCompleted: 0,
        });

        const audioContext = new AudioContext();
        const audioBuffers: AudioBuffer[] = [];
        const segmentAudios: Blob[] = [];
        let currentTime = 0;

        // 使用传入的 lines，因为可能已经被编辑过
        const currentLines = [...lines];

        for (let i = 0; i < currentLines.length; i++) {
          const line = currentLines[i];
          addLog(
            `[${i + 1}/${currentLines.length}] ${line.speaker}: ${line.text.substring(0, 30)}...`,
          );

          try {
            const audioData = await ttsProvider.synthesizeSpeech(
              line.text,
              line.voiceId,
            );
            const audioBuffer = await arrayBufferToAudioBuffer(
              audioContext,
              audioData,
            );

            // 记录时间信息
            const duration = audioBuffer.duration;
            currentLines[i].startTime = currentTime;
            currentLines[i].duration = duration;
            currentTime += duration;

            // 保存音频数据
            audioBuffers.push(audioBuffer);
            const segmentBlob = await audioBufferToBlob(audioBuffer);
            segmentAudios.push(segmentBlob);

            updateProgress({
              ttsCompleted: i + 1,
              stageProgress: Math.floor(((i + 1) / currentLines.length) * 100),
              scriptLines: currentLines, // 实时更新时间信息
              segmentAudios: [...segmentAudios], // 实时更新片段音频
            });
          } catch (error) {
            console.error(`合成第 ${i + 1} 条语音失败:`, error);
            addLog(`[警告] 第 ${i + 1} 条语音合成失败，跳过`);
            // 即使失败也需要占位，避免索引错乱
            // 这里简单处理为跳过，实际可能需要占位符或者重试机制
          }
        }

        if (audioBuffers.length === 0) {
          throw new Error("没有成功合成任何语音");
        }

        addLog("语音合成完成");

        // 5. 合并音频
        addLog("开始合并音频...");
        updateProgress({ stage: "merging", stageProgress: 0 });

        const mergedBuffer = await mergeAudioBuffers(
          audioContext,
          audioBuffers,
        );
        const totalDuration = getAudioDuration(mergedBuffer);

        updateProgress({ stageProgress: 50 });
        addLog(`音频合并完成，总时长: ${Math.floor(totalDuration)} 秒`);

        // 6. 转换为 Blob
        updateProgress({ stageProgress: 75 });
        const audioBlob = await audioBufferToBlob(mergedBuffer);

        // 7. 上传音频
        addLog("开始上传音频...");
        updateProgress({ stage: "upload", stageProgress: 0 });

        const audioFile = new File([audioBlob], `podcast_${Date.now()}.wav`, {
          type: "audio/wav",
        });
        const audioUrl = await uploadResource(audioFile);

        if (!audioUrl) {
          throw new Error("音频上传失败");
        }

        updateProgress({ stageProgress: 100 });
        addLog("音频上传完成");

        // 8. 完成
        setState((prev) => ({
          ...prev,
          status: "complete",
          stage: "complete",
          stageProgress: 100,
          audioUrl,
          duration: Math.floor(totalDuration),
          scriptLines: currentLines,
          segmentAudios,
        }));

        addLog("播客生成成功！");
        message.success("播客生成成功！");

        if (generateMusic) {
          addLog("注意：背景音乐生成功能待实现");
        }
      } catch (error) {
        console.error("TTS合成失败:", error);
        const errorMessage =
          error instanceof Error ? error.message : "未知错误";
        setState((prev) => ({
          ...prev,
          status: "error",
          error: errorMessage,
        }));
        addLog(`错误: ${errorMessage}`);
        message.error(`生成失败: ${errorMessage}`);
      }
    },
    [addLog, state, updateProgress, uploadResource],
  );

  // 更新脚本行 (用于编辑)
  const updateScriptLines = useCallback((lines: PodcastScriptLine[]) => {
    setState((prev) => ({ ...prev, scriptLines: lines }));
  }, []);

  // 重新生成单个片段
  const regenerateSegment = useCallback(
    async (index: number, newText: string) => {
      const ttsProvider = TTSProviderFactory.getTTSProvider();
      if (!ttsProvider || !ttsProvider.isConfigured() || !state.audioUrl)
        return;

      try {
        addLog(`正在重新生成第 ${index + 1} 段语音...`);

        // 1. 合成新语音
        const audioData = await ttsProvider.synthesizeSpeech(
          newText,
          state.scriptLines[index].voiceId,
        );

        const audioContext = new AudioContext();
        const audioBuffer = await arrayBufferToAudioBuffer(
          audioContext,
          audioData,
        );
        const newDuration = audioBuffer.duration;
        const newSegmentBlob = await audioBufferToBlob(audioBuffer);

        // 2. 保存新片段到临时文件 (通过后端)
        // 需要先将 Blob 转为 ArrayBuffer
        const arrayBuffer = await newSegmentBlob.arrayBuffer();
        const { tempPath: newSegmentPath } = await saveTempSegment(arrayBuffer);

        // 3. 获取原始音频路径
        let localAudioPath = "";
        if (state.audioUrl.startsWith("http")) {
          localAudioPath = await remoteResourceToLocal(state.audioUrl);
        } else if (state.audioUrl.startsWith("~")) {
          const homeDir = await getHomeDir();
          localAudioPath = `${homeDir}${state.audioUrl.slice(1)}`;
        } else {
          localAudioPath = state.audioUrl;
        }

        if (state.segmentAudios.length > 0) {
          // 前端快速替换
          const newSegmentAudios = [...state.segmentAudios];
          newSegmentAudios[index] = newSegmentBlob;

          // 更新 scriptLines
          const newScriptLines = [...state.scriptLines];
          const oldDuration = newScriptLines[index].duration;
          const timeDiff = newDuration - oldDuration;

          newScriptLines[index] = {
            ...newScriptLines[index],
            text: newText,
            duration: newDuration,
          };

          // 更新后续时间戳
          for (let i = index + 1; i < newScriptLines.length; i++) {
            newScriptLines[i] = {
              ...newScriptLines[i],
              startTime: newScriptLines[i].startTime + timeDiff,
            };
          }

          // 重新合并所有
          // 需要重新从 blobs 转 buffers
          const newBuffers = await Promise.all(
            newSegmentAudios.map(async (blob) => {
              const ab = await blob.arrayBuffer();
              return await arrayBufferToAudioBuffer(audioContext, ab);
            }),
          );

          const mergedBuffer = await mergeAudioBuffers(
            audioContext,
            newBuffers,
          );
          const totalDuration = getAudioDuration(mergedBuffer);
          const mergedBlob = await audioBufferToBlob(mergedBuffer);

          // 重新上传
          const audioFile = new File(
            [mergedBlob],
            `podcast_updated_${Date.now()}.wav`,
            {
              type: "audio/wav",
            },
          );
          const newAudioUrl = await uploadResource(audioFile);

          if (newAudioUrl) {
            setState((prev) => ({
              ...prev,
              scriptLines: newScriptLines,
              segmentAudios: newSegmentAudios,
              audioUrl: newAudioUrl,
              duration: Math.floor(totalDuration),
            }));
            addLog(`第 ${index + 1} 段语音替换完成`);
            message.success("片段替换成功");
          }
        } else {
          // 后端 FFmpeg 替换逻辑
          const { outputPath } = await replacePodcastSegment(
            localAudioPath,
            newSegmentPath,
            state.scriptLines[index].startTime,
            state.scriptLines[index].duration,
          );

          // 读取新文件并上传
          const newAudioBuffer = await readBinaryFile(outputPath);
          const newAudioFile = new File(
            [newAudioBuffer as any],
            `podcast_updated_${Date.now()}.mp3`,
            {
              type: "audio/mpeg",
            },
          );
          const newAudioUrl = await uploadResource(newAudioFile);

          // 更新 scriptLines
          const newScriptLines = [...state.scriptLines];
          const oldDuration = newScriptLines[index].duration;
          const timeDiff = newDuration - oldDuration; // 注意：这里用的是新生成的 duration - 旧 duration
          // 等等，newDuration 是新生成的片段时长
          // oldDuration 是 scriptLines[index].duration
          // timeDiff = newDuration - oldDuration 是正确的

          newScriptLines[index] = {
            ...newScriptLines[index],
            text: newText,
            duration: newDuration,
          };

          // 更新后续时间戳
          for (let i = index + 1; i < newScriptLines.length; i++) {
            newScriptLines[i] = {
              ...newScriptLines[i],
              startTime: newScriptLines[i].startTime + timeDiff,
            };
          }

          if (newAudioUrl) {
            setState((prev) => ({
              ...prev,
              scriptLines: newScriptLines,
              audioUrl: newAudioUrl,
              // 清空 segmentAudios，因为是后端 FFmpeg 处理，需要重新从完整音频提取
              segmentAudios: [],
              duration: prev.duration + timeDiff,
            }));
            addLog(`第 ${index + 1} 段语音替换完成`);
            message.success("片段替换成功");
          }
        }
      } catch (error) {
        console.error("片段重生成失败:", error);
        message.error("片段重生成失败");
      }
    },
    [
      state.audioUrl,
      state.scriptLines,
      state.segmentAudios,
      uploadResource,
      addLog,
    ],
  );

  const setInitialState = useCallback(
    (initialState: Partial<PodcastGenerationState>) => {
      setState((prev) => ({
        ...prev,
        ...initialState,
      }));
    },
    [],
  );

  // 重置状态
  const reset = useCallback(() => {
    setState({
      status: "idle",
      stage: "parsing",
      stageProgress: 0,
      ttsTotal: 0,
      ttsCompleted: 0,
      logs: [],
      script: "",
      scriptLines: [],
      segmentAudios: [],
      error: null,
      audioUrl: null,
      duration: 0,
    });
  }, []);

  return {
    ...state,
    voices,
    voicesLoading,
    loadVoices,
    addVoiceToList,
    generatePodcast,
    continueWithTTS,
    updateScriptLines,
    regenerateSegment,
    reset,
    setInitialState,
  };
};

export default usePodcastGeneration;
