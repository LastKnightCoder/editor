/**
 * ErrorState · RecoverableBoundary 档案 —— 本体在 components/ErrorState。
 */

import { useState } from "react";
import { Button } from "@tau/ui";
import { ErrorState, RecoverableBoundary } from "@/components/ErrorState";
import { BlockTitle, CanvasCard, DocHead, Note } from "../kit";

function Bomb(): never {
  throw new Error("Maximum update depth exceeded（演示用）");
}

function LiveDemo() {
  const [armed, setArmed] = useState(false);
  return (
    <RecoverableBoundary
      fallback={({ error, reset }) => (
        <ErrorState
          error={error}
          title="预览失败"
          description="这段内容暂时无法渲染，可能是生成的内容不完整或格式有误。"
          actions={[
            {
              label: "重试",
              onClick: () => {
                setArmed(false);
                reset();
              },
            },
            { label: "关闭预览", onClick: () => setArmed(false) },
          ]}
        />
      )}
    >
      {armed ? (
        <Bomb />
      ) : (
        <div className="flex min-h-[240px] items-center justify-center">
          <Button variant="danger-soft" onClick={() => setArmed(true)}>
            触发渲染错误
          </Button>
        </div>
      )}
    </RecoverableBoundary>
  );
}

export default function ErrorStateSection() {
  return (
    <>
      <DocHead
        title="ErrorState · RecoverableBoundary"
        en="components/ErrorState"
        duty="三层兜底：路由 errorElement（整窗，重载恢复）→ 页面栈每页（只替换该页，侧栏/标题栏不受影响）→ 局部区域（块预览 / AI 停靠栏）。标题说人话，技术详情默认折叠、可一键复制。"
        src="apps/desktop/src/components/ErrorState/index.tsx"
      />
      <BlockTitle en="Live">可恢复边界</BlockTitle>
      <CanvasCard cap="LIVE · 局部区域" stageClassName="">
        <LiveDemo />
      </CanvasCard>
      <BlockTitle en="Page">整窗兜底</BlockTitle>
      <CanvasCard cap="ROUTE ERROR" stageClassName="h-[520px] overflow-hidden">
        <ErrorState
          size="page"
          className="h-full"
          error={new Error("示例错误")}
          title="应用遇到了意外错误"
          description="当前窗口无法继续显示。你的数据已保存在本地，重新加载通常即可恢复；如果反复出现，请复制错误信息反馈给我们。"
          actions={[
            { label: "重新加载", onClick: () => {} },
            { label: "回到首页", onClick: () => {} },
          ]}
        />
      </CanvasCard>
      <Note>resetKeys 任一值变化自动复位：块预览按块 id、页面按栈条目 params。</Note>
    </>
  );
}
