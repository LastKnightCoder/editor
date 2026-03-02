import { snapdom } from "@zumer/snapdom";

type SnapdomBlobOptions = NonNullable<Parameters<typeof snapdom.toBlob>[1]>;

interface CaptureBlobWithSnapdomOptions extends SnapdomBlobOptions {
  fontReadyTimeoutMs?: number;
}

const DEFAULT_FONT_READY_TIMEOUT_MS = 2000;

export const waitForFontsReady = async (
  timeoutMs = DEFAULT_FONT_READY_TIMEOUT_MS,
): Promise<void> => {
  if (typeof document === "undefined") {
    return;
  }

  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts?.ready) {
    return;
  }

  const safeTimeoutMs = Math.max(0, timeoutMs);
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    const readyPromise = Promise.resolve(fonts.ready).then(
      () => "ready" as const,
    );
    const timeoutPromise = new Promise<"timeout">((resolve) => {
      timeoutId = setTimeout(() => resolve("timeout"), safeTimeoutMs);
    });

    const result = await Promise.race([readyPromise, timeoutPromise]);
    if (result === "timeout") {
      console.warn(
        `[snapdom-export] 字体等待超时（${safeTimeoutMs}ms），继续执行导出`,
      );
    }
  } catch (error) {
    console.warn("[snapdom-export] 等待字体加载失败，继续执行导出", error);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export const captureBlobWithSnapdom = async (
  element: Element,
  options: CaptureBlobWithSnapdomOptions = {},
): Promise<Blob> => {
  const {
    fontReadyTimeoutMs = DEFAULT_FONT_READY_TIMEOUT_MS,
    ...snapdomOptions
  } = options;

  await waitForFontsReady(fontReadyTimeoutMs);

  return snapdom.toBlob(element, {
    ...snapdomOptions,
    embedFonts: true,
  });
};
