/**
 * 对话工具渲染档案 —— 展品即真实聊天里的 ToolCallBlock：自定义渲染器注册表
 * （tool-call-renderers/builtin.ts）命中的工具走富卡片，其余落 ToolCallRow 折叠行
 * （D-048）。舞台用 stage="page"：工具卡自带 surface 底与描边，直接坐在对话纸面
 * 环境上，与 ChatArea 一致；isDark 随主题切换，所见即聊天所得。
 * 渲染器均为 execution 进、UI 出的纯展示；交互类按钮（刷新 / 审阅决策）在纯浏览器
 * 样板间没有后端，点击要么报错被吞、要么弹 toast，仅作视觉走查；图像展品为外链
 * 占位图，离线时不显示。
 */

import { useEffect } from "react";
import type { ToolCallExecutionState } from "@tau/shared";
import { useThemeStore } from "@tau/themes/react";
import { ToolCallBlock } from "@/components/ChatUI";
import { receiveInteractions, setInteractionSessionReady } from "@/services/piInteractions";
import { normalizeAskQuestionPayload } from "@/tools/askQuestionTypes";
import { BlockTitle, CanvasCard, DocHead, MatrixRow, Note } from "../kit";
import {
  askQuestionForm,
  askQuestionSubmitted,
  calendarCreate,
  calendarEvents,
  contentEditApplied,
  contentEditPending,
  imageGeneration,
  knowledgeSearch,
  questionMutation,
  questionQuery,
  rowCancelled,
  rowExecuting,
  rowFailedExec,
  rowFailedParam,
  rowPending,
  rowRetrying,
  rowSuccess,
  structuredResult,
  subagentResearch,
  todoCreate,
  todoDashboard,
  todoQuery,
} from "./toolcallFixtures";

/** 填写态提问卡需要宿主等待快照才开放作答：样板间注入一条演示快照（提交无后端，会报错提示） */
const seedAskQuestionDemo = () => {
  const sessionId = askQuestionForm.metadata?.piSessionId as string;
  const payload = normalizeAskQuestionPayload(JSON.parse(askQuestionForm.input)).payload;
  if (!payload) return;
  receiveInteractions({
    sessionId,
    revision: Number.MAX_SAFE_INTEGER,
    approvals: [],
    questions: [
      {
        requestId: "fx-ask-request",
        sessionId,
        toolCallId: askQuestionForm.toolCallId,
        payload,
        askedAt: askQuestionForm.timestamp,
      },
    ],
  });
  setInteractionSessionReady(sessionId, true);
};

