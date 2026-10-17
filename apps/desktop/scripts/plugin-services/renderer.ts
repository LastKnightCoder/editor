import { desktopPluginServices } from "../../src/app/plugins/services";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { definePlugin, type PluginContext } from "@tau/plugins";

const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
function wav() {
  const bytes = new Uint8Array(44 + 1600);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) =>
    bytes.set(new TextEncoder().encode(value), offset);
  text(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, 1600, true);
  return new Blob([bytes], { type: "audio/wav" });
}

async function verify() {
  let context!: PluginContext;
  const host = new PluginHost({
    workspaceId: "verification",
    storage: createMemoryStorage(),
    services: desktopPluginServices,
  });
  host.registerTrusted(
    definePlugin({
      id: "verify.services",
      name: "服务验证",
      version: "1",
      create: () => ({
        activate(ctx) {
          context = ctx;
        },
      }),
    })
  );
  await host.enable("verify.services");
  const services = context.services;
  try {
    const css = await services.tailwind.compile({
      source: '<div class="p-4 text-ink-1"></div>',
      language: "html",
    });
    check(css.css.includes(".p-4") && css.css.includes("--tau-"), "Tailwind 未输出语义类");
    const typst = await services.typst.compile({
      source: '#include "part.typ"\n#sys.inputs.at("title")',
      inputs: { title: "TauTitle" },
      files: [{ name: "part.typ", data: new Blob(["FromFile"]) }],
    });
    check(
      typst.html.includes("FromFile") && typst.html.includes("TauTitle"),
      "Typst 附件或变量失败"
    );
    let rejected = false;
    try {
      await services.typst.compile({ source: "#unknown-function()" });
    } catch {
      rejected = true;
    }
    check(rejected, "Typst 错误源码没有失败");
    const { nodes } = await services.markdown.deserialize("# Hello\n\n* [x] done");
    check(
      (await services.markdown.serialize(nodes)).markdown.includes("[x]"),
      "Markdown 任务列表丢失"
    );
    check(
      (await services.markdown.render("**hello**")).html.includes("<strong>hello</strong>"),
      "Markdown HTML 失败"
    );
    const input = { name: "input.wav", data: wav() };
    const info = await services.ffmpeg.probe(input);
    check(info.streams[0]?.type === "audio" && info.format.duration === 0.1, "ffprobe 元信息失败");
    const output = await services.ffmpeg.run({
      files: [input],
      args: ["-i", "input.wav", "-c:a", "pcm_s16le", "out.wav"],
      outputs: [{ name: "out.wav", mimeType: "audio/wav" }],
    });
    check(
      (await services.ffmpeg.probe(output.files[0])).format.duration === 0.1,
      "FFmpeg 产物失败"
    );
    const controller = new AbortController();
    const pending = services.ffmpeg.run(
      {
        files: [input],
        args: ["-re", "-stream_loop", "-1", "-i", "input.wav", "-f", "null", "-"],
        outputs: [],
      },
      { signal: controller.signal, onProgress: () => controller.abort() }
    );
    try {
      await pending;
      throw new Error("FFmpeg 取消未生效");
    } catch (error) {
      check((error as Error).name === "AbortError", "取消错误类型不正确");
    }
    const svg = await services.tikz.compile({
      source: "\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}",
    });
    check(
      svg.svg.includes("<svg") && svg.svg.includes("<path") && svg.svg.includes("@font-face"),
      "TikZ 未返回完整 SVG"
    );
    const cancelled = services.tikz.compile({
      source: "\\begin{tikzpicture}\\draw (0,0) -- (2,1);\\end{tikzpicture}",
    });
    for (let attempt = 0; attempt < 100 && !document.querySelector("iframe"); attempt++)
      await new Promise(resolve => setTimeout(resolve, 10));
    check(document.querySelector("iframe"), "未创建待取消的 TikZ 上下文");
    await host.disable("verify.services");
    try {
      await cancelled;
      throw new Error("停用未取消 TikZ");
    } catch (error) {
      check((error as Error).name === "AbortError", "停用取消错误类型不正确");
    }
    check(!document.querySelector("iframe"), "TikZ 上下文未清理");
    return {
      ok: true,
      cases: [
        "tailwind",
        "typst-assets-inputs",
        "typst-error",
        "markdown-roundtrip-html",
        "ffprobe",
        "ffmpeg-output",
        "ffmpeg-cancel",
        "tikz-svg",
        "plugin-disable",
      ],
    };
  } finally {
    await host.dispose();
  }
}

(window as unknown as { serviceVerification: Promise<unknown> }).serviceVerification =
  verify().catch(error => ({ ok: false, error: String(error), stack: error.stack }));
