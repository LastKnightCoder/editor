/**
 * 伴读库（扩展自己的页面 library.html）：所有标注过的网页、跨页的全部标注、页面笔记汇总，
 * 可给页面起名（存在 Tau，成为页面的显示名）。数据经后台转给 Tau；没连上时页面列表用本机缓存。
 */
import { useMemo, useState } from "react";
import { useDebounce } from "ahooks";
import { LayoutList } from "lucide-react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import type { WebPageSummary } from "@tau/shared/browser-companion";
import { Drawer, ToastHost } from "@tau/ui";
import { useCompanionStatus } from "../shared/extension-page";
import { summarize, type LocalNotePage } from "./local";
import {
  useLibraryPage,
  useLocalNotes,
  useStorageInvalidation,
  type FeedFilter,
  type PagesFilter,
} from "./queries";
import { FeedView } from "./views/FeedView";
import { NotesView } from "./views/NotesView";
import { PageDetail } from "./views/PageDetail";
import { PageList } from "./views/PageList";
import { EmptyState } from "./views/parts";
import { pageLabel } from "./helpers";
import { Sidebar, type LibraryView } from "./views/Sidebar";

const SEARCH_DEBOUNCE = { wait: 250 };

/** 笔记页（与伴读面板同一个页面）嵌在抽屉里，写完即存本机草稿 */
function NoteDrawer({
  page,
  onClose,
}: {
  page: { url: string; title: string } | null;
  onClose: () => void;
}) {
  const src = page && `/note.html?${new URLSearchParams({ url: page.url, title: page.title })}`;
  return (
    <Drawer
      open={!!page}
      onOpenChange={open => !open && onClose()}
      title="页面笔记"
      subtitle={page && pageLabel(page)}
      size="md"
      fill
    >
      {src && <iframe title="页面笔记" src={src} className="h-full w-full flex-1 border-0" />}
    </Drawer>
  );
}

function Library() {
  const client = useQueryClient();
  useStorageInvalidation(client);
  const status = useCompanionStatus();
  const online = status.state === "ready";

  const [view, setView] = useState<LibraryView>("pages");
  const [selected, setSelected] = useState<string | null>(() =>
    new URLSearchParams(location.search).get("page")
  );
  /** 列表里点中的那一行：详情查询回来之前先用它渲染 */
  const [clicked, setClicked] = useState<WebPageSummary | null>(null);
  const [pagesFilter, setPagesFilter] = useState<PagesFilter>({ sort: "recent" });
  const [pagesQuery, setPagesQuery] = useState("");
  const [feedFilter, setFeedFilter] = useState<FeedFilter>({});
  const [feedQuery, setFeedQuery] = useState("");
  const [drawer, setDrawer] = useState<{ url: string; title: string } | null>(null);
  const debouncedPagesQuery = useDebounce(pagesQuery, SEARCH_DEBOUNCE);
  const debouncedFeedQuery = useDebounce(feedQuery, SEARCH_DEBOUNCE);

  const notes = useLocalNotes().data;
  const notesByUrl = useMemo(
    () => new Map((notes ?? []).map(page => [page.url, page] as const)),
    [notes]
  );
  const fromTau = useLibraryPage(selected, online);
  const selectedNotes = selected ? notesByUrl.get(selected) : undefined;
  // 只有笔记、没有标注的页面不在 Tau 的页面索引里，用本机笔记拼一个汇总
  const page =
    fromTau ??
    (clicked?.url === selected ? clicked : null) ??
    (selectedNotes
      ? summarize(selectedNotes.url, selectedNotes.title, [], selectedNotes.updatedAt ?? 0)
      : null);

  const openPageDetail = (url: string) => {
    setSelected(url);
    setClicked(null);
    setPagesFilter(filter => ({ ...filter, host: undefined }));
    setView("pages");
  };
  const writeNote = (target: Pick<LocalNotePage, "url" | "title">) =>
    setDrawer({ url: target.url, title: target.title });

  return (
    <div className="bg-page text-ink-1 font-tau text-tau-body flex h-full">
      <Sidebar
        view={view}
        host={pagesFilter.host ?? null}
        state={status.state}
        onView={setView}
        onHost={host => setPagesFilter(filter => ({ ...filter, host: host ?? undefined }))}
      />
      {view === "pages" && (
        <>
          <PageList
            filter={{
              ...pagesFilter,
              query: debouncedPagesQuery.trim() || undefined,
            }}
            query={pagesQuery}
            online={online}
            selected={selected}
            notes={notesByUrl}
            onQuery={setPagesQuery}
            onFilter={filter => setPagesFilter({ ...filter, query: undefined })}
            onSelect={item => {
              setSelected(item.url);
              setClicked(item);
            }}
          />
          {page ? (
            <PageDetail
              page={page}
              canRename={online}
              notes={selectedNotes}
              onWriteNote={() => writeNote({ url: page.url, title: page.title })}
            />
          ) : (
            <main className="bg-surface min-h-0 flex-1">
              <EmptyState icon={<LayoutList size={22} strokeWidth={1.6} />}>
                选择一个页面，查看它的标注与笔记
              </EmptyState>
            </main>
          )}
        </>
      )}
      {view === "feed" && (
        <FeedView
          filter={{
            ...feedFilter,
            query: debouncedFeedQuery.trim() || undefined,
          }}
          query={feedQuery}
          online={online}
          onQuery={setFeedQuery}
          onFilter={filter => setFeedFilter({ ...filter, query: undefined })}
          onOpenPage={openPageDetail}
        />
      )}
      {view === "notes" && (
        <NotesView notes={notes ?? []} onEditDraft={writeNote} onOpenPage={openPageDetail} />
      )}
      <NoteDrawer page={drawer} onClose={() => setDrawer(null)} />
      <ToastHost />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    // 别处（其他浏览器、Tau 里）也可能改了标注，回到伴读库时刷新
    queries: { refetchOnWindowFocus: true, retry: 1 },
  },
});

export function LibraryApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <Library />
    </QueryClientProvider>
  );
}
