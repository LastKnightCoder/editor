/**
 * Drawer 档案 —— 右侧滑入的模态详情容器。
 * 主标本复刻 Skill 详情抽屉（图标 + 标题/来源标签 + mono 副标题 + 徽标行，
 * 右侧操作区、分区 toolbar、长正文滚动）；另给纯文字头部 + footer 的设置型抽屉、
 * 尺寸档切换与「列表点选 → 抽屉跟随切换」的选中项驱动示例。
 * 弹层标本不设恒开常显（模态锁住整页交互），全部由按钮触发实测。
 */

import { useState } from "react";
import {
  BookMarked,
  FolderOpen,
  Library,
  MoreHorizontal,
  Pencil,
  Radar,
  Trash2,
} from "lucide-react";
import {
  Button,
  Drawer,
  IconButton,
  Input,
  Menu,
  Segmented as UiSegmented,
  Switch,
  Tooltip,
  cn,
  useRetainedValue,
} from "@tau/ui";
import {
  ApiCard,
  BlockTitle,
  CanvasCard,
  DemoButton,
  DocHead,
  MatrixRow,
  Note,
  Segmented,
} from "../kit";

interface DemoSkill {
  key: string;
  name: string;
  folder: string;
  source?: string;
  mode: "auto" | "manual";
  files: string[];
  uses: number;
  description: string;
}

const SKILLS: DemoSkill[] = [
  {
    key: "knowledge-base",
    name: "知识库检索",
    folder: "knowledge-base",
    source: "内置",
    mode: "auto",
    files: ["SKILL.md"],
    uses: 42,
    description:
      "当用户询问自己笔记、卡片或文档里的内容时使用：先按关键词与语义检索知识库，再引用原文作答，并附上来源链接。",
  },
  {
    key: "weekly-review",
    name: "周复盘",
    folder: "weekly-review",
    mode: "manual",
    files: ["SKILL.md", "templates/review.md", "scripts/collect.ts"],
    uses: 7,
    description:
      "每周日用 $周复盘 点名：汇总本周完成的待办、番茄专注时长与新建笔记，按模板生成复盘草稿。",
  },
];

const MODE_BADGE = {
  auto: { text: "自动", className: "bg-ok-soft text-ok" },
  manual: { text: "仅手动", className: "bg-info-soft text-info" },
};

function ModeBadge({ mode }: { mode: DemoSkill["mode"] }) {
  const { text, className } = MODE_BADGE[mode];
  return (
    <span
      className={cn(
        "text-tau-tiny inline-flex h-5 shrink-0 items-center rounded-full px-2 leading-none",
        className
      )}
    >
      {text}
    </span>
  );
}

function SkillIcon({ skill }: { skill: DemoSkill }) {
  const Icon = skill.source ? Library : BookMarked;
  return (
    <span className="bg-hover text-ink-2 grid size-11 place-items-center rounded-[12px]">
      <Icon className="size-5" strokeWidth={1.75} />
    </span>
  );
}

