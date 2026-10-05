/**
 * 共享元素形变转场（View Transitions API，D-106）。
 *
 * 元素用 `data-morph-key` 声明自己代表的对象（同一对象在列表、浮层、详情页用同一 key）。
 * 转场时只给一对元素临时挂上 MORPH_NAME：旧画面挂源元素，更新后挂目标元素，浏览器
 * 补间两者的位置尺寸；结束后摘掉。目标未就绪（超时）或不在视口时不挂名，源元素淡出。
 *
 * 转场期间根上带 `data-morph`：更新回调执行时 rAF 不触发，靠 rAF 播入场的浮层
 * 据此直接渲染终态（`[[data-morph]_&]` 变体），否则会被截成透明。
 */

import { flushSync } from "react-dom";

export const MORPH_KEY_ATTR = "data-morph-key";

const MORPH_NAME = "page-morph";
const READY_TIMEOUT_MS = 400;
const READY_POLL_MS = 16;

let activeTransition: ReturnType<Document["startViewTransition"]> | null = null;
/** 正在执行某次转场的同步更新：期间嵌套发起的转场（如更新里调了 navigator.back）直接执行 */
let updating = false;
/** 当前挂着 MORPH_NAME 的元素：新转场开始前同步摘掉，避免与上一轮残留重名导致转场中止 */
const namedElements = new Set<HTMLElement>();
/** 形变序号：被后一轮打断的等待结束后不再挂名 */
let morphSeq = 0;

function canTransition() {
  return (
    typeof document.startViewTransition === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function clearNames() {
  for (const el of namedElements) el.style.viewTransitionName = "";
  namedElements.clear();
}

function setName(el: HTMLElement) {
  el.style.viewTransitionName = MORPH_NAME;
  namedElements.add(el);
}

/**
 * 以视图转场执行一次状态更新（update 内同步 setState / dispatch，由此处 flushSync）。
 * afterUpdate 在提交后、截取新画面前执行，可异步等待新画面就绪。
 * 不支持、减少动效或嵌套在另一次更新里时直接执行 update，返回 false。
 */
export function startPageTransition(update: () => void, afterUpdate?: () => Promise<void>) {
  if (updating || !canTransition()) {
    update();
    return false;
  }
  activeTransition?.skipTransition();
  const root = document.documentElement;
  root.dataset.morph = "";
  const transition = document.startViewTransition(async () => {
    updating = true;
    try {
      flushSync(update);
    } finally {
      updating = false;
    }
    await afterUpdate?.();
  });
  activeTransition = transition;
  // 被跳过（新一轮打断、重名）时 ready 会 reject，属预期
  transition.ready.catch(() => undefined);
  void transition.finished.finally(() => {
    if (activeTransition !== transition) return;
    activeTransition = null;
    clearNames();
    delete root.dataset.morph;
  });
  return true;
}

export interface MorphOptions {
  /** 旧画面里的共享元素；null（或不在视口）时不形变，直接执行 update */
  from: Element | null | undefined;
  update: () => void;
  /** 新画面里的共享元素；返回 null 表示尚未就绪，轮询到 400ms 为止 */
  to: () => Element | null | undefined;
}

export function morph({ from, update, to }: MorphOptions) {
  if (updating || !(from instanceof HTMLElement) || !inViewport(from)) {
    update();
    return;
  }
  const seq = ++morphSeq;
  clearNames();
  setName(from);
  const started = startPageTransition(
    () => {
      clearNames();
      update();
    },
    async () => {
      const target = await waitFor(to);
      if (seq !== morphSeq) return;
      if (target instanceof HTMLElement && inViewport(target)) setName(target);
    }
  );
  if (!started) clearNames();
}

/** 在 scope 内找声明了该 key 的元素 */
export function queryMorphElement(scope: ParentNode | null | undefined, key: string) {
  return scope?.querySelector<HTMLElement>(`[${MORPH_KEY_ATTR}="${quote(key)}"]`) ?? null;
}

function pageRoot(pageId: string) {
  return document.querySelector(`[data-page-id="${quote(pageId)}"]`);
}

/** 属性选择器的引号内转义 */
function quote(value: string) {
  return value.replace(/["\\]/g, "\\$&");
}

/** 当前激活页内声明了该 key 的元素（push 新页后找目标用） */
export function queryActivePageMorph(key: string) {
  return queryMorphElement(document.querySelector("[data-page-active]"), key);
}

/**
 * 后退 / 前进的形变配对：源页与目标页（保活中）都声明了同一 key 才成对。
 * 目标页此刻是 display:none，元素在更新后才有布局，故返回查找函数而非元素。
 */
export function findPageMorphPair(fromPageId: string, toPageId: string) {
  if (!canTransition()) return null;
  const fromRoot = pageRoot(fromPageId);
  const toRoot = pageRoot(toPageId);
  if (!fromRoot || !toRoot) return null;
  for (const from of fromRoot.querySelectorAll<HTMLElement>(`[${MORPH_KEY_ATTR}]`)) {
    const key = from.getAttribute(MORPH_KEY_ATTR);
    if (key && queryMorphElement(toRoot, key)) {
      return { from, to: () => queryMorphElement(pageRoot(toPageId), key) };
    }
  }
  return null;
}

function inViewport(el: Element) {
  const rect = el.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}

async function waitFor(resolve: () => Element | null | undefined) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    const found = resolve();
    if (found || Date.now() >= deadline) return found ?? null;
    await new Promise(r => setTimeout(r, READY_POLL_MS));
  }
}
