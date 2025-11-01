import { useState, useCallback } from "react";
import { message } from "antd";
import type { PodcastSpeaker } from "@/types/podcast";
import type { PodcastGenerationProgress, MinimaxVoice } from "@/types/minimax";
import {
  getVoiceList,
  generateScriptStream,
  synthesizeSpeech,
  parseScript,
} from "@/services/minimax";
import {
  arrayBufferToAudioBuffer,
  mergeAudioBuffers,
  audioBufferToBlob,
  getAudioDuration,
} from "@/utils/audio-processor";
import { useLLMConfig } from "@/hooks/useLLMConfig";
import useSettingStore from "@/stores/useSettingStore";
import useUploadResource from "@/hooks/useUploadResource";

interface PodcastGenerationState {
  status: "idle" | "loading" | "error" | "complete";
  stage: PodcastGenerationProgress["stage"];
  stageProgress: number;
  ttsTotal: number;
  ttsCompleted: number;
  logs: string[];
  script: string;
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
    error: null,
    audioUrl: null,
    duration: 0,
  });

  const [voices, setVoices] = useState<MinimaxVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);

  const { providerConfig, modelConfig } = useLLMConfig("podcastGeneration");
  const minimaxApiKey = useSettingStore(
    (state) => state.setting.integration.minimax.apiKey,
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
    if (!minimaxApiKey) {
      message.error("请先配置 Minimax API Key");
      return;
    }

    setVoicesLoading(true);
    try {
      const voiceList = await getVoiceList(minimaxApiKey);
      setVoices(voiceList);
      addLog(`成功加载 ${voiceList.length} 个音色`);
    } catch (error) {
      console.error("加载音色列表失败:", error);
      message.error("加载音色列表失败");
    } finally {
      setVoicesLoading(false);
    }
  }, [minimaxApiKey, addLog]);

  // 手动添加音色到列表（用于刚克隆的音色）
  const addVoiceToList = useCallback((voiceId: string, voiceName?: string) => {
    const newVoice: MinimaxVoice = {
      voice_id: voiceId,
      voice_name: voiceName || voiceId,
      description: ["自定义克隆音色"],
      created_time: new Date().toISOString(),
      voice_type: "voice_cloning",
    };

    // 添加到列表最前面，并去重
    setVoices((prev) => {
      const filtered = prev.filter((v) => v.voice_id !== voiceId);
      return [newVoice, ...filtered];
    });
  }, []);

  // 生成播客
  const generatePodcast = useCallback(
    async (params: PodcastGenerationParams) => {
      const {
        content,
        speakers,
        generateMusic,
        durationMin = 3,
        durationMax = 5,
      } = params;

      // 验证参数
      if (!minimaxApiKey) {
        message.error("请先配置 Minimax API Key");
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

        addLog(`解析得到 ${scriptLines.length} 条对话`);

        // 4. TTS 合成
        addLog("开始合成语音...");
        updateProgress({
          stage: "tts",
          stageProgress: 0,
          ttsTotal: scriptLines.length,
          ttsCompleted: 0,
        });

        const audioContext = new AudioContext();
        const audioBuffers: AudioBuffer[] = [];

        for (let i = 0; i < scriptLines.length; i++) {
          const line = scriptLines[i];
          addLog(
            `[${i + 1}/${scriptLines.length}] ${line.speaker}: ${line.text.substring(0, 30)}...`,
          );

          try {
            const audioData = await synthesizeSpeech(
              line.text,
              line.voiceId,
              minimaxApiKey,
            );
            const audioBuffer = await arrayBufferToAudioBuffer(
              audioContext,
              audioData,
            );
            audioBuffers.push(audioBuffer);

            updateProgress({
              ttsCompleted: i + 1,
              stageProgress: Math.floor(((i + 1) / scriptLines.length) * 100),
            });
          } catch (error) {
            console.error(`合成第 ${i + 1} 条语音失败:`, error);
            addLog(`[警告] 第 ${i + 1} 条语音合成失败，跳过`);
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
        const duration = getAudioDuration(mergedBuffer);

        updateProgress({ stageProgress: 50 });
        addLog(`音频合并完成，总时长: ${Math.floor(duration)} 秒`);

        // 6. 转换为 Blob
        updateProgress({ stageProgress: 75 });
        const audioBlob = await audioBufferToBlob(mergedBuffer);

        // 7. 上传音频
        addLog("开始上传音频...");
        updateProgress({ stage: "upload", stageProgress: 0 });

        const audioFile = new File([audioBlob], "podcast.wav", {
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
          duration: Math.floor(duration),
          script: fullScript,
        }));

        addLog("播客生成成功！");
        message.success("播客生成成功！");

        // TODO: 如果启用了音乐生成，这里可以添加背景音乐
        if (generateMusic) {
          addLog("注意：背景音乐生成功能待实现");
        }
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
      minimaxApiKey,
      providerConfig,
      modelConfig,
      addLog,
      updateProgress,
      uploadResource,
    ],
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
    reset,
  };
};

export default usePodcastGeneration;