function OverviewDemo({ skill }: { skill: DemoSkill }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="border-line-1 rounded-[12px] border px-3.5 py-3">
        <div className="text-tau-sm text-ink-3 mb-1 flex items-center gap-1.5">
          <Radar className="size-3.5" strokeWidth={1.75} />
          AI 看到的描述 · 据此决定何时加载
        </div>
        <p className="text-tau-meta text-ink-1 m-0 leading-[1.65]">{skill.description}</p>
      </div>
      <div className="border-line-1 rounded-[12px] border px-3.5 py-3">
        <div className="text-tau-sm text-ink-3 mb-1">文件 · {skill.files.length}</div>
        <ul className="font-tau-mono text-ink-2 m-0 list-none p-0 text-[11.5px] leading-[1.7]">
          {skill.files.map(f => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>
      <div className="border-line-1 rounded-[12px] border px-4 py-3">
        <div className="text-tau-sm text-ink-3 mb-1">SKILL.md</div>
        {Array.from({ length: 14 }, (_, i) => (
          <p key={i} className="text-tau-body text-ink-2 my-2 leading-[1.75]">
            第 {i + 1} 段：长正文在抽屉内独立滚动，头部与分区切换钉住不动；滚到顶 /
            底之前，对应边缘渐隐提示还有内容。
          </p>
        ))}
      </div>
    </div>
  );
}

interface DemoTask {
  id: number;
  title: string;
  project: string;
  note: string;
}

const TASKS: DemoTask[] = [
  {
    id: 1,
    title: "整理本周复盘",
    project: "个人",
    note: "汇总番茄时长与完成的待办，按模板生成草稿。",
  },
  {
    id: 2,
    title: "Drawer 非模态形态",
    project: "桌面端重构",
    note: "伴随面板：无遮罩、不抢焦点，列表仍可点选。",
  },
  { id: 3, title: "回复设计评审意见", project: "工作", note: "侧栏间距与分组标题字号两处待定。" },
];

type Tab = "overview" | "settings" | "usage";

export default function DrawerSection() {
  const [selected, setSelected] = useState<DemoSkill | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [enabled, setEnabled] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [siteTitle, setSiteTitle] = useState("我的博客");
  const [sized, setSized] = useState(false);
  const [size, setSize] = useState<"sm" | "md" | "lg">("md");
  const [task, setTask] = useState<DemoTask | null>(null);
  const [taskWidth, setTaskWidth] = useState(320);
  const shownTask = useRetainedValue(task);
  // 关闭滑出途中 selected 已是 null：用最后一次非空值继续渲染内容
  const current = useRetainedValue(selected);

  const openSkill = (skill: DemoSkill) => {
    setTab("overview");
    setSelected(skill);
  };

  return (
    <>
      <DocHead
        title="Drawer"
        en="primitives/Drawer.tsx"
        duty="右侧抽屉，模态（遮罩 + 焦点圈闭，看完即走的详情 / 配置）与非模态（就地伴随面板，边看边改）两种形态。头部三行（标题 / 副标题 / 元信息）+ 前导图标 + 右侧操作区，可选钉住 toolbar 与 footer，正文独立滚动带边缘渐隐。开合动效、遮罩点击、Esc、Tab 圈闭、焦点归还、滚动锁定全部内建；useRetainedValue 让选中项驱动的抽屉在滑出途中不变空白。"
        src="packages/ui/src/primitives/Drawer.tsx"
      />

      <CanvasCard
        cap="LIVE"
        note="点卡片打开 Skill 详情 · Esc / 遮罩 / × 关闭 · Tab 圈闭"
        stageClassName="flex flex-col gap-6"
      >
        <div className="grid grid-cols-2 gap-3">
          {SKILLS.map(skill => (
            <button
              key={skill.key}
              type="button"
              onClick={() => openSkill(skill)}
              className="border-line-1 hover:bg-hover flex items-start gap-3 rounded-[12px] border px-3.5 py-3 text-left transition-colors duration-150"
            >
              <span className="bg-hover text-ink-2 grid size-[30px] shrink-0 place-items-center rounded-[9px]">
                {skill.source ? (
                  <Library className="size-[15px]" strokeWidth={1.75} />
                ) : (
                  <BookMarked className="size-[15px]" strokeWidth={1.75} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <b className="text-tau-meta text-ink-1 block font-semibold">{skill.name}</b>
                <span className="text-tau-sm text-ink-3 line-clamp-2">{skill.description}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <DemoButton onClick={() => setSettingsOpen(true)}>站点设置…</DemoButton>
        </div>
      </CanvasCard>

      <Drawer
        open={selected !== null}
        onOpenChange={open => !open && setSelected(null)}
        label={current ? `${current.name} 详情` : "Skill 详情"}
        icon={current && <SkillIcon skill={current} />}
        title={
          current && (
            <>
              <span className="truncate">{current.name}</span>
              {current.source && (
                <span className="text-tau-micro text-ink-3 border-line-1 inline-flex shrink-0 items-center rounded-[5px] border px-1.5 font-normal leading-[18px]">
                  {current.source}
                </span>
              )}
            </>
          )
        }
        subtitle={
          current && (
            <span className="font-tau-mono block truncate text-[11.5px]">{current.folder}</span>
          )
        }
        meta={
          current && (
            <>
              <ModeBadge mode={current.mode} />
              {current.files.length} 个文件 · 用过 {current.uses} 次
            </>
          )
        }
        actions={
          <>
            <Button size="sm" variant="secondary" icon={Pencil}>
              编辑
            </Button>
            <Menu
              align="end"
              trigger={
                <IconButton aria-label="更多">
                  <MoreHorizontal className="size-4" strokeWidth={1.75} />
                </IconButton>
              }
            >
              <Menu.Item icon={<FolderOpen />}>在访达中显示</Menu.Item>
              <Menu.Separator />
              <Menu.Item icon={<Trash2 />} danger>
                删除
              </Menu.Item>
            </Menu>
            <Tooltip content={enabled ? "停用" : "启用"}>
              <span>
                <Switch
                  aria-label={enabled ? "停用 Skill" : "启用 Skill"}
                  checked={enabled}
                  onCheckedChange={setEnabled}
                  className="mx-1.5"
                />
              </span>
            </Tooltip>
          </>
        }
        toolbar={
          <UiSegmented label="详情分区" size="sm" value={tab} onValueChange={(v: Tab) => setTab(v)}>
            <UiSegmented.Item value="overview" label="概览" />
            <UiSegmented.Item value="settings" label="设置" />
            <UiSegmented.Item value="usage" label="使用记录" />
          </UiSegmented>
        }
      >
        {current &&
          (tab === "overview" ? (
            <OverviewDemo skill={current} />
          ) : (
            <p className="text-tau-meta text-ink-3 m-0 py-10 text-center">
              「{tab === "settings" ? "设置" : "使用记录"}」分区示意
            </p>
          ))}
      </Drawer>

      <Drawer
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title="站点设置"
        size="sm"
        footer={
          <>
            <span className="text-tau-micro text-ink-3 flex-1">修改即时保存</span>
            <Button size="sm" variant="secondary" onClick={() => setSettingsOpen(false)}>
              完成
            </Button>
          </>
        }
      >
        <label className="text-ink-2 mb-1.5 block text-[12px] font-[550]">站点标题</label>
        <Input value={siteTitle} onChange={e => setSiteTitle(e.target.value)} data-autofocus />
        <div className="text-ink-3 mt-1.5 text-[11.5px]">
          首输入框 data-autofocus：打开即落焦点；关闭后焦点回到「站点设置…」按钮
        </div>
      </Drawer>

      <Drawer
        open={sized}
        onOpenChange={setSized}
        title={`尺寸档 · ${size}`}
        subtitle="只改宽度，不改排版"
        size={size}
      >
        <p className="text-tau-body text-ink-2 m-0 leading-[1.75]">
          sm 440 / md 560（默认）/ lg 720；width 传像素数覆盖档位。窗口比抽屉窄时按视口减去两侧 8px
          收窄。
        </p>
      </Drawer>

      <BlockTitle en="modal={false}">非模态伴随面板</BlockTitle>
      <CanvasCard
        cap="LIVE"
        note="点任务打开 · 抽屉开着时仍可点列表切换 · 左缘拖拽调宽 · Esc 需焦点在抽屉内"
        stageClassName="flex flex-col"
      >
        <div className="border-line-1 relative h-[340px] overflow-hidden rounded-[14px] border">
          <ul className="m-0 list-none p-3">
            {TASKS.map(t => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setTask(t)}
                  aria-pressed={task?.id === t.id}
                  className={cn(
                    "text-tau-body flex w-full items-center gap-2 rounded-[9px] px-3 py-2 text-left",
                    task?.id === t.id ? "bg-hover text-ink-1" : "text-ink-2 hover:bg-hover"
                  )}
                >
                  <span className="border-line-1 size-3.5 shrink-0 rounded-full border" />
                  {t.title}
                </button>
              </li>
            ))}
          </ul>
          <Drawer
            modal={false}
            open={task !== null}
            onOpenChange={open => !open && setTask(null)}
            title={shownTask?.title}
            subtitle={shownTask?.project}
            width={taskWidth}
            onWidthChange={setTaskWidth}
            minWidth={260}
            maxWidth={480}
          >
            <p className="text-tau-body text-ink-2 m-0 leading-[1.75]">{shownTask?.note}</p>
            <p className="text-tau-sm text-ink-3 mt-4">当前宽度 {taskWidth}px</p>
          </Drawer>
        </div>
      </CanvasCard>

      <BlockTitle en="行为标本">状态矩阵</BlockTitle>
      <MatrixRow
        name="选中项驱动 · useRetainedValue"
        desc={
          <>
            抽屉多由 <code>item | null</code> 驱动：<code>open={"{item !== null}"}</code>，内容用
            <code>useRetainedValue(item)</code> 渲染——关闭时 item 已为
            null，滑出途中仍显示最后一项。 抽屉开着时切换 item，内容原地更新、不重播进场。
          </>
        }
        trayClassName="items-center"
      >
        {SKILLS.map(skill => (
          <DemoButton key={skill.key} onClick={() => openSkill(skill)}>
            打开「{skill.name}」
          </DemoButton>
        ))}
      </MatrixRow>
      <MatrixRow
        name="头部分工"
        desc={
          <>
            <code>icon</code> 前导视觉与标题首行顶对齐；<code>title</code> 可放节点（名称 +
            来源标签），此时给 <code>label</code> 作无障碍名；<code>subtitle</code>{" "}
            字符串单行截断、节点自控；
            <code>meta</code> 横排徽标与计数；<code>actions</code> 排在 ×
            之前。都随需出现——纯文字头部只传 title。
          </>
        }
        trayClassName="items-center"
      >
        <DemoButton onClick={() => openSkill(SKILLS[0])}>完整头部</DemoButton>
        <DemoButton onClick={() => setSettingsOpen(true)}>纯文字头部 + footer</DemoButton>
      </MatrixRow>
      <MatrixRow
        name="尺寸档与任意宽度"
        desc={
          <>
            <code>sm</code> 440 / <code>md</code> 560（默认）/ <code>lg</code> 720；
            <code>width</code> 覆盖档位。
          </>
        }
        trayClassName="items-center"
      >
        <Segmented
          value={size}
          onChange={v => setSize(v)}
          options={[
            { value: "sm", label: "sm" },
            { value: "md", label: "md" },
            { value: "lg", label: "lg" },
          ]}
        />
        <DemoButton onClick={() => setSized(true)}>打开</DemoButton>
      </MatrixRow>

      <ApiCard title="API 备忘">
        <table>
          <thead>
            <tr>
              <th>Prop</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>open / onOpenChange</code>
              </td>
              <td>受控开合；× / Esc / 遮罩点击都走 onOpenChange(false)</td>
            </tr>
            <tr>
              <td>
                <code>title / label</code>
              </td>
              <td>title 为节点时必须给 label 作 aria-label</td>
            </tr>
            <tr>
              <td>
                <code>icon / subtitle / meta / actions</code>
              </td>
              <td>头部四个可选槽位，缺省不占位</td>
            </tr>
            <tr>
              <td>
                <code>toolbar</code>
              </td>
              <td>头部下方钉住条（分区 Segmented、筛选），不随正文滚动</td>
            </tr>
            <tr>
              <td>
                <code>footer</code>
              </td>
              <td>底部钉住区，hairline 分隔；内容由调用方排布</td>
            </tr>
            <tr>
              <td>
                <code>size / width</code>
              </td>
              <td>
                <code>sm | md | lg</code> = 440 / 560 / 720；width 像素数覆盖
              </td>
            </tr>
            <tr>
              <td>
                <code>modal</code>
              </td>
              <td>
                false = 非模态伴随面板：就地 absolute（距上右下 12px，className 改定位），无遮罩、
                不抢焦点、不锁滚动；焦点在抽屉外时 Esc 需调用方另接页面浮层仲裁
              </td>
            </tr>
            <tr>
              <td>
                <code>fill</code>
              </td>
              <td>正文不滚动、无内边距，内容自管布局；配合不传 title = 无头部、× 浮在右上角</td>
            </tr>
            <tr>
              <td>
                <code>onWidthChange / minWidth / maxWidth</code>
              </td>
              <td>传入即开启左缘拖拽调宽；width 受控并夹进上下限</td>
            </tr>
            <tr>
              <td>
                <code>isolateKeyboard</code>
              </td>
              <td>键盘事件在抽屉边界停止冒泡（内层照常收到），宿主在 document 上监听快捷键时用</td>
            </tr>
            <tr>
              <td>
                <code>bodyClassName</code>
              </td>
              <td>正文滚动区附加类（内边距、字号）</td>
            </tr>
            <tr>
              <td>
                <code>useRetainedValue(v)</code>
              </td>
              <td>返回 v；v 为空时返回最后一次非空值——退场动画期间保留内容</td>
            </tr>
          </tbody>
        </table>
        <Note>
          内建行为（不做成 props）：遮罩淡入 + 卡片右缘滑入（280ms），退场后卸载 · Esc
          在抽屉内消费（内层 Select / Menu 先消费自己的 Esc，不冒泡成页面级 Esc）· Tab 圈闭 ·
          初始焦点落 <code>data-autofocus</code>（无则抽屉自身）· 关闭归还焦点 · 打开锁定底层滚动 ·
          内部浮层继承抽屉内 Portal 容器。
        </Note>
      </ApiCard>
    </>
  );
}
