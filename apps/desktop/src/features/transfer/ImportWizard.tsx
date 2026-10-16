/**
 * 批量导入向导（文件夹 / 压缩包 → 项目 / 文章 / 卡片）：
 * 来源与去向 → 预览（只读扫描：勾选范围、缺失资源、未解析链接）→ 执行 → 报告（可整批撤销）。
 * 所有入口经 app/transferStore 打开，本组件由 ImportWizardHost 挂在壳层。
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Archive, FileText, FolderKanban, FolderOpen, Layers, type LucideIcon } from "lucide-react";
import { Button, ConfirmDialog, Dialog, Input, Switch, cn, toast } from "@tau/ui";
import { selectFile } from "@/commands";
import { CheckTree, type CheckTreeTag } from "@/components/CheckTree";
import { usePage } from "@/page/PageProvider";
import { executeImport, rescanImport, scanImport, undoImport } from "@/services/batch-import";
import useSettingStore from "@/stores/useSettingStore";
import { useImportHistoryStore } from "@/stores/useImportHistoryStore";
import { PROVIDER_LABELS } from "@/features/settings/sections/ResourceSection";
import type { ImportWizardRequest } from "@/app/transferStore";
import {
  summarizePlan,
  type ImportPhase,
  type ImportPlan,
  type ImportResult,
  type ImportTarget,
  type PlanDoc,
  type PlanNode,
} from "@/utils/content-transfer/batch-import";
import { DIALECTS, type DialectKey } from "@/utils/content-transfer/dialects";

const TARGETS: Array<{ key: ImportTarget; label: string; hint: string; icon: LucideIcon }> = [
  { key: "project", label: "项目", hint: "保持目录树，文件夹成为分组文档", icon: FolderKanban },
  { key: "article", label: "文章", hint: "平铺，顶层文件夹名作为标签", icon: FileText },
  { key: "card", label: "卡片", hint: "每个文件一张，文件夹路径作为层级标签", icon: Layers },
];

const TARGET_UNIT: Record<ImportTarget, string> = { project: "篇", article: "篇", card: "张" };

const PHASES: Array<{ key: ImportPhase; label: string }> = [
  { key: "assets", label: "上传资源" },
  { key: "docs", label: "创建文档" },
  { key: "links", label: "回填内部链接" },
  { key: "tables", label: "导入表格" },
];

const DIALECT_ORDER: DialectKey[] = ["generic", "obsidian", "notion", "logseq"];

interface TreeItem {
  id: number;
  title: string;
  doc?: PlanDoc;
  children: TreeItem[];
}

/** 文档节点以文档 key 作为勾选 id（与 ImportOptions.selected 同集），纯文件夹用自身 key */
const toTreeItems = (nodes: PlanNode[]): TreeItem[] =>
  nodes.map(node => ({
    id: node.doc ? node.doc.key : node.key,
    title: node.title,
    doc: node.doc,
    children: toTreeItems(node.children),
  }));

const issueTag = (item: TreeItem): CheckTreeTag | null => {
  const doc = item.doc;
  if (!doc) return null;
  if (doc.missingAssets.length > 0) {
    return {
      label: `${doc.missingAssets.length} 个资源缺失`,
      tone: "warn",
      hint: `找不到：${doc.missingAssets.join("、")}`,
    };
  }
  if (doc.unresolvedLinks.length > 0) {
    return {
      label: `${doc.unresolvedLinks.length} 个链接未解析`,
      tone: "warn",
      hint: `保留为普通链接：${doc.unresolvedLinks.join("、")}`,
    };
  }
  return null;
};

const labelClass = "text-ink-2 text-tau-sm font-semibold tracking-[0.02em]";
const hintClass = "text-ink-3 text-tau-sm";

function Stat({
  label,
  value,
  children,
}: {
  label: string;
  value: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="border-line-1 rounded-tau-md flex flex-col gap-1 border px-3.5 py-2.5">
      <span className={hintClass}>{label}</span>
      <span className="text-ink-1 text-tau-body-lg font-semibold tabular-nums">{value}</span>
      {children && <span className="text-ink-3 text-tau-sm leading-normal">{children}</span>}
    </div>
  );
}

