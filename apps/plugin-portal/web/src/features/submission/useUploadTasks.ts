import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Upload, UploadKind } from "../../../../contracts";
import { queryKeys, useApi } from "../../app/api";
import { confirmUpload, runUpload, type UploadOutcome, type UploadPhase } from "./uploadFlow";

export type TaskView =
  UploadPhase | { phase: "confirming" } | { phase: "settled"; outcome: UploadOutcome };

export interface UploadTask {
  key: string;
  kind: UploadKind;
  fileName: string;
  size: number;
  view: TaskView;
}

const RECHECK_DELAY_MS = 2000;
const MAX_AUTO_RECHECKS = 15;

export const isTaskActive = (task: UploadTask) => task.view.phase !== "settled";

/**
 * 上传任务队列：每个文件一条任务，成功后交给 onReady 并移出队列；
 * 失败、取消、待核对的任务留在队列中展示，由用户处理。
 */
export function useUploadTasks(onReady: (kind: UploadKind, upload: Upload) => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const seq = useRef(0);
  const alive = useRef(true);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const setView = useCallback((key: string, view: TaskView) => {
    if (alive.current)
      setTasks(list => list.map(task => (task.key === key ? { ...task, view } : task)));
  }, []);
  const remove = useCallback((key: string) => {
    clearTimeout(timers.current.get(key));
    timers.current.delete(key);
    controllers.current.delete(key);
    setTasks(list => list.filter(task => task.key !== key));
  }, []);

  const deliver = useCallback(
    (task: UploadTask, upload: Upload) => {
      queryClient.setQueryData(queryKeys.upload(upload.id), upload);
      onReadyRef.current(task.kind, upload);
      remove(task.key);
    },
    [queryClient, remove]
  );

  const settle = useCallback(
    (task: UploadTask, outcome: UploadOutcome, attempt: number) => {
      if (!alive.current) return;
      if (outcome.type === "ready") return deliver(task, outcome.upload);
      setView(task.key, { phase: "settled", outcome });
      if (outcome.type === "pending" && attempt < MAX_AUTO_RECHECKS) {
        timers.current.set(
          task.key,
          setTimeout(
            () => void recheckRef.current(task, outcome.uploadId, outcome.reason, attempt + 1),
            RECHECK_DELAY_MS
          )
        );
      }
    },
    [deliver, setView]
  );

  const recheck = useCallback(
    async (task: UploadTask, uploadId: string, reason: "canceled" | "unknown", attempt: number) => {
      setView(task.key, { phase: "confirming" });
      settle(task, await confirmUpload(api, uploadId, reason), attempt);
    },
    [api, setView, settle]
  );
  const recheckRef = useRef(recheck);
  recheckRef.current = recheck;

  const start = useCallback(
    (kind: UploadKind, file: File) => {
      const task: UploadTask = {
        key: `task-${++seq.current}`,
        kind,
        fileName: file.name,
        size: file.size,
        view: { phase: "preparing" },
      };
      const controller = new AbortController();
      controllers.current.set(task.key, controller);
      setTasks(list => [...list, task]);
      void runUpload(api, kind, file, {
        signal: controller.signal,
        onPhase: view => {
          if (!controller.signal.aborted) setView(task.key, view);
        },
      }).then(outcome => settle(task, outcome, 0));
    },
    [api, setView, settle]
  );

  /** 取消只是停止发送；结果以随后读取的 Upload 为准 */
  const cancel = useCallback(
    (key: string) => {
      const controller = controllers.current.get(key);
      if (!controller || controller.signal.aborted) return;
      controller.abort();
      setView(key, { phase: "confirming" });
    },
    [setView]
  );

  const find = (key: string) => tasks.find(task => task.key === key);

  /** 取消时服务端已完成：用户确认后仍然采用 */
  const accept = (key: string) => {
    const task = find(key);
    if (task?.view.phase === "settled" && task.view.outcome.type === "canceled-ready") {
      deliver(task, task.view.outcome.upload);
    }
  };

  const retryCheck = (key: string) => {
    const task = find(key);
    if (task?.view.phase !== "settled") return;
    const { outcome } = task.view;
    if (outcome.type === "pending" || outcome.type === "unconfirmed") {
      clearTimeout(timers.current.get(key));
      void recheck(task, outcome.uploadId, outcome.reason, 0);
    }
  };

  useEffect(() => {
    alive.current = true;
    const activeControllers = controllers.current;
    const activeTimers = timers.current;
    return () => {
      alive.current = false;
      activeControllers.forEach(controller => controller.abort());
      activeTimers.forEach(timer => clearTimeout(timer));
    };
  }, []);

  return { tasks, start, cancel, accept, retryCheck, dismiss: remove };
}

export type UploadTasks = ReturnType<typeof useUploadTasks>;
