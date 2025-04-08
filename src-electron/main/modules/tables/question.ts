import { IQuestion, ICreateAnswer, IAnswer } from "@/types";
import Database from "better-sqlite3";
import ContentTable from "./content";
import { Descendant } from "slate";

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
    };
  }

  static initTable(db: Database.Database) {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        question_content TEXT,
        answers TEXT DEFAULT '[]'
      )
    `;
    db.exec(createTableSql);
  }

  static upgradeTable(_db: Database.Database) {
    // TODO 如果表结构有变更，在这里添加新字段
  }

  static parseQuestion(question: any): IQuestion {
    return {
      id: question.id,
      createTime: question.create_time,
      updateTime: question.update_time,
      questionContent: question.question_content,
      answers: JSON.parse(question.answers),
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

  static createQuestion(db: Database.Database, question: string): IQuestion {
    const now = Date.now();
    const stmt = db.prepare(
      "INSERT INTO questions (create_time, update_time, question_content, answers) VALUES (?, ?, ?, ?)",
    );
    const res = stmt.run(now, now, question, JSON.stringify([]));
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
    console.log("updateQuestion", questionId, question);
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
        "SELECT * FROM questions ORDER BY answers = '[]' DESC, create_time",
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
    if (!question.answers.includes(answer.contentId)) {
      question.answers.push(answer.contentId);
      if (incRefCount) {
        ContentTable.incrementRefCount(db, answer.contentId);
      }
    }

    const stmt = db.prepare(
      "UPDATE questions SET update_time = ?, answers = ? WHERE id = ?",
    );
    stmt.run(Date.now(), JSON.stringify(question.answers), questionId);
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
    const stmt = db.prepare(
      "UPDATE questions SET update_time = ?, answers = ? WHERE id = ?",
    );
    stmt.run(Date.now(), JSON.stringify(question.answers), questionId);
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
    const stmt = db.prepare(
      "UPDATE questions SET update_time = ?, answers = ? WHERE id = ?",
    );
    stmt.run(Date.now(), JSON.stringify(question.answers), questionId);
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
}
