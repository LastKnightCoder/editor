/**
 * 访客的系统与芯片。浏览器不直接暴露 CPU 架构，按可靠程度依次尝试：
 * 1. Chromium 的 User-Agent Client Hints（architecture 为 "arm" / "x86"）；
 * 2. WebGL 显卡名：Apple 芯片的 Mac 报「Apple M1」之类，Intel Mac 报 Intel / AMD 显卡；
 * Safari 只报「Apple GPU」且 UA 永远写 Intel，这种情况判断不了，返回 null。
 */
export type VisitorOs = "mac" | "windows";
export type VisitorArch = "arm64" | "x64";

export function detectOs(ua = navigator.userAgent): VisitorOs | null {
  // iPad 的桌面模式 UA 也写 Macintosh，用触点数区分
  if (/Macintosh|Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua) && navigator.maxTouchPoints <= 1) {
    return "mac";
  }
  if (/Windows/.test(ua)) return "windows";
  return null;
}

interface UserAgentDataLike {
  getHighEntropyValues(hints: string[]): Promise<{ architecture?: string }>;
}

async function archFromClientHints(): Promise<VisitorArch | null> {
  const data = (navigator as Navigator & { userAgentData?: UserAgentDataLike }).userAgentData;
  if (!data) return null;
  try {
    const { architecture } = await data.getHighEntropyValues(["architecture"]);
    if (architecture === "arm") return "arm64";
    if (architecture === "x86") return "x64";
  } catch {
    // 部分浏览器拒绝高熵提示，交给下一种方式
  }
  return null;
}

export function archFromRenderer(renderer: string): VisitorArch | null {
  if (/Apple M\d/i.test(renderer)) return "arm64";
  if (/Intel|AMD|Radeon|NVIDIA|GeForce/i.test(renderer)) return "x64";
  return null;
}

function archFromWebGl(): VisitorArch | null {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    if (!gl || !ext) return null;
    const renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return archFromRenderer(renderer);
  } catch {
    return null;
  }
}

export async function detectMacArch(): Promise<VisitorArch | null> {
  return (await archFromClientHints()) ?? archFromWebGl();
}
