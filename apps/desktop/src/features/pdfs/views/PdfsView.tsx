/**
 * PDF 列表：一整张纸——页头（标题 · 统计 · 搜索 · 添加）→ 来源 pills + 排序 + 封面⇄列表
 * →「最近打开」续读行 → 全部文件（封面墙或行式列表）。整页可拖入 PDF 导入。
 * 点文件进入 pdf-detail；本地文件缺缩略图时在后台补生成。
 */

import { pdfText, pdfValue, usePdfI18n } from "../i18n";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  ArrowDownUp,
  ChevronDown,
  FileDown,
  FileText,
  FileUp,
  LayoutGrid,
  Link2,
  List,
  Plus,
  Search,
  SearchX,
} from "lucide-react";
import { Button, ConfirmDialog, FilterPill, Input, Loading, Menu, Segmented, toast } from "@tau/ui";
import { FadeScroll } from "@tau/ui";
import { showInFolder } from "@/commands";
import { usePage } from "@/page/PageProvider";
import {
  PDF_SORTS,
  PDF_SOURCES,
  matchQuery,
  matchSource,
  recentEntries,
  sortEntries,
  type PdfEntry,
  type PdfLayout,
  type PdfSort,
  type PdfSource,
} from "../model";
import { usePdfActions, usePdfLibrary } from "../queries";
import { usePdfPrefs } from "../prefs";
import { enqueueThumbnail } from "../thumbnails";
import { CoverTile, PdfList, RecentCard, type PdfItemActions } from "../components/PdfItems";
import { AddPdfDialog } from "../components/AddPdfDialog";
import { RenamePdfDialog } from "../components/RenamePdfDialog";

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

