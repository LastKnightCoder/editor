/**
 * Spinner · Loading 档案 —— 本体即 ui/primitives/Loading。
 */

import { Loading, Spinner } from "@tau/ui/Loading";
import { BlockTitle, DocHead, MatrixRow } from "../kit";

export default function LoadingSection() {
  return (
    <>
      <DocHead
        title="Spinner · Loading"
        en="primitives/Loading.tsx"
        duty="Spinner 圆环可单独行内使用（accent 描边）；Loading 铺满父容器居中，无高度链时用 minHeight prop 兜底（默认 45vh，自带高度时传 0 关闭）。"
        src="packages/ui/src/primitives/Loading.tsx"
      />

      <BlockTitle en="States">状态矩阵</BlockTitle>
      <MatrixRow
        name="Spinner · 16px"
        desc={
          <>
            默认 <code>size-4</code>，border-2 · accent/30 底 + accent 顶弧
          </>
        }
      >
        <Spinner />
      </MatrixRow>
      <MatrixRow
        name="Spinner · 20px"
        desc={
          <>
            Loading 内用 <code>size-5</code>
          </>
        }
      >
        <Spinner className="size-5" />
      </MatrixRow>
      <MatrixRow
        name="行内组合"
        desc="13px 细环与文字基线对齐（className 覆盖）"
        trayClassName="gap-4"
      >
        <span className="text-tau-sm text-ink-2 inline-flex items-center gap-2">
          <Spinner className="size-[13px] border-[1.5px]" />
          正在统计…
        </span>
        <span className="text-tau-sm text-ink-2 inline-flex items-center gap-2">
          <Spinner className="size-[13px] border-[1.5px]" />
          读取数据库快照
        </span>
      </MatrixRow>
      <MatrixRow
        name="Loading · 页面级"
        desc={
          <>
            居中版式 + label（<code>role=status</code> + aria-live 由组件自带）
          </>
        }
      >
        {/* 容器取 surface（Loading 的真实语境是卡片/页面区域）：label 是 ink-3，
            落在更深的 group 上文字会发糊（D-006 后 group 已沉到 page 之下）。
            高度收在 168px——演示「铺满父容器」不需要 250px，只会把整段拉出大空档 */}
        <div className="bg-surface border-line-2 rounded-tau-md h-[168px] w-full overflow-hidden border">
          <Loading label="加载中…（label 可换文案）" minHeight={0} />
        </div>
      </MatrixRow>
    </>
  );
}
