import { usePlatformLabels } from "@/platform/i18n";
/**
 * 添加 Skill 弹窗：新建（模板）/ 用 AI 创建 / 导入（.zip · 文件夹 · GitHub 链接）/ 关联目录。
 * 新建与 AI 创建落进「我的」后直接推入编辑页；导入先列候选、勾选后复制；关联目录即时生效。
 */

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  FileArchive,
  FolderOpen,
  FolderPlus,
  FolderSymlink,
  Github,
  Sparkles,
  Square,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  Input,
  Segmented,
  Switch,
  Textarea,
  cn,
  toast,
} from "@tau/ui";
import { FadeScroll } from "@tau/ui";
import { usePage } from "@/page/PageProvider";
import useSkillStore from "@/stores/useSkillStore";
import useLLMConfig from "@/hooks/useLLMConfig";
import { piStreamText, type PiChatHandle } from "@/services/piLLM";
import { aiNotifyText } from "@/services/notifications/ai.i18n";
import { notifyAiTask } from "@/services/notifications/aiNotify";
import { Role } from "@/constants";
import {
  commitSkillImport,
  discardSkillImport,
  getLinkedSkillDirs,
  inspectSkillImport,
  setLinkedSkillDirs,
} from "@/commands/skill";
import { selectFile } from "@/commands/file";
import { selectDirectoryWithDialog } from "@/commands/extra";
import { hasTriggerHint, metaString, splitSkillDocument } from "@/utils/skill-frontmatter";
import type { SkillImportInspection, SkillImportSource, SkillLinkedDir } from "@/types";
import { Field } from "@/features/mcp/views/ServerForm";

import {
  useSkillWorkbenchI18n,
  skillWorkbenchTranslator,
  workbenchFeedback,
  skillTemplateLabel,
  skillTemplateHint,
  type SkillTemplateKey,
} from "../workbench-i18n";

export type AddSkillTab = "new" | "ai" | "import" | "link";

const TEMPLATES: Array<{
  key: SkillTemplateKey;
  body: (name: string) => string;
}> = [
  { key: "blank", body: name => `# ${name}\n\n` },
  {
    key: "workflow",
    body: name =>
      `# ${name}\n\n## 步骤\n\n1. 先收集需要的信息（可用 sql_query / search_knowledge）\n2. \n3. 按下面的格式输出\n\n## 输出格式\n\n\n## 注意\n\n- 只写有依据的内容，缺失的部分直接说明\n`,
  },
  {
    key: "reference",
    body: name =>
      `# ${name}\n\n这份 Skill 汇总了……的知识。正文只放概要，细节按需读取：\n\n- \`reference/\`：详细说明（用 read_skill_file 读取）\n\n## 概要\n\n`,
  },
  {
    key: "format",
    body: name => `# ${name}\n\n## 格式\n\n\n## 语气\n\n\n## 示例\n\n\`\`\`markdown\n\n\`\`\`\n`,
  },
];

const AI_SYSTEM_PROMPT = `你是 Agent Skill 的编写助手。根据用户的描述，写一份符合 Agent Skills 开放格式的 SKILL.md：
- 以 YAML front-matter 开头，字段只用 name（小写字母、数字、连字符组成的标识）、title（中文显示名）、description（写清「做什么」和「什么时候用」，一两句话，包含用户可能的说法）
- 正文用 Markdown：一级标题 + 步骤 / 输出格式 / 注意事项，面向 AI 书写，简洁可执行
- 只输出 SKILL.md 的完整内容，不要任何解释，不要用代码块包裹`;

const slugHint = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_一-龥]/g, "");

