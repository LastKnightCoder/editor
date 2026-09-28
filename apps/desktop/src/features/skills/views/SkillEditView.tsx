/**
 * Skill 整页编辑器（D-060）：左侧该 Skill 的文件树（透明底，沿用纸面），右侧编辑区。
 * SKILL.md 双视图——「编辑」= front-matter 表单（名称 / 描述 / 仅手动）+ 富文本正文，「源码」= 整份 md；
 * 其它 .md 用富文本，其余文件用等宽文本框。⌘S 保存；切文件 / 离开页面时有未保存改动先确认。
 * 内置 / 关联目录的 Skill 只读打开。
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getDesktopKit } from "@/services/editorKit";
import type { Descendant } from "slate";
import {
  ChevronDown,
  ChevronRight,
  File,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Lock,
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Radar,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  Button,
  ConfirmDialog,
  IconButton,
  Input,
  Menu,
  Segmented,
  Tooltip,
  cn,
  toast,
} from "@tau/ui";
import { Editor } from "@tau/editor/src";
import { FadeScroll } from "@/components/FadeScroll";
import { usePage, usePageBreadcrumb, usePageParams } from "@/page/PageProvider";
import useSkillStore from "@/stores/useSkillStore";
import { getMarkdown, importFromMarkdown } from "@/utils/markdown";
import {
  estimateTokens,
  hasTriggerHint,
  joinSkillDocument,
  metaString,
  splitSkillDocument,
} from "@/utils/skill-frontmatter";
import {
  createSkillEntry,
  deleteSkillEntry,
  getSkillDetail,
  readSkillFile,
  renameSkillEntry,
  showSkillInFolder,
  writeSkillFile,
} from "@/commands/skill";
import type { SkillDetail, SkillFile } from "@/types";
import {
  MODE_OPTIONS,
  setSkillMode,
  toSkillItems,
  type SkillItem,
  type SkillMode,
} from "../useSkills";
import { copySkillToMine } from "../skillActions";
import { SkillCodeEditor } from "../components/SkillCodeEditor";

const PAGE_KEY = "skill-edit";
const README = "SKILL.md";

type ViewMode = "visual" | "source";
type EntryPrompt =
  { kind: "new-file" | "new-folder"; dir: string } | { kind: "rename"; file: SkillFile };

/* ── 文件树 ── */

interface TreeNode {
  file: SkillFile;
  depth: number;
}

function buildRows(files: SkillFile[], collapsed: Set<string>): TreeNode[] {
  const rows: TreeNode[] = [];
  for (const file of files) {
    const rel = file.relativePath ?? file.name;
    const parts = rel.split("/");
    // 祖先任一折叠即隐藏
    const hidden = parts
      .slice(0, -1)
      .some((_, i) => collapsed.has(parts.slice(0, i + 1).join("/")));
    if (!hidden) rows.push({ file, depth: parts.length - 1 });
  }
  // SKILL.md 永远排第一
  return rows.sort((a, b) =>
    a.file.relativePath === README ? -1 : b.file.relativePath === README ? 1 : 0
  );
}

