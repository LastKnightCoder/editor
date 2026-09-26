/**
 * Dialog · ConfirmDialog 档案 —— 模态决策容器 + 确认语义预设。
 * 弹层标本不设恒开常显（模态会锁住整页交互），全部由按钮触发实测；
 * 关闭矩阵、焦点策略、type-to-confirm 门槛与 loading 封锁键盘全可用。
 */

import { useState } from "react";
import clsx from "clsx";
import { Dialog, DialogBody, ConfirmDialog } from "@tau/ui";
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

const CHANGELOG = [
  "浮层引擎落库：Tooltip 定位抽纯函数 computeTooltipPosition，Menu / Select 复用同一数学，flip 后 side 驱动进场方向。",
  "Select 定稿数据驱动 API；表单控件家族统一 surface 亮底 + line-1 描边口径，Esc 走焦点链不进全局注册表。",
  "命令面板（Ctrl+K）实装：命令 + 内容混合检索，空态落最近访问；Esc 仲裁 LIFO 收口到 PageProvider。",
  "主题系统双主题全键校验（AA 对比度断言）；样板间接入 themeStore 真实现，档案随主题联动。",
  "Page 协议落地：definePage 声明式页面 + 纯函数栈机，Activity 保活上限 12；侧栏条目改 navigation.ts 单源。",
  "首页最近编辑 14→30→90→365 天渐进加载凑满即停；Slate 正文提文本截断，空态与加载骨架统一。",
  "统计页矩阵视图：热力图轴标一次性字号；快照差分工具收口 utils，双端同构。",
  "侧栏导航数据单源（navigation.ts）；Titlebar 主题切换入口与窗口控制区对齐真实产品语言。",
  "首个内部版本：新壳层（Titlebar + Sidebar + Statusbar）与首页快照视图，卡片 / 日程 / 待办三区。",
  "内部预演版：token 契约与双主题（cream / cocoa）跑通 AA 校验，表面阶梯四档定序。",
  "浮层定位离屏锚点堆叠修复：shift 闸门与主轴占位判断补齐单测，视口外锚点不再钉边。",
  "样板间 v6 排版重排：版心统一 740px、字号阶梯 25/20/14.5/12.5、说明文字下限抬到 12.5px。",
];

/** 表单示例的应答按钮（与 ConfirmDialog 内部同款形制，Button 落地后迁移） */
const BTN =
  "inline-flex h-[34px] items-center justify-center gap-[7px] rounded-[10px] px-[17px] " +
  "text-tau-body ease-tau-out outline-none focus-visible:shadow-[var(--tau-focus-ring)] " +
  "transition-[background,border-color,opacity] duration-[140ms] disabled:pointer-events-none disabled:opacity-45";
const BTN_PRIMARY = clsx(BTN, "bg-accent text-ink-inverse font-[600] hover:bg-accent-hover");
const BTN_SECOND = clsx(
  BTN,
  "border-line-1 bg-surface text-ink-1 font-[550] border hover:border-ink-3"
);

