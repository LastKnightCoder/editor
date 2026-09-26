/**
 * 添加 Skill 弹窗（D-060）：新建（模板）/ 用 AI 创建 / 导入（.zip · 文件夹 · GitHub 链接）/ 关联目录。
 * 新建与 AI 创建落进「我的」后直接推入编辑页；导入先列候选、勾选后复制；关联目录即时生效。
 */

import { useEffect, useMemo, useState } from "react";
import {
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
import { Button, Checkbox, Dialog, Input, Segmented, Switch, Textarea, cn, toast } from "@tau/ui";
import { FadeScroll } from "@/components/FadeScroll";
import { usePage } from "@/page/PageProvider";
import useSkillStore from "@/stores/useSkillStore";
import useLLMConfig from "@/hooks/useLLMConfig";
import { chatLLMStream } from "@/hooks/useChatLLM";
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

export type AddSkillTab = "new" | "ai" | "import" | "link";

const TEMPLATES: Array<{
  key: string;
  label: string;
  description: string;
  body: (name: string) => string;
}> = [
  { key: "blank", label: "空白", description: "只有标题", body: name => `# ${name}\n\n` },
  {
    key: "workflow",
    label: "流程类",
    description: "分步骤完成一件事（周报、复盘、出题）",
    body: name =>
      `# ${name}\n\n## 步骤\n\n1. 先收集需要的信息（可用 sql_query / search_knowledge）\n2. \n3. 按下面的格式输出\n\n## 输出格式\n\n\n## 注意\n\n- 只写有依据的内容，缺失的部分直接说明\n`,
  },
  {
    key: "reference",
    label: "参考资料类",
    description: "SKILL.md 做索引，细节放 reference/",
    body: name =>
      `# ${name}\n\n这份 Skill 汇总了……的知识。正文只放概要，细节按需读取：\n\n- \`reference/\`：详细说明（用 read_skill_file 读取）\n\n## 概要\n\n`,
  },
  {
    key: "format",
    label: "格式规范类",
    description: "输出格式、语气、模板约束",
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
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="名称">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="会议纪要"
            data-autofocus
          />
        </Field>
        <Field label="文件夹名" hint="自动生成">
          <Input
            value={slugHint(name)}
            readOnly
            placeholder="meeting-notes"
            className="font-tau-mono"
          />
        </Field>
      </div>
      <Field label="描述" hint="做什么 + 什么时候用">
        <Textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          placeholder="例如：把会议录音转写整理成纪要，包含决议与待办。用户贴出会议转写或提到「会议纪要」时使用。"
        />
        {description.trim() && (
          <span
            className={cn("text-tau-sm", hasTriggerHint(description) ? "text-ok" : "text-ink-3")}
          >
            {hasTriggerHint(description)
              ? "写了触发场景，AI 能据此判断何时加载"
              : "建议补一句「什么时候用」，AI 靠它判断何时加载"}
          </span>
        )}
      </Field>
      <Field label="从模板开始">
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATES.map(t => (
            <button
              key={t.key}
              type="button"
              aria-pressed={template === t.key}
              onClick={() => setTemplate(t.key)}
              className={cn(
                "rounded-[12px] border px-3 py-2.5 text-left transition-[border-color,box-shadow] duration-150",
                template === t.key
                  ? "border-accent shadow-[var(--tau-focus-ring)]"
                  : "border-line-1 hover:bg-hover"
              )}
            >
              <b className="text-tau-meta block font-semibold">{t.label}</b>
              <span className="text-tau-sm text-ink-3">{t.description}</span>
            </button>
          ))}
        </div>
      </Field>
      <label className="text-tau-meta flex items-center gap-2">
        <Checkbox
          checked={manual}
          onChange={e => setManual(e.target.checked)}
          aria-label="仅手动"
        />
        仅手动调用
        <span className="text-tau-sm text-ink-3">AI 不会自动加载，只在输入框用 $ 点名时生效</span>
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
  const { meta } = useMemo(() => splitSkillDocument(draft), [draft]);
  return (
    <div className="flex h-full flex-col gap-3">
      <Field label="想让 AI 学会什么？" hint="可以直接贴一次满意的对话">
        <Textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={4}
          placeholder="每次开完会我会把录音转写贴进来，希望整理成纪要：先写结论和决议，再列待办（带负责人和截止日期），最后是讨论要点。"
          data-autofocus
        />
      </Field>
      <div className="flex items-center gap-2">
        {generating ? (
          <Button size="sm" variant="secondary" icon={Square} onClick={onStop}>
            停止
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            icon={Wand2}
            disabled={!prompt.trim()}
            onClick={onGenerate}
          >
            {draft ? "重新起草" : "起草"}
          </Button>
        )}
        {draft && !generating && (
          <span className="text-tau-sm text-ink-3 min-w-0 truncate">
            {metaString(meta, "title") || metaString(meta, "name") || "草稿"} ·
            保存后可在编辑页继续改
          </span>
        )}
      </div>
      {(draft || generating) && (
        <pre className="font-tau-mono border-line-1 text-ink-1 m-0 min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-[12px] border px-3.5 py-3 text-[12px] leading-[1.7]">
          {draft || "起草中…"}
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
  const [url, setUrl] = useState("");
  const pickZip = async () => {
    const files = await selectFile({
      properties: ["openFile"],
      filters: [{ name: "Skill 压缩包", extensions: ["zip", "skill"] }],
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
            <b className="text-tau-meta block font-semibold">选择 .zip / .skill</b>
            <span className="text-tau-sm text-ink-3">包里需要有 SKILL.md</span>
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
            <b className="text-tau-meta block font-semibold">选择文件夹</b>
            <span className="text-tau-sm text-ink-3">一个文件夹里有多个 Skill 会逐个列出</span>
          </span>
        </button>
      </div>
      <Field label="或从 GitHub 导入" hint="仓库、目录或 SKILL.md 链接">
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
            解析
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
                aria-label={`导入 ${c.name}`}
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
                    {c.fileCount} 个文件
                  </span>
                </span>
                <span className="text-tau-sm text-ink-3 block truncate">
                  {c.description || "（没有描述）"}
                </span>
              </span>
              {c.exists && (
                <span className="text-tau-sm text-warn shrink-0">同名，将覆盖（旧的进废纸篓）</span>
              )}
              {c.hasScripts && !c.exists && (
                <span className="text-tau-sm text-warn inline-flex shrink-0 items-center gap-1">
                  <TriangleAlert className="size-3.5" strokeWidth={1.75} />
                  含脚本
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
  onChange,
  onAddCustom,
}: {
  links: SkillLinkedDir[];
  onChange: (path: string, enabled: boolean) => void;
  onAddCustom: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-tau-meta text-ink-2 m-0 mb-1">
        和其它 AI 工具共用同一份 Skill：关联后<b className="font-semibold">只读</b>
        显示在「关联目录」分组，原文件改了这里自动更新；想改就「复制为我的」。
      </p>
      {links.map(link => (
        <div
          key={link.path}
          className="border-line-1 flex items-center gap-3 rounded-[12px] border px-3.5 py-2.5"
        >
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
            {link.exists ? `发现 ${link.count ?? 0} 个` : "目录不存在"}
          </span>
          <Switch
            size="sm"
            aria-label={link.enabled ? `取消关联 ${link.path}` : `关联 ${link.path}`}
            checked={link.enabled}
            disabled={!link.exists && !link.enabled}
            onCheckedChange={v => onChange(link.path, v)}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={onAddCustom}
        className="border-line-1 text-ink-2 hover:bg-hover text-tau-meta flex items-center gap-3 rounded-[12px] border border-dashed px-3.5 py-2.5"
      >
        <FolderPlus className="size-4" strokeWidth={1.75} />
        关联其它目录…
      </button>
      <p className="text-tau-sm text-ink-3 m-0 mt-1">
        同名时内置优先，其次「我的」，最后是关联目录。
      </p>
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
  const { navigator } = usePage();
  const open = tab !== null;
  const current = tab ?? "new";
  const { providerConfig, modelConfig } = useLLMConfig("chat");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState("workflow");
  const [manual, setManual] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [controller, setController] = useState<AbortController | null>(null);
  const [inspection, setInspection] = useState<SkillImportInspection | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [inspecting, setInspecting] = useState(false);
  const [links, setLinks] = useState<SkillLinkedDir[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && current === "link") void getLinkedSkillDirs().then(setLinks);
  }, [open, current]);

  const reset = () => {
    controller?.abort();
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
    if (!providerConfig || !modelConfig) {
      toast.error("请先在设置里为「对话」配置模型");
      return;
    }
    setDraft("");
    setGenerating(true);
    void chatLLMStream(
      providerConfig,
      modelConfig,
      [
        { role: Role.System, content: [{ type: "text", text: AI_SYSTEM_PROMPT }] },
        { role: Role.User, content: [{ type: "text", text: prompt.trim() }] },
      ],
      {
        onController: setController,
        onUpdate: text => setDraft(text.replace(/^```(?:markdown|md)?\n?|\n?```\s*$/g, "")),
        onFinish: () => setGenerating(false),
        onError: error => {
          setGenerating(false);
          toast.error(`起草失败：${error.message}`);
        },
      }
    );
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
    toast.success(`已导入 ${imported.length} 个 Skill`);
    close();
  };

  const saveLinks = async (next: SkillLinkedDir[]) => {
    await setLinkedSkillDirs(next.map(l => ({ path: l.path, enabled: l.enabled })));
    setLinks(await getLinkedSkillDirs());
    await useSkillStore.getState().loadSkills();
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
    new: { text: "创建并编辑", disabled: !slugHint(name) },
    ai: { text: "保存 Skill", disabled: !draft || generating },
    import: { text: `导入 ${checked.size} 个`, disabled: !inspection || checked.size === 0 },
    link: { text: "完成", disabled: false },
  }[current];

  return (
    <Dialog
      open={open}
      onOpenChange={v => !v && close()}
      onAfterClose={reset}
      title="添加 Skill"
      icon={<Sparkles />}
      width={720}
      impact={current === "import" ? "Skill 里的脚本可以在本机执行，只导入信任的来源" : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {current === "link" ? "关闭" : "取消"}
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
      <Segmented
        label="添加方式"
        size="sm"
        value={current}
        onValueChange={(v: AddSkillTab) => onTabChange(v)}
        className="mb-4"
      >
        <Segmented.Item value="new" label="新建" />
        <Segmented.Item value="ai" label="用 AI 创建" />
        <Segmented.Item value="import" label="导入" />
        <Segmented.Item value="link" label="关联目录" />
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
              controller?.abort();
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
            onChange={(path, enabled) =>
              void saveLinks(links.map(l => (l.path === path ? { ...l, enabled } : l)))
            }
            onAddCustom={async () => {
              const dir = await selectDirectoryWithDialog();
              if (!dir) return;
              if (links.some(l => l.path === dir)) return;
              await saveLinks([...links, { path: dir, enabled: true }]);
            }}
          />
        )}
      </FadeScroll>
    </Dialog>
  );
}
