import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor } from "@tau/editor";
import { cn } from "@tau/ui";
import { DocsHeader } from "../docs/DocsHeader.tsx";
import { getDocsKit } from "../docs/editorKit.ts";
import { docsMarkdown } from "../docs/editorMarkdown.ts";
import {
  PLATFORMS,
  collectReleaseNotes,
  parseReleaseHash,
  releaseAnchor,
  type ReleaseNote,
  type ReleasePlatform,
} from "./releases.ts";

const NOTES: Record<ReleasePlatform, ReleaseNote[]> = {
  desktop: collectReleaseNotes(
    import.meta.glob<string>("../../../desktop/release-notes/*.md", {
      query: "?raw",
      import: "default",
      eager: true,
    })
  ),
  mobile: collectReleaseNotes(
    import.meta.glob<string>("../../../mobile/release-notes/*.md", {
      query: "?raw",
      import: "default",
      eager: true,
    })
  ),
};

/** 一次渲染的版本数：每个版本是一个编辑器实例，滚到底再补下一批 */
const BATCH = 12;
/** 版本标题越过吸顶导航下方这条线就算「正在读」 */
const READING_LINE = 60 + 72;

function subscribeHash(listener: () => void) {
  addEventListener("hashchange", listener);
  return () => removeEventListener("hashchange", listener);
}

const useHash = () => useSyncExternalStore(subscribeHash, () => location.hash);

function setHash(hash: string) {
  if (location.hash === hash) return;
  history.pushState(null, "", hash || location.pathname);
  dispatchEvent(new HashChangeEvent("hashchange"));
}

const ReleaseBody = memo(function ReleaseBody({ markdown }: { markdown: string }) {
  const value = useMemo(() => docsMarkdown.importFromMarkdown(markdown), [markdown]);
  return <Editor kit={getDocsKit()} initValue={value} readonly />;
});

function useActiveRelease(platform: ReleasePlatform, renderedCount: number) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      let next: string | null = null;
      document.querySelectorAll<HTMLElement>("[data-release]").forEach(section => {
        if (next === null || section.getBoundingClientRect().top <= READING_LINE)
          next = section.dataset.release ?? null;
      });
      setActive(next);
    };
    const schedule = () => (frame ||= requestAnimationFrame(update));
    schedule();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
    };
  }, [platform, renderedCount]);
  return active;
}

function PlatformSwitch({ current }: { current: ReleasePlatform }) {
  return (
    <div role="tablist" aria-label="选择平台" className="flex gap-2">
      {PLATFORMS.map(item => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={item.key === current}
          onClick={() => {
            setHash(`#${item.key}`);
            scrollTo({ top: 0 });
          }}
          className="border-line-1 text-ink-2 hover:bg-hover hover:text-ink-1 aria-selected:border-accent aria-selected:bg-accent-soft aria-selected:text-accent-text inline-flex h-9 items-center gap-2 rounded-[10px] border px-3.5 text-[14px] transition-colors aria-selected:font-medium"
        >
          {item.label}
          <span className="text-ink-3 text-[12px] font-normal">{item.summary}</span>
        </button>
      ))}
    </div>
  );
}

