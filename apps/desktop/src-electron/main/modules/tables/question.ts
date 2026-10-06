import { IQuestion, ICreateAnswer, IAnswer, QuestionLinkTargetType } from "@/types";
import Database from "better-sqlite3";
import ContentTable from "./content";
import { Descendant } from "slate";
import QuestionGroupTable from "./question-group";
import QuestionLinkTable from "./question-link";
import QuestionEventTable from "./question-event";

const EMPTY_DESCRIPTION: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] } as unknown as Descendant,
];

export default class QuestionTable {
  static getListenEvents() {
    return {
      "question:create": this.createQuestion.bind(this),
      "question:update": this.updateQuestion.bind(this),
      "question:delete": this.deleteQuestion.bind(this),
      "question:get-question-by-id": this.getQuestionById.bind(this),
      "question:get-questions-by-ids": this.getQuestionByIds.bind(this),
      "question:get-all-questions": this.getAllQuestions.bind(this),
      "question:create-answer": this.createAnswer.bind(this),
      "question:add-answer": this.addAnswer.bind(this),
      "question:update-answer": this.updateAnswer.bind(this),
      "question:delete-answer": this.deleteAnswer.bind(this),
      "question:get-question-answers": this.getQuestionAnswers.bind(this),
      "question:get-no-answer-questions": this.getNoAnswerQuestions.bind(this),
      "question:list-by-group": this.listByGroup.bind(this),
      "question:reorder": this.reorderQuestions.bind(this),
      "question:move-to-group": this.moveToGroup.bind(this),
      "question:update-status": this.updateQuestionStatus.bind(this),
      "question:capture": this.captureQuestion.bind(this),
    };
  }
  static parseQuestion(question: any): IQuestion {
    return {
      id: question.id,
      createTime: question.create_time,
      updateTime: question.update_time,
      questionContent: question.question_content,
      description: question.description ? JSON.parse(question.description) : undefined,
      answers: JSON.parse(question.answers),
      groupId: question.group_id,
      sortIndex: question.sort_index,
      resolvedTime: question.resolved_time ?? null,
      status: question.status || "not_started",
    };
  }

  static getQuestionById(db: Database.Database, id: number): IQuestion | null {
    const stmt = db.prepare("SELECT * FROM questions WHERE id = ?");
    const question = stmt.get(id) as IQuestion;
    if (!question) {
      return null;
    }
    return this.parseQuestion(question);
  }

  static getQuestionByIds(db: Database.Database, ids: number[]): IQuestion[] {
    const placeholders = ids.map(() => "?").join(",");
    const stmt = db.prepare(`SELECT * FROM questions WHERE id IN (${placeholders})`);
    const questions = stmt.all(...ids);
    return questions.map(question => this.parseQuestion(question));
  }

  static getAllQuestions(db: Database.Database): IQuestion[] {
    const stmt = db.prepare("SELECT * FROM questions");
    const questions = stmt.all();
    return questions.map(question => this.parseQuestion(question));
  }

  /** 问题列表摘要：只读取列表需要的字段，避免传输并解析正文、答案缓存。 */
  static getAllQuestionSummaries(db: Database.Database): IQuestion[] {
    const rows = db
      .prepare(
        `SELECT id, create_time, update_time, question_content, group_id,
                sort_index, resolved_time, status
         FROM questions`
      )
      .all() as {
      id: number;
      create_time: number;
      update_time: number;
      question_content: string;
      group_id: number;
      sort_index: number;
      resolved_time: number | null;
      status: string | null;
    }[];

    return rows.map(row => ({
      id: row.id,
      createTime: row.create_time,
      updateTime: row.update_time,
      questionContent: row.question_content,
      answers: [],
      groupId: row.group_id,
      sortIndex: row.sort_index,
      resolvedTime: row.resolved_time,
      status: (row.status || "not_started") as IQuestion["status"],
    }));
  }