function FileTree({
  skillPath,
  files,
  selected,
  dirty,
  readonly,
  onSelect,
  onPrompt,
  onDelete,
}: {
  skillPath: string;
  files: SkillFile[];
  selected: string;
  dirty: boolean;
  readonly: boolean;
  onSelect: (file: SkillFile) => void;
  onPrompt: (prompt: EntryPrompt) => void;
  onDelete: (file: SkillFile) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rows = useMemo(() => buildRows(files, collapsed), [files, collapsed]);
  const toggle = (rel: string) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(rel)) next.delete(rel);
      else next.add(rel);
      return next;
    });

  return (
    <nav aria-label="Skill 文件" className="flex w-[232px] shrink-0 flex-col py-5 pl-3.5 pr-2.5">
      <div className="text-tau-sm text-ink-3 flex h-7 items-center gap-1 px-2">
        <span className="flex-1">文件</span>
        {!readonly && (
          <>
            <Tooltip content="新建文件">
              <IconButton
                aria-label="新建文件"
                className="size-6"
                onClick={() => onPrompt({ kind: "new-file", dir: skillPath })}
              >
                <FilePlus className="size-3.5" strokeWidth={1.75} />
              </IconButton>
            </Tooltip>
            <Tooltip content="新建文件夹">
              <IconButton
                aria-label="新建文件夹"
                className="size-6"
                onClick={() => onPrompt({ kind: "new-folder", dir: skillPath })}
              >
                <FolderPlus className="size-3.5" strokeWidth={1.75} />
              </IconButton>
            </Tooltip>
          </>
        )}
      </div>
      <FadeScroll className="-mr-1.5 min-h-0 flex-1">
        {rows.map(({ file, depth }) => {
          const rel = file.relativePath ?? file.name;
          const isReadme = rel === README;
          const active = !file.isDirectory && file.path === selected;
          const open = !collapsed.has(rel);
          const Icon = file.isDirectory
            ? open
              ? FolderOpen
              : Folder
            : isReadme
              ? Sparkles
              : file.isMarkdown
                ? FileText
                : File;
          return (
            <div
              key={file.path}
              role="treeitem"
              aria-selected={active}
              tabIndex={0}
              onClick={() => (file.isDirectory ? toggle(rel) : onSelect(file))}
              onKeyDown={e =>
                e.key === "Enter" && (file.isDirectory ? toggle(rel) : onSelect(file))
              }
              className={cn(
                "text-tau-meta group/row flex h-7 cursor-pointer items-center gap-1.5 rounded-[8px] pr-1 outline-none",
                active ? "bg-selected text-ink-1 font-medium" : "text-ink-2 hover:bg-hover",
                "focus-visible:shadow-[var(--tau-focus-ring)]"
              )}
              style={{ paddingLeft: 8 + depth * 16 }}
            >
              {file.isDirectory ? (
                open ? (
                  <ChevronDown className="text-ink-3 size-3 shrink-0" strokeWidth={2} />
                ) : (
                  <ChevronRight className="text-ink-3 size-3 shrink-0" strokeWidth={2} />
                )
              ) : (
                <span className="w-3 shrink-0" />
              )}
              <Icon
                className={cn("size-3.5 shrink-0", isReadme ? "text-accent-text" : "text-ink-3")}
                strokeWidth={1.75}
              />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              {active && dirty && (
                <i aria-label="未保存" className="bg-accent size-1.5 shrink-0 rounded-full" />
              )}
              {!readonly && !isReadme && (
                <span
                  onClick={e => e.stopPropagation()}
                  className="opacity-0 focus-within:opacity-100 group-hover/row:opacity-100"
                >
                  <Menu
                    align="start"
                    trigger={
                      <IconButton aria-label={`${file.name} 更多操作`} className="size-5">
                        <MoreHorizontal className="size-3.5" strokeWidth={1.75} />
                      </IconButton>
                    }
                  >
                    {file.isDirectory && (
                      <>
                        <Menu.Item
                          icon={<FilePlus />}
                          onSelect={() => onPrompt({ kind: "new-file", dir: file.path })}
                        >
                          新建文件
                        </Menu.Item>
                        <Menu.Item
                          icon={<FolderPlus />}
                          onSelect={() => onPrompt({ kind: "new-folder", dir: file.path })}
                        >
                          新建文件夹
                        </Menu.Item>
                        <Menu.Separator />
                      </>
                    )}
                    <Menu.Item
                      icon={<Pencil />}
                      onSelect={() => onPrompt({ kind: "rename", file })}
                    >
                      重命名
                    </Menu.Item>
                    <Menu.Item icon={<Trash2 />} danger onSelect={() => onDelete(file)}>
                      删除
                    </Menu.Item>
                  </Menu>
                </span>
              )}
            </div>
          );
        })}
      </FadeScroll>
      <p className="text-tau-sm text-ink-3 m-0 mt-2 px-2 leading-[1.5]">
        SKILL.md 以外的文件只在 AI 需要时读取，适合放长参考资料、模板与脚本。
      </p>
    </nav>
  );
}

