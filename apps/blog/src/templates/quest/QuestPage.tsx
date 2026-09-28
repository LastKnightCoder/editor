import { memo, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Header } from "@blog/components/Layout";
import DocCollectionsMenu from "@blog/components/Layout/DocCollectionsMenu";
import { Tag, ScrollToTop } from "@blog/components/Common";
import { Editor, EditorProvider } from "@tau/editor";
import { getInitData, formatDate, getReadingTime, getPlainText, joinPath } from "@blog/utils";
import { QuestAnswerData, QuestData } from "@blog/types";
import DndProvider from "@blog/components/DndProvider";
import { createBlogEditorRegistry, createBlogEditorConfig } from "@blog/services/editorRegistry";
import { createBlogEditorExtensions } from "@blog/editorExtensions";
import useBlogTheme from "@blog/hooks/useBlogTheme";
import { fadeUp, defaultTransition } from "@blog/utils/motion";

const statusLabels: Record<QuestData["status"], string> = {
  not_started: "未开始",
  in_progress: "进行中",
  resolved: "已解决",
};

const serifLabelClass = "font-['Songti_SC','STSong','Noto_Serif_SC','Source_Han_Serif_SC',serif]";

type LoadedAnswerContent = {
  loading: boolean;
  content: QuestAnswerData["content"];
  error: boolean;
};

