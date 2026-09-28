/**
 * 问题页数据源：列表快照（分组 + 全部问题摘要）+ 单题详情（材料 + 轨迹），react-query 承载。
 *
 * 刷新：订阅 question mutation 事件（本页、AI 工具、编辑器问题块、其他窗口经 websocket）统一失效；
 * 命令层写操作自带发事件，本页的变更函数只调命令，失效由订阅兜底。首页「探究中」同源失效。
 */

import { useEffect } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@tau/ui";
import type { Descendant } from "slate";
import {
  addQuestionNote,
  captureQuestion,
  createAnswer,
  addAnswer,
  deleteQuestion,
  getQuestionDetail,
  linkQuestionTargets,
  listQuestionSummaries,
  moveQuestionToGroup,
  unlinkQuestionTarget,
  updateQuestion,
  updateQuestionStatus,
} from "@/commands/question";
import {
  createQuestionGroup,
  deleteQuestionGroup,
  listQuestionGroups,
  updateQuestionGroup,
  type QuestionGroupDTO,
} from "@/commands/question-group";
import { subscribeQuestionMutationEvent } from "@/mcp/question/events";
import { createArticle } from "@/commands/article";
import { createProject } from "@/commands/project";
import { createWhiteBoard } from "@/commands/white-board";
import { DEFAULT_ARTICLE_CONTENT } from "@/constants";
import type { QuestionLinkTarget, QuestionStatus, QuestionSummary } from "@/types";

const SNAPSHOT_KEY = ["questions", "snapshot"] as const;
const SOURCE = "questions-page";

export interface QuestionsSnapshot {
  groups: QuestionGroupDTO[];
  questions: QuestionSummary[];
}

export function useQuestionsSnapshot() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: SNAPSHOT_KEY,
    queryFn: async (): Promise<QuestionsSnapshot> => {
      const [groups, questions] = await Promise.all([
        listQuestionGroups(),
        listQuestionSummaries(),
      ]);
      return { groups, questions };
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(
    () =>
      subscribeQuestionMutationEvent(() => {
        void queryClient.invalidateQueries({ queryKey: ["questions"] });
        void queryClient.invalidateQueries({ queryKey: ["home"] });
      }),
    [queryClient]
  );

  return { snapshot: query.data, loading: query.isPending };
}

export function useQuestionDetail(questionId: number | null) {
  return useQuery({
    queryKey: ["questions", "detail", questionId],
    queryFn: () => getQuestionDetail(questionId!),
    enabled: questionId != null,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

const opts = { mutationSource: SOURCE };

export const questionMutations = {
  capture: (title: string, groupHint: string | null) => captureQuestion(title, groupHint, opts),
  rename: (id: number, title: string, description?: Descendant[]) =>
    updateQuestion(id, title, description, opts),
  setStatus: (id: number, status: QuestionStatus) => updateQuestionStatus(id, status, opts),
  /** 撤销上一次状态修改：删除那条轨迹事件并回到原状态 */
  revertStatus: (id: number, status: QuestionStatus, eventId?: number) =>
    updateQuestionStatus(id, status, { ...opts, revertEventId: eventId }),
  move: (id: number, groupId: number) => moveQuestionToGroup(id, groupId, opts),
  remove: (id: number) => deleteQuestion(id, opts),
  link: (id: number, targets: QuestionLinkTarget[], created = false) =>
    // 卡片 / 文章 / 项目文档由库本身持有首个引用，关联时加一
    linkQuestionTargets(id, targets, { incRef: true, created }, opts),
  unlink: (id: number, target: QuestionLinkTarget) => unlinkQuestionTarget(id, target, opts),
  /** 独立答案：新建 content 由问题独占首个引用 */
  writeAnswer: async (id: number, content: Descendant[]) => {
    const answer = await createAnswer(content);
    await addAnswer(id, { contentId: answer.id, content }, false, opts);
    return answer;
  },
  addNote: (id: number, text: string) => addQuestionNote(id, text, opts),
  createGroup: (title: string, color: string) => createQuestionGroup({ title, color }, opts),
  updateGroup: (id: number, title: string, color: string) =>
    updateQuestionGroup({ id, title, color }, opts),
  deleteGroup: (id: number) => deleteQuestionGroup(id, opts),
};

/** 移动分组并给出可撤销提示（问题页右键菜单 / 详情与侧栏分组拖放共用） */
export function moveQuestion(
  question: { id: number; groupId: number },
  groupId: number,
  groupTitle: string
) {
  const prev = question.groupId;
  questionMutations
    .move(question.id, groupId)
    .then(() =>
      toast.success(`已移动到「${groupTitle}」`, {
        action: { label: "撤销", onClick: () => void questionMutations.move(question.id, prev) },
      })
    )
    .catch(() => toast.error("移动失败"));
}

export type CreatableKind = "article" | "white_board" | "project";

/** 页内打开一份材料所需的导航目标 */
export interface OpenTarget {
  key: "card-detail" | "article-detail" | "project-detail" | "whiteboard-content";
  params: Record<string, number>;
}

/**
 * 从问题里直接新建文章 / 白板 / 项目：以问题为名创建、挂到问题上（轨迹记「新建」），返回打开目标。
 * 白板与项目没有 content，关联不涉及引用计数。
 */
export async function createMaterialFor(
  questionId: number,
  questionTitle: string,
  kind: CreatableKind
): Promise<OpenTarget> {
  const title = questionTitle.length > 40 ? `${questionTitle.slice(0, 40)}…` : questionTitle;
  if (kind === "article") {
    const article = await createArticle({
      title,
      content: DEFAULT_ARTICLE_CONTENT,
      bannerBg: "",
      bannerPosition: "center",
      isTop: false,
      author: "",
      links: [],
      tags: [],
      isDelete: false,
      count: 0,
    });
    await questionMutations.link(
      questionId,
      [{ targetType: "article", targetId: article.id }],
      true
    );
    return { key: "article-detail", params: { id: article.id } };
  }
  if (kind === "project") {
    const project = await createProject({
      title,
      desc: [],
      children: [],
      archived: false,
      pinned: false,
    });
    await linkQuestionTargets(
      questionId,
      [{ targetType: "project", targetId: project.id }],
      { created: true },
      opts
    );
    return { key: "project-detail", params: { id: project.id } };
  }
  const board = await createWhiteBoard({
    title,
    description: questionTitle,
    tags: [],
    snapshot: "",
    whiteBoardContentList: [
      {
        name: title,
        data: {
          children: [],
          viewPort: { zoom: 1, minX: 0, minY: 0, width: 0, height: 0 },
          selection: { selectArea: null, selectedElements: [] },
          presentationSequences: [],
        },
      },
    ],
  });
  await linkQuestionTargets(
    questionId,
    [{ targetType: "white_board", targetId: board.id }],
    { created: true },
    opts
  );
  const pageId = board.activeWhiteBoardContentId ?? board.whiteBoardContentIds[0];
  return { key: "whiteboard-content", params: { id: pageId } };
}