/* ── SKILL.md 编辑视图：文档式头部（标题 + AI 看到的描述）+ 正文 ── */

function ReadmeHeader({
  meta,
  onMetaChange,
  folderName,
  readonly,
  item,
}: {
  meta: Record<string, unknown>;
  onMetaChange: (next: Record<string, unknown>) => void;
  folderName: string;
  readonly: boolean;
  item?: SkillItem;
}) {
  const title = metaString(meta, "title") || metaString(meta, "name");
  const description = metaString(meta, "description");
  const tokens = estimateTokens(`${title} ${description}`);
  const set = (key: string, value: unknown) => onMetaChange({ ...meta, [key]: value });
  const hint = !description.trim()
    ? { tone: "text-danger", text: "缺少描述，AI 无法判断何时使用它" }
    : hasTriggerHint(description)
      ? { tone: "text-ok", text: "写了触发场景，AI 能据此判断何时加载" }
      : { tone: "text-ink-3", text: "建议补一句「什么时候用」" };

  return (
    <div className="mb-8">
      <input
        value={title}
        readOnly={readonly}
        onChange={e => set("title", e.target.value)}
        placeholder={folderName}
        aria-label="名称"
        className="placeholder:text-ink-3 w-full bg-transparent text-[28px] font-semibold leading-[1.3] tracking-[-0.01em] outline-none"
      />
      {/* 调用方式：与卡片开关、抽屉「设置」同一份本机状态，三处永远一致 */}
      <div className="text-tau-sm text-ink-3 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {title && (
          <span className="font-tau-mono" title="文件夹名是 AI 调用时的标识，不在此修改">
            {folderName}
          </span>
        )}
        {item && (
          <Segmented
            label="调用方式"
            size="sm"
            value={item.mode}
            onValueChange={(v: SkillMode) => setSkillMode(item.skill, v)}
          >
            {MODE_OPTIONS.map(option => (
              <Segmented.Item key={option.value} value={option.value} label={option.label} />
            ))}
          </Segmented>
        )}
        {item && (
          <span className="min-w-0 truncate">
            {MODE_OPTIONS.find(o => o.value === item.mode)?.description}
          </span>
        )}
      </div>

      <div className="border-line-1 bg-surface focus-within:border-accent mt-5 rounded-[12px] border px-4 pb-2.5 pt-3 transition-[border-color,box-shadow] duration-150 focus-within:shadow-[var(--tau-focus-ring)]">
        <div className="text-tau-sm text-ink-3 mb-1 flex items-center gap-1.5">
          <Radar className="size-3.5" strokeWidth={1.75} />
          AI 看到的描述 · 据此决定何时加载
          <span className="ml-auto tabular-nums">约 {tokens} tokens</span>
        </div>
        <textarea
          value={description}
          readOnly={readonly}
          onChange={e => set("description", e.target.value)}
          placeholder="例如：把一周的日记、已完成待办和日程整理成周报。用户提到「周报」「本周总结」时使用。"
          aria-label="描述"
          rows={2}
          className="text-tau-body text-ink-1 placeholder:text-ink-3 block w-full resize-none bg-transparent leading-[1.7] outline-none [field-sizing:content]"
        />
        <div className={cn("text-tau-sm mt-1", hint.tone)}>{hint.text}</div>
      </div>
    </div>
  );
}

/* ── 页面 ── */

