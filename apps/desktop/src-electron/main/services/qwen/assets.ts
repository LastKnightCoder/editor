import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { DownloadSource } from "../../utils/model-download";
import path from "node:path";
import fs from "fs-extra";
import { streamToFile } from "../../utils/model-download";
import {
  qwenModelId,
  qwenAlignerId,
  type QwenModel,
  type QwenDevice,
} from "../../../../shared/local-transcription";
import {
  ensureQwenRuntime,
  qwenRuntimeReady,
  qwenRuntimeBytes,
  qwenSupported,
  qwenPlatformRequirement,
} from "./runtime";

function recognition(size: QwenModel, revision: string, bytes: number, sha256: string) {
  return {
    name: qwenModelId(size),
    label: "Qwen3-ASR " + size,
    size: size === "0.6B" ? "713 MB" : "1.61 GB",
    description: size === "0.6B" ? "短录音、快速转写" : "中文录音、优先准确度",
    huggingface: "mlx-community/Qwen3-ASR-" + size + "-4bit",
    revision,
    files: [
      "config.json",
      "merges.txt",
      "tokenizer_config.json",
      "vocab.json",
      "model.safetensors",
    ],
    bytes,
    sha256,
    marker: "model.safetensors",
  };
}

const macAssets = [
  recognition(
    "0.6B",
    "313d850181767edf09f00a9c289becca70e58cd0",
    708236945,
    "70c7e67e588062adce4f10796e47ad42ead51c6671eda61a0987eae38ca95ddf"
  ),
  recognition(
    "1.7B",
    "78a389c776a5483b2d0d4ea5494e11012e0d6159",
    1603081617,
    "9848eaf7a5c1589c671b35035ac27b72e248dd0c604eacae547e7e403d29db45"
  ),
  {
    name: qwenAlignerId,
    label: "Qwen3-ForcedAligner 0.6B",
    size: "1.84 GB",
    description: "生成字幕时间轴，两个 Qwen 模型共用",
    huggingface: "Qwen/Qwen3-ForcedAligner-0.6B",
    revision: "c7cbfc2048c462b0d63a45797104fc9db3ad62b7",
    files: [
      "chat_template.json",
      "config.json",
      "generation_config.json",
      "merges.txt",
      "preprocessor_config.json",
      "tokenizer_config.json",
      "vocab.json",
      "model.safetensors",
    ],
    bytes: 1835544544,
    sha256: "47831d0e82f96b20e9034dba01a075ee06436654719f6a68289e49f1b65ce0e7",
    marker: "model.safetensors",
  },
];

type QwenAsset = (typeof macAssets)[number] & { remoteDirectory?: string };

function ggufAsset(
  id: string,
  dimension: string,
  size: string,
  bytes: number,
  sha256: string
): QwenAsset {
  const aligner = id === qwenAlignerId;
  const family = aligner ? "Qwen3-ForcedAligner" : "Qwen3-ASR";
  const filename =
    (aligner ? "qwen3-forced-aligner-" : "qwen3-asr-") + dimension.toLowerCase() + "-q8_0.gguf";
  return {
    name: id,
    label: family + " " + dimension,
    size,
    description: aligner ? "生成字幕时间轴，两个 Qwen 模型共用" : "本地转录 · Q8",
    huggingface: "audio-cpp/audio.cpp-gguf",
    remoteDirectory: family + "-" + dimension + "-GGUF/",
    revision: "33120a4cfdf0d56786db934a03a093d4675de938",
    files: [filename],
    marker: filename,
    bytes,
    sha256,
  };
}

