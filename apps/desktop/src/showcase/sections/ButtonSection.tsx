/**
 * Button 档案 —— 本体即 ui/primitives/Button 真实现（方案 B 形制，mockups/button/）。
 * 瞬态锁定说明：hover 标本直接施加 hover 视觉类常驻（primary 换 accent-hover、
 * secondary 边框加深），结构与过渡仍来自组件本体。
 */

import { useEffect, useRef, useState } from "react";
import { Archive, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@tau/ui";
import { ApiCard, BlockTitle, CanvasCard, DocHead, MatrixRow } from "../kit";

/** loading 标本：点击进入 1.4s 载入后复位（spinner + 文案切换 + 封锁全可验） */
function LoadingSpecimen() {
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  return (
    <Button
      variant="primary"
      loading={busy}
      loadingText="导出中…"
      onClick={() => {
        setBusy(true);
        timer.current = setTimeout(() => setBusy(false), 1400);
      }}
    >
      导出 PDF
    </Button>
  );
}

export default function ButtonSection() {
  return (
    <>
      <DocHead
        title="Button"
        en="primitives/Button.tsx"
        duty="文字按钮六变体 × 两档尺寸。primary 是 accent 实心 + 微投影（每屏至多一枚）；secondary 亮底描边承取消与表单；soft 是工具栏次级强调；danger 两档对齐确认位与列表位的危险分级。"
        src="packages/ui/src/primitives/Button.tsx"
      />

      <CanvasCard
        cap="LIVE"
        note="真实交互（hover / 按压 / 载入全可验）"
        stageClassName="flex flex-wrap items-center gap-3"
      >
        <Button variant="primary" icon={Plus}>
          创建笔记本
        </Button>
        <Button>取消</Button>
        <Button variant="soft">开始复习</Button>
        <Button variant="ghost">稍后再说</Button>
        <Button variant="danger" icon={Trash2}>
          删除
        </Button>
        <Button variant="danger-soft" icon={Archive}>
          移到废纸篓
        </Button>
      </CanvasCard>

      <BlockTitle en="States">状态矩阵</BlockTitle>
      <MatrixRow name="default" desc={<>六变体各自的静止态</>}>
        <Button variant="primary" size="sm">
          创建
        </Button>
        <Button size="sm">取消</Button>
        <Button variant="soft" size="sm">
          复习
        </Button>
        <Button variant="ghost" size="sm">
          稍后
        </Button>
      </MatrixRow>
      <MatrixRow
        name=":hover（锁定）"
        desc={
          <>
            primary 换 <code>accent-hover</code> · secondary 边框加深，140ms ease-tau-out
          </>
        }
      >
        {/* 锁定态 = 直接施加 hover 视觉类，见文件头注 */}
        <Button variant="primary" size="sm" className="bg-accent-hover">
          创建
        </Button>
        <Button size="sm" className="border-ink-3">
          取消
        </Button>
        <Button variant="soft" size="sm" className="bg-accent/20">
          复习
        </Button>
        <Button variant="ghost" size="sm" className="bg-hover text-ink-1">
          稍后
        </Button>
      </MatrixRow>
      <MatrixRow name="disabled" desc={<>opacity-45 · 原生属性，不进 Tab 队列</>}>
        <Button variant="primary" size="sm" disabled>
          创建
        </Button>
        <Button size="sm" disabled>
          取消
        </Button>
        <Button variant="danger" size="sm" disabled>
          删除
        </Button>
      </MatrixRow>
      <MatrixRow
        name="loading"
        desc={
          <>
            spinner + <code>aria-busy</code> + 文案切换 + 封锁点击（点「导出 PDF」实试）
          </>
        }
        trayClassName="items-center"
      >
        <LoadingSpecimen />
      </MatrixRow>

      <BlockTitle en="Sizes × Icon">尺寸与图标</BlockTitle>
      <MatrixRow name="md · 34px" desc={<>表单 / Dialog 应答区档</>}>
        <Button variant="primary" icon={Plus}>
          新建卡片
        </Button>
        <Button icon={Search}>查找</Button>
      </MatrixRow>
      <MatrixRow name="sm · 28px" desc={<>工具栏 / 面板头 / 紧排行档</>}>
        <Button variant="primary" size="sm" icon={Plus}>
          新建
        </Button>
        <Button size="sm" icon={Archive}>
          归档
        </Button>
      </MatrixRow>
      <MatrixRow name="block" desc={<>空态 CTA / 窄容器满宽</>} trayClassName="items-center">
        <div className="w-[240px]">
          <Button variant="primary" block icon={Plus}>
            新建卡片
          </Button>
        </div>
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
                <code>variant</code>
              </td>
              <td>
                <code>"primary" | "secondary" | "soft" | "ghost" | "danger" | "danger-soft"</code>
              </td>
              <td>默认 secondary。每屏至多一枚 primary；危险分级见 D-011</td>
            </tr>
            <tr>
              <td>
                <code>size</code>
              </td>
              <td>
                <code>"sm" | "md"</code>
              </td>
              <td>默认 md</td>
            </tr>
            <tr>
              <td>
                <code>icon</code>
              </td>
              <td>
                <code>LucideIcon</code>
              </td>
              <td>仅左位 16px；icon-only 归 IconButton，不设该档</td>
            </tr>
            <tr>
              <td>
                <code>block</code>
              </td>
              <td>boolean</td>
              <td>满宽</td>
            </tr>
            <tr>
              <td>
                <code>loading</code> / <code>loadingText</code>
              </td>
              <td>boolean / string</td>
              <td>spinner + aria-busy + 文案切换 + 一并 disabled</td>
            </tr>
            <tr>
              <td colSpan={3}>
                其余 props 透传 <code>&lt;button&gt;</code>（cn 合并，type 默认 "button"）
              </td>
            </tr>
          </tbody>
        </table>
      </ApiCard>
    </>
  );
}
