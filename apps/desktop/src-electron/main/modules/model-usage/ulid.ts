import { randomBytes } from "node:crypto";

/** Crockford Base32（去掉 I L O U） */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LEN = 10;
const RANDOM_LEN = 16;

let lastTime = -1;
let lastRandom: number[] = [];

const encodeTime = (time: number) => {
  let out = "";
  for (let i = 0; i < TIME_LEN; i++) {
    out = ALPHABET[time % 32] + out;
    time = Math.floor(time / 32);
  }
  return out;
};

const freshRandom = () => Array.from(randomBytes(RANDOM_LEN), byte => byte % 32);

/** 同一毫秒内随机段 +1，保证单进程内严格递增 */
const incrementRandom = (digits: number[]) => {
  const next = [...digits];
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i] < 31) {
      next[i] += 1;
      return next;
    }
    next[i] = 0;
  }
  // 80 位随机段溢出几乎不可能，重新取随机数兜底
  return freshRandom();
};

/**
 * 单调 ULID：26 位，前 10 位毫秒时间戳、后 16 位随机数，字典序即时间序。
 * 用作用量事件主键，跨设备合并时直接按主键去重。
 */
export function ulid(now = Date.now()): string {
  if (now <= lastTime) {
    lastRandom = incrementRandom(lastRandom);
    now = lastTime;
  } else {
    lastTime = now;
    lastRandom = freshRandom();
  }
  return encodeTime(now) + lastRandom.map(digit => ALPHABET[digit]).join("");
}
