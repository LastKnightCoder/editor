import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { ASRError, throwIfASRAborted, waitForASR } from "@tau/asr";
import {
  qwenModelId,
  qwenAlignerId,
  qwenAlignedLanguages,
} from "../../../../shared/local-transcription";
import FfmpegService from "../../utils/FfmpegService";
import { runASRProcess } from "../asr-process";
import type { TranscriptionOptions, TranscriptionResult } from "../whisper-engine";
import { transcribeWindows } from "./windows";
import { missingQwenAsset, qwenAssets } from "./assets";
import { qwenExecutable, qwenSupported } from "./runtime";
import worker from "./transcribe.py?raw";

const languageNames = new Intl.DisplayNames("en", { type: "language" });
const codes = [
  "zh",
  "en",
  "yue",
  "ar",
  "de",
  "fr",
  "es",
  "pt",
  "id",
  "it",
  "ko",
  "ru",
  "th",
  "vi",
  "ja",
  "tr",
  "hi",
  "ms",
  "nl",
  "sv",
  "da",
  "fi",
  "pl",
  "cs",
  "fil",
  "fa",
  "el",
  "hu",
  "mk",
  "ro",
];
const codeByName = new Map(codes.map(code => [languageNames.of(code)?.toLowerCase(), code]));

export async function transcribeQwen(
  directory: string,
  audio: string,
  options: TranscriptionOptions,
  signal: AbortSignal,
  progress?: (message: string) => void
): Promise<TranscriptionResult> {
  if (!qwenSupported()) throw new ASRError("unsupported", "当前设备不支持 Qwen 本地转录");
  const timed = options.output !== "text";
  const language = options.language || "auto";
  if (timed && language !== "auto" && !qwenAlignedLanguages.has(language))
    throw new Error("时间对齐模型不支持此语言，请选择纯文字或 Whisper");
  const model = path.join(directory, qwenModelId(options.qwenModel ?? "1.7B"));
  const aligner = path.join(directory, qwenAlignerId);
  const missing = await missingQwenAsset(
    directory,
    options.qwenModel ?? "1.7B",
    timed,
    options.qwenDevice
  );
  if (missing) throw new ASRError("needs-assets", "请在语音转录设置下载 " + missing);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "tau-qwen-"));
  const start = Date.now();
  try {
    const input = path.join(temp, "input.wav");
    const output = path.join(temp, "result.json");
    const ffmpeg = await waitForASR(FfmpegService.ensureFluentFfmpegPath(), signal);
    await runASRProcess(
      ffmpeg,
      [
        "-nostdin",
        "-loglevel",
        "error",
        "-i",
        audio,
        "-map",
        "0:a:0",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        input,
      ],
      signal
    );
    let result: TranscriptionResult;
    if (process.platform === "win32") {
      const modelId = qwenModelId(options.qwenModel ?? "1.7B");
      const modelFile = qwenAssets.find(asset => asset.name === modelId);
      const alignerFile = qwenAssets.find(asset => asset.name === qwenAlignerId);
      if (!modelFile || !alignerFile) throw new Error("缺少 Windows Qwen 模型配置");
      result = await transcribeWindows(
        input,
        path.join(model, modelFile.marker),
        timed ? path.join(aligner, alignerFile.marker) : undefined,
        language,
        options.qwenDevice ?? "cpu",
        signal,
        progress
      );
    } else {
      await runASRProcess(
        qwenExecutable(),
        ["-I", "-c", worker, input, model, language, timed ? aligner : "", output],
        signal,
        progress
      );
      result = (await fs.readJson(output)) as TranscriptionResult;
      throwIfASRAborted(signal);
      result.language = codeByName.get(result.language?.toLowerCase()) ?? result.language;
      if (
        timed &&
        result.text.trim() &&
        (!qwenAlignedLanguages.has(result.language) || !result.segments.length)
      )
        throw new Error("未获得可用的字幕时间轴，请选择纯文字或 Whisper");
    }
    if (!options.wordTimestamps && !options.useLLMOptimization) delete result.wordSegments;
    result.processingTime = (Date.now() - start) / 1000;
    return result;
  } finally {
    await fs.remove(temp);
  }
}
