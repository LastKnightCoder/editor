const pending = new Set<Promise<unknown>>();

export function trackLibraryRequest<T>(task: Promise<T>): Promise<T> {
  pending.add(task);
  void task.finally(() => pending.delete(task)).catch(() => {});
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
export function settleLibraryRequests() {
  return drainWithinBudget(Promise.allSettled([...pending]));
}
