import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "@tau/ui";
import type { PodcastSpeaker, PodcastScriptLine } from "@/types/podcast";
import type { PodcastGenerationProgress } from "@/types/podcast";
import type { TTSVoice, ITTSProvider } from "@/types/tts";
import { parseScript } from "@/services/podcast";
import {
  loadSpeechSegment,
  mergeSpeechSegments,
  speechSegmentToBlob,
  type SpeechSegment,
} from "@/utils/audio-processor";
import { useLLMConfig } from "@/hooks/useLLMConfig";
import useUploadResource from "@/hooks/useUploadResource";
import { replacePodcastSegment, saveTempSegment } from "@/commands/podcast-audio";
import { readBinaryFile, getHomeDir } from "@/commands";
import { remoteResourceToLocal } from "@/utils/resouce";
import { TTSProviderFactory } from "@/utils/tts";
import { useMemoizedFn } from "ahooks";
import { runGenerationTask } from "@/services/generation-orchestrator";

interface PodcastGenerationState {
  status: "idle" | "loading" | "error" | "complete";
  stage: PodcastGenerationProgress["stage"];
  stageProgress: number;
  ttsTotal: number;
  ttsCompleted: number;
  logs: string[];
  script: string;
  scriptLines: PodcastScriptLine[];
  segmentAudios: (Blob | null)[];
  error: string | null;
  audioUrl: string | null;
  duration: number;
}

interface PodcastGenerationParams {
  content?: string;
  resourceNames?: string[];
  userPrompt?: string;
  enableTools?: boolean;
  speakers: PodcastSpeaker[];
  generateMusic: boolean;
  durationMin?: number;
  durationMax?: number;
}

