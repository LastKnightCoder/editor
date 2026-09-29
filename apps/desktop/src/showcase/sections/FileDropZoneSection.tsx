/**
 * FileDropZone 档案 —— 本体即 ui/primitives/FileDropZone。
 */

import { useState } from "react";
import { Inbox } from "lucide-react";
import { FileDropZone } from "@tau/ui";
import { BlockTitle, DocHead, MatrixRow } from "../kit";

export default function FileDropZoneSection() {
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <>
      <DocHead
        title="FileDropZone"
        en="primitives/FileDropZone.tsx"
        duty="点击选择或拖入文件的区域，拖入时转 accent-soft；只取第一个文件。编辑器的图片上传、列表图标选择在用。"
        src="packages/ui/src/primitives/FileDropZone.tsx"
      />

      <BlockTitle en="States">状态矩阵</BlockTitle>
      <MatrixRow name="默认" desc="点击选择或拖入（Enter / 空格也可打开文件选择）">
        <FileDropZone accept="image/*" onFile={file => setPicked(file.name)} className="w-full">
          <Inbox size={32} strokeWidth={1.5} className="text-ink-3" />
          <p className="text-tau-body text-ink-2 m-0">{picked ?? "点击或拖拽图片到此处上传"}</p>
        </FileDropZone>
      </MatrixRow>
      <MatrixRow name="disabled" desc="上传中：不可点、不接收拖入">
        <FileDropZone onFile={() => {}} disabled className="w-full">
          <p className="text-tau-body text-ink-2 m-0">上传中…</p>
        </FileDropZone>
      </MatrixRow>
    </>
  );
}