function NewPane({
  name,
  setName,
  description,
  setDescription,
  template,
  setTemplate,
  manual,
  setManual,
}: {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  template: string;
  setTemplate: (v: string) => void;
  manual: boolean;
  setManual: (v: boolean) => void;
}) {
  const { t } = useSkillWorkbenchI18n();
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("workbench.name")}>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t("workbench.nameHint")}
            data-autofocus
          />
        </Field>
        <Field label={t("workbench.folder")} hint={t("workbench.generated")}>
          <Input
            value={slugHint(name)}
            readOnly
            placeholder="meeting-notes"
            className="font-tau-mono"
          />
        </Field>
      </div>
      <Field label={t("workbench.description")} hint={t("workbench.descriptionHint")}>
        <Textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          placeholder={t("workbench.descriptionExample")}
        />
        {description.trim() && (
          <span
            className={cn("text-tau-sm", hasTriggerHint(description) ? "text-ok" : "text-ink-3")}
          >
            {hasTriggerHint(description) ? t("workbench.triggerReady") : t("workbench.triggerHint")}
          </span>
        )}
      </Field>
      <Field label={t("workbench.startTemplate")}>
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATES.map(templateOption => (
            <button
              key={templateOption.key}
              type="button"
              aria-pressed={template === templateOption.key}
              onClick={() => setTemplate(templateOption.key)}
              className={cn(
                "rounded-[12px] border px-3 py-2.5 text-left transition-[border-color,box-shadow] duration-150",
                template === templateOption.key
                  ? "border-accent shadow-[var(--tau-focus-ring)]"
                  : "border-line-1 hover:bg-hover"
              )}
            >
              <b className="text-tau-meta block font-semibold">
                {skillTemplateLabel(templateOption.key, t)}
              </b>
              <span className="text-tau-sm text-ink-3">
                {skillTemplateHint(templateOption.key, t)}
              </span>
            </button>
          ))}
        </div>
      </Field>
      <label className="text-tau-meta flex items-center gap-2">
        <Checkbox
          checked={manual}
          onChange={e => setManual(e.target.checked)}
          aria-label={t("workbench.manual")}
        />
        {t("workbench.manualInvocation")}
        <span className="text-tau-sm text-ink-3">{t("workbench.manualHint")}</span>
      </label>
    </div>
  );
}

function AiPane({
  prompt,
  setPrompt,
  draft,
  generating,
  onGenerate,
  onStop,
}: {
  prompt: string;
  setPrompt: (v: string) => void;
  draft: string;
  generating: boolean;
  onGenerate: () => void;
  onStop: () => void;
}) {
  const { t } = useSkillWorkbenchI18n();
  const { meta } = useMemo(() => splitSkillDocument(draft), [draft]);
  return (
    <div className="flex h-full flex-col gap-3">
      <Field label={t("workbench.aiQuestion")} hint={t("workbench.aiQuestionHint")}>
        <Textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={4}
          placeholder={t("workbench.aiExample")}
          data-autofocus
        />
      </Field>
      <div className="flex items-center gap-2">
        {generating ? (
          <Button size="sm" variant="secondary" icon={Square} onClick={onStop}>
            {t("workbench.stop")}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            icon={Wand2}
            disabled={!prompt.trim()}
            onClick={onGenerate}
          >
            {draft ? t("workbench.redraft") : t("workbench.draft")}
          </Button>
        )}
        {draft && !generating && (
          <span className="text-tau-sm text-ink-3 min-w-0 truncate">
            {metaString(meta, "title") || metaString(meta, "name") || t("workbench.draftTitle")}
            {t("workbench.draftEditable")}
          </span>
        )}
      </div>
      {(draft || generating) && (
        <pre className="font-tau-mono border-line-1 text-ink-1 m-0 min-h-0 flex-1 overflow-auto rounded-[12px] border px-3.5 py-3 text-[12px] leading-[1.7] whitespace-pre-wrap">
          {draft || t("workbench.drafting")}
        </pre>
      )}
    </div>
  );
}

