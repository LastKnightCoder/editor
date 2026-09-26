/**
 * Skill 详情抽屉（通用 Drawer，md 560px）：
 * 概览（AI 看到的描述 + SKILL.md 渲染 + 元信息）/ 设置（调用方式、导出、删除）/ 使用记录。
 * 「编辑」推入整页编辑器；只读来源给「复制为我的」。
 */

import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  Download,
  FolderOpen,
  Lock,
  MoreHorizontal,
  Pencil,
  Radar,
  Trash2,
} from "lucide-react";
import dayjs from "dayjs";
import {
  Button,
  Drawer,
  IconButton,
  Menu,
  Segmented,
  Switch,
  Tooltip,
  cn,
  toast,
  useRetainedValue,
} from "@tau/ui";
import { Editor } from "@tau/editor/src";
import { usePage } from "@/page/PageProvider";
import useTheme from "@/hooks/useTheme";
import useSkillStore from "@/stores/useSkillStore";
import { importFromMarkdown } from "@/utils/markdown";
import { splitSkillDocument } from "@/utils/skill-frontmatter";
import {
  exportSkillZip,
  getSkillDetail,
  getSkillReadme,
  showSkillInFolder,
} from "@/commands/skill";
import { saveFileWithDialog } from "@/commands/extra";
import type { SkillFile } from "@/types";
import { MODE_OPTIONS, setSkillMode, type SkillItem } from "../useSkills";
import { ModeBadge, SkillIcon, SourceTag } from "../components/SkillVisual";
import { copySkillToMine } from "../skillActions";

type DrawerTab = "overview" | "settings" | "usage";

/**
 * 抽屉内容随所选 Skill 加载。结果带上所属路径：切换 Skill 时旧内容不能沿用——
 * 只读编辑器是非受控的，拿到上一个 Skill 的正文当初值后不会再更新。
 */
function useSkillContent(item: SkillItem | null) {
  const [content, setContent] = useState<{
    path: string;
    readme: string;
    files: SkillFile[];
  } | null>(null);
  const path = item?.skill.path;
  const internal = item?.skill.isInternal;
  const inline = item?.skill.readmeContent;
  useEffect(() => {
    let alive = true;
    if (!path) return;
    if (internal) {
      setContent({ path, readme: inline ?? "", files: [] });
      return;
    }
    void Promise.all([getSkillReadme(path), getSkillDetail(path)])
      .then(([readme, detail]) => {
        if (alive) setContent({ path, readme: readme ?? "", files: detail?.files ?? [] });
      })
      .catch(error => alive && toast.error(`读取 Skill 失败：${(error as Error).message}`));
    return () => {
      alive = false;
    };
  }, [path, internal, inline]);
  const fresh = content && content.path === path ? content : null;
  return { readme: fresh?.readme ?? null, files: fresh?.files ?? [] };
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-tau-sm text-ink-3 mb-1">{label}</div>
      <div className="text-tau-meta text-ink-1 min-w-0">{children}</div>
    </div>
  );
}

