import { vi } from "vitest";

/** 主进程测试共用 video-note-index-queue mock（经 `vi.mock("<相对路径>/video-note-index-queue")` 生效） */
export default { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() };
