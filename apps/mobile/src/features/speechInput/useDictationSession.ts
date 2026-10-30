import { useCallback, useEffect, useRef, useState } from "react";
import {
  ASRError,
  refineSpeechInput,
  type SpeechInputService,
  type SpeechInputSession,
  type SpeechRefiner,
} from "@tau/asr";

export type DictationPhase =
  | "idle"
  | "connecting"
  | "listening"
  | "committing"
  | "polishing"
  | "error";

export interface DictationSessionOptions {
  service: SpeechInputService | null;
  /** 可选 AI 润色器；缺省时松手直接写入，不进入 polishing */
  refine?: SpeechRefiner;
  /** 识别中的预览文字 */
  onPreview(text: string): void;
  /** 定稿原文；willPolish 表示本次随后会进入润色 */
  onCommit(text: string, willPolish: boolean): void;
  onPolished?(text: string, status: "refined" | "fallback"): void;
  onError(error: unknown): void;
}

export interface DictationSession {
  phase: DictationPhase;
  /** 进入 listening 的时间戳，供计时 */
  startedAt: number | null;
  /** 按下（手势判定后） */
  start(): void;
  /** 松手：停止录音并在结果返回后写入 */
  finish(): void;
  /** 上滑取消：不触发 onCommit */
  cancel(): void;
  /** 润色中点「跳过」：中止润色，保留原文 */
  skipPolish(): void;
  /** 润色失败后「重试」：用上次的识别结果与润色器重新润色 */
  retryPolish(): void;
}

function isCancellation(error: unknown): boolean {
  if (error instanceof ASRError) return error.code === "cancelled";
  return error instanceof Error && error.name === "AbortError";
}

/** 每次 start 一个运行记录；被取消或被新会话替换后，迟到的回调按 run 身份丢弃 */
interface Run {
  controller: AbortController;
  session?: SpeechInputSession;
  polish?: AbortController;
  /** 开始录音时固定的润色器，录音中设置变化不影响本次 */
  refine?: SpeechRefiner;
  cancelled: boolean;
}

type Transcript = Parameters<typeof refineSpeechInput>[0];

export function useDictationSession(options: DictationSessionOptions): DictationSession {
  const [phase, setPhase] = useState<DictationPhase>("idle");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const runRef = useRef<Run | null>(null);
  const lastPolishRef = useRef<{ transcript: Transcript; refine: SpeechRefiner } | null>(null);

  const settle = useCallback((run: Run, next: DictationPhase) => {
    if (runRef.current !== run) return;
    runRef.current = null;
    setPhase(next);
    setStartedAt(null);
  }, []);

  const fail = useCallback(
    (run: Run, error: unknown) => {
      if (run.cancelled || runRef.current !== run || isCancellation(error))
        return settle(run, "idle");
      settle(run, "error");
      optionsRef.current.onError(error);
    },
    [settle]
  );

  const polish = useCallback(
    async (run: Run, transcript: Transcript) => {
      const { refine } = run;
      lastPolishRef.current = null;
      if (!refine) return settle(run, "idle");
      run.polish = new AbortController();
      setPhase("polishing");
      try {
        const result = await refineSpeechInput(transcript, refine, {
          signal: run.polish.signal,
          onPreview: () => undefined,
        });
        if (runRef.current !== run) return;
        if (result.status === "fallback") lastPolishRef.current = { transcript, refine };
        if (result.status !== "original")
          optionsRef.current.onPolished?.(result.text, result.status);
        settle(run, "idle");
      } catch {
        // refineSpeechInput 只在中止（跳过 / 卸载）时抛出，失败已降级为 fallback
        settle(run, "idle");
      }
    },
    [settle]
  );

  const start = useCallback(() => {
    const { service } = optionsRef.current;
    if (runRef.current) return;
    if (!service) {
      setPhase("error");
      optionsRef.current.onError(new Error("语音输入不可用"));
      return;
    }
    const run: Run = {
      controller: new AbortController(),
      refine: optionsRef.current.refine,
      cancelled: false,
    };
    runRef.current = run;
    lastPolishRef.current = null;
    setPhase("connecting");
    setStartedAt(null);
    service
      .start({
        signal: run.controller.signal,
        onPreview: text => {
          if (runRef.current === run && !run.cancelled) optionsRef.current.onPreview(text);
        },
      })
      .then(
        session => {
          run.session = session;
          if (run.cancelled || runRef.current !== run) {
            void session.cancel().catch(() => undefined);
            return;
          }
          setPhase("listening");
          setStartedAt(Date.now());
          // 松手与服务层 120 秒自动停止都经由 result 定稿，只走这一条路径
          session.result.then(
            transcript => {
              if (run.cancelled || runRef.current !== run) return;
              if (!transcript.text.trim()) return settle(run, "idle");
              setPhase("committing");
              optionsRef.current.onCommit(transcript.text, !!run.refine);
              void polish(run, transcript);
            },
            error => fail(run, error)
          );
        },
        error => fail(run, error)
      );
  }, [fail, polish, settle]);

  const finish = useCallback(() => {
    const run = runRef.current;
    if (!run) return;
    if (!run.session) {
      // 尚未连上就松手：没有可写入的内容，按取消处理
      run.cancelled = true;
      run.controller.abort();
      return settle(run, "idle");
    }
    setPhase(current => (current === "listening" ? "committing" : current));
    run.session.stop().catch(error => fail(run, error));
  }, [fail, settle]);

  const cancel = useCallback(() => {
    const run = runRef.current;
    if (!run) return;
    run.cancelled = true;
    run.controller.abort();
    run.polish?.abort();
    void run.session?.cancel().catch(() => undefined);
    settle(run, "idle");
  }, [settle]);

  const skipPolish = useCallback(() => {
    const run = runRef.current;
    if (!run?.polish) return;
    run.polish.abort();
    settle(run, "idle");
  }, [settle]);

  const retryPolish = useCallback(() => {
    const last = lastPolishRef.current;
    if (!last || runRef.current) return;
    const run: Run = { controller: new AbortController(), refine: last.refine, cancelled: false };
    runRef.current = run;
    void polish(run, last.transcript);
  }, [polish]);

  useEffect(
    () => () => {
      const run = runRef.current;
      if (!run) return;
      runRef.current = null;
      run.cancelled = true;
      run.controller.abort();
      run.polish?.abort();
      void run.session?.cancel().catch(() => undefined);
    },
    []
  );

  return { phase, startedAt, start, finish, cancel, skipPolish, retryPolish };
}