function OverviewPane({
  item,
  readme,
  files,
}: {
  item: SkillItem;
  readme: string | null;
  files: SkillFile[];
}) {
  const { theme } = useTheme();
  const body = useMemo(() => (readme === null ? null : splitSkillDocument(readme).body), [readme]);
  const value = useMemo(() => (body === null ? null : importFromMarkdown(body)), [body]);
  const { skill } = item;
  const fileList = skill.isInternal
    ? ["SKILL.md"]
    : files.filter(f => !f.isDirectory).map(f => f.relativePath ?? f.name);

  return (
    <div className="flex flex-col gap-4">
      {item.warning && (
        <div
          className={cn(
            "text-tau-meta rounded-[12px] px-3 py-2.5",
            item.warning.level === "danger"
              ? "bg-danger-soft text-danger"
              : "bg-warn-soft text-warn"
          )}
        >
          {item.warning.text}
        </div>
      )}
      <div className="border-line-1 rounded-[12px] border px-3.5 py-3">
        <div className="text-tau-sm text-ink-3 mb-1 flex items-center gap-1.5">
          <Radar className="size-3.5" strokeWidth={1.75} />
          AI 看到的描述 · 据此决定何时加载
          {item.mode === "auto" && (
            <span className="ml-auto tabular-nums">约 {item.tokens} tokens</span>
          )}
        </div>
        <p
          className={cn(
            "text-tau-meta m-0 leading-[1.65]",
            skill.description ? "text-ink-1" : "text-ink-3"
          )}
        >
          {skill.description || "（空）"}
        </p>
      </div>

      <div className="border-line-1 grid grid-cols-2 gap-x-4 gap-y-3 rounded-[12px] border px-3.5 py-3">
        <Meta label="调用方式">
          <ModeBadge mode={item.mode} />
        </Meta>
        <Meta label="工具预授权">
          {skill.allowedTools?.length ? (
            <span className="flex flex-wrap gap-1">
              {skill.allowedTools.map(t => (
                <code key={t} className="font-tau-mono bg-hover rounded-[4px] px-1.5 text-[11px]">
                  {t}
                </code>
              ))}
            </span>
          ) : (
            <span className="text-ink-3">未声明</span>
          )}
        </Meta>
        <Meta label={`文件 · ${fileList.length}`}>
          <ul className="font-tau-mono text-ink-2 m-0 max-h-28 list-none overflow-y-auto p-0 text-[11.5px] leading-[1.7]">
            {fileList.map(f => (
              <li key={f} className="truncate">
                {f}
              </li>
            ))}
          </ul>
        </Meta>
        <Meta label="位置">
          <span className="font-tau-mono text-ink-2 break-all text-[11.5px]">
            {skill.isInternal ? "随应用内置（只读）" : skill.path}
          </span>
        </Meta>
      </div>

      <div className="border-line-1 min-w-0 rounded-[12px] border px-4 py-3">
        <div className="text-tau-sm text-ink-3 mb-1">SKILL.md</div>
        {value ? (
          <Editor
            key={skill.path}
            initValue={value}
            readonly
            theme={theme}
            className="text-tau-body"
          />
        ) : (
          <p className="text-tau-meta text-ink-3 m-0">加载中…</p>
        )}
      </div>
    </div>
  );
}

function ActionText({ title, description }: { title: string; description: string }) {
  return (
    <span className="min-w-0 flex-1">
      <b className="text-tau-meta text-ink-1 block font-semibold">{title}</b>
      <span className="text-tau-sm text-ink-3 block truncate">{description}</span>
    </span>
  );
}

