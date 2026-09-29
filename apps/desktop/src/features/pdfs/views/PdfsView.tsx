/**
 * PDF 列表：一整张纸——页头（标题 · 统计 · 搜索 · 添加）→ 来源 pills + 排序 + 封面⇄列表
 * →「最近打开」续读行 → 全部文件（封面墙或行式列表）。整页可拖入 PDF 导入。
 * 点文件进入 pdf-detail；本地文件缺缩略图时在后台补生成。
 */

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
import { FadeScroll } from "@/components/FadeScroll";
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
      toast.info(`开始为「${e.title}」建立 AI 索引`);
      void actions.buildIndex(e);
    },
    onRelocate: e => void actions.relocate(e),
    onDelete: setPendingDelete,
  };

  if (loading) return <Loading />;

  const filtering = source !== "all" || query.trim().length > 0;
  const sortLabel = PDF_SORTS.find(s => s.value === sort)?.label ?? "";
  const count = (s: PdfSource) => all.filter(e => matchSource(e, s)).length;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pb-4 pt-1">
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
                  <b className="text-ink-1 font-semibold">{all.length}</b> 个文件
                  {totalAnnotations > 0 && (
                    <>
                      <span className="text-ink-3 mx-1.5">·</span>
                      <b className="text-ink-1 font-semibold">{totalAnnotations}</b> 条标注
                    </>
                  )}
                  {searchable > 0 && (
                    <>
                      <span className="text-ink-3 mx-1.5">·</span>
                      <b className="text-ink-1 font-semibold">{searchable}</b> 个可被 AI 检索
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
                  placeholder="搜索文件名"
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
                  添加 PDF
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
                    label={s.label}
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
                      {s.label}
                    </Menu.RadioItem>
                  ))}
                </Menu.RadioGroup>
              </Menu>
              <Segmented
                label="排布"
                size="sm"
                value={layout}
                onValueChange={(v: PdfLayout) => setLayout(v)}
                className="shrink-0"
              >
                <Segmented.Item value="cover" icon={LayoutGrid} label="封面" />
                <Segmented.Item value="list" icon={List} label="列表" />
              </Segmented>
            </div>
          )}
        </div>

        <FadeScroll className="mb-4 min-h-0 flex-1 pb-4 pl-8 pr-[26px] pt-3">
          {all.length === 0 ? (
            <EmptyLibrary
              onPickFiles={() => setAdding("local")}
              onAddLink={() => setAdding("remote")}
            />
          ) : (
            <>
              {!filtering && layout === "cover" && recent.length > 0 && (
                <section className="mb-6">
                  <SectionTitle title="最近打开" hint="从上次读到的页继续" />
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
                  title={query.trim() ? `搜索「${query.trim()}」` : "全部"}
                  hint={`${visible.length} 个 · 按${sortLabel}`}
                />
                {visible.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-16 text-center">
                    <SearchX className="text-ink-3 size-6" strokeWidth={1.5} />
                    <p className="text-tau-meta text-ink-2">没有符合条件的 PDF</p>
                    <p className="text-tau-sm text-ink-3">
                      这里只按文件名找；想按内容找，用 Ctrl K 或 AI 对话里的 PDF 检索
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-1"
                      onClick={() => {
                        setQuery("");
                        setSource("all");
                      }}
                    >
                      清除筛选
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
              <span className="text-[15px] font-semibold">松开以添加 PDF</span>
              <span className="text-tau-meta text-ink-2">
                {uploadOnImport ? "复制到工作区并上传到云端" : "复制到工作区的 resources 目录"}
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
        title="删除 PDF"
        context={pendingDelete?.title}
        description={
          pendingDelete?.isLocal
            ? "工作区 resources 里的文件副本不会删除。"
            : "远程文件本身不受影响。"
        }
        impact={
          pendingDelete
            ? `一并删除${pendingDelete.annotationCount ? ` ${pendingDelete.annotationCount} 条标注、` : "标注、"}书签和这份 PDF 的 AI 对话`
            : undefined
        }
        danger
        confirmText="删除"
        loading={deleting}
        onConfirm={async () => {
          if (!pendingDelete) return;
          setDeleting(true);
          try {
            await actions.remove(pendingDelete);
            setPendingDelete(null);
          } catch (error) {
            console.error("[pdfs] 删除失败", error);
            toast.error("删除失败");
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
    toast.success("已复制链接");
  } catch {
    toast.error("复制失败");
  }
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <h2 className="mb-3 flex items-baseline gap-2 px-0.5 text-[13.5px] font-semibold">
      {title}
      {hint && <small className="text-tau-sm text-ink-3 font-normal tabular-nums">{hint}</small>}
    </h2>
  );
}

function EmptyLibrary({ onPickFiles, onAddLink }: { onPickFiles(): void; onAddLink(): void }) {
  return (
    <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-2 px-5 text-center">
      <span className="bg-accent-soft text-accent-text mb-1.5 grid size-[52px] place-items-center rounded-[16px]">
        <FileText className="size-6" strokeWidth={1.5} />
      </span>
      <p className="text-ink-1 text-[15px] font-semibold">把论文、书和资料放进来</p>
      <p className="text-tau-meta text-ink-2 max-w-[40ch]">
        支持本地文件和链接。打开后可以标注、加书签，也能让 AI 按页检索和引用。
      </p>
      <div className="mt-2.5 flex gap-2">
        <Button variant="primary" size="sm" icon={FileUp} onClick={onPickFiles}>
          选择文件
        </Button>
        <Button variant="secondary" size="sm" icon={Link2} onClick={onAddLink}>
          添加链接
        </Button>
      </div>
      <p className="text-tau-sm text-ink-3 mt-1.5">也可以直接把 PDF 拖到这里</p>
    </div>
  );
}
