/**
 * Toast 档案 —— 命令式 API + ToastHost 真实现（Host 挂在 ShowcaseApp 根，
 * 触发即全窗口生效）。常显标本用受 item 驱动的 ToastPill 本体（duration=0
 * 不自动关；点击会尝试 remove 无害）。位置经 opts.position 单条覆写。
 */

import { useState, type ReactNode } from "react";
import {
  toast,
  ToastPill,
  type ToastItem,
  type ToastPosition,
  type ToastType,
} from "@/ui/primitives/Toast";
import { ApiCard, BlockTitle, CanvasCard, DemoButton, DocHead, MatrixRow, Segmented } from "../kit";

const POSITIONS: ToastPosition[] = ["top-center", "top-right", "bottom-right", "bottom-center"];

const MESSAGES = {
  success: "已保存",
  error: "同步失败，已保留本地副本",
  warning: "存储空间不足 15%",
  info: "已切换到年度视图",
} satisfies Partial<Record<ToastType, string>>;

/** 分组行：左标签定宽右对齐 + 控件组，各行起点对齐（替代居中换行的按钮堆） */
function ControlRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-tau-micro text-ink-2 w-10 shrink-0 text-right">{label}</span>
      <div className="flex flex-wrap items-center gap-2.5">{children}</div>
    </div>
  );
}

/** 构造常显标本（duration 0 = 不自动关；position 固定 top-center 不影响水平展示） */
function specimen(id: number, item: Omit<ToastItem, "id" | "position" | "duration">): ToastItem {
  return { id, position: "top-center", duration: 0, ...item };
}

export default function ToastSection() {
  const [pos, setPos] = useState<ToastPosition>("top-center");

  const fire = (type: keyof typeof MESSAGES) =>
    void toast.show(type, MESSAGES[type], { position: pos });

  return (
    <>
      <DocHead
        title="Toast"
        en="primitives/Toast.tsx"
        duty="轻量内联胶囊。单行 36px：类型语义色只落图标 + 一句话 + 可选动作；无关闭钮——整条点击关闭，悬停冻结倒计时；同位置上限 4 条挤掉最老。"
        src="src/ui/primitives/Toast.tsx"
      />

      <CanvasCard
        cap="LIVE"
        note="真实触发（整窗口生效，换位置后重发即见）"
        stageClassName="flex min-h-[280px] flex-col items-start justify-center"
      >
        <div className="flex flex-col gap-5">
          <ControlRow label="类型">
            <DemoButton onClick={() => fire("success")}>success</DemoButton>
            <DemoButton onClick={() => fire("error")}>error</DemoButton>
            <DemoButton onClick={() => fire("warning")}>warning</DemoButton>
            <DemoButton onClick={() => fire("info")}>info</DemoButton>
          </ControlRow>
          <ControlRow label="流程">
            <DemoButton
              primary
              onClick={() =>
                void toast.promise(
                  new Promise<string>(resolve => setTimeout(() => resolve("128 条"), 1400)),
                  {
                    loading: "正在导入数据…",
                    success: n => `导入完成 · 共 ${n}`,
                    error: "导入失败",
                  },
                  { position: pos }
                )
              }
            >
              promise（loading→成功）
            </DemoButton>
          </ControlRow>
          <ControlRow label="交互">
            <DemoButton
              onClick={() =>
                void toast.success("已删除 3 张卡片", {
                  action: { label: "撤销", onClick: () => void toast.info("已撤销") },
                  position: pos,
                })
              }
            >
              带动作（撤销）
            </DemoButton>
            <DemoButton
              onClick={() => {
                for (let i = 1; i <= 6; i++) {
                  setTimeout(
                    () => void toast.info(`第 ${i} / 6 条（上限 4，老者离场）`, { position: pos }),
                    i * 140
                  );
                }
              }}
            >
              堆叠 ×6（验上限 4）
            </DemoButton>
          </ControlRow>
          <ControlRow label="位置">
            <Segmented
              value={pos}
              onChange={setPos}
              options={POSITIONS.map(p => ({
                value: p,
                label: <span className="font-tau-mono text-tau-micro">{p}</span>,
              }))}
            />
          </ControlRow>
        </div>
      </CanvasCard>

      <BlockTitle en="ToastPill 本体常显标本">类型矩阵</BlockTitle>
      <MatrixRow
        name="success"
        desc={
          <>
            CircleCheck · <code>text-ok</code> · 3200ms 自动关
          </>
        }
        trayClassName=""
      >
        <ToastPill item={specimen(1, { type: "success", message: "已保存" })} />
      </MatrixRow>
      <MatrixRow
        name="error"
        desc={
          <>
            CircleX · <code>text-danger</code>
          </>
        }
        trayClassName=""
      >
        <ToastPill item={specimen(2, { type: "error", message: "同步失败，已保留本地副本" })} />
      </MatrixRow>
      <MatrixRow
        name="warning"
        desc={
          <>
            CircleAlert · <code>text-warn</code>
          </>
        }
        trayClassName=""
      >
        <ToastPill item={specimen(3, { type: "warning", message: "存储空间不足 15%" })} />
      </MatrixRow>
      <MatrixRow
        name="info"
        desc={
          <>
            Info · <code>text-info</code>（唯一非圆框例外，同为线性家族）
          </>
        }
        trayClassName=""
      >
        <ToastPill item={specimen(4, { type: "info", message: "已切换到年度视图" })} />
      </MatrixRow>
      <MatrixRow
        name="loading"
        desc={
          <>
            LoaderCircle 旋转 · 载入中常驻，<code>resolve / reject</code> 收尾
          </>
        }
        trayClassName=""
      >
        <ToastPill item={specimen(5, { type: "loading", message: "正在导入数据…" })} />
      </MatrixRow>
      <MatrixRow
        name="action 内联动作"
        desc={
          <>
            <code>opts.action</code>，点击动作后 toast 关闭
          </>
        }
        trayClassName=""
      >
        <ToastPill
          item={specimen(6, {
            type: "success",
            message: "已删除 3 张卡片",
            action: { label: "撤销", onClick: () => undefined },
          })}
        />
      </MatrixRow>

      <ApiCard title="API 备忘（命令式）">
        <table>
          <thead>
            <tr>
              <th>API</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>toast.success / error / warning / info</code>
              </td>
              <td>一句话反馈，默认 3200ms 自动关</td>
            </tr>
            <tr>
              <td>
                <code>toast.loading → resolve / reject</code>
              </td>
              <td>载入中常驻（与 duration 无关）；落定起按 duration 收尾</td>
            </tr>
            <tr>
              <td>
                <code>toast.promise(p, ...)</code>
              </td>
              <td>loading → 成功/失败，文案支持按结果取值</td>
            </tr>
            <tr>
              <td>
                <code>opts.action</code>
              </td>
              <td>内联动作（如「撤销」）</td>
            </tr>
            <tr>
              <td>
                <code>opts.position / duration · toast.config()</code>
              </td>
              <td>四位置；全局默认可调、单条可覆写</td>
            </tr>
          </tbody>
        </table>
      </ApiCard>
    </>
  );
}
