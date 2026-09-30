/**
 * MCP 服务器页：卡片库（自定义 / 内置两段）+ 右侧详情抽屉 + 添加弹窗。
 * 卡片上的开关即时启停；点卡片看工具、改配置、查日志。
 */

import { useMemo, useState } from "react";
import { Braces, Plug, Plus, Search } from "lucide-react";
import { Button, ConfirmDialog, IconButton, Input, Switch, Tooltip, cn, toast } from "@tau/ui";
import { FadeScroll } from "@/components/FadeScroll";
import useMCPStore from "@/stores/useMCPStore";
import { serversToJson } from "../serverConfig";
import {
  removeServer,
  setServerEnabled,
  useMcpServers,
  getScopedServerItems,
  getPiBuiltinServerItem,
  type McpServerItem,
} from "../useMcpServers";
import { AddServerDialog } from "./AddServerDialog";
import { ServerDrawer } from "./ServerDrawer";
import { ServerIcon, StatusLine } from "./ServerVisual";

// 卡片落在大纸上：细描边分隔，悬停轻抬（纸上再叠阴影卡会糊成一片）
const CARD =
  "border-line-1 ease-tau-out flex min-h-[132px] min-w-0 flex-col gap-2.5 rounded-[var(--tau-radius-lg)] border p-3.5 text-left " +
  "hover:shadow-lift hover:border-transparent transition-[box-shadow,border-color] duration-200 " +
  "focus-visible:shadow-[var(--tau-focus-ring)] focus-visible:outline-none";

function subtitle(item: McpServerItem): string {
  if (item.kind !== "custom") return "内置";
  return item.server?.transport.type === "stdio" ? "本地进程 · stdio" : "远程 · HTTP";
}

function ServerCard({
  item,
  active,
  onOpen,
}: {
  item: McpServerItem;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <article
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => {
        if (e.key === "Enter" && e.target === e.currentTarget) onOpen();
      }}
      className={cn(CARD, "cursor-pointer", active && "border-accent")}
    >
      <div className="flex items-start gap-2.5">
        <ServerIcon item={item} />
        <div className={cn("min-w-0 flex-1", !item.enabled && "opacity-60")}>
          <div className="truncate text-[13.5px] font-semibold">{item.name}</div>
          <div className="text-tau-sm text-ink-3">{subtitle(item)}</div>
        </div>
        {/* 开关不触发打开详情；常开项（功能工具 / AI 基础工具）只读 */}
        <span onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
          <Switch
            size="sm"
            aria-label={
              item.locked
                ? `${item.name}（常开）`
                : item.enabled
                  ? `停用 ${item.name}`
                  : `启用 ${item.name}`
            }
            checked={item.enabled}
            disabled={item.locked || item.status === "unavailable"}
            onCheckedChange={v => void setServerEnabled(item, v)}
          />
        </span>
      </div>
      {item.description ? (
        <p className="text-tau-sm text-ink-2 line-clamp-2 min-h-[2lh] leading-[1.55]">
          {item.description}
        </p>
      ) : (
        <p className="font-tau-mono text-ink-3 line-clamp-2 min-h-[2lh] break-all text-[11.5px] leading-[1.6]">
          {item.target}
        </p>
      )}
      <StatusLine item={item} className="mt-auto" />
    </article>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-7">
      <h2 className="mb-2.5 flex items-baseline gap-2 px-0.5 text-[13.5px] font-semibold">
        {title}
        {hint && <small className="text-tau-sm text-ink-3 font-normal">{hint}</small>}
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">{children}</div>
    </section>
  );
}

const matches = (item: McpServerItem, q: string) =>
  item.name.toLowerCase().includes(q) ||
  item.description.toLowerCase().includes(q) ||
  item.tools.some(t => t.name.toLowerCase().includes(q));

