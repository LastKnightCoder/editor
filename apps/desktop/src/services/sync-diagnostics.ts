/** 只记录阶段与错误类型，配置、请求正文和错误原文可能含凭据，不进入诊断日志。 */
export async function traceSyncStage<T>(
  traceId: string,
  provider: string,
  stage: string,
  run: () => Promise<T>
): Promise<T> {
  const started = performance.now();
  const context = { traceId, provider, stage };
  const elapsedMs = () => Math.round(performance.now() - started);
  console.info("[sync-diagnostic] start", context);
  const pending = setTimeout(() => {
    console.warn("[sync-diagnostic] pending", { ...context, elapsedMs: elapsedMs() });
  }, 10_000);
  try {
    const result = await run();
    console.info("[sync-diagnostic] done", { ...context, elapsedMs: elapsedMs() });
    return result;
  } catch (error) {
    const metadata =
      error && typeof error === "object" && "$metadata" in error ? error.$metadata : undefined;
    const status =
      metadata && typeof metadata === "object" && "httpStatusCode" in metadata
        ? metadata.httpStatusCode
        : undefined;
    console.warn("[sync-diagnostic] failed", {
      ...context,
      elapsedMs: elapsedMs(),
      errorName: error instanceof Error ? error.name : "UnknownError",
      ...(typeof status === "number" ? { httpStatus: status } : {}),
    });
    throw error;
  } finally {
    clearTimeout(pending);
  }
}
