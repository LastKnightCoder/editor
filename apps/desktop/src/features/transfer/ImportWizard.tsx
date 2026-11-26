import { useImportI18n } from "./i18n-import";
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
import { executeImport, scanImport, undoImport } from "@/services/batch-import";
import useSettingStore from "@/stores/useSettingStore";
import { useImportHistoryStore } from "@/stores/useImportHistoryStore";
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

const TARGETS: Array<{ key: ImportTarget; icon: LucideIcon }> = [
  { key: "project", icon: FolderKanban },
  { key: "article", icon: FileText },
  { key: "card", icon: Layers },
];
const PHASES: Array<{ key: ImportPhase }> = [
  { key: "assets" },
  { key: "docs" },
  { key: "links" },
  { key: "tables" },
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

const issueTag = (
  item: TreeItem,
  t: ReturnType<typeof useImportI18n>["t"],
  locale: string
): CheckTreeTag | null => {
  const doc = item.doc;
  if (!doc) return null;
  if (doc.missingAssets.length > 0) {
    return {
      label: t("issue.missing", {
        count: doc.missingAssets.length,
        amount: doc.missingAssets.length.toLocaleString(locale),
      }),
      tone: "warn",
      hint: t("issue.missingHint", {
        paths: new Intl.ListFormat(locale).format(doc.missingAssets),
      }),
    };
  }
  if (doc.unresolvedLinks.length > 0) {
    return {
      label: t("issue.unresolved", {
        count: doc.unresolvedLinks.length,
        amount: doc.unresolvedLinks.length.toLocaleString(locale),
      }),
      tone: "warn",
      hint: t("issue.linkHint", { paths: new Intl.ListFormat(locale).format(doc.unresolvedLinks) }),
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
  const { t, locale } = useImportI18n();
  const number = (value: number) => value.toLocaleString(locale);
  const countText = (key: Parameters<typeof t>[0], count: number) =>
    t(key, { count, amount: number(count) });
  const { navigator } = usePage();
  const storage = useSettingStore(s =>
    s.setting.imageBed.active === "local" ? "local" : "plugin"
  );
  const [step, setStep] = useState<Step>("source");
  const [target, setTarget] = useState<ImportTarget | undefined>(request.target);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [scanning, setScanning] = useState<{ done: number; total: number } | null>(null);
  const [scanError, setScanError] = useState<string | { kind: "empty" }>();
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
  const [warningPage, setWarningPage] = useState(0);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const scanIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const scanAbort = useRef<AbortController | null>(null);
  const planRef = useRef<ImportPlan | null>(null);
  const releasePlan = () => {
    const current = planRef.current;
    planRef.current = null;
    if (current) void current.source.close().catch(console.error);
  };
  const scan = async (path: string, dialect?: DialectKey) => {
    const scanId = ++scanIdRef.current;
    scanAbort.current?.abort();
    const controller = new AbortController();
    scanAbort.current = controller;
    releasePlan();
    setDialectOverride(dialect ?? null);
    setPlan(null);
    setScanError(undefined);
    setScanning({ done: 0, total: 0 });
    let progressAt = 0;
    try {
      const next = await scanImport(
        path,
        (done, total) => {
          const now = performance.now();
          if (scanId === scanIdRef.current && (done === total || now - progressAt >= 100)) {
            progressAt = now;
            setScanning({ done, total });
          }
        },
        controller.signal,
        dialect
      );
      if (controller.signal.aborted) {
        await next.source.close();
        return;
      }
      planRef.current = next;
      setPlan(next);
      setProjectTitle(next.source.name);
      setCheckedKeys(next.docs.map(doc => doc.key));
      if (next.docs.length === 0) setScanError({ kind: "empty" });
    } catch (error) {
      if (scanId === scanIdRef.current)
        setScanError(error instanceof Error ? error.message : String(error));
    } finally {
      if (scanId === scanIdRef.current) setScanning(null);
    }
  };
  const switchDialect = (dialect: DialectKey) => {
    if (plan && dialect !== plan.dialect) void scan(plan.source.rootPath, dialect);
  };
  useEffect(() => {
    if (request.sourcePath) void scan(request.sourcePath);
    return () => {
      ++scanIdRef.current;
      scanAbort.current?.abort();
      abortRef.current?.abort();
      releasePlan();
    };
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

  const run = async () => {
    if (!plan || !target) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStep("running");
    setProgress(null);
    let progressAt = 0;
    const abort = () => void plan.source.close().catch(console.error);
    controller.signal.addEventListener("abort", abort, { once: true });
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
        onProgress: (phase, done, total, label) => {
          const now = performance.now();
          if (done === 1 || done === total || now - progressAt >= 100) {
            progressAt = now;
            setProgress({ phase, done, total, label });
          }
        },
      }
    );
    controller.signal.removeEventListener("abort", abort);
    abortRef.current = null;
    releasePlan();
    setPlan(null);
    setCheckedKeys([]);
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
      toast.success(t("undo.done"));
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("undo.failed"));
    }
  };

  /* ---------- 各步正文 ---------- */

  const sourceStep = (
    <div className="flex flex-col gap-5 px-6 pt-3.5 pb-5">
      <section className="flex flex-col gap-2">
        <span className={labelClass}>{t("source.label")}</span>
        <div className="border-line-1 rounded-tau-md flex items-center gap-3 border border-dashed px-3.5 py-3">
          <FolderOpen className="text-ink-3 size-4 shrink-0" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            {plan ? (
              <>
                <div className="text-ink-1 text-tau-body truncate" title={plan.source.rootPath}>
                  {plan.source.rootPath}
                </div>
                <div className={hintClass}>
                  {[
                    countText("source.docs", plan.docs.length),
                    countText("source.assets", plan.assets.size),
                    plan.tables.length > 0 ? countText("source.tables", plan.tables.length) : null,
                    plan.otherFileCount > 0 ? countText("source.other", plan.otherFileCount) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </>
            ) : scanning ? (
              <div className="text-ink-2 text-tau-body">
                {scanning.total > 0
                  ? t("scan.progress", {
                      done: number(scanning.done),
                      total: number(scanning.total),
                    })
                  : t("scan.busy")}
              </div>
            ) : (
              <div className={hintClass}>{t("source.hint")}</div>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={!!scanning}
            onClick={() => void pick("folder")}
          >
            {t("source.folder")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={Archive}
            disabled={!!scanning}
            onClick={() => void pick("zip")}
          >
            {t("source.zip")}
          </Button>
        </div>
        {scanError && (
          <p
            role="alert"
            className="bg-danger-soft text-danger text-tau-meta rounded-tau-sm px-3 py-2"
          >
            {typeof scanError === "string" ? scanError : t("scan.empty")}
          </p>
        )}
      </section>

      {plan && (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <span className={labelClass}>{t("source.format")}</span>
            <span className={hintClass}>
              {t(dialectOverride ? "source.manual" : "source.detected")}
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
                {key === "generic" ? t("source.generic") : DIALECTS[key].label}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <span className={labelClass}>{t("source.as")}</span>
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
                  {t(`target.${option.key}`)}
                </span>
                <span className={hintClass}>{t(`targetHint.${option.key}`)}</span>
              </button>
            );
          })}
        </div>
      </section>

      {target === "project" && (
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>{t("source.projectName")}</span>
          <Input
            value={projectTitle}
            placeholder={t("source.required")}
            onChange={event => setProjectTitle(event.target.value)}
          />
        </label>
      )}
    </div>
  );

  const previewStep = plan && summary && (
    <div className="mt-3.5 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_270px]">
      <div className="border-line-1 flex min-h-0 flex-col border-r">
        <div className="flex items-center gap-2 pr-5 pb-2 pl-6">
          <span className={labelClass}>{t("preview.content")}</span>
          <span className={cn(hintClass, "tabular-nums")}>
            {number(summary.docCount)} / {number(plan.docs.length)}
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
            {t(summary.docCount === plan.docs.length ? "preview.none" : "preview.all")}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-3 pb-3 pl-4">
          <CheckTree
            virtual={plan.docs.length > 200}
            nodes={treeItems}
            checkedKeys={checkedKeys}
            onCheckedKeysChange={setCheckedKeys}
            isSelectable={item => !!item.doc}
            getTag={item => issueTag(item, t, locale)}
          />
        </div>
      </div>
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-6 pb-5 pl-5">
        <Stat
          label={t("preview.toImport")}
          value={countText(`count.${target ?? "article"}`, summary.docCount)}
        >
          {target === "project"
            ? t("preview.destination", { title: projectTitle.trim() || plan.source.name })
            : null}
        </Stat>
        <Stat label={t("preview.resources")} value={countText("stats.assets", summary.assetCount)}>
          {t(summary.missingAssetCount > 0 ? "preview.storageMissing" : "preview.storage", {
            storage: t(`storage.${storage}`),
            count: summary.missingAssetCount,
            amount: number(summary.missingAssetCount),
          })}
        </Stat>
        <Stat label={t("preview.links")} value={countText("stats.links", summary.linkCount)}>
          {t(summary.unresolvedLinkCount > 0 ? "preview.outsideLinks" : "preview.linkConversion", {
            count: summary.unresolvedLinkCount,
            amount: number(summary.unresolvedLinkCount),
          })}
        </Stat>
        {target !== "project" && (
          <ToggleRow
            title={t("preview.tags")}
            hint={t(target === "card" ? "preview.tags.card" : "preview.tags.article")}
            checked={useSourceTags}
            onCheckedChange={setUseSourceTags}
          />
        )}
        {plan.tables.length > 0 && (
          <ToggleRow
            title={countText("preview.tables", plan.tables.length)}
            hint={t("preview.tableHint", {
              titles: new Intl.ListFormat(locale).format(plan.tables.map(table => table.title)),
            })}
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
    <div className="flex flex-col gap-3 px-6 pt-4 pb-6">
      {phases.map((phase, index) => {
        const currentIndex = progress ? phases.findIndex(p => p.key === progress.phase) : 0;
        const state = index < currentIndex ? "done" : index === currentIndex ? "active" : "pending";
        return (
          <div key={phase.key} className="flex flex-col gap-1.5">
            <div className="text-tau-body flex items-center gap-2">
              <span className={state === "pending" ? "text-ink-3" : "text-ink-1"}>
                {number(index + 1)}. {t(`phase.${phase.key}`)}
              </span>
              <span className={cn(hintClass, "ml-auto tabular-nums")}>
                {state === "done"
                  ? t("common.done")
                  : state === "active" && progress?.phase === phase.key
                    ? `${number(progress.done)} / ${number(progress.total)}`
                    : state === "active"
                      ? t("common.preparing")
                      : t("common.waiting")}
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
    <div className="flex min-h-0 flex-col gap-3 px-6 pt-4 pb-5">
      <p className="text-ink-1 text-tau-body-lg font-semibold">
        {countText(
          `done.${outcome.result.stopped ?? "complete"}.${outcome.result.target}`,
          outcome.result.docCount
        )}
      </p>
      <p className={hintClass}>
        {[
          countText("done.assets", outcome.result.assetCount),
          countText("done.links", outcome.result.linkCount),
          outcome.result.databaseIds.length > 0
            ? countText("done.tables", outcome.result.databaseIds.length)
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        {outcome.result.error && t("done.error", { error: outcome.result.error })}
      </p>
      {outcome.result.warnings.length > 0 && (
        <div className="flex min-h-0 flex-col gap-1.5">
          <span className={labelClass}>
            {countText("stats.warnings", outcome.result.warnings.length)}
          </span>
          <ul className="border-line-1 rounded-tau-md text-ink-2 text-tau-sm max-h-[220px] overflow-y-auto border px-3.5 py-2.5 leading-relaxed">
            {outcome.result.warnings
              .slice(warningPage * 100, (warningPage + 1) * 100)
              .map((warning, index) => (
                <li key={index} className="break-all">
                  {warning}
                </li>
              ))}
          </ul>
          {outcome.result.warnings.length > 100 && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={warningPage === 0}
                onClick={() => setWarningPage(warningPage - 1)}
              >
                {t("common.previousPage")}
              </Button>
              <span>
                {number(warningPage + 1)} /{" "}
                {number(Math.ceil(outcome.result.warnings.length / 100))}
              </span>
              <Button
                size="sm"
                disabled={(warningPage + 1) * 100 >= outcome.result.warnings.length}
                onClick={() => setWarningPage(warningPage + 1)}
              >
                {t("common.nextPage")}
              </Button>
            </div>
          )}
        </div>
      )}
      {record && <p className={hintClass}>{t("done.historyHint")}</p>}
    </div>
  );

  /* ---------- 应答区 ---------- */

  const canPreview =
    !!plan && plan.docs.length > 0 && !!target && (target !== "project" || !!projectTitle.trim());

  const footer =
    step === "source" ? (
      <>
        <Button variant="secondary" size="sm" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!canPreview}
          onClick={() => setStep("preview")}
        >
          {t("common.next")}
        </Button>
      </>
    ) : step === "preview" ? (
      <>
        <Button variant="ghost" size="sm" className="mr-auto" onClick={() => setStep("source")}>
          {t("common.previous")}
        </Button>
        <Button variant="secondary" size="sm" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!summary || (summary.docCount === 0 && !(importTables && plan?.tables.length))}
          onClick={() => void run()}
        >
          {countText(`action.import.${target ?? "article"}`, summary?.docCount ?? 0)}
        </Button>
      </>
    ) : step === "running" ? (
      <Button variant="secondary" size="sm" onClick={() => abortRef.current?.abort()}>
        {t("common.stop")}
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
            {t("undo.title")}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onClose}>
          {t("common.close")}
        </Button>
        {outcome && outcome.result.docCount > 0 && (
          <Button variant="primary" size="sm" onClick={openResult}>
            {t(outcome.result.target === "project" ? "done.openProject" : "common.view")}
          </Button>
        )}
      </>
    );

  const impact =
    step === "source" ? t("impact.source") : step === "preview" ? t("impact.preview") : undefined;

  return (
    <>
      <Dialog
        title={t(
          step === "done" ? "dialog.done" : step === "running" ? "dialog.running" : "dialog.title"
        )}
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
        title={t("undo.title")}
        description={t(
          outcome?.result.target === "project"
            ? outcome.result.databaseIds.length
              ? "undo.projectDatabases"
              : "undo.project"
            : `undo.${outcome?.result.target ?? "article"}${outcome?.result.databaseIds.length ? "Databases" : ""}`,
          { count: outcome?.result.docCount ?? 0, amount: number(outcome?.result.docCount ?? 0) }
        )}
        impact={t("undo.impact")}
        confirmText={t("undo.confirm")}
        onConfirm={undo}
      />
    </>
  );
}