function ToggleRow({
  title,
  hint,
  checked,
  onCheckedChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="border-line-1 rounded-tau-md flex items-center gap-3 border px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-ink-1 text-tau-body font-medium">{title}</div>
        <div className={hintClass}>{hint}</div>
      </div>
      <Switch size="sm" checked={checked} aria-label={title} onCheckedChange={onCheckedChange} />
    </div>
  );
}

type Step = "source" | "preview" | "running" | "done";

export function ImportWizard({
  request,
  onClose,
}: {
  request: ImportWizardRequest;
  onClose: () => void;
}) {
  const { navigator } = usePage();
  const storage = useSettingStore(s => PROVIDER_LABELS[s.setting.imageBed.active]);
  const [step, setStep] = useState<Step>("source");
  const [target, setTarget] = useState<ImportTarget | undefined>(request.target);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [scanning, setScanning] = useState<{ done: number; total: number } | null>(null);
  const [scanError, setScanError] = useState<string>();
  const [projectTitle, setProjectTitle] = useState("");
  const [checkedKeys, setCheckedKeys] = useState<number[]>([]);
  const [useSourceTags, setUseSourceTags] = useState(true);
  const [importTables, setImportTables] = useState(true);
  /** 用户手动选的来源格式；null = 用自动识别结果 */
  const [dialectOverride, setDialectOverride] = useState<DialectKey | null>(null);
  const [progress, setProgress] = useState<{
    phase: ImportPhase;
    done: number;
    total: number;
    label?: string;
  } | null>(null);
  const [outcome, setOutcome] = useState<{ result: ImportResult; recordId?: string } | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const scanIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);

  const runScan = async (
    scanner: (onProgress: (done: number, total: number) => void) => Promise<ImportPlan>
  ) => {
    const scanId = ++scanIdRef.current;
    setPlan(null);
    setScanError(undefined);
    setScanning({ done: 0, total: 0 });
    try {
      const next = await scanner((done, total) => {
        if (scanId === scanIdRef.current) setScanning({ done, total });
      });
      if (scanId !== scanIdRef.current) return;
      setPlan(next);
      setProjectTitle(next.source.name);
      setCheckedKeys(next.docs.map(doc => doc.key));
      if (next.docs.length === 0) setScanError("没有找到 Markdown 文件");
    } catch (error) {
      if (scanId === scanIdRef.current) {
        setScanError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (scanId === scanIdRef.current) setScanning(null);
    }
  };

  const scan = (path: string) => {
    setDialectOverride(null);
    return runScan(onProgress => scanImport(path, onProgress));
  };

  const switchDialect = (dialect: DialectKey) => {
    if (!plan || dialect === plan.dialect) return;
    const source = plan.source;
    setDialectOverride(dialect);
    void runScan(onProgress => rescanImport(source, dialect, onProgress));
  };

  // 拖入时来源已知，挂载即扫描（ref 防 StrictMode 重放）
  useEffect(() => {
    if (!request.sourcePath || startedRef.current) return;
    startedRef.current = true;
    void scan(request.sourcePath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = async (kind: "folder" | "zip") => {
    const paths = await selectFile(
      kind === "folder"
        ? { properties: ["openDirectory"] }
        : { properties: ["openFile"], filters: [{ name: "ZIP", extensions: ["zip"] }] }
    ).catch(() => null);
    if (paths?.[0]) void scan(paths[0]);
  };

  const treeItems = useMemo(() => (plan ? toTreeItems(plan.tree) : []), [plan]);
  const selected = useMemo(() => new Set(checkedKeys), [checkedKeys]);
  const summary = useMemo(() => (plan ? summarizePlan(plan, selected) : null), [plan, selected]);
  const unit = target ? TARGET_UNIT[target] : "篇";

  const run = async () => {
    if (!plan || !target) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStep("running");
    setProgress(null);
    const next = await executeImport(
      plan,
      {
        target,
        projectTitle: projectTitle.trim() || plan.source.name,
        selected,
        useSourceTags,
        importTables: importTables && plan.tables.length > 0,
      },
      {
        signal: controller.signal,
        onProgress: (phase, done, total, label) => setProgress({ phase, done, total, label }),
      }
    );
    abortRef.current = null;
    setOutcome(next);
    setStep("done");
  };

  const record = useImportHistoryStore(s =>
    outcome?.recordId ? s.records.find(r => r.id === outcome.recordId) : undefined
  );

  const openResult = () => {
    if (!outcome) return;
    onClose();
    const { result } = outcome;
    if (result.target === "project" && result.projectId !== undefined) {
      navigator.push("project-detail", { id: result.projectId });
    } else {
      navigator.push(result.target === "article" ? "articles" : "cards");
    }
  };

  const undo = async () => {
    if (!record) return;
    try {
      await undoImport(record);
      toast.success("已撤销本次导入");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "撤销失败");
    }
  };

  /* ---------- 各步正文 ---------- */

  const sourceStep = (
    <div className="flex flex-col gap-5 px-6 pb-5 pt-3.5">
      <section className="flex flex-col gap-2">
        <span className={labelClass}>来源</span>
        <div className="border-line-1 rounded-tau-md flex items-center gap-3 border border-dashed px-3.5 py-3">
          <FolderOpen className="text-ink-3 size-4 shrink-0" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            {plan ? (
              <>
                <div className="text-ink-1 text-tau-body truncate" title={plan.source.rootPath}>
                  {plan.source.rootPath}
                </div>
                <div className={hintClass}>
                  {plan.docs.length} 个 Markdown · {plan.assets.size} 个被引用的资源
                  {plan.tables.length > 0 && ` · ${plan.tables.length} 个 CSV 表格`}
                  {plan.otherFileCount > 0 && ` · ${plan.otherFileCount} 个其它文件不导入`}
                </div>
              </>
            ) : scanning ? (
              <div className="text-ink-2 text-tau-body">
                正在扫描{scanning.total > 0 && ` ${scanning.done} / ${scanning.total}`}…
              </div>
            ) : (
              <div className={hintClass}>
                选择一个 Markdown 文件夹或压缩包，图片与文档之间的链接会一并处理
              </div>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={!!scanning}
            onClick={() => void pick("folder")}
          >
            选择文件夹
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={Archive}
            disabled={!!scanning}
            onClick={() => void pick("zip")}
          >
            压缩包
          </Button>
        </div>
        {scanError && (
          <p
            role="alert"
            className="bg-danger-soft text-danger text-tau-meta rounded-tau-sm px-3 py-2"
          >
            {scanError}
          </p>
        )}
      </section>

      {plan && (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <span className={labelClass}>来源格式</span>
            <span className={hintClass}>
              {dialectOverride ? "已手动指定" : "已自动识别"}，换一种会重新扫描
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DIALECT_ORDER.map(key => (
              <button
                key={key}
                type="button"
                aria-pressed={plan.dialect === key}
                disabled={!!scanning}
                onClick={() => switchDialect(key)}
                className={cn(
                  "text-tau-sm rounded-full border px-3 py-0.5",
                  plan.dialect === key
                    ? "border-accent bg-accent-soft text-accent-text"
                    : "border-line-1 text-ink-2 hover:bg-hover"
                )}
              >
                {DIALECTS[key].label}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <span className={labelClass}>导入为</span>
        <div className="grid grid-cols-3 gap-2">
          {TARGETS.map(option => {
            const active = target === option.key;
            const locked = !!request.target && !active;
            return (
              <button
                key={option.key}
                type="button"
                disabled={locked}
                aria-pressed={active}
                onClick={() => setTarget(option.key)}
                className={cn(
                  "rounded-tau-md flex flex-col items-start gap-1 border px-3.5 py-3 text-left",
                  active ? "border-accent bg-accent-soft" : "border-line-1 hover:bg-hover",
                  locked && "pointer-events-none opacity-45"
                )}
              >
                <span className="text-ink-1 text-tau-body flex items-center gap-1.5 font-semibold">
                  <option.icon className="size-[15px]" strokeWidth={1.75} />
                  {option.label}
                </span>
                <span className={hintClass}>{option.hint}</span>
              </button>
            );
          })}
        </div>
      </section>

      {target === "project" && (
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>项目名称</span>
          <Input
            value={projectTitle}
            placeholder="必填"
            onChange={event => setProjectTitle(event.target.value)}
          />
        </label>
      )}
    </div>
  );

  const previewStep = plan && summary && (
    <div className="mt-3.5 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_270px]">
      <div className="border-line-1 flex min-h-0 flex-col border-r">
        <div className="flex items-center gap-2 pb-2 pl-6 pr-5">
          <span className={labelClass}>导入内容</span>
          <span className={cn(hintClass, "tabular-nums")}>
            {summary.docCount} / {plan.docs.length}
          </span>
          <button
            type="button"
            className="text-accent-text text-tau-sm ml-auto hover:underline"
            onClick={() =>
              setCheckedKeys(
                summary.docCount === plan.docs.length ? [] : plan.docs.map(doc => doc.key)
              )
            }
          >
            {summary.docCount === plan.docs.length ? "全不选" : "全选"}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-3 pl-4 pr-3">
          <CheckTree
            nodes={treeItems}
            checkedKeys={checkedKeys}
            onCheckedKeysChange={setCheckedKeys}
            isSelectable={item => !!item.doc}
            getTag={issueTag}
          />
        </div>
      </div>
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pb-5 pl-5 pr-6">
        <Stat label="将导入" value={`${summary.docCount} ${unit}`}>
          {target === "project" ? `到新项目「${projectTitle.trim() || plan.source.name}」` : null}
        </Stat>
        <Stat label="本地资源" value={`${summary.assetCount} 个`}>
          存到当前资源存储（{storage}）
          {summary.missingAssetCount > 0 && `；${summary.missingAssetCount} 处找不到，保留原地址`}
        </Stat>
        <Stat label="文档互链" value={`${summary.linkCount} 处`}>
          转为应用内链接
          {summary.unresolvedLinkCount > 0 &&
            `；${summary.unresolvedLinkCount} 处指向本批之外，保留为普通链接`}
        </Stat>
        {target !== "project" && (
          <ToggleRow
            title="原有标签"
            hint={`frontmatter tags、正文 #标签写进${target === "card" ? "卡片" : "文章"}标签`}
            checked={useSourceTags}
            onCheckedChange={setUseSourceTags}
          />
        )}
        {plan.tables.length > 0 && (
          <ToggleRow
            title={`${plan.tables.length} 个表格`}
            hint={`CSV 导入为数据库（${plan.tables.map(table => table.title).join("、")}），列均为文本`}
            checked={importTables}
            onCheckedChange={setImportTables}
          />
        )}
      </div>
    </div>
  );

  const phases = PHASES.filter(
    phase => phase.key !== "tables" || (importTables && (plan?.tables.length ?? 0) > 0)
  );

  const runningStep = (
    <div className="flex flex-col gap-3 px-6 pb-6 pt-4">
      {phases.map((phase, index) => {
        const currentIndex = progress ? phases.findIndex(p => p.key === progress.phase) : 0;
        const state = index < currentIndex ? "done" : index === currentIndex ? "active" : "pending";
        return (
          <div key={phase.key} className="flex flex-col gap-1.5">
            <div className="text-tau-body flex items-center gap-2">
              <span className={state === "pending" ? "text-ink-3" : "text-ink-1"}>
                {index + 1}. {phase.label}
              </span>
              <span className={cn(hintClass, "ml-auto tabular-nums")}>
                {state === "done"
                  ? "完成"
                  : state === "active" && progress?.phase === phase.key
                    ? `${progress.done} / ${progress.total}`
                    : state === "active"
                      ? "准备中"
                      : "等待"}
              </span>
            </div>
            {state === "active" && progress?.phase === phase.key && progress.total > 0 && (
              <>
                <div className="bg-track h-1.5 overflow-hidden rounded-full">
                  <div
                    className="bg-accent h-full rounded-full transition-[width]"
                    style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                  />
                </div>
                {progress.label && (
                  <span className={cn(hintClass, "truncate")}>{progress.label}</span>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );

  const doneStep = outcome && (
    <div className="flex min-h-0 flex-col gap-3 px-6 pb-5 pt-4">
      <p className="text-ink-1 text-tau-body-lg font-semibold">
        {outcome.result.stopped === "canceled"
          ? "已停止，"
          : outcome.result.stopped === "failed"
            ? "导入中断，"
            : ""}
        已导入 {outcome.result.docCount} {TARGET_UNIT[outcome.result.target]}
      </p>
      <p className={hintClass}>
        {outcome.result.assetCount} 个资源已入库 · {outcome.result.linkCount} 处链接已转为应用内链接
        {outcome.result.databaseIds.length > 0 &&
          ` · ${outcome.result.databaseIds.length} 个表格已导入为数据库`}
        {outcome.result.error && `；原因：${outcome.result.error}`}
      </p>
      {outcome.result.warnings.length > 0 && (
        <div className="flex min-h-0 flex-col gap-1.5">
          <span className={labelClass}>{outcome.result.warnings.length} 条提醒</span>
          <ul className="border-line-1 rounded-tau-md text-ink-2 text-tau-sm max-h-[220px] overflow-y-auto border px-3.5 py-2.5 leading-relaxed">
            {outcome.result.warnings.map((warning, index) => (
              <li key={index} className="break-all">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}
      {record && <p className={hintClass}>可在 设置 › 导入与导出 中查看本次记录或撤销</p>}
    </div>
  );

  /* ---------- 应答区 ---------- */

  const canPreview =
    !!plan && plan.docs.length > 0 && !!target && (target !== "project" || !!projectTitle.trim());

  const footer =
    step === "source" ? (
      <>
        <Button variant="secondary" size="sm" onClick={onClose}>
          取消
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!canPreview}
          onClick={() => setStep("preview")}
        >
          下一步
        </Button>
      </>
    ) : step === "preview" ? (
      <>
        <Button variant="ghost" size="sm" className="mr-auto" onClick={() => setStep("source")}>
          上一步
        </Button>
        <Button variant="secondary" size="sm" onClick={onClose}>
          取消
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!summary || (summary.docCount === 0 && !(importTables && plan?.tables.length))}
          onClick={() => void run()}
        >
          导入 {summary?.docCount ?? 0} {unit}
        </Button>
      </>
    ) : step === "running" ? (
      <Button variant="secondary" size="sm" onClick={() => abortRef.current?.abort()}>
        停止
      </Button>
    ) : (
      <>
        {record && (
          <Button
            variant="danger-soft"
            size="sm"
            className="mr-auto"
            onClick={() => setConfirmUndo(true)}
          >
            撤销本次导入
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onClose}>
          关闭
        </Button>
        {outcome && outcome.result.docCount > 0 && (
          <Button variant="primary" size="sm" onClick={openResult}>
            {outcome.result.target === "project" ? "打开项目" : "查看"}
          </Button>
        )}
      </>
    );

  const impact =
    step === "source"
      ? "只扫描，不会写入任何数据"
      : step === "preview"
        ? "导入后可在 设置 › 导入与导出 中整批撤销"
        : undefined;

  return (
    <>
      <Dialog
        title={step === "done" ? "导入完成" : step === "running" ? "正在导入" : "批量导入"}
        context={plan?.source.name}
        open
        onOpenChange={next => !next && onClose()}
        locked={step === "running"}
        width={step === "preview" ? 820 : 640}
        height={step === "preview" ? 600 : undefined}
        impact={impact}
        footer={footer}
      >
        {step === "source" && sourceStep}
        {step === "preview" && previewStep}
        {step === "running" && runningStep}
        {step === "done" && doneStep}
      </Dialog>
      <ConfirmDialog
        open={confirmUndo}
        onOpenChange={setConfirmUndo}
        danger
        title="撤销本次导入"
        description={
          outcome?.result.target === "project"
            ? `将删除导入建出的项目及其全部文档${outcome.result.databaseIds.length ? "与数据库" : ""}，导入后做的修改也会一并删除。`
            : `将删除本次导入的 ${outcome?.result.docCount ?? 0} ${TARGET_UNIT[outcome?.result.target ?? "article"]}内容${outcome?.result.databaseIds.length ? "与数据库" : ""}，导入后做的修改也会一并删除。`
        }
        impact="已上传的图片与附件文件保留"
        confirmText="撤销导入"
        onConfirm={undo}
      />
    </>
  );
}