function extractInitData(html: string): unknown | null {
  const marker = "window._INIT_DATA_";
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = html.indexOf("{", markerIndex);
  if (start < 0) return null;

  let inString = false;
  let escaped = false;
  let depth = 0;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const raw = html.slice(start, index + 1);
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function readRemoteContent(data: unknown): QuestAnswerData["content"] {
  if (!data || typeof data !== "object") return undefined;
  const content = (data as { content?: unknown }).content;
  if (!content || typeof content !== "object") return undefined;
  const record = content as { content?: QuestAnswerData["content"] };
  return Array.isArray(record.content) ? record.content : undefined;
}

const AnswerContent = memo(
  ({
    answer,
    basePath,
    settings,
  }: {
    answer: QuestAnswerData;
    basePath: string;
    settings: ReturnType<typeof getInitData>["settings"];
  }) => {
    const blogTheme = useBlogTheme();
    const sourceHref = answer.source?.href
      ? joinPath(basePath, answer.source.href, { raw: true })
      : "";
    const [remote, setRemote] = useState<LoadedAnswerContent>({
      loading: Boolean(sourceHref && !answer.content),
      content: answer.content,
      error: false,
    });

    useEffect(() => {
      if (!sourceHref || answer.content) {
        return;
      }

      let cancelled = false;
      setRemote({ loading: true, content: undefined, error: false });
      fetch(sourceHref)
        .then(response => response.text())
        .then(html => {
          if (cancelled) return;
          const content = readRemoteContent(extractInitData(html));
          setRemote({
            loading: false,
            content,
            error: !content,
          });
        })
        .catch(() => {
          if (cancelled) return;
          setRemote({ loading: false, content: undefined, error: true });
        });

      return () => {
        cancelled = true;
      };
    }, [answer.content, sourceHref]);

    // hooks 必须先于下方条件早退调用，避免远端答案加载完成后 hooks 数量变化
    const editorRegistry = useMemo(() => createBlogEditorRegistry(), []);
    const editorConfig = useMemo(() => createBlogEditorConfig(blogTheme), [blogTheme]);
    const editorExtensions = useMemo(() => createBlogEditorExtensions(settings), [settings]);

    if (remote.loading) {
      return <p className="text-sm text-[var(--color-text-tertiary)]">正在取回答案...</p>;
    }

    if (remote.error || !remote.content || remote.content.length === 0) {
      return <p className="text-sm text-[var(--color-text-tertiary)]">暂无可展示内容</p>;
    }

    return (
      <DndProvider>
        <EditorProvider
          registry={editorRegistry}
          config={editorConfig}
          extensions={editorExtensions}
        >
          <Editor initValue={remote.content} readonly />
        </EditorProvider>
      </DndProvider>
    );
  }
);

AnswerContent.displayName = "AnswerContent";

const SectionKicker = memo(({ label, className = "" }: { label: string; className?: string }) => (
  <div
    className={`${serifLabelClass} ${className} mb-5 inline-flex items-center gap-3 text-lg font-semibold text-[var(--color-text-primary)]`}
  >
    <span>{label}</span>
    <span className="h-px w-10 bg-[var(--color-border-ring-heavy)]" />
  </div>
));

SectionKicker.displayName = "SectionKicker";

function getAnswerLabel(index: number, total: number): string {
  if (total <= 1) {
    return "解";
  }
  const numerals = ["其一", "其二", "其三", "其四", "其五", "其六"];
  return `解 · ${numerals[index] || `其 ${index + 1}`}`;
}

const AnswerHeader = memo(
  ({
    answer,
    basePath,
    index,
    showDivider,
    total,
  }: {
    answer: QuestAnswerData;
    basePath: string;
    index: number;
    showDivider: boolean;
    total: number;
  }) => {
    const showIndex = total > 1;
    const answerLabel = getAnswerLabel(index, total);

    return (
      <div
        className={`mb-7 ${showDivider ? "border-t border-[var(--color-border-ring-heavy)] pt-6" : ""}`}
      >
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <div
            className={`${serifLabelClass} text-xl font-semibold text-[var(--color-text-primary)]`}
            data-answer-index={showIndex ? String(index + 1).padStart(2, "0") : undefined}
          >
            {answerLabel}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs tracking-[0.04em] text-[var(--color-text-tertiary)]">
            <time dateTime={new Date(answer.updateTime).toISOString()}>
              {formatDate(answer.updateTime, "full")}
            </time>
            {answer.source?.href && (
              <a
                href={joinPath(basePath, answer.source.href)}
                className="text-[var(--color-text-secondary)] underline underline-offset-4 transition-colors hover:text-[var(--color-accent)]"
              >
                原文
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }
);

AnswerHeader.displayName = "AnswerHeader";

const QuestPage = memo(() => {
  const initData = getInitData();
  const { site, navigation } = initData;
  const quest = initData.content as QuestData;
  const docCollections = initData.docCollections || [];
  const blogSettings = initData.settings;
  const blogTheme = useBlogTheme();
  const blogEditorRegistry = useMemo(() => createBlogEditorRegistry(), []);
  const blogEditorConfig = useMemo(() => createBlogEditorConfig(blogTheme), [blogTheme]);
  const blogEditorExtensions = useMemo(
    () => createBlogEditorExtensions(blogSettings),
    [blogSettings]
  );
  const hasDescription = Boolean(quest.description && getPlainText(quest.description).trim());

  const readingTime = useMemo(() => {
    const answerContent = quest.answers.flatMap(answer => answer.content || []);
    return getReadingTime([...(quest.description || []), ...answerContent]);
  }, [quest.answers, quest.description]);

  const desktopDocNav =
    docCollections.length > 0 ? (
      <DocCollectionsMenu collections={docCollections} basePath={site.basePath} variant="desktop" />
    ) : undefined;
  const mobileDocNav =
    docCollections.length > 0 ? (
      <DocCollectionsMenu collections={docCollections} basePath={site.basePath} variant="mobile" />
    ) : undefined;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <Header
        title={site.title}
        basePath={site.basePath}
        navigation={navigation}
        customNav={desktopDocNav}
        mobileCustomNav={mobileDocNav}
        searchHref={initData.search?.href}
      />

      <main className="min-h-0 flex-1 overflow-hidden">
        <div className="h-full min-h-0 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="panel-scroll-area" data-primary-scroll-container>
            <article className="wide-prose-column">
              <motion.header
                className="mb-10"
                initial={fadeUp.hidden}
                animate={fadeUp.visible}
                transition={defaultTransition}
              >
                <div className="mb-5 flex flex-wrap items-center gap-2">
                  <Tag name={quest.groupTitle} size="sm" />
                  <span className="tag">{statusLabels[quest.status]}</span>
                  <span className="text-xs font-medium uppercase tracking-[0.15em] text-[var(--color-text-tertiary)]">
                    {formatDate(quest.updateTime)} · 约 {readingTime} 分钟
                  </span>
                </div>
                <SectionKicker label="问" className="mb-4" />
                <h1 className="text-4xl font-bold leading-[1.08] text-[var(--color-text-primary)] sm:text-5xl">
                  {quest.title}
                </h1>
                {hasDescription && quest.description && (
                  <div
                    className="mt-6 max-w-[68ch] text-[15px] leading-8 text-[var(--color-text-tertiary)]"
                    data-testid="quest-description"
                  >
                    <DndProvider>
                      <EditorProvider
                        registry={blogEditorRegistry}
                        config={blogEditorConfig}
                        extensions={blogEditorExtensions}
                      >
                        <Editor
                          initValue={quest.description}
                          readonly
                          className="text-[var(--color-text-tertiary)]"
                        />
                      </EditorProvider>
                    </DndProvider>
                  </div>
                )}
              </motion.header>

              <section className="space-y-14">
                {quest.answers.length > 0 ? (
                  quest.answers.map((answer, index) => (
                    <section key={answer.id}>
                      <AnswerHeader
                        answer={answer}
                        basePath={site.basePath}
                        index={index}
                        showDivider={hasDescription || index > 0}
                        total={quest.answers.length}
                      />
                      <AnswerContent
                        answer={answer}
                        basePath={site.basePath}
                        settings={blogSettings}
                      />
                    </section>
                  ))
                ) : (
                  <div>
                    <p
                      className={`${serifLabelClass} text-lg font-semibold text-[var(--color-text-secondary)]`}
                    >
                      仍在路上
                    </p>
                    <p className="mt-2 max-w-[42ch] text-sm leading-7 text-[var(--color-text-tertiary)]">
                      这条求索暂时还没有整理出答案。
                    </p>
                  </div>
                )}
              </section>
            </article>
          </div>
        </div>
      </main>

      <ScrollToTop />
    </div>
  );
});

QuestPage.displayName = "QuestPage";

export default QuestPage;