function SettingsPane({
  item,
  onDelete,
}: {
  item: SkillItem;
  onDelete: (item: SkillItem) => void;
}) {
  const { skill } = item;
  const exportZip = async () => {
    try {
      const data = await exportSkillZip(skill.path);
      const result = await saveFileWithDialog({
        defaultFileName: `${skill.folderName}.zip`,
        filters: [{ name: "Skill 压缩包", extensions: ["zip"] }],
        data,
      });
      if (!result.canceled) toast.success("已导出");
    } catch (error) {
      toast.error(`导出失败：${(error as Error).message}`);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h4 className="text-tau-meta m-0 mb-1 font-semibold">调用方式</h4>
        <p className="text-tau-sm text-ink-3 m-0 mb-2.5">
          决定 AI 什么时候读取这个 Skill。偏好只存在本机、不改原文件，内置与关联目录的 Skill
          也能设。
        </p>
        <div className="grid grid-cols-3 gap-2">
          {MODE_OPTIONS.map(option => {
            const active = item.mode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setSkillMode(skill, option.value)}
                className={cn(
                  "rounded-[12px] border px-3 py-2.5 text-left transition-[border-color,box-shadow] duration-150",
                  active
                    ? "border-accent shadow-[var(--tau-focus-ring)]"
                    : "border-line-1 hover:bg-hover"
                )}
              >
                <b className="text-tau-meta text-ink-1 block font-semibold">{option.label}</b>
                <span className="text-tau-sm text-ink-3 leading-[1.5]">{option.description}</span>
              </button>
            );
          })}
        </div>
        {skill.defaultInvocation === "manual" && (
          <p className="text-tau-sm text-ink-3 m-0 mt-2">
            SKILL.md 声明了 <code className="font-tau-mono">disable-model-invocation: true</code>
            ，默认仅手动。
          </p>
        )}
      </section>

      {item.readonly ? (
        <div className="border-line-1 flex items-center gap-3 rounded-[12px] border px-3.5 py-3">
          <Lock className="text-ink-3 size-4 shrink-0" strokeWidth={1.75} />
          <ActionText
            title="正文只读"
            description={
              skill.source === "builtin" ? "随应用更新" : "来自外部目录，请在原工具里修改"
            }
          />
          <Button
            size="sm"
            variant="secondary"
            icon={Copy}
            className="shrink-0"
            onClick={() => void copySkillToMine(skill)}
          >
            复制为我的
          </Button>
        </div>
      ) : (
        <div className="border-line-1 flex flex-col rounded-[12px] border">
          <div className="flex items-center gap-3 px-3.5 py-3">
            <ActionText title="导出" description="打包成 .zip，可在其它工具里导入" />
            <Button
              size="sm"
              variant="secondary"
              icon={Download}
              className="shrink-0"
              onClick={() => void exportZip()}
            >
              导出
            </Button>
          </div>
          <div className="flex items-center gap-3 px-3.5 py-3">
            <ActionText title="删除" description="整个文件夹移到废纸篓，可以恢复" />
            <Button
              size="sm"
              variant="danger-soft"
              icon={Trash2}
              className="shrink-0"
              onClick={() => onDelete(item)}
            >
              删除
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function UsagePane({ item }: { item: SkillItem }) {
  const usage = item.usage;
  if (!usage?.count) {
    return (
      <p className="text-tau-meta text-ink-3 m-0 py-10 text-center">
        还没有对话加载过这个 Skill
        <br />
        <span className="text-tau-sm">AI 自动读取或你用 $ 点名后，会在这里留下记录</span>
      </p>
    );
  }
  const autoRatio = Math.round((usage.autoCount / usage.count) * 100);
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = dayjs()
      .startOf("week")
      .subtract(7 - i, "week");
    const end = start.add(1, "week");
    return usage.recent.filter(r => r.at >= start.valueOf() && r.at < end.valueOf()).length;
  });
  const peak = Math.max(1, ...weeks);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2.5">
        <div className="border-line-1 rounded-[12px] border px-3.5 py-2.5">
          <div className="text-[20px] font-semibold tabular-nums">{usage.count}</div>
          <div className="text-tau-sm text-ink-3">累计加载</div>
        </div>
        <div className="border-line-1 rounded-[12px] border px-3.5 py-2.5">
          <div className="text-[20px] font-semibold tabular-nums">{autoRatio}%</div>
          <div className="text-tau-sm text-ink-3">AI 自动加载占比</div>
        </div>
        <div className="border-line-1 rounded-[12px] border px-3.5 py-2.5">
          <div className="text-tau-sm text-ink-3">近 8 周</div>
          <div className="mt-1.5 flex h-9 items-end gap-[3px]">
            {weeks.map((n, i) => (
              <i
                key={i}
                className={cn(
                  "block flex-1 rounded-t-[2px]",
                  i === 7 ? "bg-accent" : "bg-accent-soft"
                )}
                style={{ height: `${Math.max(2, (n / peak) * 36)}px` }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="text-tau-sm text-ink-3">最近 {usage.recent.length} 次加载</div>
      <ul className="m-0 list-none p-0">
        {usage.recent.map((record, index) => (
          <li key={index} className="text-tau-meta flex items-center gap-3 px-1 py-2">
            <span className="text-ink-2 font-tau-mono min-w-0 flex-1 truncate text-[11.5px]">
              {record.conversationKey ?? "—"}
            </span>
            <span className="border-line-1 text-tau-tiny text-ink-2 rounded-full border px-2 leading-[18px]">
              {record.how === "auto" ? "自动加载" : "$ 点名"}
            </span>
            <span className="text-ink-3 w-24 text-right tabular-nums">
              {dayjs(record.at).format("MM-DD HH:mm")}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-tau-sm text-ink-3 m-0">记录只统计本机，最多保留最近 30 次。</p>
    </div>
  );
}

export function SkillDrawer({
  item,
  onClose,
  onDelete,
}: {
  item: SkillItem | null;
  onClose: () => void;
  onDelete: (item: SkillItem) => void;
}) {
  const { navigator } = usePage();
  const [tab, setTab] = useState<DrawerTab>("overview");
  const current = useRetainedValue(item);
  useEffect(() => setTab("overview"), [current?.key]);
  const { readme, files } = useSkillContent(current);

  const edit = () => {
    if (!current) return;
    onClose();
    navigator.push("skill-edit", { path: current.skill.path });
  };

  return (
    <Drawer
      open={item !== null}
      onOpenChange={open => !open && onClose()}
      label={current ? `${current.skill.name} 详情` : "Skill 详情"}
      icon={current && <SkillIcon skill={current.skill} size="lg" />}
      title={
        current && (
          <>
            <span className="truncate">{current.skill.name}</span>
            <SourceTag skill={current.skill} />
          </>
        )
      }
      subtitle={
        current && (
          <span className="font-tau-mono block truncate text-[11.5px]">
            {current.skill.folderName}
          </span>
        )
      }
      meta={
        current && (
          <>
            <ModeBadge mode={current.mode} />
            {current.skill.fileCount ?? 1} 个文件 · 用过 {current.usage?.count ?? 0} 次
          </>
        )
      }
      actions={
        current && (
          <>
            {current.readonly ? (
              <Button
                size="sm"
                variant="secondary"
                icon={Copy}
                onClick={() => void copySkillToMine(current.skill)}
              >
                复制为我的
              </Button>
            ) : (
              <Button size="sm" variant="secondary" icon={Pencil} onClick={edit}>
                编辑
              </Button>
            )}
            {!current.skill.isInternal && (
              <Menu
                align="end"
                trigger={
                  <IconButton aria-label="更多">
                    <MoreHorizontal className="size-4" strokeWidth={1.75} />
                  </IconButton>
                }
              >
                <Menu.Item
                  icon={<FolderOpen />}
                  onSelect={() => void showSkillInFolder(current.skill.path)}
                >
                  在访达中显示
                </Menu.Item>
                {!current.readonly && (
                  <>
                    <Menu.Separator />
                    <Menu.Item icon={<Trash2 />} danger onSelect={() => onDelete(current)}>
                      删除
                    </Menu.Item>
                  </>
                )}
              </Menu>
            )}
            <Tooltip content={current.enabled ? "停用" : "启用"}>
              <span>
                <Switch
                  aria-label={current.enabled ? "停用 Skill" : "启用 Skill"}
                  checked={current.enabled}
                  onCheckedChange={v =>
                    useSkillStore.getState().setEnabled(current.skill.folderName, v)
                  }
                  className="mx-1.5"
                />
              </span>
            </Tooltip>
          </>
        )
      }
      toolbar={
        <Segmented
          label="详情分区"
          size="sm"
          value={tab}
          onValueChange={(v: DrawerTab) => setTab(v)}
        >
          <Segmented.Item value="overview" label="概览" />
          <Segmented.Item value="settings" label="设置" />
          <Segmented.Item value="usage" label="使用记录" />
        </Segmented>
      }
    >
      {current &&
        (tab === "settings" ? (
          <SettingsPane item={current} onDelete={onDelete} />
        ) : tab === "usage" ? (
          <UsagePane item={current} />
        ) : (
          <OverviewPane item={current} readme={readme} files={files} />
        ))}
    </Drawer>
  );
}
