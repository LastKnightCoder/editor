import { createStore } from "zustand/vanilla";
import type { CreateVLQuizRecordInput, QuizAnswerRecord, VLQuizItem, VLQuizRecord } from "@/types";

interface TestSession {
  version: number;
  projectId: number;
  quizSetId: number;
  items: VLQuizItem[];
  currentIndex: number;
  answers: Record<number, QuizAnswerRecord>;
  startTime: number;
  status: "testing" | "submitted";
}

interface SessionState {
  testSession: TestSession | null;
  submitting: boolean;
  result: VLQuizRecord | null;
}

/** 每个弹窗各自持有题目快照，不从全局当前项目推导成绩归属。 */
export function createQuizSession(
  saveRecord: (input: CreateVLQuizRecordInput) => Promise<VLQuizRecord>,
  isActive: () => boolean = () => true
) {
  const store = createStore<SessionState>(() => ({
    testSession: null,
    submitting: false,
    result: null,
  }));
  let version = 0;
  let pending: { version: number; promise: Promise<VLQuizRecord | null> } | null = null;
  const isCurrent = (expected: number) =>
    isActive() && store.getState().testSession?.version === expected;
  const setIndex = (index: number) => {
    const { testSession, submitting } = store.getState();
    if (!testSession || submitting || testSession.status !== "testing") return;
    store.setState({
      testSession: {
        ...testSession,
        currentIndex: Math.max(0, Math.min(index, testSession.items.length - 1)),
      },
    });
  };
  return {
    store,
    startTest(projectId: number, quizSetId: number, items: VLQuizItem[]) {
      if (!items.length) throw new Error("测验集没有题目");
      pending = null;
      store.setState({
        testSession: {
          version: ++version,
          projectId,
          quizSetId,
          items: structuredClone(items),
          currentIndex: 0,
          answers: {},
          startTime: Date.now(),
          status: "testing",
        },
        submitting: false,
        result: null,
      });
    },
    submitAnswer(itemId: number, answer: QuizAnswerRecord) {
      const { testSession, submitting } = store.getState();
      if (
        !testSession ||
        submitting ||
        testSession.status !== "testing" ||
        !testSession.items.some(item => item.id === itemId)
      )
        return;
      store.setState({
        testSession: {
          ...testSession,
          answers: { ...testSession.answers, [itemId]: { ...answer, itemId } },
        },
      });
    },
    nextQuestion: () => setIndex((store.getState().testSession?.currentIndex ?? 0) + 1),
    prevQuestion: () => setIndex((store.getState().testSession?.currentIndex ?? 0) - 1),
    finishTest(): Promise<VLQuizRecord | null> {
      const { testSession, result } = store.getState();
      if (!testSession) return Promise.resolve(null);
      if (testSession.status === "submitted") return Promise.resolve(result);
      if (pending?.version === testSession.version) return pending.promise;
      const expected = testSession.version;
      const answers = Object.values(testSession.answers);
      const correctCount = answers.filter(answer => answer.isCorrect).length;
      store.setState({ submitting: true });
      const promise = (async () => {
        await Promise.resolve();
        if (!isCurrent(expected)) return null;
        try {
          const record = await saveRecord({
            projectId: testSession.projectId,
            quizSetId: testSession.quizSetId,
            totalCount: testSession.items.length,
            correctCount,
            score: (correctCount / testSession.items.length) * 100,
            duration: Math.round((Date.now() - testSession.startTime) / 1000),
            answers,
          });
          if (!isCurrent(expected)) return null;
          store.setState({ testSession: { ...testSession, status: "submitted" }, result: record });
          return record;
        } catch (error) {
          if (!isCurrent(expected)) return null;
          throw error;
        } finally {
          if (isCurrent(expected)) store.setState({ submitting: false });
          if (pending?.version === expected) pending = null;
        }
      })();
      pending = { version: expected, promise };
      return promise;
    },
    cancelTest() {
      pending = null;
      store.setState({ testSession: null, submitting: false, result: null });
    },
    getTestProgress() {
      const { testSession } = store.getState();
      return testSession
        ? {
            current: testSession.currentIndex + 1,
            total: testSession.items.length,
            answered: Object.keys(testSession.answers).length,
          }
        : null;
    },
  };
}