export function SkillEditView() {
  const { path: skillPath } = usePageParams<{ path: string }>();
  const { navigator } = usePage();
  const skills = useSkillStore(s => s.skills);
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [saved, setSaved] = useState<string>("");
  const [draft, setDraft] = useState<string>("");
  const [mode, setMode] = useState<ViewMode>("visual");
  /** 富文本编辑器的重挂载版本：切文件 / 切视图 / 源码改完回到编辑时换新 */
  const [editorVersion, setEditorVersion] = useState(0);
  const [prompt, setPrompt] = useState<EntryPrompt | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [deleting, setDeleting] = useState<SkillFile | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<(() => void) | null>(null);
  const [saving, setSaving] = useState(false);
  /** 文件树开关：只有 SKILL.md 时默认收起，用户切过之后以用户为准 */
  const [treePref, setTreePref] = useState<boolean | null>(null);

  const readonly = detail?.source !== "mine";
  const showTree = treePref ?? (detail?.files.length ?? 0) > 1;
  const dirty = draft !== saved;
  const isReadme = selected === `${skillPath}/${README}`;
  const selectedFile = detail?.files.find(f => f.path === selected);
  const isMarkdown = isReadme || Boolean(selectedFile?.isMarkdown);

  const reload = useCallback(async () => {
    try {
      const next = await getSkillDetail(skillPath);
      if (!next) throw new Error("这个 Skill 已不存在");
      setDetail(next);
      setLoadError(null);
      return next;
    } catch (error) {
      setLoadError((error as Error).message);
      return null;
    }
  }, [skillPath]);

  const openFile = useCallback(async (filePath: string) => {
    try {
      const content = await readSkillFile(filePath);
      setSelected(filePath);
      setSaved(content);
      setDraft(content);
      setEditorVersion(v => v + 1);
    } catch (error) {
      toast.error(`打开失败：${(error as Error).message}`);
    }
  }, []);

  useEffect(() => {
    void reload().then(next => {
      if (next) void openFile(`${next.path}/${README}`);
    });
  }, [reload, openFile]);

  const guard = (action: () => void) => {
    if (dirty && !readonly) setPendingSwitch(() => action);
    else action();
  };

  const save = useCallback(async () => {
    if (readonly || !dirty || !selected) return;
    setSaving(true);
    try {
      await writeSkillFile(selected, draft);
      setSaved(draft);
      if (isReadme) void useSkillStore.getState().loadSkills();
    } catch (error) {
      toast.error(`保存失败：${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [readonly, dirty, selected, draft, isReadme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  // 编辑视图：front-matter 与正文拆开编辑，任一变化都拼回 draft
  const doc = useMemo(() => (isReadme ? splitSkillDocument(draft) : null), [isReadme, draft]);
  const bodyValue = useMemo<Descendant[]>(
    () => importFromMarkdown(isReadme ? (doc?.body ?? "") : draft),
    // 只在重挂载时取初值，编辑中不回灌
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editorVersion, selected, mode]
  );
  /** 源码编辑器是非受控的：只在重挂载（切文件 / 切视图）时取初值，编辑中不回灌 */
  const codeInitial = useMemo(
    () => draft,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editorVersion, selected, mode]
  );
  const docRef = useRef(doc);
  docRef.current = doc;
  /** 富文本往返会规范化 Markdown：与挂载时的往返结果相同就视为没改，避免一打开就「未保存」 */
  const initialMarkdown = useMemo(() => getMarkdown(bodyValue), [bodyValue]);
  /** 拼回 SKILL.md；正文与 front-matter 都没实质变化时保持原文，不因规范化 / YAML 重排而变脏 */
  const composeReadme = (meta: Record<string, unknown>, body: string) => {
    const original = splitSkillDocument(saved);
    const nextBody = body === initialMarkdown ? original.body : body;
    if (nextBody === original.body && JSON.stringify(meta) === JSON.stringify(original.meta))
      return saved;
    return joinSkillDocument(meta, nextBody);
  };

  const preferences = useSkillStore(s => s.preferences);
  const item = useMemo(
    () => toSkillItems(skills, preferences, {}).find(i => i.skill.path === skillPath),
    [skills, preferences, skillPath]
  );
  const title = doc ? metaString(doc.meta, "title") || metaString(doc.meta, "name") : "";
  const displayName = title || item?.skill.name || detail?.name || "Skill";

  const breadcrumb = useMemo(
    () => (
      <span className="text-tau-meta text-ink-2 flex min-w-0 items-center gap-1">
        <Tooltip content={showTree ? "收起文件" : "展开文件"} placement="bottom">
          <IconButton
            className="shrink-0"
            aria-label={showTree ? "收起文件" : "展开文件"}
            aria-expanded={showTree}
            onClick={() => setTreePref(!showTree)}
          >
            <PanelLeft size={17} strokeWidth={1.75} />
          </IconButton>
        </Tooltip>
        <button
          type="button"
          onClick={() => guard(() => navigator.back())}
          className="ease-tau-out hover:text-accent-text rounded-tau-sm hover:bg-hover px-1.5 py-0.5 transition-colors"
        >
          Skill
        </button>
        <span className="text-ink-3">/</span>
        <span className="text-ink-1 truncate px-1.5 font-medium">{displayName}</span>
      </span>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayName, navigator, dirty, showTree]
  );
  usePageBreadcrumb(PAGE_KEY, breadcrumb);

  const submitPrompt = async () => {
    if (!prompt) return;
    const value = promptValue.trim();
    if (!value) return;
    try {
      if (prompt.kind === "rename") {
        const next = await renameSkillEntry(prompt.file.path, value);
        if (selected === prompt.file.path) setSelected(next);
      } else {
        const created = await createSkillEntry(prompt.dir, value, prompt.kind === "new-folder");
        await reload();
        if (prompt.kind === "new-file") await openFile(created);
      }
      await reload();
      setPrompt(null);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-ink-2">{loadError}</p>
        <Button variant="secondary" onClick={() => navigator.back()}>
          返回
        </Button>
      </div>
    );
  }

  let editorArea: ReactNode = null;
  /** 源码视图：代码框撑满剩余高度、在框内滚动；其余视图整块在外层滚动 */
  let codeView = false;
  if (!selected) {
    editorArea = <p className="text-tau-meta text-ink-3 p-8">加载中…</p>;
  } else if (isReadme && mode === "visual" && doc?.error) {
    editorArea = (
      <div className="bg-danger-soft text-danger text-tau-meta m-6 rounded-[12px] px-3.5 py-3">
        front-matter 写坏了（{doc.error}），请切到「源码」修正。
      </div>
    );
  } else if (isMarkdown && mode === "visual") {
    editorArea = (
      <div className="mx-auto w-full max-w-[760px] px-9 pb-12 pt-6">
        {isReadme && doc && (
          <ReadmeHeader
            meta={doc.meta}
            folderName={detail?.folderName ?? ""}
            readonly={readonly}
            item={item}
            onMetaChange={meta => setDraft(composeReadme(meta, docRef.current?.body ?? ""))}
          />
        )}
        <Editor
          kit={getDesktopKit()}
          key={`${selected}:${editorVersion}`}
          initValue={bodyValue}
          readonly={readonly}
          onChange={value => {
            const markdown = getMarkdown(value);
            if (isReadme) setDraft(composeReadme(docRef.current?.meta ?? {}, markdown));
            else setDraft(markdown === initialMarkdown ? saved : markdown);
          }}
          className="text-tau-body-lg"
        />
      </div>
    );
  } else {
    codeView = true;
    editorArea = (
      <div className="border-line-1 mx-9 mb-6 mt-2 flex min-h-0 min-w-0 flex-1 flex-col rounded-[12px] border py-1.5 pr-1">
        <FadeScroll className="min-h-0 flex-1 py-1">
          <SkillCodeEditor
            key={`${selected}:${editorVersion}`}
            fileName={selected}
            value={codeInitial}
            readonly={readonly}
            onChange={setDraft}
          />
        </FadeScroll>
      </div>
    );
  }

  const relPath = selected.startsWith(skillPath) ? selected.slice(skillPath.length + 1) : selected;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pb-4 pt-1">
      {/* 一整张纸（同微信读书笔记页）：文件树是纸内左栏，开关在面包屑 */}
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {detail && showTree && (
          <FileTree
            skillPath={detail.path}
            files={detail.files}
            selected={selected}
            dirty={dirty}
            readonly={readonly}
            onSelect={file => guard(() => void openFile(file.path))}
            onPrompt={p => {
              setPrompt(p);
              setPromptValue(p.kind === "rename" ? p.file.name : "");
            }}
            onDelete={setDeleting}
          />
        )}
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2.5 pl-9 pr-5 pt-2">
            <span className="font-tau-mono text-ink-2 min-w-0 truncate text-[12px]">{relPath}</span>
            {readonly ? (
              <span className="text-tau-sm text-ink-3 inline-flex items-center gap-1">
                <Lock className="size-3.5" strokeWidth={1.75} />
                只读
              </span>
            ) : (
              <span className="text-tau-sm text-ink-3">
                {saving ? "保存中…" : dirty ? "未保存" : "已保存"}
              </span>
            )}
            <span className="flex-1" />
            {isReadme && (
              <Segmented
                label="视图"
                size="sm"
                value={mode}
                onValueChange={(v: ViewMode) => {
                  setMode(v);
                  setEditorVersion(n => n + 1);
                }}
              >
                <Segmented.Item value="visual" label="编辑" />
                <Segmented.Item value="source" label="源码" />
              </Segmented>
            )}
            {detail && (
              <Tooltip content="在访达中显示">
                <IconButton
                  aria-label="在访达中显示"
                  onClick={() => void showSkillInFolder(detail.path)}
                >
                  <FolderOpen className="size-4" strokeWidth={1.75} />
                </IconButton>
              </Tooltip>
            )}
            {readonly ? (
              item && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void copySkillToMine(item.skill)}
                >
                  复制为我的
                </Button>
              )
            ) : (
              <Button
                size="sm"
                variant="primary"
                loading={saving}
                disabled={!dirty}
                onClick={() => void save()}
              >
                保存
              </Button>
            )}
          </header>
          {codeView ? (
            <div className="flex min-h-0 flex-1 flex-col">{editorArea}</div>
          ) : (
            <FadeScroll className="mb-4 min-h-0 flex-1">{editorArea}</FadeScroll>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={prompt !== null}
        onOpenChange={open => !open && setPrompt(null)}
        title={
          prompt?.kind === "rename"
            ? "重命名"
            : prompt?.kind === "new-folder"
              ? "新建文件夹"
              : "新建文件"
        }
        confirmText="确定"
        confirmDisabled={!promptValue.trim()}
        onConfirm={submitPrompt}
        description={
          <Input
            value={promptValue}
            onChange={e => setPromptValue(e.target.value)}
            placeholder={prompt?.kind === "new-folder" ? "reference" : "notes.md"}
            data-autofocus
          />
        }
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={open => !open && setDeleting(null)}
        title={deleting?.isDirectory ? "删除文件夹" : "删除文件"}
        context={deleting?.name}
        description="会移到废纸篓，可以从那里恢复。"
        confirmText="删除"
        danger
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await deleteSkillEntry(deleting.path);
            if (selected.startsWith(deleting.path)) await openFile(`${skillPath}/${README}`);
            await reload();
          } catch (error) {
            toast.error((error as Error).message);
          }
          setDeleting(null);
        }}
      />

      <ConfirmDialog
        open={pendingSwitch !== null}
        onOpenChange={open => !open && setPendingSwitch(null)}
        title="放弃未保存的修改？"
        description="当前文件有未保存的修改，离开后会丢失。"
        confirmText="放弃修改"
        danger
        onConfirm={() => {
          const action = pendingSwitch;
          setPendingSwitch(null);
          setDraft(saved);
          action?.();
        }}
      />
    </div>
  );
}
