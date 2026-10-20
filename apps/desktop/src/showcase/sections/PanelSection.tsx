/**
 * Panel 族档案 —— Panel/PanelTitle/PanelNote/EmptyNote/PanelAction 真实现。
 * 本页的画布卡（CanvasCard/ApiCard）本身即 Panel 视觉的用法示范。
 */

import { ChevronRight } from "lucide-react";
import {
  DocumentCard,
  DocumentCardGrid,
  EmptyNote,
  Panel,
  PanelAction,
  PanelNote,
  PanelTitle,
} from "@tau/ui";
import { ApiCard, BlockTitle, CanvasCard, DocHead, MatrixRow } from "../kit";

function SampleRows() {
  return (
    <div className="text-tau-body text-ink-2 mt-3 leading-loose">
      卡片 · 渐进式总结的三层加工
      <br />
      文档 · 双链笔记实践
      <br />
      文章 · 本地优先软件
    </div>
  );
}

export default function PanelSection() {
  return (
    <>
      <DocHead
        title="Panel 族"
        en="primitives/Panel.tsx"
        duty="壳层内容区的基础白卡容器（surface 底 + shadow-card，无描边）+ 标题行配套件。pad 三档对应域密度：base（统计页）/ compact（首页）/ none（自管内距）。"
        src="packages/ui/src/primitives/Panel.tsx"
      />

      {/* 展品本身即白卡 —— 用 page 舞台，否则白卡叠白卡只能靠阴影分辨 */}
      <CanvasCard
        cap="LIVE"
        note="完整示例（Action 悬停可验）"
        stage="page"
        stageClassName="flex flex-col items-stretch gap-4"
      >
        <Panel pad="base" className="max-w-[580px]">
          <PanelTitle>
            最近编辑 <PanelNote>14 天内</PanelNote>
            <PanelAction>
              全部 <ChevronRight size={12} strokeWidth={1.75} />
            </PanelAction>
          </PanelTitle>
          <SampleRows />
          <EmptyNote>暂无更多内容 —— EmptyNote 板内空态注记（灰底行）</EmptyNote>
        </Panel>
        <Panel pad="compact" className="max-w-[580px]">
          <PanelTitle className="text-[13px]">
            紧凑版式 <PanelNote>pad=compact</PanelNote>
          </PanelTitle>
          <div className="text-tau-sm text-ink-2 mt-1.5">
            首页卡片用 12/16 内距，标题下间距 mb-1.5。
          </div>
        </Panel>
      </CanvasCard>

      <BlockTitle en="States">状态矩阵</BlockTitle>
      <MatrixRow
        name="pad = base"
        desc={
          <>
            <code>px-5 py-[18px]</code> · 统计页等宽松版式
          </>
        }
      >
        <Panel pad="base" className="min-w-[300px]">
          <PanelTitle className="text-[12.5px]">标题 14.5px semibold</PanelTitle>
        </Panel>
      </MatrixRow>
      <MatrixRow
        name="pad = compact"
        desc={
          <>
            <code>px-4 py-3</code> · 首页紧凑版式
          </>
        }
      >
        <Panel pad="compact" className="min-w-[300px]">
          <PanelTitle className="text-[12.5px]">标题</PanelTitle>
        </Panel>
      </MatrixRow>
      <MatrixRow name="pad = none" desc="自管内距（图表满贴等场景）">
        <Panel pad="none" className="grid h-14 min-w-[300px] place-items-center">
          <span className="text-tau-micro text-ink-3">内容自带 padding / 满贴图表</span>
        </Panel>
      </MatrixRow>
      <MatrixRow
        name="EmptyNote"
        desc={
          <>
            <code>line-1</code> 描边空态行 · mt-2.5 px-3 py-2.5
          </>
        }
        trayClassName=""
      >
        <EmptyNote className="flex-1">该板块暂无数据</EmptyNote>
      </MatrixRow>
      <MatrixRow name="PanelAction :hover" desc="标题行右侧「前往」链接，锁定 hover 态">
        <span className="text-tau-sm text-ink-2 inline-flex items-center gap-1.5">
          标题行
          <PanelAction className="bg-hover text-ink-1">
            全部 <ChevronRight size={12} strokeWidth={1.75} />
          </PanelAction>
        </span>
      </MatrixRow>

      <BlockTitle en="DocumentCard">文档卡片</BlockTitle>
      <CanvasCard
        cap="LIVE"
        note="编辑器与博客共用；整张卡片可点击，摘要固定两行"
        stage="page"
        stageClassName="w-full"
      >
        <DocumentCardGrid>
          <DocumentCard
            title="项目文档"
            description="保留文档标题、摘要和图标；卡片随正文字号缩放。"
            href="#document-card"
          />
          <DocumentCard title="空白文档" description="" />
        </DocumentCardGrid>
      </CanvasCard>

      <ApiCard title="API 备忘">
        <table>
          <thead>
            <tr>
              <th>导出</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>Panel</code>
              </td>
              <td>
                <code>pad?: "base" | "compact" | "none"</code>（默认 base）
              </td>
            </tr>
            <tr>
              <td>
                <code>PanelTitle</code>
              </td>
              <td>h2 · 14.5px semibold；下间距由调用方按域密度给（mb-1.5 / mb-2.5）</td>
            </tr>
            <tr>
              <td>
                <code>PanelNote</code>
              </td>
              <td>标题行右侧说明小字（11.5px ink-3）</td>
            </tr>
            <tr>
              <td>
                <code>EmptyNote</code>
              </td>
              <td>板内空态注记</td>
            </tr>
            <tr>
              <td>
                <code>PanelAction</code>
              </td>
              <td>标题行右侧「前往」链接</td>
            </tr>
          </tbody>
        </table>
      </ApiCard>
    </>
  );
}
