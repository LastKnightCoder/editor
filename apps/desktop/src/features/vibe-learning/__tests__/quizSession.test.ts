import { describe, expect, it, vi } from "vitest";
import { createQuizSession } from "../quizSession";
import type { CreateVLQuizRecordInput, VLQuizItem, VLQuizRecord } from "@/types";

const item = (id: number): VLQuizItem => ({
  id,
  quizSetId: 1,
  type: "boolean",
  prompt: [],
  detail: [],
  data: { booleanAnswer: true },
  tags: [],
  difficulty: "standard",
  sortOrder: id,
  createTime: 0,
  updateTime: 0,
});
const record = (input: CreateVLQuizRecordInput): VLQuizRecord => ({
  ...input,
  id: 1,
  createTime: 0,
});
const answer = (itemId: number, isCorrect = true) => ({
  itemId,
  userAnswer: true,
  isCorrect,
  score: isCorrect ? 1 : 0,
  duration: 1,
});

describe("测验局部会话", () => {
  it("多个项目各自持有题面与答案，成绩保存开始时的身份", async () => {
    const saveA = vi.fn(async (input: CreateVLQuizRecordInput) => record(input));
    const saveB = vi.fn(async (input: CreateVLQuizRecordInput) => record(input));
    const a = createQuizSession(saveA);
    const b = createQuizSession(saveB);
    const questions = [item(1), item(2)];
    a.startTest(7, 11, questions);
    b.startTest(8, 12, [item(3)]);
    questions[0].data.booleanAnswer = false;
    expect(a.store.getState().testSession?.items[0].data.booleanAnswer).toBe(true);
    a.submitAnswer(1, answer(1));
    b.submitAnswer(3, answer(3, false));
    a.nextQuestion();
    expect(b.getTestProgress()).toEqual({ current: 1, total: 1, answered: 1 });
    await a.finishTest();
    await b.finishTest();
    expect(saveA).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 7, quizSetId: 11, score: 50 })
    );
    expect(saveB).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 8, quizSetId: 12, score: 0 })
    );
  });

  it("重复完成复用在途请求，写入时冻结作答与导航，成功后不重复落库", async () => {
    let finish!: (value: VLQuizRecord) => void;
    const save = vi.fn<(input: CreateVLQuizRecordInput) => Promise<VLQuizRecord>>(
      () =>
        new Promise<VLQuizRecord>(resolve => {
          finish = resolve;
        })
    );
    const session = createQuizSession(save);
    session.startTest(7, 1, [item(1), item(2)]);
    session.submitAnswer(1, answer(1));
    const first = session.finishTest();
    const duplicate = session.finishTest();
    expect(first).toBe(duplicate);
    session.nextQuestion();
    session.submitAnswer(2, answer(2));
    expect(session.getTestProgress()).toEqual({ current: 1, total: 2, answered: 1 });
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    const saved = record(save.mock.calls[0][0]);
    finish(saved);
    expect(await first).toEqual(saved);
    expect(await session.finishTest()).toEqual(saved);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("保存失败保留作答，允许用同一会话重试", async () => {
    const save = vi.fn(async (input: CreateVLQuizRecordInput) => record(input));
    save.mockRejectedValueOnce(new Error("写入失败"));
    const session = createQuizSession(save);
    session.startTest(7, 1, [item(1)]);
    session.submitAnswer(1, answer(1));
    await expect(session.finishTest()).rejects.toThrow("写入失败");
    expect(session.store.getState()).toMatchObject({
      submitting: false,
      testSession: { status: "testing", answers: { 1: answer(1) } },
    });
    expect(await session.finishTest()).toMatchObject({ projectId: 7, score: 100 });
  });

  it("取消后的迟到成绩不复活会话，也不完成后来打开的测验", async () => {
    let finish!: (value: VLQuizRecord) => void;
    const session = createQuizSession(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    session.startTest(7, 1, [item(1)]);
    const saving = session.finishTest();
    await Promise.resolve();
    session.cancelTest();
    session.startTest(8, 2, [item(2)]);
    finish(
      record({
        projectId: 7,
        quizSetId: 1,
        score: 0,
        totalCount: 1,
        correctCount: 0,
        answers: [],
        duration: 0,
      })
    );
    expect(await saving).toBeNull();
    expect(session.store.getState()).toMatchObject({
      result: null,
      submitting: false,
      testSession: { projectId: 8, quizSetId: 2, status: "testing" },
    });
  });

  it("切库替换控制器后，旧响应不返回可供新弹窗认领的成绩", async () => {
    let active = true;
    let finish!: (value: VLQuizRecord) => void;
    const session = createQuizSession(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
      () => active
    );
    session.startTest(7, 1, [item(1)]);
    const saving = session.finishTest();
    await Promise.resolve();
    active = false;
    finish(
      record({
        projectId: 7,
        quizSetId: 1,
        score: 0,
        totalCount: 1,
        correctCount: 0,
        answers: [],
        duration: 0,
      })
    );
    expect(await saving).toBeNull();
    expect(session.store.getState().result).toBeNull();
  });

  it("提交前立即取消时不发起写入，未知题目不进入成绩", async () => {
    const save = vi.fn(async (input: CreateVLQuizRecordInput) => record(input));
    const session = createQuizSession(save);
    session.startTest(7, 1, [item(1)]);
    session.submitAnswer(99, answer(99));
    expect(session.getTestProgress()?.answered).toBe(0);
    const saving = session.finishTest();
    session.cancelTest();
    expect(await saving).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
});
