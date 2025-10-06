import { IQuestion, ICreateAnswer, IAnswer } from "@/types";
import Database from "better-sqlite3";
import ContentTable from "./content";
import { Descendant } from "slate";
import QuestionGroupTable from "./question-group";

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
    };
  }

  static initTable(db: Database.Database) {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        question_content TEXT,
        answers TEXT DEFAULT '[]',
        group_id INTEGER,
        sort_index INTEGER NOT    NULL DEFAULT 0,
        resolved_time INTEGER
      )
    `;
    db.exec(createTableSql);
  }

  static upgradeTable(db: Database.Database) {
    // 增量添加缺失列
    const tableInfo = db.prepare(`PRAGMA table_info(questions)`).all() as {
      name: string;
    }[];
    const hasGroupId = tableInfo.some((c) => c.name === "group_id");
    const hasSortIndex = tableInfo.some((c) => c.name === "sort_index");
    const hasResolvedTime = tableInfo.some((c) => c.name === "resolved_time");

    if (!hasGroupId) {
      db.exec(`ALTER TABLE questions ADD COLUMN group_id INTEGER`);
    }
    if (!hasSortIndex) {
      db.exec(
        `ALTER TABLE questions ADD COLUMN sort_index INTEGER NOT NULL DEFAULT 0`,
      );
    }
    if (!hasResolvedTime) {
      db.exec(`ALTER TABLE questions ADD COLUMN resolved_time INTEGER`);
    }

    // 索引
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_questions_group_id ON questions(group_id);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_questions_sort_index ON questions(sort_index);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_questions_create_time ON questions(create_time);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_questions_resolved_time ON questions(resolved_time);`,
    );

    // 保障默认分组与回填 group_id
    const def = QuestionGroupTable.getDefaultGroup(db);
    db.prepare(`UPDATE questions SET group_id = ? WHERE group_id IS NULL`).run(
      def.id,
    );

    // 回填 sort_index（按创建时间）
    const rows = db
      .prepare(
        `SELECT id FROM questions ORDER BY sort_index ASC, create_time ASC, id ASC`,
      )
      .all() as { id: number }[];
    const step = 1024;
    const now = Date.now();
    const upd = db.prepare(
      `UPDATE questions SET sort_index = ?, update_time = ? WHERE id = ?`,
    );
    rows.forEach((r, idx) => {
      upd.run((idx + 1) * step, now, r.id);
    });

    // 回填 resolved_time（取最早答案内容的 create_time）
    const allQuestions = db.prepare(`SELECT * FROM questions`).all() as {
      id: number;
      answers: string;
      resolved_time: number | null;
    }[];
    const updResolved = db.prepare(
      `UPDATE questions SET resolved_time = ?, update_time = ? WHERE id = ?`,
    );
    allQuestions.forEach((q) => {
      try {
        const answers: number[] = JSON.parse(q.answers || "[]");
        if (answers && answers.length > 0 && q.resolved_time == null) {
          let minCreate: number | null = null;
          for (const aid of answers) {
            const c = ContentTable.getContentById(db, aid);
            if (c) {
              if (minCreate == null || c.createTime < minCreate) {
                minCreate = c.createTime;
              }
            }
          }
          if (minCreate != null) {
            updResolved.run(minCreate, Date.now(), q.id);
          }
        }
      } catch (e) {
        // ignore
      }
    });
  }

  static parseQuestion(question: any): IQuestion {
    return {
      id: question.id,
      createTime: question.create_time,
      updateTime: question.update_time,
      questionContent: question.question_content,
      answers: JSON.parse(question.answers),
      groupId: question.group_id,
      sortIndex: question.sort_index,
      resolvedTime: question.resolved_time ?? null,
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
    const stmt = db.prepare(
      `SELECT * FROM questions WHERE id IN (${placeholders})`,
    );
    const questions = stmt.all(...ids);
    return questions.map((question) => this.parseQuestion(question));
  }

  static getAllQuestions(db: Database.Database): IQuestion[] {
    const stmt = db.prepare("SELECT * FROM questions");
    const questions = stmt.all();
    return questions.map((question) => this.parseQuestion(question));
  }

  static createQuestion(
    db: Database.Database,
    question: string,
    groupId?: number,
  ): IQuestion {
    const now = Date.now();
    const def = groupId ?? QuestionGroupTable.getDefaultGroup(db).id;
    const maxSort = db
      .prepare(`SELECT MAX(sort_index) as max_idx FROM questions`)
      .get() as { max_idx: number | null };
    const nextSortIndex = (maxSort?.max_idx ?? 0) + 1024;
    const stmt = db.prepare(
      "INSERT INTO questions (create_time, update_time, question_content, answers, group_id, sort_index) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const res = stmt.run(
      now,
      now,
      question,
      JSON.stringify([]),
      def,
      nextSortIndex,
    );
    const createdQuestionId = res.lastInsertRowid;
    return this.getQuestionById(db, createdQuestionId as number) as IQuestion;
  }

  static updateQuestion(
    db: Database.Database,
    questionId: number,
    question: string,
  ): IQuestion {
    const stmt = db.prepare(
      "UPDATE questions SET update_time = ?, question_content = ? WHERE id = ?",
    );
    stmt.run(Date.now(), question, questionId);
    return this.getQuestionById(db, questionId) as IQuestion;
  }

  static deleteQuestion(db: Database.Database, id: number): number {
    const question = this.getQuestionById(db, id);
    if (!question) {
      return 0;
    }
    const stmt = db.prepare("DELETE FROM questions WHERE id = ?");
    const res = stmt.run(id);
    const answers = question.answers;
    answers.forEach((answer) => {
      ContentTable.deleteContent(db, answer);
    });
    return res.changes;
  }

  static getNoAnswerQuestions(db: Database.Database): IQuestion[] {
    // 获取所有的问题，没有答案的排在最上面，有答案的排在下面
    const questions = db
      .prepare(
        "SELECT * FROM questions WHERE answers = '[]' ORDER BY sort_index ASC, create_time ASC",
      )
      .all();
    return questions.map((question) => this.parseQuestion(question));
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

  static addAnswer(
    db: Database.Database,
    questionId: number,
    answer: ICreateAnswer,
    incRefCount = false,
  ): IQuestion {
    const question = this.getQuestionById(db, questionId);
    if (!question) {
      throw new Error("Question not found");
    }
    const wasEmpty = question.answers.length === 0;
    if (!question.answers.includes(answer.contentId)) {
      question.answers.push(answer.contentId);
      if (incRefCount) {
        ContentTable.incrementRefCount(db, answer.contentId);
      }
    }

    const now = Date.now();
    if (wasEmpty) {
      // 首次添加答案，写入 resolved_time
      db.prepare(
        "UPDATE questions SET update_time = ?, answers = ?, resolved_time = ? WHERE id = ?",
      ).run(now, JSON.stringify(question.answers), now, questionId);
    } else {
      db.prepare(
        "UPDATE questions SET update_time = ?, answers = ? WHERE id = ?",
      ).run(now, JSON.stringify(question.answers), questionId);
    }
    return this.getQuestionById(db, questionId) as IQuestion;
  }

  static deleteAnswer(
    db: Database.Database,
    questionId: number,
    answerId: number,
  ): IQuestion {
    const question = this.getQuestionById(db, questionId);
    if (!question) {
      throw new Error("Question not found");
    }
    question.answers = question.answers.filter((id) => id !== answerId);
    ContentTable.deleteContent(db, answerId);
    const now = Date.now();
    if (question.answers.length === 0) {
      db.prepare(
        "UPDATE questions SET update_time = ?, answers = ?, resolved_time = NULL WHERE id = ?",
      ).run(now, JSON.stringify(question.answers), questionId);
    } else {
      db.prepare(
        "UPDATE questions SET update_time = ?, answers = ? WHERE id = ?",
      ).run(now, JSON.stringify(question.answers), questionId);
    }
    return this.getQuestionById(db, questionId) as IQuestion;
  }

  static updateAnswer(
    db: Database.Database,
    questionId: number,
    answers: number[],
  ): IQuestion {
    const question = this.getQuestionById(db, questionId);
    if (!question) {
      throw new Error("Question not found");
    }
    const originalAnswer = question.answers;
    // 找到不在 answers 中的 answerId
    const deletedAnswerIds = originalAnswer.filter(
      (id) => !answers.includes(id),
    );
    deletedAnswerIds.forEach((id) => {
      ContentTable.deleteContent(db, id);
    });
    question.answers = answers;
    const now = Date.now();
    if (answers.length === 0) {
      db.prepare(
        "UPDATE questions SET update_time = ?, answers = ?, resolved_time = NULL WHERE id = ?",
      ).run(now, JSON.stringify(question.answers), questionId);
    } else {
      // 若此前没有 resolved_time，这里回填最早答案时间
      const cur = db
        .prepare(`SELECT resolved_time FROM questions WHERE id = ?`)
        .get(questionId) as { resolved_time: number | null };
      if (!cur.resolved_time) {
        let minCreate: number | null = null;
        for (const aid of answers) {
          const c = ContentTable.getContentById(db, aid);
          if (c) {
            if (minCreate == null || c.createTime < minCreate)
              minCreate = c.createTime;
          }
        }
        db.prepare(
          "UPDATE questions SET update_time = ?, answers = ?, resolved_time = ? WHERE id = ?",
        ).run(
          now,
          JSON.stringify(question.answers),
          minCreate ?? now,
          questionId,
        );
      } else {
        db.prepare(
          "UPDATE questions SET update_time = ?, answers = ? WHERE id = ?",
        ).run(now, JSON.stringify(question.answers), questionId);
      }
    }
    return this.getQuestionById(db, questionId) as IQuestion;
  }

  static getAnswerById(db: Database.Database, id: number): IAnswer | null {
    const answer = ContentTable.getContentById(db, id);
    return answer;
  }

  static getQuestionAnswers(
    db: Database.Database,
    questionId: number,
  ): IAnswer[] {
    const question = this.getQuestionById(db, questionId);
    if (!question) {
      return [];
    }
    return question.answers
      .map((id) => this.getAnswerById(db, id))
      .filter((v) => v !== null) as IAnswer[];
  }

  static listByGroup(
    db: Database.Database,
    groupId: number,
    filter: "all" | "answered" | "unanswered" = "all",
    search?: string,
  ): IQuestion[] {
    const conditions: string[] = ["group_id = ?"];
    const params: unknown[] = [groupId];
    if (filter === "answered") conditions.push("answers <> '[]'");
    if (filter === "unanswered") conditions.push("answers = '[]'");
    if (search && search.trim()) {
      conditions.push("question_content LIKE ?");
      params.push(`%${search}%`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = db
      .prepare(
        `SELECT * FROM questions ${where} ORDER BY sort_index ASC, create_time ASC`,
      )
      .all(...params) as {
      id: number;
      create_time: number;
      update_time: number;
      question_content: string;
      answers: string;
      group_id: number;
      sort_index: number;
      resolved_time: number | null;
    }[];
    return rows.map((q) => this.parseQuestion(q));
  }

  static reorderQuestions(
    db: Database.Database,
    params: { orderedIds: number[] },
  ): number {
    const ids = params.orderedIds;
    const step = 1024;
    const upd = db.prepare(
      `UPDATE questions SET sort_index = ?, update_time = ? WHERE id = ?`,
    );
    const now = Date.now();
    ids.forEach((id, idx) => {
      upd.run((idx + 1) * step, now, id);
    });
    return ids.length;
  }

  static moveToGroup(
    db: Database.Database,
    params: { id: number; toGroupId: number },
  ): IQuestion {
    const now = Date.now();
    db.prepare(
      `UPDATE questions SET group_id = ?, update_time = ? WHERE id = ?`,
    ).run(params.toGroupId, now, params.id);
    return this.getQuestionById(db, params.id) as IQuestion;
  }
}
