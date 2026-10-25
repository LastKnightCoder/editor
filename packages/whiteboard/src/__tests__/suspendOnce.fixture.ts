import { use } from "react";

/** 首次渲染挂起、release 后放行的组件：让同一 Suspense 边界内尚未提交的兄弟渲染被整体丢弃 */
export function createSuspendOnce() {
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  function SuspendOnce() {
    use(pending);
    return null;
  }
  return { SuspendOnce, release };
}
