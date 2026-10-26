/**
 * Skill 与 MCP：上半是 Skill 卡片，开关决定是否启用，徽标显示调用方式；
 * 下半是 MCP 服务器，打开开关后经历「连接中…」再变成可用工具数。
 * 卡片结构按 features/skills 的 SkillsView 与 features/mcp 的 ServerVisual 重建。
 */
import { useEffect, useState } from "react";
import { Github, Globe, PenTool, Plug, Sparkles, type LucideIcon } from "lucide-react";
import { Switch, cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

interface Skill {
  id: number;
  name: string;
  description: string;
  icon: LucideIcon;
  mode: "auto" | "manual";
  on: boolean;
  tokens: number;
}

const SKILLS: Skill[] = [
  {
    id: 1,
    name: "读书卡片",
    description: "把一段摘录改写成一张卡片：先用自己的话复述，再写一句联想。",
    icon: PenTool,
    mode: "auto",
    on: true,
    tokens: 120,
  },
  {
    id: 2,
    name: "周报",
    description: "汇总本周完成的待办和番茄记录，按项目写成周报。",
    icon: Sparkles,
    mode: "manual",
    on: true,
    tokens: 0,
  },
];

interface Server {
  id: number;
  name: string;
  transport: string;
  icon: LucideIcon;
  tools: number;
  state: "off" | "connecting" | "ok";
}

const SERVERS: Server[] = [
  {
    id: 1,
    name: "GitHub",
    transport: "远程 · HTTP",
    icon: Github,
    tools: 12,
    state: "ok",
  },
  {
    id: 2,
    name: "浏览器",
    transport: "本地进程 · stdio",
    icon: Globe,
    tools: 5,
    state: "off",
  },
];

const CARD =
  "border-line-1 hover:shadow-lift flex min-h-[124px] flex-col gap-2.5 rounded-[var(--tau-radius-lg)] border p-3.5 transition-[box-shadow,border-color] duration-200 hover:border-transparent";

export default function SkillsDemo() {
  const [skills, setSkills] = useState(SKILLS);
  const [servers, setServers] = useState(SERVERS);
  const budget = skills
    .filter(skill => skill.on && skill.mode === "auto")
    .reduce((sum, skill) => sum + skill.tokens, 0);

  useEffect(() => {
    const connecting = servers.find(server => server.state === "connecting");
    if (!connecting) return;
    const timer = setTimeout(
      () =>
        setServers(list =>
          list.map(server => (server.id === connecting.id ? { ...server, state: "ok" } : server))
        ),
      1300
    );
    return () => clearTimeout(timer);
  }, [servers]);

  return (
    <AppWindow active="skills" crumb="Skill" height={460}>
      <div className="scrollbar-hide h-full overflow-y-auto px-7 pt-5 pb-6 max-sm:px-4">
        <div className="flex items-center gap-3">
          <h3 className="text-tau-title-lg font-semibold tracking-[-0.01em]">Skill</h3>
          <span className="text-tau-meta text-ink-2">
            已启用{" "}
            <b className="text-ink-1 font-semibold">{skills.filter(skill => skill.on).length}</b> /{" "}
            {skills.length}
          </span>
          <span className="text-ink-3 text-tau-sm ml-auto tabular-nums">
            常驻上下文 {budget} tokens
          </span>
        </div>
        <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3.5">
          {skills.map(skill => {
            const Icon = skill.icon;
            return (
              <div key={skill.id} className={CARD}>
                <div className="flex items-center gap-2.5">
                  <span className="bg-hover text-ink-2 grid size-[30px] place-items-center rounded-[9px]">
                    <Icon className="size-4" strokeWidth={1.75} />
                  </span>
                  <b className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                    {skill.name}
                  </b>
                  <Switch
                    size="sm"
                    checked={skill.on}
                    aria-label={`启用「${skill.name}」`}
                    onCheckedChange={on =>
                      setSkills(list =>
                        list.map(item => (item.id === skill.id ? { ...item, on } : item))
                      )
                    }
                  />
                </div>
                <p className="text-ink-2 line-clamp-2 text-[12.5px] leading-[1.6]">
                  {skill.description}
                </p>
                <div className="mt-auto flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 text-[11px] leading-5",
                      !skill.on
                        ? "border-line-1 text-ink-3 border border-dashed"
                        : skill.mode === "auto"
                          ? "bg-ok-soft text-ok"
                          : "bg-info-soft text-info"
                    )}
                  >
                    {!skill.on ? "已停用" : skill.mode === "auto" ? "自动" : "仅手动"}
                  </span>
                  <span className="text-ink-3 text-[11px]">
                    {skill.mode === "manual" && skill.on ? "输入框里用 $ 点名" : "用过 14 次"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-7 flex items-center gap-3">
          <Plug className="text-ink-2 size-4" strokeWidth={1.75} />
          <b className="text-tau-body font-semibold">MCP 服务器</b>
          <span className="text-tau-sm text-ink-3">
            {servers
              .filter(server => server.state === "ok")
              .reduce((sum, server) => sum + server.tools, 0)}{" "}
            个工具可用
          </span>
        </div>
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3.5">
          {servers.map(server => {
            const Icon = server.icon;
            return (
              <div key={server.id} className={CARD}>
                <div className="flex items-center gap-2.5">
                  <span className="bg-hover text-ink-2 grid size-[30px] place-items-center rounded-[9px]">
                    <Icon className="size-4" strokeWidth={1.75} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <b className="truncate text-[13.5px] font-semibold">{server.name}</b>
                    <span className="text-ink-3 text-[11px]">{server.transport}</span>
                  </span>
                  <Switch
                    size="sm"
                    checked={server.state !== "off"}
                    aria-label={`启用「${server.name}」`}
                    onCheckedChange={on =>
                      setServers(list =>
                        list.map(item =>
                          item.id === server.id
                            ? { ...item, state: on ? "connecting" : "off" }
                            : item
                        )
                      )
                    }
                  />
                </div>
                <span className="text-tau-sm mt-auto flex items-center gap-2">
                  <i
                    className={cn(
                      "size-[7px] rounded-full",
                      server.state === "ok" && "bg-ok",
                      server.state === "connecting" && "bg-warn animate-pulse",
                      server.state === "off" && "border-ink-3 border"
                    )}
                  />
                  <span className={server.state === "off" ? "text-ink-3" : "text-ink-2"}>
                    {server.state === "ok"
                      ? `${server.tools} / ${server.tools} 个工具`
                      : server.state === "connecting"
                        ? "连接中…"
                        : "已停用"}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </AppWindow>
  );
}
