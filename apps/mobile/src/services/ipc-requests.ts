const pending = new Map<Promise<unknown>, { command: string; startedAt: number }>();

export function trackLibraryRequest<T>(task: Promise<T>, command: string): Promise<T> {
  pending.set(task, { command, startedAt: Date.now() });
  void task.finally(() => pending.delete(task)).catch(() => undefined);
  return task;
}

export async function drainWithinBudget(task: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      task,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("DEVICE_SYNC_BUSY: 仍有本机操作未完成，请稍后重新下载")),
          8000
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export async function settleLibraryRequests() {
  const tasks = [...pending.keys()];
  try {
    await drainWithinBudget(Promise.allSettled(tasks));
  } catch (error) {
    console.warn(
      "[sync] 等待本机数据请求超时",
      tasks.flatMap(task => {
        const request = pending.get(task);
        return request
          ? [{ command: request.command, elapsedMs: Date.now() - request.startedAt }]
          : [];
      })
    );
    throw error;
  }
}