interface PodcastFlow {
  controller: AbortController;
  provider: ITTSProvider;
  busy: boolean;
}
export const usePodcastGeneration = () => {
  const flowRef = useRef<PodcastFlow | null>(null);
  const stopFlow = useCallback(() => {
    const flow = flowRef.current;
    flowRef.current = null;
    flow?.controller.abort();
    void flow?.provider.synthesis
      ?.dispose?.()
      .catch(error => console.error("回收播客语音任务失败", error));
  }, []);
  useEffect(() => stopFlow, [stopFlow]);
  const startFlow = useCallback(
    (provider: ITTSProvider) => {
      stopFlow();
      const flow = { provider, controller: new AbortController(), busy: false };
      flowRef.current = flow;
      return flow;
    },
    [stopFlow]
  );
  const assertFlow = useCallback((flow: PodcastFlow) => {
    flow.controller.signal.throwIfAborted();
    flow.provider.synthesis?.signal?.throwIfAborted();
    if (flowRef.current !== flow) throw new DOMException("播客任务已替换", "AbortError");
  }, []);
  const flowSignal = useCallback(
    (flow: PodcastFlow) =>
      AbortSignal.any([
        flow.controller.signal,
        ...(flow.provider.synthesis?.signal ? [flow.provider.synthesis.signal] : []),
      ]),
    []
  );
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

  const { provider, model } = useLLMConfig("podcastGeneration");
  const uploadResource = useUploadResource();

  const addLog = useCallback((log: string) => {
    setState(prev => ({
      ...prev,
      logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] ${log}`],
    }));
  }, []);

  const updateProgress = useCallback((updates: Partial<PodcastGenerationState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // 加载音色列表
  const loadVoices = useCallback(async () => {
    const synthesizer = TTSProviderFactory.getSpeechSynthesizer();
    if (!synthesizer) {
      toast.error("请先配置 TTS 服务提供商");
      return;
    }

    setVoicesLoading(true);
    try {
      const voiceList = await synthesizer.getVoiceList();
      setVoices(voiceList);
      addLog(`成功加载 ${voiceList.length} 个音色 (${TTSProviderFactory.getActiveProviderType()})`);
    } catch (error) {
      console.error("加载音色列表失败:", error);
      toast.error("加载音色列表失败");
    } finally {
      setVoicesLoading(false);
    }
  }, [addLog]);

  // 手动添加音色到列表（用于刚克隆的音色）
  const addVoiceToList = useCallback((voiceId: string, voiceName?: string, providerId?: string) => {
    const newVoice: TTSVoice = {
      id: voiceId,
      name: voiceName || voiceId,
      description: "自定义克隆音色",
      type: "cloned",
      provider: providerId ?? "",
    };

    // 添加到列表最前面，并去重
    setVoices(prev => {
      const filtered = prev.filter(v => v.id !== voiceId);
      return [newVoice, ...filtered];
    });
  }, []);

  // 生成播客（返回错误信息字符串，undefined 表示成功启动）
  const generatePodcast = useMemoizedFn(
    async (params: PodcastGenerationParams): Promise<string | undefined> => {
      const {
        content,
        resourceNames,
        userPrompt,
        enableTools = false,
        speakers,
        // generateMusic,
        durationMin = 3,
        durationMax = 5,
      } = params;

      // 验证参数
      const selectedTTS = TTSProviderFactory.getTTSProvider();
      if (!selectedTTS?.synthesis) {
        return "请先配置 TTS 服务提供商";
      }

      if (!provider || !model) {
        return "请先配置播客生成的 LLM 模型";
      }

      if (!content?.trim() && (!resourceNames || resourceNames.length === 0)) {
        return "缺少可用于生成播客的内容或资源";
      }

      if (speakers.length < 2) {
        return "至少需要 2 个说话人";
      }

      if (speakers.some(s => !s.voiceId)) {
        return "请为所有说话人选择音色";
      }

      if (flowRef.current?.busy) return "已有播客任务正在进行";
      const flow = startFlow(selectedTTS);
      flow.busy = true;
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
        const ttsPromptOptions = {
          textInstructions:
            (await flow.provider.getTextInstructions?.(flow.controller.signal)) ??
            "只输出可朗读的纯文本，不加入语音控制标签。",
        };
        assertFlow(flow);
        const generationSignal = flowSignal(flow);

        await new Promise<void>((resolve, reject) => {
          const abort = () => reject(generationSignal.reason);
          generationSignal.addEventListener("abort", abort, { once: true });
          runGenerationTask(
            provider,
            model,
            {
              taskType: "podcast",
              sourceType: enableTools ? "vibe_learning" : "provided_content",
              taskPayload: {
                speakers,
                // prompt 标签规则须与实际合成引擎对齐，从当前语音服务派生
                ttsPromptOptions,
                durationMin,
                durationMax,
              },
              sourcePayload: enableTools
                ? {
                    resourceNames: resourceNames || [],
                    userPrompt,
                  }
                : {
                    content: content || "",
                    userPrompt,
                  },
            },
            {
              onController: controller => {
                if (generationSignal.aborted) controller.abort();
                else
                  generationSignal.addEventListener("abort", () => controller.abort(), {
                    once: true,
                  });
              },
              onUpdate: (responseText: string) => {
                if (generationSignal.aborted || flowRef.current !== flow) return;
                fullScript = responseText;
                setState(prev => ({ ...prev, script: responseText }));
              },
              onFinish: () => {
                generationSignal.removeEventListener("abort", abort);
                if (generationSignal.aborted || flowRef.current !== flow) {
                  reject(new DOMException("任务已结束", "AbortError"));
                  return;
                }
                updateProgress({ stageProgress: 100 });
                addLog("脚本生成完成");
                resolve();
              },
              onError: (error: Error) => {
                generationSignal.removeEventListener("abort", abort);
                reject(error);
              },
            }
          );
        });

        assertFlow(flow);
        // 3. 解析脚本
        const scriptLines = parseScript(fullScript, speakers);
        if (scriptLines.length === 0) {
          throw new Error("脚本解析失败，未找到有效的对话行");
        }

        // 更新状态中的 scriptLines，以便用户可以编辑
        setState(prev => ({
          ...prev,
          scriptLines,
          status: "loading", // 保持 loading 状态，等待用户确认继续
        }));

        addLog(`解析得到 ${scriptLines.length} 条对话`);
      } catch (error) {
        if (flow.controller.signal.aborted || flowRef.current !== flow) return;
        stopFlow();
        console.error("播客生成失败:", error);
        const errorMessage = error instanceof Error ? error.message : "未知错误";
        setState(prev => ({
          ...prev,
          status: "error",
          error: errorMessage,
        }));
        addLog(`错误: ${errorMessage}`);
        toast.error(`播客生成失败: ${errorMessage}`);
      } finally {
        flow.busy = false;
      }
    }
  );

  // 继续 TTS 合成 (用于脚本编辑后继续，返回错误信息字符串)
  const continueWithTTS = useMemoizedFn(
    async (
      lines: typeof state.scriptLines,
      generateMusic: boolean
    ): Promise<string | undefined> => {
      const ttsProvider = flowRef.current?.provider ?? TTSProviderFactory.getTTSProvider();
      if (!ttsProvider || !ttsProvider.isConfigured()) {
        return "请先配置 TTS 服务提供商";
      }

      const flow = flowRef.current ?? startFlow(ttsProvider);
      if (flow.busy) return "已有播客任务正在进行";
      flow.busy = true;
      let audioContext: AudioContext | undefined;
      try {
        assertFlow(flow);
        // 4. TTS 合成
        addLog(`开始合成语音 (${ttsProvider.getProviderName()})...`);
        updateProgress({
          stage: "tts",
          stageProgress: 0,
          ttsTotal: lines.length,
          ttsCompleted: 0,
        });

        audioContext = new AudioContext();
        const segments: SpeechSegment[] = [];
        const segmentAudios: (Blob | null)[] = Array(lines.length).fill(null);
        let currentTime = 0;

        // 使用传入的 lines，因为可能已经被编辑过
        const currentLines = lines.map(line => ({ ...line, startTime: 0, duration: 0 }));

        for (let i = 0; i < currentLines.length; i++) {
          assertFlow(flow);
          const line = currentLines[i];
          line.startTime = currentTime;
          addLog(
            `[${i + 1}/${currentLines.length}] ${line.speaker}: ${line.text.substring(0, 30)}...`
          );

          try {
            const audioData = await ttsProvider.synthesis!.synthesizeSpeech(
              line.text,
              line.voiceId,
              undefined,
              flow.controller.signal
            );
            const segment = await loadSpeechSegment(
              audioContext,
              audioData.audio.slice().buffer as ArrayBuffer
            );

            assertFlow(flow);
            // 记录时间信息
            currentLines[i].startTime = currentTime;
            currentLines[i].duration = segment.duration;
            currentTime += segment.duration;

            // 保存音频数据
            segments.push(segment);
            segmentAudios[i] = speechSegmentToBlob(segment);

            updateProgress({
              ttsCompleted: i + 1,
              stageProgress: Math.floor(((i + 1) / currentLines.length) * 100),
              scriptLines: currentLines.map(item => ({ ...item })),
              segmentAudios: [...segmentAudios], // 实时更新片段音频
            });
          } catch (error) {
            if (
              flow.controller.signal.aborted ||
              ttsProvider.synthesis?.signal?.aborted ||
              (error instanceof Error && error.name === "AbortError")
            )
              throw error;
            console.error(`合成第 ${i + 1} 条语音失败:`, error);
            addLog(`[警告] 第 ${i + 1} 条语音合成失败，跳过`);
          }
        }

        if (segments.length === 0) {
          throw new Error("没有成功合成任何语音");
        }

        addLog("语音合成完成");

        // 5. 合并音频
        addLog("开始合并音频...");
        updateProgress({ stage: "merging", stageProgress: 0 });

        const merged = await mergeSpeechSegments(audioContext, segments);
        assertFlow(flow);
        const totalDuration = merged.duration;

        updateProgress({ stageProgress: 75 });
        addLog(`音频合并完成，总时长: ${Math.floor(totalDuration)} 秒`);

        // 6. 上传音频
        addLog("开始上传音频...");
        updateProgress({ stage: "upload", stageProgress: 0 });

        const audioFile = new File([merged.blob], `podcast_${Date.now()}.${merged.ext}`, {
          type: merged.blob.type || "audio/wav",
        });
        const audioUrl = await uploadResource(audioFile, flowSignal(flow));
        assertFlow(flow);

        if (!audioUrl) {
          throw new Error("音频上传失败");
        }

        updateProgress({ stageProgress: 100 });
        addLog("音频上传完成");

        // 7. 完成
        setState(prev => ({
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
        toast.success("播客生成成功！");

        if (generateMusic) {
          addLog("注意：背景音乐生成功能待实现");
        }
      } catch (error) {
        if (flow.controller.signal.aborted || flowRef.current !== flow) return;
        console.error("TTS合成失败:", error);
        const errorMessage = error instanceof Error ? error.message : "未知错误";
        setState(prev => ({
          ...prev,
          status: "error",
          error: errorMessage,
        }));
        addLog(`错误: ${errorMessage}`);
        toast.error(`生成失败: ${errorMessage}`);
      } finally {
        if (flowRef.current === flow) stopFlow();
        try {
          await ttsProvider.synthesis?.dispose?.();
        } finally {
          await audioContext?.close();
        }
      }
    }
  );

  // 更新脚本行 (用于编辑)
  const updateScriptLines = useCallback((lines: PodcastScriptLine[]) => {
    setState(prev => ({ ...prev, scriptLines: lines }));
  }, []);

  // 重新生成单个片段
  const regenerateSegment = useCallback(
    async (index: number, newText: string) => {
      const selectedTTS = TTSProviderFactory.getTTSProvider();
      const synthesizer = selectedTTS?.synthesis;
      if (!selectedTTS || !synthesizer || !state.audioUrl || flowRef.current?.busy) return;
      const flow = startFlow(selectedTTS);
      flow.busy = true;
      let audioContext: AudioContext | undefined;

      try {
        addLog(`正在重新生成第 ${index + 1} 段语音...`);

        // 1. 合成新语音
        const audioData = await synthesizer.synthesizeSpeech(
          newText,
          state.scriptLines[index].voiceId,
          undefined,
          flow.controller.signal
        );

        assertFlow(flow);
        audioContext = new AudioContext();
        const newSegment = await loadSpeechSegment(
          audioContext,
          audioData.audio.slice().buffer as ArrayBuffer
        );
        const newDuration = newSegment.duration;
        const newSegmentBlob = speechSegmentToBlob(newSegment);

        assertFlow(flow);

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
          const newSegments = await Promise.all(
            newSegmentAudios
              .filter((blob): blob is Blob => blob !== null)
              .map(async blob => loadSpeechSegment(audioContext!, await blob.arrayBuffer()))
          );
          const merged = await mergeSpeechSegments(audioContext, newSegments);
          const totalDuration = merged.duration;

          // 重新上传
          const audioFile = new File([merged.blob], `podcast_updated_${Date.now()}.${merged.ext}`, {
            type: merged.blob.type || "audio/wav",
          });
          assertFlow(flow);
          const newAudioUrl = await uploadResource(audioFile, flowSignal(flow));
          assertFlow(flow);

          if (newAudioUrl) {
            setState(prev => ({
              ...prev,
              scriptLines: newScriptLines,
              segmentAudios: newSegmentAudios,
              audioUrl: newAudioUrl,
              duration: Math.floor(totalDuration),
            }));
            addLog(`第 ${index + 1} 段语音替换完成`);
            toast.success("片段替换成功");
          }
        } else {
          assertFlow(flow);
          // 2. 保存新片段到临时文件 (通过后端)
          const { tempPath: newSegmentPath } = await saveTempSegment(newSegment.data);

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

          assertFlow(flow);
          // 后端 FFmpeg 替换逻辑
          const { outputPath } = await replacePodcastSegment(
            localAudioPath,
            newSegmentPath,
            state.scriptLines[index].startTime,
            state.scriptLines[index].duration
          );

          // 读取新文件并上传
          const newAudioBuffer = await readBinaryFile(outputPath);
          const newAudioFile = new File(
            [newAudioBuffer as BlobPart],
            `podcast_updated_${Date.now()}.mp3`,
            {
              type: "audio/mpeg",
            }
          );
          assertFlow(flow);
          const newAudioUrl = await uploadResource(newAudioFile, flowSignal(flow));
          assertFlow(flow);

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

          if (newAudioUrl) {
            setState(prev => ({
              ...prev,
              scriptLines: newScriptLines,
              audioUrl: newAudioUrl,
              // 清空 segmentAudios，因为是后端 FFmpeg 处理，需要重新从完整音频提取
              segmentAudios: [],
              duration: prev.duration + timeDiff,
            }));
            addLog(`第 ${index + 1} 段语音替换完成`);
            toast.success("片段替换成功");
          }
        }
      } catch (error) {
        if (flow.controller.signal.aborted || flowRef.current !== flow) return;
        console.error("片段重生成失败:", error);
        toast.error("片段重生成失败");
      } finally {
        if (flowRef.current === flow) stopFlow();
        try {
          await synthesizer.dispose?.();
        } finally {
          await audioContext?.close();
        }
      }
    },
    [
      state.audioUrl,
      state.scriptLines,
      state.segmentAudios,
      uploadResource,
      addLog,
      startFlow,
      assertFlow,
      flowSignal,
      stopFlow,
    ]
  );

  const setInitialState = useCallback(
    (initialState: Partial<PodcastGenerationState>) => {
      stopFlow();
      setState(prev => ({
        ...prev,
        ...initialState,
      }));
    },
    [stopFlow]
  );

  // 重置状态
  const reset = useCallback(() => {
    stopFlow();
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
  }, [stopFlow]);

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