  static createQuestion(
    db: Database.Database,
    question: string,
    groupId: number,
    description: Descendant[]
  ): IQuestion {
    try {
      const now = Date.now();

      console.log("[QuestionTable] 创建问题:", {
        question,
        groupId,
        description,
      });

      const maxSort = db.prepare(`SELECT MAX(sort_index) as max_idx FROM questions`).get() as {
        max_idx: number | null;
      };
      const nextSortIndex = (maxSort?.max_idx ?? 0) + 1024;

      const stmt = db.prepare(
        "INSERT INTO questions (create_time, update_time, question_content, description, answers, group_id, sort_index, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      );
      const res = stmt.run(
        now,
        now,
        question,
        description ? JSON.stringify(description) : null,
        JSON.stringify([]),
        groupId,
        nextSortIndex,
        "not_started"
      );
      const createdQuestionId = res.lastInsertRowid;
      QuestionEventTable.log(db, Number(createdQuestionId), "create", {}, now);
      const createdQuestion = this.getQuestionById(db, createdQuestionId as number) as IQuestion;

      console.log("[QuestionTable] 问题创建成功:", createdQuestion);
      return createdQuestion;
    } catch (error) {
      console.error("[QuestionTable] 创建问题失败:", error);
      throw error;
    }
  }

  /** description 省略（undefined）时保留原背景，只改标题；传 null 才清空 */
  static updateQuestion(
    db: Database.Database,
    questionId: number,
    question: string,
    description?: Descendant[] | null
  ): IQuestion {
    if (description === undefined) {
      db.prepare("UPDATE questions SET update_time = ?, question_content = ? WHERE id = ?").run(
        Date.now(),
        question,
        questionId
      );
    } else {
      db.prepare(
        "UPDATE questions SET update_time = ?, question_content = ?, description = ? WHERE id = ?"
      ).run(Date.now(), question, description ? JSON.stringify(description) : null, questionId);
    }
    return this.getQuestionById(db, questionId) as IQuestion;
  }

  static deleteQuestion(db: Database.Database, id: number): number {
    const question = this.getQuestionById(db, id);
    if (!question) {
      return 0;
    }
    const stmt = db.prepare("DELETE FROM questions WHERE id = ?");
    const res = stmt.run(id);
    QuestionLinkTable.releaseAll(db, id);
    return res.changes;
  }

  static getNoAnswerQuestions(db: Database.Database): IQuestion[] {
    // 获取所有未解决的问题（not_started 和 in_progress），按状态和创建时间排序
    // not_started 排在最前面，in_progress 其次
    const questions = db
      .prepare(
        `SELECT * FROM questions 
         WHERE status != 'resolved' 
         ORDER BY 
           CASE status 
             WHEN 'not_started' THEN 1 
             WHEN 'in_progress' THEN 2 
             ELSE 3 
           END,
           sort_index ASC, 
           create_time ASC`
      )
      .all();
    return questions.map(question => this.parseQuestion(question));
  }

  static createAnswer(db: Database.Database, content: Descendant[]): IAnswer {
    const now = Date.now();
    const contentId = ContentTable.createContent(db, {
      content,
    });

    return {
      id: contentId,
      content,
      createTime: now,
      updateTime: now,
    };
  }

  /**
   * 旧接口：以 content id 挂材料。内容会被识别为卡片 / 文章 / 项目文档，否则为独立答案。
   * incRefCount = false 表示新建的独立答案（问题独占首个引用），轨迹记为「写下」。
   */
  static addAnswer(
    db: Database.Database,
    questionId: number,
    answer: ICreateAnswer,
    incRefCount = false
  ): IQuestion {
    if (!this.getQuestionById(db, questionId)) {
      throw new Error("Question not found");
    }
    QuestionLinkTable.linkTargets(
      db,
      questionId,
      [QuestionLinkTable.resolveContentTarget(db, answer.contentId)],
      { incRef: incRefCount, created: !incRefCount }
    );
    return this.getQuestionById(db, questionId) as IQuestion;
  }

  /** 旧接口：按 content id 解除关联（释放引用；材料本体由引用计数决定去留） */
  static deleteAnswer(db: Database.Database, questionId: number, answerId: number): IQuestion {
    if (!this.getQuestionById(db, questionId)) {
      throw new Error("Question not found");
    }
    const row = db
      .prepare(
        `SELECT target_type, target_id FROM question_link WHERE question_id = ? AND content_id = ?`
      )
      .get(questionId, answerId) as
      { target_type: QuestionLinkTargetType; target_id: number } | undefined;
    if (row) {
      QuestionLinkTable.unlinkTarget(db, questionId, {
        targetType: row.target_type,
        targetId: row.target_id,
      });
    }
    return this.getQuestionById(db, questionId) as IQuestion;
  }

  /** 旧接口：以 content id 列表整体覆盖（移除不在列表里的内容类材料，并按列表排序） */
  static updateAnswer(db: Database.Database, questionId: number, answers: number[]): IQuestion {
    const question = this.getQuestionById(db, questionId);
    if (!question) {
      throw new Error("Question not found");
    }
    question.answers
      .filter(id => !answers.includes(id))
      .forEach(id => this.deleteAnswer(db, questionId, id));
    const rows = db
      .prepare(
        `SELECT id, content_id FROM question_link WHERE question_id = ? ORDER BY sort_index ASC, id ASC`
      )
      .all(questionId) as { id: number; content_id: number | null }[];
    const rank = (r: { content_id: number | null }) =>
      r.content_id == null ? -1 : answers.indexOf(r.content_id);
    const contentRows = rows.filter(r => rank(r) >= 0).sort((a, b) => rank(a) - rank(b));
    let cursor = 0;
    const ordered = rows.map(r => (rank(r) >= 0 ? contentRows[cursor++] : r));
    QuestionLinkTable.reorderLinks(
      db,
      questionId,
      ordered.map(r => r.id)
    );
    return this.getQuestionById(db, questionId) as IQuestion;
  }

  static getAnswerById(db: Database.Database, id: number): IAnswer | null {
    const answer = ContentTable.getContentById(db, id);
    return answer;
  }

  static getQuestionAnswers(db: Database.Database, questionId: number): IAnswer[] {
    const question = this.getQuestionById(db, questionId);
    if (!question) {
      return [];
    }
    return question.answers
      .map(id => this.getAnswerById(db, id))
      .filter(v => v !== null) as IAnswer[];
  }

  static listByGroup(
    db: Database.Database,
    groupId: number,
    filter: "all" | "answered" | "unanswered" | "not_started" | "in_progress" | "resolved" = "all",
    search?: string
  ): IQuestion[] {
    const conditions: string[] = ["group_id = ?"];
    const params: unknown[] = [groupId];
    // 兼容旧的 filter 值
    if (filter === "answered") conditions.push("answers <> '[]'");
    if (filter === "unanswered") conditions.push("answers = '[]'");
    // 新的状态 filter
    if (filter === "not_started") {
      conditions.push("status = ?");
      params.push("not_started");
    }
    if (filter === "in_progress") {
      conditions.push("status = ?");
      params.push("in_progress");
    }
    if (filter === "resolved") {
      conditions.push("status = ?");
      params.push("resolved");
    }
    if (search && search.trim()) {
      conditions.push("question_content LIKE ?");
      params.push(`%${search}%`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = db
      .prepare(`SELECT * FROM questions ${where} ORDER BY sort_index ASC, create_time ASC`)
      .all(...params) as {
      id: number;
      create_time: number;
      update_time: number;
      question_content: string;
      answers: string;
      group_id: number;
      sort_index: number;
      resolved_time: number | null;
      status: string;
    }[];
    return rows.map(q => this.parseQuestion(q));
  }

  static reorderQuestions(db: Database.Database, params: { orderedIds: number[] }): number {
    const ids = params.orderedIds;
    const step = 1024;
    const upd = db.prepare(`UPDATE questions SET sort_index = ?, update_time = ? WHERE id = ?`);
    const now = Date.now();
    ids.forEach((id, idx) => {
      upd.run((idx + 1) * step, now, id);
    });
    return ids.length;
  }

  static moveToGroup(db: Database.Database, params: { id: number; toGroupId: number }): IQuestion {
    const now = Date.now();
    db.prepare(`UPDATE questions SET group_id = ?, update_time = ? WHERE id = ?`).run(
      params.toGroupId,
      now,
      params.id
    );
    return this.getQuestionById(db, params.id) as IQuestion;
  }

  /**
   * 设置状态并记入轨迹；resolved_time = 标为已解答的时刻，离开已解答时清空。
   * revertEventId：撤销上一次状态修改——删除那条事件而不是再记一条。
   */
  static updateQuestionStatus(
    db: Database.Database,
    questionId: number,
    status: string,
    options: { revertEventId?: number } = {}
  ): IQuestion & { eventId?: number } {
    const question = this.getQuestionById(db, questionId);
    if (!question) {
      throw new Error("Question not found");
    }
    if (!["not_started", "in_progress", "resolved"].includes(status)) {
      throw new Error("Invalid status value");
    }
    if (question.status === status) return question;
    const now = Date.now();
    const resolvedTime = status === "resolved" ? now : null;
    db.prepare(
      `UPDATE questions SET status = ?, resolved_time = ?, update_time = ? WHERE id = ?`
    ).run(status, resolvedTime, now, questionId);
    let eventId: number | undefined;
    if (options.revertEventId != null) {
      QuestionEventTable.deleteEvent(db, options.revertEventId);
      // 撤销回已解答时恢复原解答时刻
      if (status === "resolved" && question.resolvedTime == null) {
        const prev = db
          .prepare(
            `SELECT create_time FROM question_event WHERE question_id = ? AND type = 'status'
             AND json_extract(payload, '$.to') = 'resolved' ORDER BY create_time DESC LIMIT 1`
          )
          .get(questionId) as { create_time: number } | undefined;
        if (prev) {
          db.prepare(`UPDATE questions SET resolved_time = ? WHERE id = ?`).run(
            prev.create_time,
            questionId
          );
        }
      }
    } else {
      eventId = QuestionEventTable.log(
        db,
        questionId,
        "status",
        { to: status as IQuestion["status"] },
        now
      ).id;
    }
    return { ...(this.getQuestionById(db, questionId) as IQuestion), eventId };
  }

  /**
   * 快速收集：groupHint 为「#分组」里的名称，按全名、再按前缀匹配，找不到落默认分组。
   */
  static captureQuestion(
    db: Database.Database,
    title: string,
    groupHint?: string | null
  ): { question: IQuestion; groupId: number; groupTitle: string } {
    const text = title.trim();
    if (!text) throw new Error("问题内容不能为空");
    const groups = QuestionGroupTable.listGroups(db);
    const hint = groupHint?.trim().toLowerCase();
    const group =
      (hint &&
        (groups.find(g => g.title.toLowerCase() === hint) ??
          groups.find(g => g.title.toLowerCase().startsWith(hint)))) ||
      QuestionGroupTable.getDefaultGroup(db);
    const question = this.createQuestion(db, text, group.id, EMPTY_DESCRIPTION);
    return { question, groupId: group.id, groupTitle: group.title };
  }
}