function ImportPane({
  inspection,
  loading,
  onInspect,
  checked,
  setChecked,
}: {
  inspection: SkillImportInspection | null;
  loading: boolean;
  onInspect: (source: SkillImportSource) => void;
  checked: Set<string>;
  setChecked: (next: Set<string>) => void;
}) {
  const { t } = useSkillWorkbenchI18n();
  const { trashName } = usePlatformLabels();
  const [url, setUrl] = useState("");
  const pickZip = async () => {
    const files = await selectFile({
      properties: ["openFile"],
      filters: [{ name: t("workbench.zipFilter"), extensions: ["zip", "skill"] }],
    });
    if (files?.[0]) onInspect({ type: "zip", path: files[0] });
  };
  const pickFolder = async () => {
    const dir = await selectDirectoryWithDialog();
    if (dir) onInspect({ type: "folder", path: dir });
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => void pickZip()}
          className="border-line-1 hover:bg-hover flex items-center gap-3 rounded-[12px] border border-dashed px-3.5 py-4 text-left"
        >
          <FileArchive className="text-ink-2 size-5" strokeWidth={1.5} />
          <span>
            <b className="text-tau-meta block font-semibold">{t("workbench.chooseArchive")}</b>
            <span className="text-tau-sm text-ink-3">{t("workbench.archiveHint")}</span>
          </span>
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void pickFolder()}
          className="border-line-1 hover:bg-hover flex items-center gap-3 rounded-[12px] border border-dashed px-3.5 py-4 text-left"
        >
          <FolderOpen className="text-ink-2 size-5" strokeWidth={1.5} />
          <span>
            <b className="text-tau-meta block font-semibold">{t("workbench.chooseFolder")}</b>
            <span className="text-tau-sm text-ink-3">{t("workbench.folderHint")}</span>
          </span>
        </button>
      </div>
      <Field label={t("workbench.github")} hint={t("workbench.githubHint")}>
        <div className="flex gap-2">
          <Input
            lead={Github}
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === "Enter" && url.trim() && onInspect({ type: "github", url })}
            placeholder="https://github.com/anthropics/skills/tree/main/skills/docx"
            className="font-tau-mono"
            wrapperClassName="flex-1"
          />
          <Button
            variant="secondary"
            loading={loading}
            disabled={!url.trim()}
            onClick={() => onInspect({ type: "github", url })}
          >
            {t("workbench.inspect")}
          </Button>
        </div>
      </Field>
      {inspection && (
        <ul className="border-line-1 m-0 flex list-none flex-col rounded-[12px] border p-1">
          {inspection.candidates.map(c => (
            <li
              key={c.relPath}
              className="text-tau-meta hover:bg-hover flex items-center gap-2.5 rounded-[9px] px-2.5 py-2"
            >
              <Checkbox
                aria-label={t("workbench.importName", { name: c.name })}
                checked={checked.has(c.relPath)}
                onChange={e => {
                  const next = new Set(checked);
                  if (e.target.checked) next.add(c.relPath);
                  else next.delete(c.relPath);
                  setChecked(next);
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <b className="truncate font-semibold">{c.name}</b>
                  <span className="text-tau-micro text-ink-3 border-line-1 shrink-0 rounded-[5px] border px-1.5">
                    {t("workbench.files", { count: c.fileCount })}
                  </span>
                </span>
                <span className="text-tau-sm text-ink-3 block truncate">
                  {c.description || t("workbench.noDescription")}
                </span>
              </span>
              {c.exists && (
                <span className="text-tau-sm text-warn shrink-0">
                  {t("workbench.overwrite", { trash: trashName })}
                </span>
              )}
              {c.hasScripts && !c.exists && (
                <span className="text-tau-sm text-warn inline-flex shrink-0 items-center gap-1">
                  <TriangleAlert className="size-3.5" strokeWidth={1.75} />
                  {t("workbench.scripts")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LinkPane({
  links,
  onUpdate,
  onAddCustom,
}: {
  links: SkillLinkedDir[];
  /** selectedSkills：null = 回到「全部生效」（目录新增的自动出现）；不传 = 保持原样 */
  onUpdate: (path: string, patch: { enabled?: boolean; selectedSkills?: string[] | null }) => void;
  onAddCustom: () => void;
}) {
  const { t } = useSkillWorkbenchI18n();
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggleSkill = (link: SkillLinkedDir, folderName: string, checked: boolean) => {
    const current = new Set(link.selectedSkills ?? link.skills?.map(s => s.folderName) ?? []);
    if (checked) current.add(folderName);
    else current.delete(folderName);
    onUpdate(link.path, { selectedSkills: [...current] });
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-tau-meta text-ink-2 m-0 mb-1">{t("workbench.linkIntroduction")}</p>
      {links.map(link => {
        const open = expanded === link.path;
        const canPick = link.enabled && link.exists && (link.skills?.length ?? 0) > 0;
        const skills = [...(link.skills ?? [])].sort((a, b) =>
          a.selected === b.selected ? a.name.localeCompare(b.name) : a.selected ? -1 : 1
        );
        return (
          <div key={link.path} className="border-line-1 rounded-[12px] border">
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <span
                className={cn(
                  "grid size-[30px] shrink-0 place-items-center rounded-[9px]",
                  link.enabled ? "bg-accent-soft text-accent-text" : "bg-hover text-ink-2"
                )}
              >
                <FolderSymlink className="size-[15px]" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <b className="text-tau-meta block font-semibold">
                  {link.label ?? link.path.split("/").filter(Boolean).pop()}
                </b>
                <span className="font-tau-mono text-ink-3 block truncate text-[11.5px]">
                  {link.path}
                </span>
              </span>
              <span className="text-tau-sm text-ink-3 shrink-0 tabular-nums">
                {!link.exists
                  ? t("workbench.missingDirectory")
                  : link.selectedCount === link.count
                    ? t("workbench.total", { count: link.count ?? 0 })
                    : t("workbench.enabled", {
                        enabled: link.selectedCount ?? 0,
                        total: link.count ?? 0,
                      })}
              </span>
              {canPick && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  icon={open ? ChevronUp : ChevronDown}
                  aria-expanded={open}
                  onClick={() => setExpanded(open ? null : link.path)}
                >
                  {t("workbench.choose")}
                </Button>
              )}
              <Switch
                size="sm"
                aria-label={t(link.enabled ? "workbench.unlinkPath" : "workbench.linkPath", {
                  path: link.path,
                })}
                checked={link.enabled}
                disabled={!link.exists && !link.enabled}
                onCheckedChange={v => {
                  onUpdate(
                    link.path,
                    v
                      ? { enabled: true, selectedSkills: link.selectedSkills ?? [] }
                      : { enabled: false }
                  );
                  if (v) setExpanded(link.path);
                }}
              />
            </div>
            {open && canPick && (
              <div className="border-line-1 border-t px-2.5 py-2">
                <div className="flex items-center gap-3 px-1 pb-1.5">
                  <span className="text-tau-sm text-ink-3 min-w-0 flex-1">
                    {t("workbench.linkSelectionHint")}
                  </span>
                  <button
                    type="button"
                    className="text-tau-sm text-ink-2 hover:text-ink-1 shrink-0"
                    onClick={() => onUpdate(link.path, { selectedSkills: null })}
                  >
                    {t("workbench.selectAll")}
                  </button>
                  <button
                    type="button"
                    className="text-tau-sm text-ink-2 hover:text-ink-1 shrink-0"
                    onClick={() => onUpdate(link.path, { selectedSkills: [] })}
                  >
                    {t("workbench.selectNone")}
                  </button>
                </div>
                <ul className="m-0 flex list-none flex-col p-1">
                  {skills.map(s => (
                    <li
                      key={s.folderName}
                      className={cn(
                        "text-tau-meta hover:bg-hover flex items-center gap-2.5 rounded-[9px] px-2.5 py-2",
                        !s.selected && "opacity-60"
                      )}
                    >
                      <Checkbox
                        aria-label={t("workbench.enableName", { name: s.name })}
                        checked={s.selected}
                        onChange={e => toggleSkill(link, s.folderName, e.target.checked)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <b className="truncate font-semibold">{s.name}</b>
                          <span className="font-tau-mono text-ink-3 truncate text-[11px]">
                            {s.folderName}
                          </span>
                        </span>
                        <span className="text-tau-sm text-ink-3 block truncate">
                          {s.description || t("workbench.noDescription")}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={onAddCustom}
        className="border-line-1 text-ink-2 hover:bg-hover text-tau-meta flex items-center gap-3 rounded-[12px] border border-dashed px-3.5 py-2.5"
      >
        <FolderPlus className="size-4" strokeWidth={1.75} />
        {t("workbench.addDirectory")}
      </button>
      <p className="text-tau-sm text-ink-3 m-0 mt-1">{t("workbench.priorityHint")}</p>
    </div>
  );
}

export function AddSkillDialog({
  tab,
  onTabChange,
}: {
  tab: AddSkillTab | null;
  onTabChange: (tab: AddSkillTab | null) => void;
}) {
  const { t } = useSkillWorkbenchI18n();
  const { navigator } = usePage();
  const open = tab !== null;
  const current = tab ?? "new";
  const { provider, model, thinkingLevel: chatThinkingLevel } = useLLMConfig("chat");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState("workflow");
  const [manual, setManual] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [chatHandle, setChatHandle] = useState<PiChatHandle | null>(null);
  const [inspection, setInspection] = useState<SkillImportInspection | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [inspecting, setInspecting] = useState(false);
  const [links, setLinks] = useState<SkillLinkedDir[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && current === "link") void getLinkedSkillDirs().then(setLinks);
  }, [open, current]);

  const reset = () => {
    chatHandle?.cancel();
    if (inspection) void discardSkillImport(inspection.token);
    setName("");
    setDescription("");
    setTemplate("workflow");
    setManual(false);
    setPrompt("");
    setDraft("");
    setGenerating(false);
    setInspection(null);
    setChecked(new Set());
  };

  const close = () => onTabChange(null);

  const openEditor = (path: string) => {
    close();
    navigator.push("skill-edit", { path });
  };

  const createNew = async () => {
    const tpl = TEMPLATES.find(t => t.key === template) ?? TEMPLATES[0];
    const skill = await useSkillStore.getState().createSkill({
      name: name.trim(),
      description: description.trim(),
      manual,
      body: tpl.body(name.trim()),
    });
    openEditor(skill.path);
  };

  const generate = () => {
    if (!provider || !model) {
      toast.error(workbenchFeedback("workbench.modelRequired"));
      return;
    }
    setDraft("");
    setGenerating(true);
    const handle = piStreamText(
      {
        provider,
        model,
        ...(chatThinkingLevel ? { thinking: chatThinkingLevel } : {}),
        messages: [
          { role: Role.System, content: [{ type: "text", text: AI_SYSTEM_PROMPT }] },
          { role: Role.User, content: [{ type: "text", text: prompt.trim() }] },
        ],
        source: { feature: "skillDraft" },
      },
      ({ text }) => setDraft(text.replace(/^```(?:markdown|md)?\n?|\n?```\s*$/g, ""))
    );
    setChatHandle(handle);
    void handle.result.then(result => {
      if (result.ok && !result.aborted) {
        setGenerating(false);
        notifyAiTask({
          id: "skill-ai-draft",
          mode: "unfocused-only",
          title: aiNotifyText("skill.doneTitle"),
          body: aiNotifyText("skill.doneBody"),
          source: aiNotifyText("source.skill"),
          icon: "sparkles",
          tone: "ok",
        });
        return;
      }
      if (!result.aborted) {
        setGenerating(false);
        const getMessage = () =>
          skillWorkbenchTranslator.t("workbench.draftFailed", {
            reason: result.error ?? skillWorkbenchTranslator.t("workbench.modelFailed"),
          });
        const notified = notifyAiTask({
          id: "skill-ai-draft",
          mode: "unfocused-only",
          title: aiNotifyText("skill.failedTitle"),
          body: getMessage(),
          source: aiNotifyText("source.skill"),
          icon: "sparkles",
          tone: "danger",
          sticky: true,
        });
        if (!notified) toast.error(getMessage);
      }
    });
  };

  const saveDraft = async () => {
    const { meta, body } = splitSkillDocument(draft);
    const title = metaString(meta, "title") || metaString(meta, "name") || "新 Skill";
    const skill = await useSkillStore.getState().createSkill({
      name: title,
      description: metaString(meta, "description"),
      body,
    });
    openEditor(skill.path);
  };

  const inspect = async (source: SkillImportSource) => {
    setInspecting(true);
    try {
      if (inspection) await discardSkillImport(inspection.token);
      const next = await inspectSkillImport(source);
      setInspection(next);
      setChecked(new Set(next.candidates.map(c => c.relPath)));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setInspecting(false);
    }
  };

  const commitImport = async () => {
    if (!inspection) return;
    const items = inspection.candidates
      .filter(c => checked.has(c.relPath))
      .map(c => ({ relPath: c.relPath, overwrite: c.exists }));
    const imported = await commitSkillImport(inspection.token, items);
    setInspection(null);
    await useSkillStore.getState().loadSkills();
    toast.success(workbenchFeedback("workbench.imported", { count: imported.length }));
    close();
  };

  const saveLinks = async (next: SkillLinkedDir[]) => {
    await setLinkedSkillDirs(
      next.map(l => ({ path: l.path, enabled: l.enabled, selectedSkills: l.selectedSkills }))
    );
    setLinks(await getLinkedSkillDirs());
    await useSkillStore.getState().loadSkills();
  };

  /** 更新单个关联目录；selectedSkills 传 null 表示回到「全部生效」，不传则保持原样 */
  const updateLink = (
    path: string,
    patch: { enabled?: boolean; selectedSkills?: string[] | null }
  ) => {
    void saveLinks(
      links.map(l => {
        if (l.path !== path) return l;
        const selectedSkills =
          patch.selectedSkills === undefined
            ? l.selectedSkills
            : (patch.selectedSkills ?? undefined);
        return { ...l, enabled: patch.enabled ?? l.enabled, selectedSkills };
      })
    );
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (current === "new") await createNew();
      else if (current === "ai") await saveDraft();
      else if (current === "import") await commitImport();
      else close();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const primary = {
    new: { text: t("workbench.createEdit"), disabled: !slugHint(name) },
    ai: { text: t("workbench.saveSkill"), disabled: !draft || generating },
    import: {
      text: t("workbench.importCount", { count: checked.size }),
      disabled: !inspection || checked.size === 0,
    },
    link: { text: t("workbench.done"), disabled: false },
  }[current];

  return (
    <Dialog
      open={open}
      onOpenChange={v => !v && close()}
      onAfterClose={reset}
      title={t("workbench.addTitle")}
      icon={<Sparkles />}
      width={720}
      impact={current === "import" ? t("workbench.trust") : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {current === "link" ? t("workbench.close") : t("workbench.cancel")}
          </Button>
          {current !== "link" && (
            <Button
              variant="primary"
              loading={busy}
              disabled={primary.disabled}
              onClick={() => void submit()}
            >
              {primary.text}
            </Button>
          )}
        </>
      }
    >
      <DialogBody>
        <Segmented
          label={t("workbench.addMethod")}
          size="sm"
          value={current}
          onValueChange={(v: AddSkillTab) => onTabChange(v)}
          className="mb-4"
        >
          <Segmented.Item value="new" label={t("workbench.new")} />
          <Segmented.Item value="ai" label={t("workbench.aiCreate")} />
          <Segmented.Item value="import" label={t("workbench.import")} />
          <Segmented.Item value="link" label={t("workbench.linked")} />
        </Segmented>
        <FadeScroll className="-mr-1.5 h-[460px]">
          {current === "new" && (
            <NewPane
              name={name}
              setName={setName}
              description={description}
              setDescription={setDescription}
              template={template}
              setTemplate={setTemplate}
              manual={manual}
              setManual={setManual}
            />
          )}
          {current === "ai" && (
            <AiPane
              prompt={prompt}
              setPrompt={setPrompt}
              draft={draft}
              generating={generating}
              onGenerate={generate}
              onStop={() => {
                chatHandle?.cancel();
                setGenerating(false);
              }}
            />
          )}
          {current === "import" && (
            <ImportPane
              inspection={inspection}
              loading={inspecting}
              onInspect={source => void inspect(source)}
              checked={checked}
              setChecked={setChecked}
            />
          )}
          {current === "link" && (
            <LinkPane
              links={links}
              onUpdate={updateLink}
              onAddCustom={async () => {
                const dir = await selectDirectoryWithDialog();
                if (!dir) return;
                if (links.some(l => l.path === dir)) return;
                await saveLinks([...links, { path: dir, enabled: true, selectedSkills: [] }]);
              }}
            />
          )}
        </FadeScroll>
      </DialogBody>
    </Dialog>
  );
}
