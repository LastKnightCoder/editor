/**
 * IconButton 档案 —— 本体即 ui/primitives/IconButton 真实现。
 * 瞬态锁定说明：hover 标本直接施加 hover 视觉类（bg-hover text-ink-1 常驻），
 * 组件尺寸/圆角/过渡仍来自组件本体，无样式复刻。
 */

import { CalendarDays, MoreHorizontal, Plus, Search } from "lucide-react";
import { IconButton } from "@/ui/primitives/IconButton";
import { ApiCard, BlockTitle, CanvasCard, DemoButton, DocHead, MatrixRow, Note } from "../kit";

export default function IconButtonSection() {
  return (
    <>
      <DocHead
        title="IconButton"
        en="primitives/IconButton.tsx"
        duty="30px 方形无底幽灵按钮，hover 淡墨（A2 反馈语言）。图标随 color 继承，尺寸微调靠 className 覆盖。"
        src="src/ui/primitives/IconButton.tsx"
      />

      <CanvasCard
        cap="LIVE"
        note="真实交互（hover / disabled 全可验）"
        stageClassName="flex flex-wrap items-center gap-6.5"
      >
        <IconButton title="搜索">
          <Search size={17} strokeWidth={1.75} />
        </IconButton>
        <IconButton title="新建">
          <Plus size={17} strokeWidth={1.75} />
        </IconButton>
        <IconButton title="日历">
          <CalendarDays size={17} strokeWidth={1.75} />
        </IconButton>
        <IconButton title="更多">
          <MoreHorizontal size={17} strokeWidth={1.75} />
        </IconButton>
        <IconButton title="不可用" disabled>
          <Plus size={17} strokeWidth={1.75} />
        </IconButton>
      </CanvasCard>

      <BlockTitle en="States">状态矩阵</BlockTitle>
      <MatrixRow
        name="default"
        desc={
          <>
            无底态，<code>text-ink-2</code>
          </>
        }
      >
        <IconButton>
          <Search size={17} strokeWidth={1.75} />
        </IconButton>
      </MatrixRow>
      <MatrixRow
        name=":hover（锁定）"
        desc={
          <>
            <code>bg-hover</code> + <code>ink-1</code>，160ms ease-tau-out
          </>
        }
      >
        {/* 锁定态 = 直接施加 hover 视觉类，见文件头注 */}
        <IconButton className="bg-hover text-ink-1">
          <Search size={17} strokeWidth={1.75} />
        </IconButton>
      </MatrixRow>
      <MatrixRow name="disabled" desc={<>opacity-35 · cursor-default，不吃 hover</>}>
        <IconButton disabled>
          <Search size={17} strokeWidth={1.75} />
        </IconButton>
      </MatrixRow>
      <MatrixRow
        name="27px 覆盖变体"
        desc={
          <>
            侧栏头等紧凑位，<code>className="size-[27px]"</code> 覆盖
          </>
        }
      >
        <IconButton className="size-[27px]">
          <Search size={17} strokeWidth={1.75} />
        </IconButton>
        <IconButton>
          <Search size={17} strokeWidth={1.75} />
        </IconButton>
        <span className="text-tau-micro text-ink-3">← 27px ｜ 30px →</span>
      </MatrixRow>

      <ApiCard title="API 备忘">
        <table>
          <thead>
            <tr>
              <th>Prop</th>
              <th>类型</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>className</code>
              </td>
              <td>string</td>
              <td>尺寸/位置微调唯一入口（不新开 size prop，YAGNI）</td>
            </tr>
            <tr>
              <td colSpan={3}>
                其余 props 透传 <code>&lt;button&gt;</code>（clsx 合并，type 默认 "button"）
              </td>
            </tr>
          </tbody>
        </table>
      </ApiCard>

      <Note>
        bg-press token 预留未消费——组件无显式 :active 态，按压场景由 hover 覆盖（如实呈现现状）。
      </Note>

      <div className="mt-6 flex items-center gap-3">
        <span className="text-tau-meta text-ink-2">对照：</span>
        <DemoButton>button（无 antd 等价物，Button 基础件待 §9 任务 2）</DemoButton>
      </div>
    </>
  );
}