export function McpView() {
  const { builtin, custom } = useMcpServers();
  const scoped = useMemo(() => getScopedServerItems(), []);
  const piBuiltin = useMemo(() => getPiBuiltinServerItem(), []);
  /* 内置 = provider 工具 + 功能工具 + AI 基础工具：对用户一律是「内置」，只是部分常开不可关 */
  const builtinAll = useMemo(
    () => [...builtin, ...scoped, piBuiltin],
    [builtin, scoped, piBuiltin]
  );
  const customServers = useMCPStore(s => s.customServers);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<McpServerItem | null>(null);

  const q = query.trim().toLowerCase();
  const shownCustom = q ? custom.filter(i => matches(i, q)) : custom;
  const shownBuiltin = q ? builtinAll.filter(i => matches(i, q)) : builtinAll;

  const openItem = useMemo(
    () => [...custom, ...builtinAll].find(i => i.id === openId) ?? null,
    [custom, builtinAll, openId]
  );

  const enabledServers = [...custom, ...builtin].filter(
    i => i.enabled && i.status !== "unavailable"
  );
  const toolCount =
    enabledServers.reduce((n, i) => n + i.tools.length - i.disabledTools.size, 0) +
    scoped.reduce((n, i) => n + i.tools.length, 0) +
    piBuiltin.tools.length;
  const nothing = shownCustom.length + shownBuiltin.length === 0;

  const exportAll = async () => {
    await navigator.clipboard.writeText(serversToJson(customServers));
    toast.success(`已复制 ${customServers.length} 个服务器的 mcpServers JSON`);
  };

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pb-4 pt-1">
      {/* 一整张纸：页头固定在纸顶，卡片在纸内滚动（同 Skill 页） */}
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-none flex-col px-8 pt-5">
          <div className="flex h-10 flex-none items-center gap-3">
            <h1 className="text-tau-title-lg shrink-0 whitespace-nowrap font-semibold tracking-[-0.01em]">
              MCP 服务器
            </h1>
            {/* w-0 + flex-1：填满剩余宽度并截断，不撑大页面的最小宽度 */}
            <span className="text-tau-meta text-ink-2 w-0 flex-1 truncate whitespace-nowrap tabular-nums">
              已启用 <b className="text-ink-1 font-semibold">{enabledServers.length}</b> 个服务器
              <span className="text-ink-3 mx-1.5">·</span>
              <b className="text-ink-1 font-semibold">{toolCount}</b> 个工具
            </span>
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
              placeholder="搜索服务器或工具"
              // 输入框自身不贡献最小宽度，窄窗口下随标题栏收缩
              className="w-0"
              wrapperClassName="w-auto max-w-[240px] flex-[0_1_240px]"
            />
            {customServers.length > 0 && (
              <Tooltip content="复制全部自定义服务器为 mcpServers JSON">
                <IconButton aria-label="导出为 JSON" onClick={() => void exportAll()}>
                  <Braces className="size-4" strokeWidth={1.75} />
                </IconButton>
              </Tooltip>
            )}
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              className="shrink-0 whitespace-nowrap"
              onClick={() => setAdding(true)}
            >
              添加服务器
            </Button>
          </div>

          <p className="text-tau-meta text-ink-2 mt-1 px-0.5 pb-3">
            让 AI 调用本机程序或远程服务：读写文件、查
            GitHub、操作浏览器……启用的服务器在每次对话中都可用。
          </p>
        </div>

        <FadeScroll className="mb-4 min-h-0 flex-1 pb-2 pl-8 pr-[26px] pt-3">
          {(!q || shownCustom.length > 0) && (
            <Section title="自定义" hint={custom.length > 0 ? String(custom.length) : undefined}>
              {shownCustom.map(item => (
                <ServerCard
                  key={item.id}
                  item={item}
                  active={item.id === openId}
                  onOpen={() => setOpenId(item.id)}
                />
              ))}
              {!q && (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="border-line-1 text-ink-3 hover:bg-hover hover:text-ink-1 flex min-h-[132px] flex-col items-center justify-center gap-1.5 rounded-[var(--tau-radius-lg)] border border-dashed transition-[background,color] duration-150"
                >
                  <Plus className="size-5" strokeWidth={1.5} />
                  <span className="text-tau-meta">添加服务器</span>
                  {custom.length === 0 && (
                    <span className="text-tau-sm text-ink-3">手动填写或粘贴 JSON</span>
                  )}
                </button>
              )}
            </Section>
          )}

          {shownBuiltin.length > 0 && (
            <Section title="内置" hint="随应用提供，部分常开不可关">
              {shownBuiltin.map(item => (
                <ServerCard
                  key={item.id}
                  item={item}
                  active={item.id === openId}
                  onOpen={() => setOpenId(item.id)}
                />
              ))}
            </Section>
          )}

          {nothing && (
            <div className="flex flex-col items-center gap-2 px-5 py-20 text-center">
              <span className="bg-accent-soft text-accent-text mb-1.5 grid size-[52px] place-items-center rounded-[16px]">
                <Plug className="size-6" strokeWidth={1.5} />
              </span>
              <p className="text-ink-1 text-[15px] font-semibold">
                没有匹配「{query.trim()}」的服务器
              </p>
              <Button variant="secondary" size="sm" className="mt-2" onClick={() => setQuery("")}>
                清除搜索
              </Button>
            </div>
          )}
        </FadeScroll>
      </div>

      <ServerDrawer item={openItem} onClose={() => setOpenId(null)} onDelete={setDeleting} />

      <AddServerDialog open={adding} onOpenChange={setAdding} onAdded={id => id && setOpenId(id)} />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={open => !open && setDeleting(null)}
        title="删除 MCP 服务器"
        context={deleting?.name}
        description="删除后 AI 无法再调用它的工具，配置不可恢复。"
        confirmText="删除"
        danger
        onConfirm={async () => {
          if (!deleting) return;
          await removeServer(deleting.id);
          if (openId === deleting.id) setOpenId(null);
          setDeleting(null);
        }}
      />
    </div>
  );
}