export function PdfsView() {
  usePdfI18n();

  const { navigator } = usePage();
  const { entries, loading } = usePdfLibrary();
  const actions = usePdfActions();
  const { layout, sort, uploadOnImport, setLayout, setSort, setUploadOnImport } = usePdfPrefs();

  const [source, setSource] = useState<PdfSource>("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<"local" | "remote" | null>(null);
  const [renaming, setRenaming] = useState<PdfEntry | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PdfEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dragging, setDragging] = useState(false);
  // dragenter/leave 在子元素间穿梭时成对触发，计数到 0 才算真正离开
  const dragDepth = useRef(0);

  const all = useMemo(() => entries ?? [], [entries]);
  const visible = useMemo(
    () =>
      sortEntries(
        all.filter(e => matchSource(e, source) && matchQuery(e, query)),
        sort
      ),
    [all, source, query, sort]
  );
  const recent = useMemo(() => recentEntries(all), [all]);
  const totalAnnotations = useMemo(() => all.reduce((s, e) => s + e.annotationCount, 0), [all]);
  const searchable = useMemo(() => all.filter(e => e.index === "ready").length, [all]);

  // 本地文件缺缩略图：后台串行补生成（远程文件要下载，等打开时再生成）
  useEffect(() => {
    for (const e of all) {
      if (e.isLocal && !e.fileMissing && !e.thumbnailUrl) enqueueThumbnail(e.id, e.raw.filePath);
    }
  }, [all]);

  const importFiles = (files: File[]) => void actions.importFiles(files, uploadOnImport);

  const itemActions: PdfItemActions = {
    onOpen: e => navigator.push("pdf-detail", { pdfId: e.id }),
    onRename: setRenaming,
    onUpload: e => void actions.uploadToCloud(e),
    onCopyLink: e => void copyLink(e.raw.remoteUrl),
    onReveal: e => void showInFolder(e.raw.filePath),
    onBuildIndex: e => {
      toast.info(pdfText("feedback.indexStarted", { title: pdfValue(e.title) }));
      void actions.buildIndex(e);
    },
    onRelocate: e => void actions.relocate(e),
    onDelete: setPendingDelete,
  };

  if (loading) return <Loading />;

  const filtering = source !== "all" || query.trim().length > 0;
  const sortLabel = pdfText(`sort.${sort}`);
  const count = (s: PdfSource) => all.filter(e => matchSource(e, s)).length;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pt-1 pb-4">
      <div
        className="bg-surface shadow-card rounded-tau-lg relative flex min-h-0 flex-1 flex-col overflow-hidden"
        onDragEnter={e => {
          if (!hasFiles(e)) return;
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={e => {
          if (hasFiles(e)) e.preventDefault();
        }}
        onDragLeave={e => {
          if (!hasFiles(e)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={e => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          importFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <div className="flex flex-none flex-col px-8 pt-5">
          <div className="flex h-10 flex-none items-center gap-3">
            <h1 className="text-tau-title-lg shrink-0 font-semibold tracking-[-0.01em]">PDF</h1>
            <span className="text-tau-meta text-ink-2 w-0 flex-1 truncate whitespace-nowrap tabular-nums">
              {all.length > 0 && (
                <>
                  <b className="text-ink-1 font-semibold">{all.length}</b>{" "}
                  {pdfText("summary.fileUnit", { count: all.length })}
                  {totalAnnotations > 0 && (
                    <>
                      <span className="text-ink-3 mx-1.5">·</span>
                      <b className="text-ink-1 font-semibold">{totalAnnotations}</b>{" "}
                      {pdfText("summary.annotationUnit", { count: totalAnnotations })}
                    </>
                  )}
                  {searchable > 0 && (
                    <>
                      <span className="text-ink-3 mx-1.5">·</span>
                      <b className="text-ink-1 font-semibold">{searchable}</b>{" "}
                      {pdfText("summary.searchableUnit")}
                    </>
                  )}
                </>
              )}
            </span>
            {all.length > 0 && (
              <>
                <Input
                  size="sm"
                  lead={Search}
                  clearable
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Escape" && query) {
                      e.stopPropagation();
                      setQuery("");
                    }
                  }}
                  placeholder={pdfText("search.fileName")}
                  className="w-0"
                  wrapperClassName="w-auto max-w-[240px] flex-[0_1_240px]"
                />
                <Button
                  variant="primary"
                  size="sm"
                  icon={Plus}
                  className="shrink-0"
                  onClick={() => setAdding("local")}
                >
                  {pdfText("file.addPdf")}
                </Button>
              </>
            )}
          </div>

          {all.length > 0 && (
            <div className="mt-2 flex h-10 flex-none items-center gap-1.5">
              <div className="flex w-0 flex-1 items-center gap-1.5 py-1">
                {PDF_SOURCES.map(s => (
                  <FilterPill
                    key={s.value}
                    active={source === s.value}
                    onClick={() => setSource(s.value)}
                    label={pdfText(`source.${s.value}`)}
                    count={count(s.value)}
                  />
                ))}
              </div>
              <Menu
                align="end"
                trigger={
                  <Button variant="ghost" size="sm" icon={ArrowDownUp} className="shrink-0">
                    {sortLabel}
                    <ChevronDown className="text-ink-3 size-3.5" strokeWidth={1.75} />
                  </Button>
                }
              >
                <Menu.RadioGroup value={sort} onValueChange={v => setSort(v as PdfSort)}>
                  {PDF_SORTS.map(s => (
                    <Menu.RadioItem key={s.value} value={s.value}>
                      {pdfText(`sort.${s.value}`)}
                    </Menu.RadioItem>
                  ))}
                </Menu.RadioGroup>
              </Menu>
              <Segmented
                label={pdfText("layout.label")}
                size="sm"
                value={layout}
                onValueChange={(v: PdfLayout) => setLayout(v)}
                className="shrink-0"
              >
                <Segmented.Item value="cover" icon={LayoutGrid} label={pdfText("layout.cover")} />
                <Segmented.Item value="list" icon={List} label={pdfText("layout.list")} />
              </Segmented>
            </div>
          )}
        </div>

        <FadeScroll className="mb-4 min-h-0 flex-1 pt-3 pr-[26px] pb-4 pl-8">
          {all.length === 0 ? (
            <EmptyLibrary
              onPickFiles={() => setAdding("local")}
              onAddLink={() => setAdding("remote")}
            />
          ) : (
            <>
              {!filtering && layout === "cover" && recent.length > 0 && (
                <section className="mb-6">
                  <SectionTitle title={pdfText("sort.opened")} hint={pdfText("recent.hint")} />
                  <div className="-mx-3.5 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-1">
                    {recent.map(entry => (
                      <RecentCard
                        key={entry.id}
                        entry={entry}
                        onOpen={() => itemActions.onOpen(entry)}
                      />
                    ))}
                  </div>
                </section>
              )}
              <section>
                <SectionTitle
                  title={
                    query.trim()
                      ? pdfText("filter.query", { query: pdfValue(query.trim()) })
                      : pdfText("source.all")
                  }
                  hint={pdfText("list.summary", {
                    count: pdfValue(visible.length),
                    sort: pdfValue(sortLabel),
                  })}
                />
                {visible.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-16 text-center">
                    <SearchX className="text-ink-3 size-6" strokeWidth={1.5} />
                    <p className="text-tau-meta text-ink-2">{pdfText("empty.filtered")}</p>
                    <p className="text-tau-sm text-ink-3">{pdfText("empty.filteredHint")}</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-1"
                      onClick={() => {
                        setQuery("");
                        setSource("all");
                      }}
                    >
                      {pdfText("filter.clear")}
                    </Button>
                  </div>
                ) : layout === "list" ? (
                  <PdfList entries={visible} sort={sort} onSort={setSort} actions={itemActions} />
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-[22px] gap-y-6">
                    {visible.map(entry => (
                      <CoverTile key={entry.id} entry={entry} actions={itemActions} />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </FadeScroll>

        {dragging && (
          <div className="border-accent bg-accent-soft/90 text-accent-text rounded-tau-lg pointer-events-none absolute inset-2.5 z-10 grid place-items-center border-2 border-dashed text-center">
            <div className="flex flex-col items-center gap-1.5">
              <FileDown className="size-7" strokeWidth={1.5} />
              <span className="text-[15px] font-semibold">{pdfText("upload.dropTitle")}</span>
              <span className="text-tau-meta text-ink-2">
                {uploadOnImport ? pdfText("upload.cloudHint") : pdfText("upload.localHint")}
              </span>
            </div>
          </div>
        )}
      </div>

      <AddPdfDialog
        open={adding !== null}
        initialTab={adding ?? "local"}
        uploadOnImport={uploadOnImport}
        onUploadOnImportChange={setUploadOnImport}
        onClose={() => setAdding(null)}
        onFiles={importFiles}
        onAddRemote={actions.addRemote}
      />
      <RenamePdfDialog
        entry={renaming}
        onClose={() => setRenaming(null)}
        onSubmit={actions.rename}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={open => {
          if (!open) setPendingDelete(null);
        }}
        title={pdfText("file.deleteTitle")}
        context={pendingDelete?.title}
        description={
          pendingDelete?.isLocal ? pdfText("file.keepLocalCopy") : pdfText("file.keepRemote")
        }
        impact={
          pendingDelete
            ? pdfText(
                pendingDelete.annotationCount ? "file.deleteImpactCount" : "file.deleteImpact",
                { count: pdfValue(pendingDelete.annotationCount) }
              )
            : undefined
        }
        danger
        confirmText={pdfText("action.delete")}
        loading={deleting}
        onConfirm={async () => {
          if (!pendingDelete) return;
          setDeleting(true);
          try {
            await actions.remove(pendingDelete);
            setPendingDelete(null);
          } catch (error) {
            console.error("[pdfs] 删除失败", error);
            toast.error(pdfText("feedback.deleteFailed"));
          } finally {
            setDeleting(false);
          }
        }}
      />
    </div>
  );
}

async function copyLink(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(pdfText("feedback.linkCopied"));
  } catch {
    toast.error(pdfText("feedback.copyFailed"));
  }
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  usePdfI18n();

  return (
    <h2 className="mb-3 flex items-baseline gap-2 px-0.5 text-[13.5px] font-semibold">
      {title}
      {hint && <small className="text-tau-sm text-ink-3 font-normal tabular-nums">{hint}</small>}
    </h2>
  );
}

function EmptyLibrary({ onPickFiles, onAddLink }: { onPickFiles(): void; onAddLink(): void }) {
  usePdfI18n();

  return (
    <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-2 px-5 text-center">
      <span className="bg-accent-soft text-accent-text mb-1.5 grid size-[52px] place-items-center rounded-[16px]">
        <FileText className="size-6" strokeWidth={1.5} />
      </span>
      <p className="text-ink-1 text-[15px] font-semibold">{pdfText("empty.title")}</p>
      <p className="text-tau-meta text-ink-2 max-w-[40ch]">{pdfText("empty.description")}</p>
      <div className="mt-2.5 flex gap-2">
        <Button variant="primary" size="sm" icon={FileUp} onClick={onPickFiles}>
          {pdfText("file.choose")}
        </Button>
        <Button variant="secondary" size="sm" icon={Link2} onClick={onAddLink}>
          {pdfText("file.addLink")}
        </Button>
      </div>
      <p className="text-tau-sm text-ink-3 mt-1.5">{pdfText("empty.dropHint")}</p>
    </div>
  );
}