export const qwenAssets: QwenAsset[] =
  process.platform === "win32"
    ? [
        ggufAsset(
          qwenModelId("0.6B"),
          "0.6B",
          "1.15 GB",
          1151279968,
          "5c53bbb9a6b2ade85c16c290c560658ca18b78a23c323378528f1f945683fcbe"
        ),
        ggufAsset(
          qwenModelId("1.7B"),
          "1.7B",
          "2.47 GB",
          2473017600,
          "3bc2462eca3a3a8f56abcd860d0943ffdc0546547dde55a9d08589607d6f3936"
        ),
        ggufAsset(
          qwenAlignerId,
          "0.6B",
          "1.14 GB",
          1142622368,
          "d37d7be5f34ee71a495fe7f391267f1cab88e91b7b7b257df07061eecdea936e"
        ),
      ]
    : macAssets;

export async function qwenAssetReady(directory: string, asset: (typeof qwenAssets)[number]) {
  const stat = await fs.stat(path.join(directory, asset.name, asset.marker)).catch(() => null);
  if (stat?.size !== asset.bytes) return false;
  if (process.platform !== "win32" && !(await qwenRuntimeReady("cpu"))) return false;
  const files = await Promise.all(
    asset.files.map(file => fs.pathExists(path.join(directory, asset.name, file)))
  );
  return files.every(Boolean);
}

export async function missingQwenAsset(
  directory: string,
  model: QwenModel,
  subtitles: boolean,
  device: QwenDevice = "cpu"
) {
  if (process.platform === "win32" && !(await qwenRuntimeReady(device)))
    return device === "gpu" ? "Qwen GPU 运行包" : "Qwen CPU 运行包";
  const required = qwenAssets.filter(
    asset => asset.name === qwenModelId(model) || (subtitles && asset.name === qwenAlignerId)
  );
  for (const asset of required) if (!(await qwenAssetReady(directory, asset))) return asset.label;
  return undefined;
}

export async function downloadQwenAsset(
  directory: string,
  asset: (typeof qwenAssets)[number],
  source: DownloadSource,
  signal: AbortSignal,
  report: (percentage: number, message: string) => void
) {
  if (!qwenSupported()) throw new Error(qwenPlatformRequirement);
  let setupBytes = 0;
  if (process.platform !== "win32") {
    report(0, "正在准备本地 Qwen 运行环境…");
    await ensureQwenRuntime(signal, (received, message) => {
      setupBytes = received;
      report(Math.floor((99 * received) / (qwenRuntimeBytes("cpu") + asset.bytes)), message);
    });
  }
  signal.throwIfAborted();
  const destination = path.join(directory, asset.name);
  if (await qwenAssetReady(directory, asset)) return destination;
  await fs.ensureDir(directory);
  const staging = await fs.mkdtemp(destination + "-");
  try {
    let reported = -1;
    for (const file of asset.files) {
      signal.throwIfAborted();
      const remoteFile = (asset.remoteDirectory ?? "") + file;
      const url =
        source === "modelscope"
          ? "https://modelscope.cn/models/" + asset.huggingface + "/resolve/master/" + remoteFile
          : "https://huggingface.co/" +
            asset.huggingface +
            "/resolve/" +
            asset.revision +
            "/" +
            remoteFile;
      await streamToFile(url, path.join(staging, file), {
        signal,
        onBytes:
          file === asset.marker
            ? downloaded => {
                const percent = Math.min(
                  99,
                  Math.floor((99 * (setupBytes + downloaded)) / (setupBytes + asset.bytes))
                );
                if (percent !== reported) report(percent, "正在下载 " + asset.label);
                reported = percent;
              }
            : undefined,
      });
    }
    if ((await fs.stat(path.join(staging, asset.marker))).size !== asset.bytes)
      throw new Error("模型文件不完整，请重试");
    signal.throwIfAborted();
    const hash = createHash("sha256");
    for await (const part of createReadStream(path.join(staging, asset.marker), { signal }))
      hash.update(part);
    if (hash.digest("hex") !== asset.sha256) throw new Error("模型权重校验失败，请重新下载");
    await fs.move(staging, destination, { overwrite: true });
    report(100, "下载完成");
    return destination;
  } finally {
    await fs.remove(staging);
  }
}
