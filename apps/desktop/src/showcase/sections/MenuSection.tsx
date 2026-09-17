/**
 * Menu 档案 —— 动作触发的浮层命令面板（方案 B「现代产品」定稿，D-010）。
 * 全部标本可交互（点击/键盘/右键实测行为）；命令项触发即关、开关项不关是
 * 与 Select 的语义分界，标本里专门放一块让两态都可体验。
 */

import { useState, type ComponentProps } from "react";
import {
  ChevronDown,
  Download,
  ExternalLink,
  FilePlus,
  Link2,
  MoreHorizontal,
  Pin,
  Trash2,
} from "lucide-react";
import { ContextMenu, Menu } from "@/ui/primitives/Menu";
import { cn } from "@/ui/cn";
import { ApiCard, BlockTitle, CanvasCard, DocHead, MatrixRow } from "../kit";

/**
 * 触发按钮：表单家族口径（surface 亮底 + line-1 描边，D-007/D-009）。
 * 必须 rest 透传——Menu 克隆注入 onClick、aria 属性与 ref，不透传则点击无反应
 * （同 Tooltip 的克隆协议；React 19 里 ref 随 props 展开直达 DOM）。
 */
function MenuTrigger({ children, className, ...rest }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "border-line-1 bg-surface text-ink-1 rounded-tau-sm text-tau-body hover:border-ink-3 focus-visible:border-accent aria-expanded:border-accent inline-flex h-[34px] items-center gap-2 border px-3 outline-none transition-colors focus-visible:shadow-[var(--tau-focus-ring)]",
        className
      )}
    >
      {children}
      <ChevronDown className="text-ink-3 size-[13px]" />
    </button>
  );
}

