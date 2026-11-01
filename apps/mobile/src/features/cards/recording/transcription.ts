import { useSyncExternalStore } from "react";
import { defaultSpeechInputSetting, type ASRAudioFile, type ASRTranscript } from "@tau/asr";
import type { ASRProviderRegistry } from "@tau/plugins/asr-host";
import type { AudioElement } from "@tau/editor/extensions/media";
import { copyJson } from "@tau/plugins/host";
import { isCollaborationResource } from "@tau/collaboration";
import { IResourceService } from "@tau/shared/host-services";
import {
  Editor as SlateEditor,
  Element as SlateElement,
  Path,
  Transforms,
  type Element as ElementNode,
} from "slate";
import { HistoryEditor } from "slate-history";
import { toast } from "../../../components/toast";
import { getMobileSettingSnapshot } from "../../../services/mobileSettingsBridge";
import {
  prepareTranscriptAudio,
  readTranscriptAudio,
  releaseTranscriptAudio,
} from "../../../services/recording";

export type TranscriptionTask = {
  status: "running" | "failed";
  /** 0…1；服务不报进度时为 null */
  fraction: number | null;
  stage: "preparing" | "uploading" | "recognizing";
  error?: string;
};

/** 「还不能转文字」面板的原因 */
export type TranscriptionUnavailable = { title: string; reason: string };

const tasks = new Map<string, TranscriptionTask>();
/** 发起转写的编辑器与识别注册表，失败后「重试」沿用 */
const origins = new Map<string, { editor: SlateEditor; registry: ASRProviderRegistry | null }>();
const controllers = new Map<string, AbortController>();
let unavailable: TranscriptionUnavailable | null = null;
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setTask(src: string, task: TranscriptionTask | null) {
  if (task) tasks.set(src, task);
  else tasks.delete(src);
  emit();
}

/** 音频块上的转写状态（运行时状态，不进文档） */
export function useTranscriptionTask(src: string): TranscriptionTask | null {
  useSyncExternalStore(subscribe, () => version);
  return tasks.get(src) ?? null;
}

export function useTranscriptionUnavailable(): TranscriptionUnavailable | null {
  useSyncExternalStore(subscribe, () => version);
  return unavailable;
}

export function closeTranscriptionUnavailable() {
  unavailable = null;
  emit();
}

function showUnavailable(title: string, reason: string) {
  unavailable = { title, reason };
  emit();
}

export function cancelTranscription(src: string) {
  controllers.get(src)?.abort(new DOMException("转写已取消", "AbortError"));
}

export function dismissTranscriptionError(src: string) {
  if (tasks.get(src)?.status !== "failed") return;
  origins.delete(src);
  setTask(src, null);
}

/** 失败后重试：按 src 在原编辑器里找回音频块 */
export function retryTranscription(src: string) {
  const origin = origins.get(src);
  dismissTranscriptionError(src);
  const element = origin ? findAudioElement(origin.editor, src) : null;
  if (origin && element) void transcribeAudioBlock(origin.editor, origin.registry, element);
}

