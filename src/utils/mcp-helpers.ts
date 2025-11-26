import dayjs from "dayjs";
import type { Operation } from "@/types";

/**
 * 操作时间段
 */
export interface OperationPeriod {
  startTime: string; // "YYYY-MM-DD HH:mm:ss"
  endTime: string;
  durationSeconds: number;
}

/**
 * 格式化时间戳为 "YYYY-MM-DD HH:mm:ss"
 */
export function formatTimestamp(timestamp: number): string {
  return dayjs(timestamp).format("YYYY-MM-DD HH:mm:ss");
}

/**
 * 计算时长（秒）
 */
export function calculateDuration(startTime: number, endTime: number): number {
  return Math.floor((endTime - startTime) / 1000);
}

/**
 * 安全截断 Markdown 内容
 */
export function truncateMarkdown(
  markdown: string,
  maxLength?: number,
): { content: string; truncated: boolean } {
  if (!maxLength || markdown.length <= maxLength) {
    return { content: markdown, truncated: false };
  }

  // 在合理的位置截断（段落、句子）
  let truncated = markdown.substring(0, maxLength);

  // 找到最后一个段落或句子结束符
  const breakPoints = ["\n\n", "\n", "。", "！", "？", ".", "!", "?"];
  let bestBreak = -1;

  for (const bp of breakPoints) {
    const idx = truncated.lastIndexOf(bp);
    if (idx > maxLength * 0.8) {
      // 至少保留 80%
      bestBreak = idx + bp.length;
      break;
    }
  }

  if (bestBreak > 0) {
    truncated = truncated.substring(0, bestBreak);
  }

  return {
    content: truncated + "\n\n[内容已截断...]",
    truncated: true,
  };
}

/**
 * 合并连续的操作记录
 * 将间隔小于 threshold 的连续 update 操作合并为编辑会话
 */
export function mergeConsecutiveOperations(
  operations: Operation[],
  threshold: number = 3 * 60 * 1000, // 默认 3 分钟
): Map<number, OperationPeriod[]> {
  // 1. 按时间排序
  const sorted = [...operations].sort(
    (a, b) => a.operation_time - b.operation_time,
  );

  // 2. 按 operation_id 分组
  const grouped = new Map<number, Operation[]>();
  sorted.forEach((op) => {
    const id = op.operation_id;
    if (!grouped.has(id)) {
      grouped.set(id, []);
    }
    grouped.get(id)!.push(op);
  });

  // 3. 对每个 ID 的操作进行会话分析
  const sessions = new Map<number, OperationPeriod[]>();

  grouped.forEach((ops, id) => {
    const periods: OperationPeriod[] = [];
    let currentSession: { start: number; end: number } | null = null;

    ops.forEach((op) => {
      // 只处理 update 操作
      if (op.operation_action !== "update") return;

      if (!currentSession) {
        // 开始新会话
        currentSession = { start: op.operation_time, end: op.operation_time };
      } else if (op.operation_time - currentSession.end < threshold) {
        // 间隔 < threshold，扩展当前会话
        currentSession.end = op.operation_time;
      } else {
        // 开始新会话，保存旧会话
        periods.push({
          startTime: formatTimestamp(currentSession.start),
          endTime: formatTimestamp(currentSession.end),
          durationSeconds: calculateDuration(
            currentSession.start,
            currentSession.end,
          ),
        });
        currentSession = { start: op.operation_time, end: op.operation_time };
      }
    });

    // 添加最后一个会话
    if (currentSession) {
      const session = currentSession as { start: number; end: number };
      periods.push({
        startTime: formatTimestamp(session.start),
        endTime: formatTimestamp(session.end),
        durationSeconds: calculateDuration(session.start, session.end),
      });
    }

    if (periods.length > 0) {
      sessions.set(id, periods);
    }
  });

  return sessions;
}

/**
 * 解析日期字符串为时间戳
 */
export function parseDate(dateStr: string): number {
  return dayjs(dateStr).valueOf();
}

/**
 * 将时间戳转换为日期字符串 (YYYY-MM-DD)
 */
export function formatDate(timestamp: number): string {
  return dayjs(timestamp).format("YYYY-MM-DD");
}