export default function MenuSection() {
  const [sort, setSort] = useState("mtime");
  const [showWords, setShowWords] = useState(true);
  const [pin, setPin] = useState(true);
  const [fired, setFired] = useState("（尚未触发）");

  return (
    <>
      <DocHead
        title="Menu"
        en="primitives/Menu.tsx"
        duty="动作触发的浮层命令面板：命令 / 开关 / 单选组 / 分隔 / 子菜单的异构序列（复合组件，D-010）。命令项触发即关，checkbox·radio 触发不关；键盘全表与 aria 内建，定位复用自研引擎（gap 4），Esc 走焦点链 LIFO 不进 D-003 注册表（同 Select 口径）。"
        src="src/ui/primitives/Menu.tsx"
      />

      <CanvasCard
        cap="LIVE"
        note="键盘全表可用：↑↓ / Enter / → ←（子菜单）/ Esc / 敲字跳匹配；危险项 hover 实心红"
        stageClassName="flex flex-col items-start gap-6"
      >
        <div className="flex flex-wrap items-center gap-4">
          <Menu trigger={<MenuTrigger>文件</MenuTrigger>}>
            <Menu.Item icon={<FilePlus />} kbd="⌘N" onSelect={() => setFired("新建卡片")}>
              新建卡片
            </Menu.Item>
            <Menu.Item kbd="⌘S" disabled onSelect={() => setFired("保存")}>
              保存（只读）
            </Menu.Item>
            <Menu.Submenu label="导出为" icon={<Download />}>
              <Menu.Item onSelect={() => setFired("导出 PDF")}>PDF 文档</Menu.Item>
              <Menu.Item onSelect={() => setFired("导出 Markdown")}>Markdown</Menu.Item>
              <Menu.Item onSelect={() => setFired("导出纯文本")}>纯文本</Menu.Item>
            </Menu.Submenu>
            <Menu.Separator />
            <Menu.Item danger kbd="⌫" onSelect={() => setFired("移到废纸篓")}>
              移到废纸篓
            </Menu.Item>
          </Menu>

          <Menu trigger={<MenuTrigger>视图</MenuTrigger>}>
            <Menu.Group>排序</Menu.Group>
            <Menu.RadioGroup value={sort} onValueChange={setSort}>
              <Menu.RadioItem value="mtime">修改时间</Menu.RadioItem>
              <Menu.RadioItem value="ctime">创建时间</Menu.RadioItem>
              <Menu.RadioItem value="title">标题</Menu.RadioItem>
            </Menu.RadioGroup>
            <Menu.Separator />
            <Menu.Group>显示</Menu.Group>
            <Menu.CheckboxItem checked={showWords} onCheckedChange={setShowWords}>
              字数统计
            </Menu.CheckboxItem>
            <Menu.CheckboxItem checked={pin} onCheckedChange={setPin}>
              置顶卡片
            </Menu.CheckboxItem>
          </Menu>
        </div>
        <div className="text-tau-meta text-ink-3 font-tau-mono">
          最近命令 = {fired} · sort = {sort} · showWords = {String(showWords)} · pin = {String(pin)}
        </div>
      </CanvasCard>

      <BlockTitle en="ContextMenu（右键承载）">上下文菜单</BlockTitle>
      <MatrixRow name="卡片行右键" desc="锚 = 鼠标点的虚拟 rect；关闭后焦点还右键命中元素">
        <ContextMenu
          content={
            <>
              <Menu.Item icon={<ExternalLink />} onSelect={() => setFired("打开")}>
                打开
              </Menu.Item>
              <Menu.Item icon={<Link2 />} kbd="⌘L" onSelect={() => setFired("复制链接")}>
                复制链接
              </Menu.Item>
              <Menu.Separator />
              <Menu.CheckboxItem icon={<Pin />} checked={pin} onCheckedChange={setPin}>
                置顶
              </Menu.CheckboxItem>
              <Menu.Separator />
              <Menu.Item danger icon={<Trash2 />} onSelect={() => setFired("删除卡片")}>
                删除卡片
              </Menu.Item>
            </>
          }
        >
          <div className="border-line-1 bg-surface rounded-tau-md flex w-full max-w-[420px] items-center gap-3 border px-4 py-3">
            <span className="bg-accent size-2 rounded-full" />
            <span className="text-tau-body font-[550]">桌面端重构 · 架构笔记</span>
            <span className="text-ink-3 text-tau-meta ml-auto">昨天 14:20</span>
          </div>
        </ContextMenu>
      </MatrixRow>

      <BlockTitle en="状态标本">状态矩阵</BlockTitle>
      <MatrixRow name="图标随需出现" desc="命令组带图标 / 开关组无图标不留空位（形制 B）">
        <Menu trigger={<MenuTrigger>更多操作</MenuTrigger>}>
          <Menu.Item icon={<FilePlus />} onSelect={() => setFired("新建")}>
            新建卡片
          </Menu.Item>
          <Menu.Item onSelect={() => setFired("设置")}>设置…</Menu.Item>
        </Menu>
      </MatrixRow>
      <MatrixRow name="图标按钮当触发器" desc="trigger 克隆注入（任意单一元素，含 IconButton）">
        <Menu
          trigger={
            <button
              aria-label="更多"
              className="hover:bg-hover text-ink-2 grid size-[30px] place-items-center rounded-[9px]"
            >
              <MoreHorizontal className="size-4" />
            </button>
          }
        >
          <Menu.Item onSelect={() => setFired("刷新")}>刷新快照</Menu.Item>
          <Menu.Item danger onSelect={() => setFired("清空")}>
            清空筛选
          </Menu.Item>
        </Menu>
      </MatrixRow>

      <ApiCard title="API 备忘（复合组件）">
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
                <code>Menu · trigger</code>
              </td>
              <td>
                触发器（单一元素，克隆注入开合事件与 aria）；<code>align="start" | "end"</code>{" "}
                交叉轴对齐
              </td>
            </tr>
            <tr>
              <td>
                <code>Menu.Item</code>
              </td>
              <td>
                命令项：<code>icon / kbd / danger / disabled / onSelect</code>——触发即关整树
              </td>
            </tr>
            <tr>
              <td>
                <code>Menu.CheckboxItem</code>
              </td>
              <td>
                开关项：<code>checked / onCheckedChange</code>——触发<b>不关闭</b>（连续操作）
              </td>
            </tr>
            <tr>
              <td>
                <code>Menu.RadioGroup · RadioItem</code>
              </td>
              <td>
                受控单选组：<code>value / onValueChange</code>，组内互斥、触发不关闭
              </td>
            </tr>
            <tr>
              <td>
                <code>Menu.Submenu</code>
              </td>
              <td>
                子菜单级联：<code>label / icon</code>，→ / Enter / hover 260ms 展开
              </td>
            </tr>
            <tr>
              <td>
                <code>Menu.Separator · Menu.Group</code>
              </td>
              <td>分隔线 / 分组标签（tiny 600 ink-3）</td>
            </tr>
            <tr>
              <td>
                <code>ContextMenu · content</code>
              </td>
              <td>包住内容区（display:contents 不破坏布局），区域内右键弹出；锚 = 命中点</td>
            </tr>
          </tbody>
        </table>
      </ApiCard>
    </>
  );
}