export default function DialogSection() {
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [bookName, setBookName] = useState("");
  const [reading, setReading] = useState(false);
  const [readSize, setReadSize] = useState<"sm" | "md" | "lg">("md");

  // async onConfirm：ConfirmDialog 自动进入 loading，resolve 后自动关闭
  // （reject 保持打开就地处理错误——回执场景在 then 里发 Toast）
  const handleExport = async () => {
    await new Promise(r => setTimeout(r, 900));
  };

  return (
    <>
      <DocHead
        title="Dialog · ConfirmDialog"
        en="primitives/Dialog.tsx · primitives/ConfirmDialog.tsx"
        duty="模态决策容器。Dialog 是通用壳（标题/徽标/正文/影响行/应答区三段固定，footer 由调用方给按钮序列）；ConfirmDialog 是它的确认语义预设——一句话接线，danger 两档与输入解锁内建。遮罩 blur、焦点圈闭、Esc/Tab/Enter 键盘表、异步封锁全部内建。"
        src="packages/ui/src/primitives/Dialog.tsx"
      />

      <CanvasCard
        cap="LIVE"
        note="全部标本可交互：Esc 关闭 · 遮罩点击 · Tab 圈闭 · Enter 默认应答"
        stageClassName="flex flex-col gap-6"
      >
        <div className="flex flex-wrap items-center gap-4">
          <DemoButton onClick={() => setArchiving(true)}>归档卡片…</DemoButton>
          <DemoButton onClick={() => setDeleting(true)}>删除笔记本…</DemoButton>
          <DemoButton primary onClick={() => setCreating(true)}>
            新建笔记本…
          </DemoButton>
          <DemoButton onClick={() => setExporting(true)}>导出为 PDF…</DemoButton>
          <DemoButton onClick={() => setReading(true)}>更新说明…</DemoButton>
        </div>
        <Note>
          「删除」是 critical：无 ×、遮罩点击抖动拒绝、焦点落「取消」、输入笔记本名解锁；
          「导出」确认后 loading 封锁一切关闭路径，900ms 后自动关闭。
        </Note>
      </CanvasCard>

      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title="归档卡片"
        context="桌面端重构 · 架构笔记"
        description="卡片将从列表移入档案，内容与标签不变。"
        impact="可随时在侧栏「档案」中恢复"
        confirmText="归档"
        size="sm"
        onConfirm={() => undefined}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="删除笔记本"
        context="工作 · 重构"
        description="笔记本及其全部内容将移入废纸篓，清空后不可撤销。"
        impact="24 张卡片 · 废纸篓保留 30 天"
        confirmText="删除"
        danger
        typeToConfirm="工作 · 重构"
        critical
        onConfirm={() => undefined}
      />
      <Dialog
        open={creating}
        onOpenChange={setCreating}
        title="新建笔记本"
        footer={
          <>
            <button type="button" className={BTN_SECOND} onClick={() => setCreating(false)}>
              取消
            </button>
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={!bookName.trim()}
              data-autofocus
            >
              创建
            </button>
          </>
        }
      >
        <DialogBody>
          <label className="text-ink-2 mb-1.5 block text-[12px] font-[550]">名称</label>
          <input
            type="text"
            value={bookName}
            onChange={e => setBookName(e.target.value)}
            placeholder="给笔记本起个名字"
            data-autofocus
            className="border-line-1 bg-surface text-ink-1 placeholder:text-ink-3 rounded-tau-sm focus:border-accent ease-tau-out h-[34px] w-full border px-3 outline-none transition-[border-color,box-shadow] duration-[160ms] focus:shadow-[var(--tau-focus-ring)]"
          />
          <div className="text-ink-3 mt-1.5 text-[11.5px]">
            首输入框 data-autofocus；Enter 走表单原生提交；空名时主按钮禁用
          </div>
        </DialogBody>
      </Dialog>
      <ConfirmDialog
        open={exporting}
        onOpenChange={setExporting}
        title="导出为 PDF"
        context="桌面端重构 · 架构笔记"
        description="导出 1,204 字 · 3 张配图，含代码块与标签页，保存到「文稿」文件夹。"
        impact="上次导出：昨天 14:20"
        confirmText="导出"
        loadingText="导出中…"
        onConfirm={handleExport}
      />
      <Dialog
        open={reading}
        onOpenChange={setReading}
        title="更新说明"
        size={readSize}
        footer={
          <button type="button" className={BTN_PRIMARY} onClick={() => setReading(false)}>
            知道了
          </button>
        }
      >
        <DialogBody>
          <div className="divide-line-2 divide-y">
            {CHANGELOG.map((text, i) => (
              <div key={i} className="text-ink-2 py-2.5 text-[12.5px] leading-[1.6]">
                {text}
              </div>
            ))}
          </div>
        </DialogBody>
      </Dialog>

      <BlockTitle en="行为标本">状态矩阵</BlockTitle>
      <MatrixRow
        name="关闭矩阵"
        desc={
          <>
            <code>dismissible</code>（默认）：× / Esc / 遮罩点击均可关；<code>critical</code>：无
            ×、遮罩与 Esc 抖动拒绝——必须按钮作答；<code>locked</code>（loading 期间）：全失效。Esc
            不冒泡成页面后退。
          </>
        }
        trayClassName="items-center"
      >
        <DemoButton onClick={() => setArchiving(true)}>dismissible</DemoButton>
        <DemoButton onClick={() => setDeleting(true)}>critical（点遮罩看抖动）</DemoButton>
        <DemoButton onClick={() => setExporting(true)}>locked（确认后 loading）</DemoButton>
      </MatrixRow>
      <MatrixRow
        name="尺寸档与任意宽度"
        desc={
          <>
            <code>sm</code> 380 / <code>md</code> 440（默认）/ <code>lg</code>{" "}
            560——只改宽度不改排版；
            <code>width</code>{" "}
            传像素数覆盖档位，业务特殊版式不必硬凑档位。下方切换「更新说明」的档位。
          </>
        }
        trayClassName="items-center"
      >
        <Segmented
          value={readSize}
          onChange={v => setReadSize(v)}
          options={[
            { value: "sm", label: "sm" },
            { value: "md", label: "md" },
            { value: "lg", label: "lg" },
          ]}
        />
        <DemoButton onClick={() => setReading(true)}>打开更新说明</DemoButton>
      </MatrixRow>
      <MatrixRow
        name="头部信息分工"
        desc={
          <>
            标题讲动作、<code>context</code> 徽标记对象（surface 亮底 + 描边）、正文讲事实、
            <code>impact</code> 影响行念后果、按钮文案不带数量——一处一责。阻断通知纯文字头部（无
            icon）。
          </>
        }
        trayClassName="items-center"
      >
        <DemoButton onClick={() => setDeleting(true)}>徽标 + danger 影响行</DemoButton>
        <DemoButton onClick={() => setArchiving(true)}>普通影响行</DemoButton>
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
                <code>Dialog · title / context</code>
              </td>
              <td>标题保持动作语义（「删除笔记本」）；操作对象挂徽标，随需出现</td>
            </tr>
            <tr>
              <td>
                <code>Dialog · impact / impactDanger</code>
              </td>
              <td>footer 影响行（后果量化贴决策点）；danger 主按钮时建议 impactDanger 走红字</td>
            </tr>
            <tr>
              <td>
                <code>Dialog · critical / locked</code>
              </td>
              <td>critical = 无 × + 遮罩/Esc 抖动拒绝；locked = 异步进行中封锁一切关闭路径</td>
            </tr>
            <tr>
              <td>
                <code>Dialog · size / width / height</code>
              </td>
              <td>
                档位 <code>sm | md | lg</code>；width 像素数覆盖档位；height 定高（不超
                82vh），给内容自管滚动的工作台型弹窗
              </td>
            </tr>
            <tr>
              <td>
                <code>DialogBody</code>
              </td>
              <td>
                正文滚动区（edge fade + 内缩滚动条 + 标准内边距）；放在它之外的 children
                钉住不随正文滚动
              </td>
            </tr>
            <tr>
              <td>
                <code>Dialog · footer</code>
              </td>
              <td>应答区按钮序列（主按钮恒在最右，组件自身不渲染按钮）</td>
            </tr>
            <tr>
              <td>
                <code>ConfirmDialog · danger</code>
              </td>
              <td>主按钮实心红 + 初始焦点落「取消」（回车不误触）</td>
            </tr>
            <tr>
              <td>
                <code>ConfirmDialog · typeToConfirm</code>
              </td>
              <td>输入该名称解锁确认按钮（每次打开重置）——只给真·不可逆操作</td>
            </tr>
            <tr>
              <td>
                <code>ConfirmDialog · loading / loadingText</code>
              </td>
              <td>确认进行中：spinner + 文案切换 + 取消禁用 + 关闭封锁；完成后由调用方关 open</td>
            </tr>
          </tbody>
        </table>
        <Note>
          内建行为（不做成 props）：开合动效 · Tab 圈闭 · 焦点归还触发元素 · 初始焦点落
          <code>data-autofocus</code>（无则卡片）· Esc 仅 open 态在卡片消费（焦点链
          LIFO，不冒泡成页面后退）· 打开锁定底层滚动 · 正文区独立滚动（上限
          78vh，长内容滚动边缘渐隐）。
        </Note>
      </ApiCard>
    </>
  );
}
