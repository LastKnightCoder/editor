// 更新内容：从关于页进入的独立页面。有新版本时列出跨越的每个版本，已是最新时只列本版。

import { Suspense, lazy, useRef } from "react";
import { LoaderCircle } from "lucide-react";
import { PageHeader } from "../../../components/PageHeader";
import { useEdgeFade } from "../../../hooks/useScrollState";
import { useNavigator } from "../../../router";
import { notesToShow, useAppUpdate, useAutoUpdateCheck } from "./appUpdate";

// 更新说明用笔记同款只读编辑器渲染；按需加载，避免页面注册时静态引入整个编辑器
const PluginMarkdown = lazy(() =>
  import("../../plugins/components/PluginMarkdown").then(module => ({
    default: module.PluginMarkdown,
  }))
);

function formatDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function NotesBody() {
  const check = useAppUpdate(state => state.check);
  const error = useAppUpdate(state => state.error);
  useAutoUpdateCheck();

  if (!check) {
    return (
      <p className="text-ink-3 flex items-center justify-center gap-2 pt-16 text-[13px]">
        {error ?? (
          <>
            <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
            正在读取更新内容…
          </>
        )}
      </p>
    );
  }
  const notes = notesToShow(check);
  if (notes.length === 0) {
    return <p className="text-ink-3 pt-16 text-center text-[13px]">这个版本没有更新说明</p>;
  }
  return (
    <div className="space-y-3 pb-8 pt-1">
      {notes.map(item => (
        <section key={item.version} className="setting-group px-4 pb-2 pt-3.5">
          <header className="flex items-baseline gap-2">
            <h2 className="text-ink-1 text-[16px] font-extrabold tabular-nums">v{item.version}</h2>
            {item.version === check.currentVersion && (
              <span className="bg-page text-ink-2 rounded-full px-2 py-0.5 text-[11px]">
                当前版本
              </span>
            )}
            {item.version === check.latest.version && check.latest.releaseDate && (
              <span className="text-ink-3 ml-auto text-[12px] tabular-nums">
                {formatDate(check.latest.releaseDate)}
              </span>
            )}
          </header>
          <Suspense fallback={<p className="text-ink-3 py-2 text-[12.5px]">加载中…</p>}>
            <PluginMarkdown source={item.note} />
          </Suspense>
        </section>
      ))}
    </div>
  );
}

export function ReleaseNotesPage() {
  const navigator = useNavigator();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef, { bottom: false });
  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      <PageHeader title="更新内容" onBack={() => navigator.goBack("ui")} />
      <div
        ref={scrollRef}
        className="edge-fade-scroll mobile-page-scroll flex-1 overflow-y-auto px-4"
      >
        <NotesBody />
      </div>
    </div>
  );
}