export function ChangelogApp() {
  const { platform, version: targetVersion } = parseReleaseHash(useHash());
  const notes = NOTES[platform];
  const [count, setCount] = useState(BATCH);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 打开锚点里的版本：先把它所在的批次渲染出来，再滚过去
  const targetIndex = targetVersion ? notes.findIndex(note => note.version === targetVersion) : -1;
  const renderedCount = Math.max(count, targetIndex + 1);
  const visible = notes.slice(0, renderedCount);

  useEffect(() => setCount(BATCH), [platform]);

  useEffect(() => {
    if (targetIndex < 0 || !targetVersion) return;
    document.getElementById(releaseAnchor(platform, targetVersion))?.scrollIntoView();
  }, [platform, targetVersion, targetIndex]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      entries => entries.some(entry => entry.isIntersecting) && setCount(n => n + BATCH),
      { rootMargin: "800px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [platform, renderedCount]);

  const active = useActiveRelease(platform, renderedCount);
  const selectVersion = useCallback(
    (version: string) => {
      const anchor = releaseAnchor(platform, version);
      // 锚点没变（读到别处又点回来）时不会触发跳转，直接滚
      if (location.hash === `#${anchor}`) document.getElementById(anchor)?.scrollIntoView();
      else setHash(`#${anchor}`);
    },
    [platform]
  );
  const current = PLATFORMS.find(item => item.key === platform);

  return (
    <div className="bg-page font-tau text-ink-1 min-h-dvh">
      <DocsHeader current="changelog" />
      <div className="mx-auto flex max-w-[1200px] gap-12 px-6 max-sm:px-5">
        <main className="min-w-0 flex-1 py-12 max-sm:py-8">
          <div className="mx-auto max-w-[760px]">
            <p className="text-accent-text text-[13px] font-medium tracking-[0.14em]">更新日志</p>
            <h1 className="mt-3 font-serif text-[38px] leading-tight font-semibold max-sm:text-[30px]">
              Tau 的每一次更新
            </h1>
            <p className="text-ink-2 mt-3 text-[16px] leading-relaxed">
              从第一个版本到现在，每次发布都改了什么。应用内也能在「关于与更新」里看到本版内容。
            </p>
            <div className="mt-8">
              <PlatformSwitch current={platform} />
            </div>
            <DndProvider backend={HTML5Backend}>
              {visible.map((note, index) => (
                <section
                  key={`${platform}-${note.version}`}
                  id={releaseAnchor(platform, note.version)}
                  data-release={note.version}
                  className="border-line-1 mt-10 scroll-mt-[84px] border-t pt-8"
                >
                  <h2 className="flex items-center gap-3 font-serif text-[26px] font-semibold">
                    <a
                      href={`#${releaseAnchor(platform, note.version)}`}
                      className="hover:text-accent-text transition-colors"
                    >
                      v{note.version}
                    </a>
                    {index === 0 && (
                      <span className="bg-accent-soft text-accent-text font-tau rounded-full px-2.5 py-0.5 text-[12px] font-medium">
                        最新
                      </span>
                    )}
                  </h2>
                  <div className="mt-4">
                    <ReleaseBody markdown={note.markdown} />
                  </div>
                </section>
              ))}
            </DndProvider>
            {renderedCount < notes.length ? (
              <div ref={sentinelRef} className="text-ink-3 py-10 text-center text-[13px]">
                正在加载更早的版本…
              </div>
            ) : (
              <p className="text-ink-3 border-line-1 mt-10 border-t py-10 text-center text-[13px]">
                {current?.label}一共发布了 {notes.length} 个版本，以上是全部。
              </p>
            )}
          </div>
        </main>
        <aside className="sticky top-[60px] hidden h-[calc(100dvh-60px)] w-[180px] shrink-0 overflow-y-auto py-12 lg:block">
          <nav aria-label="版本列表" className="text-[13px]">
            <p className="text-ink-3 mb-2 text-[12px] font-medium tracking-[0.12em]">
              {current?.label}版本
            </p>
            <ul className="border-line-1 flex flex-col border-l">
              {notes.map(note => (
                <li key={note.version}>
                  <button
                    type="button"
                    onClick={() => selectVersion(note.version)}
                    aria-current={note.version === active ? "location" : undefined}
                    className={cn(
                      "text-ink-2 hover:text-ink-1 -ml-px block w-full border-l border-transparent py-1 pl-3 pr-2 text-left tabular-nums leading-snug transition-colors",
                      "aria-[current=location]:border-accent aria-[current=location]:text-accent-text"
                    )}
                  >
                    v{note.version}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      </div>
    </div>
  );
}
