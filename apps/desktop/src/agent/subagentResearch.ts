import type { AgentToolExecutionState } from "@tau/agent";

export const SUBAGENT_RESEARCH_TOOL_NAME = "subagent_research";
export const SUBAGENT_RESEARCH_RENDERER_KEY = "subagent-research";

export type SubAgentTaskStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "cancelled";

export type SubAgentResearchStatus =
  | "pending"
  | "running"
  | "success"
  | "partial_success"
  | "failed"
  | "cancelled";

export interface SubAgentResearchTask {
  id: string;
  title: string;
  prompt: string;
}

export interface SubAgentResearchEvent {
  time: number;
  type:
    | "started"
    | "text"
    | "reasoning"
    | "tool"
    | "finished"
    | "failed"
    | "cancelled";
  message: string;
}

export interface SubAgentTaskView extends SubAgentResearchTask {
  status: SubAgentTaskStatus;
  startedAt?: number;
  progressText?: string;
  reasoning?: string;
  reasoningPreview?: string;
  toolExecutions: AgentToolExecutionState[];
  events: SubAgentResearchEvent[];
  answer?: string;
  error?: string;
  duration?: number;
}

export interface SubAgentResearchPayload {
  sessionId: string;
  status: SubAgentResearchStatus;
  summary?: string;
  startedAt: number;
  finishedAt?: number;
  tasks: SubAgentTaskView[];
}

export interface SubAgentRunTaskResult {
  answer: string;
}

export interface SubAgentRunTaskArgs {
  task: SubAgentResearchTask;
  signal: AbortSignal;
  updateTask: (
    patch: Partial<SubAgentTaskView>,
    event?: SubAgentResearchEvent,
  ) => void;
}

export interface RunSubAgentResearchOptions {
  sessionId?: string;
  tasks: SubAgentResearchTask[];
  maxConcurrency?: number;
  signal?: AbortSignal;
  runTask: (args: SubAgentRunTaskArgs) => Promise<SubAgentRunTaskResult>;
  onUpdate?: (payload: SubAgentResearchPayload) => void;
  now?: () => number;
}

const DEFAULT_MAX_CONCURRENCY = 3;
const HARD_MAX_CONCURRENCY = 5;

const isAbortError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as { name?: string; message?: string };
  return (
    record.name === "AbortError" ||
    record.message?.toLowerCase().includes("abort") ||
    record.message?.includes("取消")
  );
};

const createControllerFromParent = (parentSignal?: AbortSignal) => {
  const controller = new AbortController();
  if (!parentSignal) {
    return controller;
  }

  if (parentSignal.aborted) {
    controller.abort();
    return controller;
  }

  parentSignal.addEventListener(
    "abort",
    () => {
      controller.abort();
    },
    { once: true },
  );
  return controller;
};

const resolveStatus = (tasks: SubAgentTaskView[]): SubAgentResearchStatus => {
  if (tasks.some((task) => task.status === "running")) {
    return "running";
  }
  if (tasks.some((task) => task.status === "pending")) {
    return "pending";
  }
  if (tasks.every((task) => task.status === "cancelled")) {
    return "cancelled";
  }
  if (tasks.every((task) => task.status === "success")) {
    return "success";
  }
  if (tasks.some((task) => task.status === "success")) {
    return "partial_success";
  }
  if (tasks.some((task) => task.status === "cancelled")) {
    return "cancelled";
  }
  return "failed";
};

export const buildSubAgentResearchMetadata = (
  payload: SubAgentResearchPayload,
) => ({
  render: {
    rendererKey: SUBAGENT_RESEARCH_RENDERER_KEY,
    payload,
  },
});

export const createInitialSubAgentResearchPayload = (
  sessionId: string,
  tasks: SubAgentResearchTask[],
  now = Date.now,
): SubAgentResearchPayload => ({
  sessionId,
  status: "pending",
  startedAt: now(),
  tasks: tasks.map((task) => ({
    ...task,
    status: "pending",
    toolExecutions: [],
    events: [],
  })),
});

export const runSubAgentResearch = async ({
  sessionId = `subagent-${Date.now()}`,
  tasks,
  maxConcurrency = DEFAULT_MAX_CONCURRENCY,
  signal,
  runTask,
  onUpdate,
  now = Date.now,
}: RunSubAgentResearchOptions): Promise<SubAgentResearchPayload> => {
  const startedAt = now();
  const taskViews: SubAgentTaskView[] = tasks.map((task) => ({
    ...task,
    status: "pending",
    toolExecutions: [],
    events: [],
  }));
  const concurrency = Math.max(
    1,
    Math.min(HARD_MAX_CONCURRENCY, Math.floor(maxConcurrency)),
  );
  const childControllers = new Set<AbortController>();

  const buildPayload = (): SubAgentResearchPayload => ({
    sessionId,
    status: resolveStatus(taskViews),
    startedAt,
    finishedAt: taskViews.every((task) => task.status !== "pending")
      ? now()
      : undefined,
    tasks: taskViews.map((task) => ({
      ...task,
      events: [...task.events],
      toolExecutions: task.toolExecutions.map((execution) => ({
        ...execution,
      })),
    })),
  });

  const notify = () => onUpdate?.(buildPayload());

  const cancelPendingTasks = () => {
    taskViews.forEach((task) => {
      if (task.status === "pending" || task.status === "running") {
        task.status = "cancelled";
        task.error = "SubAgent 调研已取消";
        task.events = [
          ...task.events,
          {
            time: now(),
            type: "cancelled",
            message: "SubAgent 调研已取消",
          },
        ];
      }
    });
  };

  if (signal) {
    signal.addEventListener(
      "abort",
      () => {
        childControllers.forEach((controller) => controller.abort());
        cancelPendingTasks();
        notify();
      },
      { once: true },
    );
  }

  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < taskViews.length) {
      if (signal?.aborted) {
        cancelPendingTasks();
        notify();
        return;
      }

      const currentIndex = nextIndex;
      nextIndex += 1;
      const task = taskViews[currentIndex];
      const controller = createControllerFromParent(signal);
      childControllers.add(controller);
      const taskStartedAt = now();

      task.status = "running";
      task.startedAt = taskStartedAt;
      task.events = [
        ...task.events,
        {
          time: taskStartedAt,
          type: "started",
          message: "开始调研",
        },
      ];
      notify();

      const updateTask: SubAgentRunTaskArgs["updateTask"] = (patch, event) => {
        Object.assign(task, patch);
        if (event) {
          task.events = [...task.events, event];
        }
        notify();
      };

      try {
        const result = await runTask({
          task,
          signal: controller.signal,
          updateTask,
        });
        task.status = "success";
        task.answer = result.answer;
        task.duration = now() - taskStartedAt;
        task.events = [
          ...task.events,
          {
            time: now(),
            type: "finished",
            message: "调研完成",
          },
        ];
      } catch (error) {
        const cancelled = controller.signal.aborted || isAbortError(error);
        task.status = cancelled ? "cancelled" : "failed";
        task.error = cancelled
          ? "SubAgent 调研已取消"
          : (error as Error).message;
        task.duration = now() - taskStartedAt;
        task.events = [
          ...task.events,
          {
            time: now(),
            type: cancelled ? "cancelled" : "failed",
            message: task.error,
          },
        ];
      } finally {
        childControllers.delete(controller);
        notify();
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, taskViews.length) }, () =>
      runWorker(),
    ),
  );

  if (signal?.aborted) {
    cancelPendingTasks();
  }

  const finalPayload = buildPayload();
  onUpdate?.(finalPayload);
  return finalPayload;
};
