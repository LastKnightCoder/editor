/** 日常区：番茄钟倒计时与时间账本 */
import { mustQuery } from "../lib/dom.ts";

const POMODORO_SECONDS = 25 * 60;

type LedgerBlock = [start: number, end: number, tag: number];

const LEDGER: [string, LedgerBlock[]][] = [
  [
    "周一",
    [
      [9, 10.5, 1],
      [14, 15, 4],
    ],
  ],
  [
    "周二",
    [
      [9.5, 11, 1],
      [20, 21, 2],
    ],
  ],
  [
    "周三",
    [
      [8.5, 10, 1],
      [10.2, 11, 1],
      [15, 16.5, 4],
    ],
  ],
  ["周四", [[9.5, 10.4, 1]]],
];

// 账本横轴是 6–24 点
const DAY_START = 6;
const DAY_SPAN = 18;

function renderLedger() {
  const pct = (v: number) => ((v / DAY_SPAN) * 100).toFixed(1);
  mustQuery("#ledger").innerHTML = LEDGER.map(
    ([day, blocks]) =>
      `<div class="lg-row"><span>${day}</span><span class="tr">${blocks
        .map(
          ([a, b, tag]) =>
            `<i style="left:${pct(a - DAY_START)}%;width:${pct(b - a)}%;background:var(--tau-tag-${tag})"></i>`
        )
        .join("")}</span></div>`
  ).join("");
}

function startPomodoro() {
  const time = mustQuery("#pomo-time");
  const bar = mustQuery("#pomo-bar");
  let left = 16 * 60 + 24;
  setInterval(() => {
    left = left > 0 ? left - 1 : POMODORO_SECONDS;
    const mm = String(Math.floor(left / 60)).padStart(2, "0");
    const ss = String(left % 60).padStart(2, "0");
    time.textContent = `${mm}:${ss}`;
    bar.style.width = `${(100 * (1 - left / POMODORO_SECONDS)).toFixed(2)}%`;
  }, 1000);
}

export function initDaily() {
  renderLedger();
  startPomodoro();
}
