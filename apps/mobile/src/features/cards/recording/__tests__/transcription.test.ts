import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createEditor, Node, Transforms, type Descendant, type Element } from "slate";
import type { ASRProviderRegistry } from "@tau/plugins/asr-host";
import { IResourceService } from "@tau/shared/host-services";
import type { ASRTranscript } from "@tau/asr";
import { dismissTranscriptionError, transcribeAudioBlock } from "../transcription";

const native = vi.hoisted(() => ({
  prepareTranscriptAudio: vi.fn(async () => ({
    name: "recording.ogg",
    mimeType: "audio/ogg",
    sizeBytes: 100,
    durationMs: 2000,
  })),
  releaseTranscriptAudio: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  readTranscriptAudio: vi.fn(),
}));
vi.mock("../../../../services/recording", () => native);
vi.mock("../../../../services/mobileSettingsBridge", () => ({
  getMobileSettingSnapshot: () => ({
    speechInput: {
      active: "plugin",
      language: "zh-CN",
      plugin: { id: "test.asr", configurations: { "test.asr": { config: {}, modelId: "model" } } },
    },
  }),
}));
vi.mock("../../../../components/toast", () => ({ toast: { success: vi.fn(), info: vi.fn() } }));
const reference = "tau-collab-local:00000000-0000-0000-0000-000000000000";
beforeEach(() => vi.clearAllMocks());
afterEach(() => dismissTranscriptionError(reference));

function setup(
  src = reference,
  identity: { uuid?: string; collabId?: string } = { uuid: "audio-id" }
) {
  const audio = { type: "audio", src, ...identity, children: [{ text: "" }] };
  const editor = createEditor();
  editor.isVoid = node => node.type === "audio";
  editor.children = [
    { type: "detail", children: [audio, { type: "paragraph", children: [{ text: "原有内容" }] }] },
    { type: "paragraph", children: [{ text: "文末" }] },
  ] as Descendant[];
  const resolveResource = vi.fn(async () => "~/.editor/resources/audio.bin");
  Object.assign(editor, {
    getService: (id: unknown) => {
      if (id === IResourceService) return { remoteResourceToLocal: resolveResource };
      throw new Error("未知服务");
    },
  });
  const registry = {
    create: vi.fn(() => ({
      instance: {
        probe: async () => ({ state: "ready", acceptedAudio: { fileMimeTypes: ["audio/ogg"] } }),
        transcribeFile: vi.fn(),
      },
    })),
    transcribeFile: vi.fn(async () => ({
      result: Promise.resolve({ text: "识别结果" } as ASRTranscript),
    })),
  };
  return { editor, audio: audio as unknown as Element, registry, resolveResource };
}

it("解析文档资源引用后转写，文字稿紧跟嵌套音频", async () => {
  const { editor, audio, registry, resolveResource } = setup();
  await transcribeAudioBlock(editor, registry as unknown as ASRProviderRegistry, audio);
  expect(resolveResource).toHaveBeenCalledWith(reference);
  expect(native.prepareTranscriptAudio).toHaveBeenCalledWith(
    expect.any(String),
    "~/.editor/resources/audio.bin",
    ["audio/ogg"]
  );
  expect(Node.get(editor, [0, 1])).toMatchObject({ type: "detail", title: "文字稿" });
  expect(Node.string(Node.get(editor, [0, 1]))).toBe("识别结果");
  expect(Node.string(Node.get(editor, [0, 2]))).toBe("原有内容");
  expect(editor.children).toHaveLength(2);
});

it("音频在转写期间移动后，按文档节点身份定位新位置", async () => {
  const { editor, audio, registry } = setup(reference, { collabId: "node-id" });
  let finish!: (result: ASRTranscript) => void;
  registry.transcribeFile.mockImplementationOnce(async () => ({
    result: new Promise<ASRTranscript>(resolve => {
      finish = resolve;
    }),
  }));
  const running = transcribeAudioBlock(editor, registry as unknown as ASRProviderRegistry, audio);
  await vi.waitFor(() => expect(registry.transcribeFile).toHaveBeenCalledOnce());
  Transforms.moveNodes(editor, { at: [0, 0], to: [1] });
  Transforms.setNodes(editor, { title: "录音新标题" }, { at: [1] });
  finish({ text: "识别结果" });
  await running;
  expect(Node.get(editor, [2])).toMatchObject({ type: "detail", title: "文字稿" });
});

it("公网地址保持原样，继续交给识别服务按地址获取", async () => {
  const src = "https://example.com/audio.mp3";
  const { editor, audio, registry, resolveResource } = setup(src);
  await transcribeAudioBlock(editor, registry as unknown as ASRProviderRegistry, audio);
  expect(resolveResource).not.toHaveBeenCalled();
  expect(native.prepareTranscriptAudio).toHaveBeenCalledWith(expect.any(String), src, [
    "audio/ogg",
  ]);
});

it("未解析的资源引用不会交给文件读取命令", async () => {
  const { editor, audio, registry, resolveResource } = setup();
  resolveResource.mockResolvedValueOnce(reference);
  await transcribeAudioBlock(editor, registry as unknown as ASRProviderRegistry, audio);
  expect(native.prepareTranscriptAudio).not.toHaveBeenCalled();
  expect(registry.transcribeFile).not.toHaveBeenCalled();
});
