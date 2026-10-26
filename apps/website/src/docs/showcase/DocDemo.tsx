/** 正文里的一块示意：按名字取组件，加载中占位、出错时只影响这一块 */
import { Suspense } from "react";
import { ErrorBoundary } from "@tau/ui";
import { findDemo } from "./registry.ts";

function Placeholder({ text }: { text: string }) {
  return (
    <div className="border-line-1 text-ink-3 grid h-[240px] place-items-center rounded-[14px] border border-dashed text-[13px]">
      {text}
    </div>
  );
}

export function DocDemo({ name, caption }: { name: string; caption?: string }) {
  const Demo = findDemo(name);
  return (
    <figure className="my-8 max-w-none">
      {Demo ? (
        <ErrorBoundary fallback={<Placeholder text="示意加载失败，请刷新页面重试" />}>
          <Suspense fallback={<Placeholder text="示意加载中…" />}>
            <Demo />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <Placeholder text={`缺少示意：${name}`} />
      )}
      {caption && (
        <figcaption className="text-ink-3 mt-3 text-center text-[13px]">{caption}</figcaption>
      )}
    </figure>
  );
}
