/**
 * Tabs 档案 —— 本体即 ui/primitives/Tabs。
 */

import { Tabs } from "@tau/ui";
import { BlockTitle, DocHead, MatrixRow } from "../kit";

export default function TabsSection() {
  return (
    <>
      <DocHead
        title="Tabs"
        en="primitives/Tabs.tsx"
        duty="浮层与卡片内的下划线式标签页（accent 2px，方向键切换），与设置页子页 Tab 同一视觉语言。受控 activeKey / 非受控 defaultActiveKey 均可。"
        src="packages/ui/src/primitives/Tabs.tsx"
      />

      <BlockTitle en="Variants">形态</BlockTitle>
      <MatrixRow name="默认 · 左对齐" desc="非受控，defaultActiveKey 缺省取第一项">
        <Tabs
          className="w-full"
          items={[
            {
              key: "upload",
              label: "本地上传",
              children: <p className="text-ink-2 m-0">本地上传面板</p>,
            },
            {
              key: "link",
              label: "网络图片",
              children: <p className="text-ink-2 m-0">网络图片面板</p>,
            },
          ]}
        />
      </MatrixRow>
      <MatrixRow name="centered" desc="浮层内居中（列表图标选择）">
        <Tabs
          centered
          className="w-full"
          items={[
            { key: "emoji", label: "表情", children: <p className="text-ink-2 m-0">表情面板</p> },
            {
              key: "upload",
              label: "上传图片",
              children: <p className="text-ink-2 m-0">上传面板</p>,
            },
          ]}
        />
      </MatrixRow>
    </>
  );
}