function formatTimestamp(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${String(m).padStart(2, "0")}:${s}`;
}

function paragraph(text: string): ElementNode {
  return { type: "paragraph", children: [{ type: "formatted", text }] } as unknown as ElementNode;
}

/**
 * 文字稿折叠块：有分段时每段一个段落，没有时把全文按换行分段。
 * 协议里分段与时间都是可选的：只有每段都带开始时间时才在段首标时间，避免有的标有的不标。
 */
export function buildTranscriptBlock(transcript: ASRTranscript): ElementNode | null {
  const segments = (transcript.segments ?? []).filter(segment => segment.text.trim());
  const timed = segments.length > 0 && segments.every(segment => segment.startMs !== undefined);
  const lines = segments.length
    ? segments.map(segment =>
        timed
          ? `${formatTimestamp(segment.startMs ?? 0)}  ${segment.text.trim()}`
          : segment.text.trim()
      )
    : transcript.text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
  if (!lines.length) return null;
  return {
    type: "detail",
    title: "文字稿",
    open: true,
    children: lines.map(paragraph),
  } as unknown as ElementNode;
}

/** 插在音频块之后；块被删了就插到文末，文字稿不丢 */
function insertTranscript(editor: SlateEditor, element: AudioElement, block: ElementNode) {
  const collabId = (element as AudioElement & { collabId?: string }).collabId;
  const [entry] = SlateEditor.nodes(editor, {
    at: [],
    match: node => {
      if (!SlateElement.isElement(node) || node.type !== "audio") return false;
      const current = node as AudioElement & { collabId?: string };
      return element.uuid
        ? current.uuid === element.uuid
        : collabId
          ? current.collabId === collabId
          : current.src === element.src;
    },
  });
  const at = entry ? Path.next(entry[1]) : [editor.children.length];
  const insert = () => Transforms.insertNodes(editor, block, { at, select: false });
  if (HistoryEditor.isHistoryEditor(editor)) HistoryEditor.withNewBatch(editor, insert);
  else insert();
}

function formatLimit(ms: number) {
  return ms >= 3_600_000
    ? `${Math.round((ms / 3_600_000) * 10) / 10} 小时`
    : `${Math.max(1, Math.round(ms / 60_000))} 分钟`;
}

function errorText(error: unknown, fallback: string) {
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return text.replace(/^[A-Z_]+:/, "") || fallback;
}

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

/** 选中音频块 →「转文字」：识别整段，文字稿插在块下方 */
export async function transcribeAudioBlock(
  editor: SlateEditor,
  registry: ASRProviderRegistry | null,
  element: ElementNode
): Promise<void> {
  const audio = element as unknown as AudioElement;
  const src = audio.src;
  if (!src) return;
  if (tasks.get(src)?.status === "running") return;
  if ([...tasks.values()].some(task => task.status === "running")) {
    toast.info("正在转另一段录音，完成后再试");
    return;
  }
  const setting = getMobileSettingSnapshot()?.speechInput ?? defaultSpeechInputSetting();
  const account = setting.plugin.configurations[setting.plugin.id];
  if (setting.active !== "plugin" || !account || !registry) {
    showUnavailable(
      "还不能转文字",
      "系统识别只支持实时语音输入。在「我的 → 语音 → 语音识别」选一个支持录音转文字的识别服务。"
    );
    return;
  }
  let instance;
  try {
    instance = registry.create(
      setting.plugin.id,
      copyJson(account.config),
      account.modelId
    ).instance;
  } catch (error) {
    showUnavailable("还不能转文字", errorText(error, "识别插件未启用"));
    return;
  }
  const controller = new AbortController();
  controllers.set(src, controller);
  origins.set(src, { editor, registry });
  const id = crypto.randomUUID();
  setTask(src, { status: "running", fraction: null, stage: "preparing" });
  try {
    const availability = await instance.probe(
      { input: "file", language: setting.language },
      controller.signal
    );
    if (availability.state !== "ready" || !instance.transcribeFile) {
      setTask(src, null);
      showUnavailable(
        "还不能转文字",
        availability.state === "unsupported" || !instance.transcribeFile
          ? "当前识别服务只支持实时语音输入，不支持识别录好的音频。在「我的 → 语音 → 语音识别」换一个支持录音转文字的服务。"
          : (availability.reason ?? "识别服务暂时不可用")
      );
      return;
    }
    let prepared;
    try {
      const resolveResource = editor.getService(IResourceService).remoteResourceToLocal;
      const source = isCollaborationResource(src) ? await resolveResource?.(src) : src;
      if (!source || isCollaborationResource(source))
        throw new Error("音频资源尚未解析，请稍后重试");
      controller.signal.throwIfAborted();
      prepared = await prepareTranscriptAudio(
        id,
        source,
        availability.acceptedAudio?.fileMimeTypes ?? []
      );
    } catch (error) {
      if (!String(error).includes("UNSUPPORTED_FORMAT")) throw error;
      setTask(src, null);
      showUnavailable(
        "还不能转文字",
        "当前识别服务不支持这种音频格式。在「我的 → 语音 → 语音识别」换一个识别服务后重试。"
      );
      return;
    }
    controller.signal.throwIfAborted();
    // maxDurationMs 是提供方能接受的最大时长；时长未知时交给提供方自己判断
    if (
      availability.maxDurationMs !== undefined &&
      prepared.durationMs !== null &&
      prepared.durationMs > availability.maxDurationMs
    ) {
      throw new Error(`音频超过识别服务单次上限 ${formatLimit(availability.maxDurationMs)}`);
    }
    const file: ASRAudioFile = {
      name: prepared.name,
      mimeType: prepared.mimeType,
      sizeBytes: prepared.sizeBytes,
      ...(prepared.url ? { url: prepared.url } : {}),
      open: async signal => readTranscriptAudio(id, signal),
    };
    setTask(src, { status: "running", fraction: null, stage: "uploading" });
    const task = await registry.transcribeFile(
      setting.plugin.id,
      copyJson(account.config),
      account.modelId,
      { audio: file, language: setting.language },
      {
        taskId: id,
        signal: controller.signal,
        onEvent: event => {
          if (event.type === "progress")
            setTask(src, {
              status: "running",
              stage: event.stage,
              fraction: event.fraction ?? null,
            });
        },
      }
    );
    const transcript = await task.result;
    const block = buildTranscriptBlock(transcript);
    setTask(src, null);
    if (!block) {
      origins.delete(src);
      toast.info("没有识别到文字");
      return;
    }
    insertTranscript(editor, audio, block);
    origins.delete(src);
    toast.success("已插入文字稿");
  } catch (error) {
    if (isAbort(error) || controller.signal.aborted) {
      origins.delete(src);
      setTask(src, null);
    } else
      setTask(src, {
        status: "failed",
        fraction: null,
        stage: "recognizing",
        error: errorText(error, "转文字失败"),
      });
  } finally {
    controllers.delete(src);
    void releaseTranscriptAudio(id);
  }
}

function findAudioElement(editor: SlateEditor, src: string): ElementNode | null {
  for (const [node] of SlateEditor.nodes(editor, {
    at: [],
    match: node => SlateElement.isElement(node) && node.type === "audio",
  })) {
    if ((node as unknown as AudioElement).src === src) return node as ElementNode;
  }
  return null;
}