export default function ToolCallSection() {
  useEffect(seedAskQuestionDemo, []);
  const isDark = useThemeStore(s => s.mode) === "dark";

  const show = (execution: ToolCallExecutionState) => (
    <ToolCallBlock execution={execution} isDark={isDark} />
  );
  const tray = "flex-col items-stretch gap-2 w-full";

  return (
    <>
      <DocHead
        title="对话工具渲染"
        en="ToolCallBlock · tool-call-renderers"
        duty="聊天里每条工具调用的两级渲染：注册表命中的工具走域内富卡片（任务 / 日历 / 问题 / 知识检索 / 内容编辑 / 追问 / 图像 / 子代理 / 结构化结果），未注册工具统一落缺省折叠行；状态只用语义色（成功 ok、失败 danger、重试 warn、执行中 accent、等待 / 取消 ink-3）。"
        src="apps/desktop/src/tool-call-renderers/ · packages/chat-ui/src/components/Message/ToolCallRow.tsx"
      />

      <BlockTitle en="ToolCallRow · 未注册工具的兜底">缺省折叠行</BlockTitle>
      <CanvasCard
        cap="状态矩阵"
        note="点击行展开输入 / 输出 / 错误"
        stage="page"
        stageClassName="flex flex-col"
      >
        <MatrixRow
          name="pending · 等待中"
          desc="时钟图标，ink-3；尚未开始执行"
          trayClassName={tray}
        >
          {show(rowPending)}
        </MatrixRow>
        <MatrixRow
          name="executing · 执行中"
          desc="accent 细环 Spinner（13px / border-1.5）"
          trayClassName={tray}
        >
          {show(rowExecuting)}
        </MatrixRow>
        <MatrixRow
          name="retrying · 重试中"
          desc="warn 旋转图标 + 次数；默认展开并显示上一次尝试的错误"
          trayClassName={tray}
        >
          {show(rowRetrying)}
        </MatrixRow>
        <MatrixRow
          name="success · 完成"
          desc="ok 对勾 + 时长（tabular-nums）；默认折叠，点击行看输入 / 输出"
          trayClassName={tray}
        >
          {show(rowSuccess)}
        </MatrixRow>
        <MatrixRow
          name="failed · 执行错误"
          desc="danger 色行 + X 图标，默认展开；输出 / 错误分栏，错误块 danger-soft 底"
          trayClassName={tray}
        >
          {show(rowFailedExec)}
        </MatrixRow>
        <MatrixRow
          name="failed · 参数错误"
          desc="errorType=parameter 时换 TriangleAlert 图标 + 「参数错误」文案"
          trayClassName={tray}
        >
          {show(rowFailedParam)}
        </MatrixRow>
        <MatrixRow name="cancelled · 已取消" desc="禁用图标，ink-3" trayClassName={tray}>
          {show(rowCancelled)}
        </MatrixRow>
      </CanvasCard>

      <BlockTitle en="todo · calendar">任务与日历</BlockTitle>
      <CanvasCard cap="查询与操作" stage="page" stageClassName="flex flex-col">
        <MatrixRow
          name="query_todos · 查询结果"
          desc="TodoToolRenderer：汇总行（共 N 项 / 未完成 / 已完成 / 逾期）+ 分组列表；行内含类型图标、截止 / 逾期、循环角标；「刷新」按钮样板间内不可用"
          trayClassName={tray}
        >
          {show(todoQuery)}
        </MatrixRow>
        <MatrixRow
          name="get_todo_dashboard · 总览"
          desc="dashboard 变体：多一段完成度分段进度条（ok / line-1 / danger）"
          trayClassName={tray}
        >
          {show(todoDashboard)}
        </MatrixRow>
        <MatrixRow
          name="create_todo · 任务操作"
          desc="TodoOperationRenderer：动作文案 + 实体徽章 + 关联对象 / 所属分组值块"
          trayClassName={tray}
        >
          {show(todoCreate)}
        </MatrixRow>
        <MatrixRow
          name="query_calendar_events · 事件查询"
          desc="CalendarQueryRenderer：日历色点 + 日期 / 时间 / 全天标签 + 详情预览"
          trayClassName={tray}
        >
          {show(calendarEvents)}
        </MatrixRow>
        <MatrixRow
          name="create_calendar_event · 日历操作"
          desc="CalendarOperationRenderer：动作文案 + 目标日历摘要"
          trayClassName={tray}
        >
          {show(calendarCreate)}
        </MatrixRow>
      </CanvasCard>

      <BlockTitle en="question · knowledge">问题与知识</BlockTitle>
      <CanvasCard cap="检索类" stage="page" stageClassName="flex flex-col">
        <MatrixRow
          name="query_questions · 问题列表"
          desc="QuestionQueryRenderer（经 rendererKey 路由）：状态标签 + 分组 + 回答数"
          trayClassName={tray}
        >
          {show(questionQuery)}
        </MatrixRow>
        <MatrixRow
          name="update_question_status · 问题操作"
          desc="QuestionOperationRenderer：动作文案 + 问题标题 + 状态 / 回答数徽章"
          trayClassName={tray}
        >
          {show(questionMutation)}
        </MatrixRow>
        <MatrixRow
          name="search_knowledge · 知识检索"
          desc="KnowledgeSearchRenderer：结果行（类型徽章 + 由 output 快照渲染的富文本预览 + 相对时间），超过 5 条折叠"
          trayClassName={tray}
        >
          {show(knowledgeSearch)}
        </MatrixRow>
      </CanvasCard>

      <BlockTitle en="structured · content-edit">结构化结果与内容编辑</BlockTitle>
      <CanvasCard cap="结构化展示与审阅" stage="page" stageClassName="flex flex-col">
        <MatrixRow
          name="maintenance_check · 结构化结果"
          desc="StructuredToolResultRenderer（经 rendererKey + payload）：标题 / 徽章 / 指标 / 字段 / 条目通用骨架"
          trayClassName={tray}
        >
          {show(structuredResult)}
        </MatrixRow>
        <MatrixRow
          name="replace_content_by_text · 待确认"
          desc="ContentEditProposalRenderer 挂起态：确认应用 / 提修改意见 / 拒绝按钮组 + 改动摘要 + 改动高亮 / 完整内容切换（意见区的展开样式可点开查看）"
          trayClassName={tray}
        >
          {show(contentEditPending)}
        </MatrixRow>
        <MatrixRow
          name="apply_content_edit_operations · 已应用"
          desc="审阅完成态：ok 图标 + 回执消息；展开摘要可见逐处改动预览卡"
          trayClassName={tray}
        >
          {show(contentEditApplied)}
        </MatrixRow>
      </CanvasCard>

      <BlockTitle en="ask · image · subagent">对话交互与执行</BlockTitle>
      <CanvasCard cap="交互与执行类" stage="page" stageClassName="flex flex-col">
        <MatrixRow
          name="ask-question · 填写中"
          desc="AskQuestionRenderer 交互态：标题 + 单选 / 多选表单（可真实点选）"
          trayClassName={tray}
        >
          {show(askQuestionForm)}
        </MatrixRow>
        <MatrixRow
          name="ask-question · 已提交"
          desc="锁定态：回显各题选项与补充说明"
          trayClassName={tray}
        >
          {show(askQuestionSubmitted)}
        </MatrixRow>
        <MatrixRow
          name="generate_image · 图像生成"
          desc="OpenAIImageResultRenderer（经 rendererKey + payload）：提示词 + 图像网格（外链占位图）"
          trayClassName={tray}
        >
          {show(imageGeneration)}
        </MatrixRow>
        <MatrixRow
          name="subagent_research · 子代理调研"
          desc="SubAgentResearchRenderer（经 rendererKey + payload）：任务列表 + 状态 / 耗时，可点开看子代理的工具执行与结论"
          trayClassName={tray}
        >
          {show(subagentResearch)}
        </MatrixRow>
      </CanvasCard>

      <Note>
        渲染链路与聊天一致：<code>ToolCallDisplay</code> 先查{" "}
        <code>metadata.render.rendererKey</code> 再按 toolName 查注册表，未命中落
        ToolCallRow；自定义渲染器抛异常时由 ErrorBoundary 回退到缺省行。样式调整直接改{" "}
        <code>tool-call-renderers/ui.tsx</code>（共用卡片件）或各渲染器； 缺省行改{" "}
        <code>ChatUI/ToolCallRow.tsx</code> + <code>FoldRow.tsx</code>。
      </Note>
    </>
  );
}
