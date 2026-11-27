interface Bucket {
  windowEnd: number;
  /** 窗口内被省略的条数 */
  suppressed: number;
  /** 被省略的那些里最后一次的内容，窗口结束时随汇总写出 */
  last?: {
    level: "info" | "warn" | "error";
    message: string;
    fields?: Record<string, unknown>;
    error?: unknown;
  };
  timer?: number;
}

const buckets = new Map<string, Bucket>();

const write = (
  level: "info" | "warn" | "error",
  message: string,
  fields?: Record<string, unknown>,
  error?: unknown
) => {
  if (fields) console[level](message, fields, error);
  else console[level](message, error);
};

/** 窗口结束时补写被省略的条数；没有重复就不补，避免凭空多出一行 */
function flush(key: string) {
  const bucket = buckets.get(key);
  if (!bucket) return;
  buckets.delete(key);
  clearTimeout(bucket.timer);
  if (bucket.last) {
    const { level, message, fields, error } = bucket.last;
    write(level, message, { ...fields, suppressed: bucket.suppressed }, error);
  }
}

/**
 * 会反复触发的日志（轮询、重试、按条处理）按来源节流，但不丢信息：
 * 窗口内的第一条立即写出；其后的重复只计数，窗口结束时补一条汇总，带上省略的条数与
 * 最后一次的内容。持续触发时每个窗口最多两行。key 只用固定的来源名或有限的标识。
 */
export function logThrottled(
  key: string,
  level: "info" | "warn" | "error",
  message: string,
  fields?: Record<string, unknown>,
  error?: unknown,
  intervalMs = 30_000
): void {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now >= current.windowEnd) {
    // 上个窗口的汇总定时器还没来得及触发时先补上，条数不能丢
    if (current) flush(key);
    write(level, message, fields, error);
    buckets.set(key, { windowEnd: now + intervalMs, suppressed: 0 });
    return;
  }
  current.suppressed++;
  current.last = { level, message, fields, error };
  if (!current.timer) current.timer = window.setTimeout(() => flush(key), current.windowEnd - now);
}
