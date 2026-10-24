import type { ASREvent, ASRStreamSession, ASRTranscript } from "./types";
import { ASRTranscriptReducer } from "./reducer";
import { prepareMicrophone, type MicrophoneCapture } from "./capture";

export interface SpeechInputSession {
  result: Promise<ASRTranscript>;
  stop(): Promise<void>;
  cancel(): Promise<void>;
}
export interface SpeechInputService {
  start(options: {
    signal: AbortSignal;
    onPreview(text: string): void;
  }): Promise<SpeechInputSession>;
}
export interface SpeechInputSetting {
  active: "native" | "plugin";
  language: string;
  refinement?: import("./refinement").SpeechRefinementPreferences;
  plugin: { id: string; configurations: Record<string, { modelId: string; config: unknown }> };
}
export function defaultSpeechInputSetting(): SpeechInputSetting {
  return { active: "native", language: "zh-CN", plugin: { id: "", configurations: {} } };
}
export function createSpeechInputService(
  open: (
    taskId: string,
    signal: AbortSignal,
    onEvent: (event: ASREvent) => void
  ) => Promise<{
    session: ASRStreamSession;
    format: import("./types").ASRAudioFormat;
    release(): Promise<void>;
  }>
): SpeechInputService {
  let active = false;
  return {
    async start(options) {
      if (active) throw new Error("已有语音输入正在进行");
      active = true;
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, options.signal]);
      const taskId = crypto.randomUUID();
      const reducer = new ASRTranscriptReducer(taskId);
      let fatal: unknown;
      let capture: MicrophoneCapture | undefined;
      let opened: Awaited<ReturnType<typeof open>> | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let finishing: Promise<void> | undefined;
      let microphone: ReturnType<typeof prepareMicrophone> | undefined;
      try {
        microphone = prepareMicrophone(signal, error => {
          fatal = error;
          controller.abort();
        });
        opened = await open(taskId, signal, event => {
          if (signal.aborted) return;
          if (reducer.apply(event) && event.type === "segments")
            options.onPreview(
              reducer
                .getSnapshot()
                .segments.map(segment => segment.text)
                .join("")
            );
        });
        void opened.session.result.catch(error => {
          fatal ??= error;
          controller.abort();
        });
        signal.throwIfAborted();
        capture = await microphone.start(opened.format, frame => opened!.session.write(frame));
        const abort = () => {
          void opened!.session.cancel().catch(() => undefined);
          void microphone!.cancel();
        };
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
        const result = opened.session.result
          .catch(error => {
            throw fatal ?? error;
          })
          .finally(async () => {
            if (timer) clearTimeout(timer);
            signal.removeEventListener("abort", abort);
            try {
              await microphone?.cancel();
              await opened?.release();
            } finally {
              active = false;
            }
          });
        void result.catch(() => undefined);
        const stop = () => {
          if (!finishing)
            finishing = (async () => {
              try {
                await capture!.stop();
                await opened!.session.endInput();
              } catch (error) {
                fatal = error;
                controller.abort();
                throw error;
              }
            })();
          return finishing;
        };
        timer = setTimeout(() => {
          void stop().catch(() => undefined);
        }, 120_000);
        return {
          result,
          stop,
          async cancel() {
            controller.abort();
            await opened!.session.cancel();
            await result.catch(() => undefined);
          },
        };
      } catch (error) {
        controller.abort();
        try {
          await microphone?.cancel();
          await opened?.session.cancel();
          await opened?.release();
        } finally {
          active = false;
        }
        throw fatal ?? error;
      }
    },
  };
}
