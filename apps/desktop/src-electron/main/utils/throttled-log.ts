interface Bucket {
  windowEnd: number;
  /** 窗口内被省略的条数 */
  suppressed: number;
  /** 被省略的那些里最后一次的内容，窗口结束时随汇总写出 */
  last?: { message: string; error?: unknown; fields?: Record<string, unknown> };
  timer?: NodeJS.Timeout;
}

const buckets = new Map<string, Bucket>();

const write = (message: string, fields?: Record<string, unknown>, error?: unknown) => {
  if (fields) console.warn(message, fields, error);
  else console.warn(message, error);
};

/** 窗口结束时补写被省略的条数；没有重复失败就不补，避免凭空多出一行 */
function flush(key: string) {
  const bucket = buckets.get(key);
  if (!bucket) return;
  buckets.delete(key);
  clearTimeout(bucket.timer);
  if (bucket.last)
    write(
      bucket.last.message,
      { ...bucket.last.fields, suppressed: bucket.suppressed },
      bucket.last.error
    );
}

/**
 * 会反复触发的失败（轮询、写入总线、按行解析）按来源节流，但不丢信息：
 * 窗口内的第一条立即写出；其后的重复失败只计数，窗口结束时补一条汇总，
 * 带上省略的条数与最后一次的错误。持续失败时每个窗口最多两行。
 * key 只用固定的来源名或有限的标识，不带会无限增长的值。
 */
export function warnThrottled(
  key: string,
  message: string,
  error?: unknown,
  fields?: Record<string, unknown>,
  intervalMs = 60_000
): void {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now >= current.windowEnd) {
    // 上个窗口的汇总定时器还没来得及触发时先补上，条数不能丢
    if (current) flush(key);
    write(message, fields, error);
    buckets.set(key, { windowEnd: now + intervalMs, suppressed: 0 });
    return;
  }
  current.suppressed++;
  current.last = { message, error, fields };
  if (!current.timer) {
    current.timer = setTimeout(() => flush(key), current.windowEnd - now);
    // 汇总不该拖住进程退出
    current.timer.unref?.();
  }
}
