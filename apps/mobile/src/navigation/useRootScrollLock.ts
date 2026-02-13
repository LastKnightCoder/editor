import { useEffect } from "react";

const ROOT_SCROLL_LOCK_CLASS = "mobile-root-scroll-locked";
let lockCount = 0;

type RootLockSnapshot = {
  scrollX: number;
  scrollY: number;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
};

let lockSnapshot: RootLockSnapshot | null = null;

function shouldUseBodyFixedLock(): boolean {
  if (typeof navigator === "undefined") {
    return true;
  }
  return !/android/i.test(navigator.userAgent || "");
}

function lockRootScroll(): void {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  const { documentElement, body } = document;
  const scrollX = window.scrollX ?? window.pageXOffset ?? 0;
  const scrollY = window.scrollY ?? window.pageYOffset ?? 0;

  lockSnapshot = {
    scrollX,
    scrollY,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyRight: body.style.right,
    bodyWidth: body.style.width,
  };

  documentElement.classList.add(ROOT_SCROLL_LOCK_CLASS);
  body.classList.add(ROOT_SCROLL_LOCK_CLASS);
  if (shouldUseBodyFixedLock()) {
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
  }
}

function unlockRootScroll(): void {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }
  if (!lockSnapshot) {
    return;
  }

  const { documentElement, body } = document;
  const snapshot = lockSnapshot;
  lockSnapshot = null;

  documentElement.classList.remove(ROOT_SCROLL_LOCK_CLASS);
  body.classList.remove(ROOT_SCROLL_LOCK_CLASS);
  body.style.position = snapshot.bodyPosition;
  body.style.top = snapshot.bodyTop;
  body.style.left = snapshot.bodyLeft;
  body.style.right = snapshot.bodyRight;
  body.style.width = snapshot.bodyWidth;

  const userAgent =
    typeof navigator === "undefined" ? "" : navigator.userAgent || "";
  const isJsdom = /jsdom/i.test(userAgent);

  if (!isJsdom && typeof window.scrollTo === "function") {
    try {
      window.scrollTo(snapshot.scrollX, snapshot.scrollY);
    } catch {
      // jsdom 不实现 scrollTo，忽略即可。
    }
  }
}

export function useRootScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) {
      return;
    }

    if (lockCount === 0) {
      lockRootScroll();
    }
    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        unlockRootScroll();
      }
    };
  }, [locked]);
}

export default useRootScrollLock;
