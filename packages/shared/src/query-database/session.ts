import type { QueryResult } from "./types";

export interface RunningQuery {
  result: Promise<QueryResult>;
  cancel(reason?: Error): void;
}

/** 变化只登记为脏；在途结果不会盖过更晚的定义或失效事件。 */
export function createQuerySession(input: {
  run(): RunningQuery;
  publish(result: QueryResult): void;
  fail(error: Error): void;
  loading(value: boolean): void;
  delayMs?: number;
}) {
  let disposed = false;
  let active = true;
  let dirty = false;
  let current: RunningQuery | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    if (disposed || !active || current || !dirty) return;
    dirty = false;
    input.loading(true);
    try {
      current = input.run();
    } catch (error) {
      input.loading(false);
      input.fail(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    const operation = current;
    void operation.result
      .then(
        result => {
          if (!disposed && active && current === operation && !dirty) input.publish(result);
        },
        error => {
          if (!disposed && active && current === operation && !dirty)
            input.fail(error instanceof Error ? error : new Error(String(error)));
        }
      )
      .finally(() => {
        if (disposed || current !== operation) return;
        current = undefined;
        input.loading(false);
        if (active && dirty) schedule();
      });
  };
  const schedule = () => {
    if (!timer && active && !disposed && !current) timer = setTimeout(flush, input.delayMs ?? 250);
  };
  return {
    invalidate() {
      if (disposed) return;
      dirty = true;
      schedule();
    },
    setActive(value: boolean) {
      if (disposed || active === value) return;
      active = value;
      if (!active) {
        if (timer) clearTimeout(timer);
        timer = undefined;
        const previous = current;
        current = undefined;
        previous?.cancel();
        input.loading(false);
        dirty = true;
      } else {
        dirty = true;
        schedule();
      }
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      current?.cancel();
      current = undefined;
    },
  };
}
