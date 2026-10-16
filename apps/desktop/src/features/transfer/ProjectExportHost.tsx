/**
 * 项目整体导出的壳层承载：命令面板与设置入口经 app/transferStore 打开。
 * 带 projectId 直达导出弹窗，否则先选项目。
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FolderKanban } from "lucide-react";
import { Dialog, DialogBody, Loading } from "@tau/ui";
import { getProjectList } from "@/commands";
import BatchExportModal from "@/components/BatchExportModal";
import { useTransferStore } from "@/app/transferStore";

function ProjectPicker({
  open,
  onPick,
  onClose,
}: {
  open: boolean;
  onPick: (project: { id: number; title: string }) => void;
  onClose: () => void;
}) {
  const projects = useQuery({
    queryKey: ["projects", "list"],
    queryFn: getProjectList,
    enabled: open,
  });
  const list = projects.data ?? [];

  return (
    <Dialog title="导出项目" open={open} onOpenChange={next => !next && onClose()}>
      <DialogBody>
        <div className="-mx-2 h-[300px] overflow-y-auto px-2">
          {projects.isLoading ? (
            <Loading />
          ) : list.length === 0 ? (
            <p className="text-ink-3 text-tau-meta pt-16 text-center">还没有项目</p>
          ) : (
            <ul className="flex flex-col">
              {list.map(project => (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => onPick({ id: project.id, title: project.title })}
                    className="rounded-tau-sm hover:bg-hover group flex min-h-11 w-full cursor-pointer items-center gap-2.5 px-2 text-left"
                  >
                    <span className="bg-hover text-ink-2 grid size-7 flex-none place-items-center rounded-[8px]">
                      <FolderKanban className="size-[15px]" strokeWidth={1.75} />
                    </span>
                    <span className="text-tau-body min-w-0 flex-1 truncate">
                      {project.title || "未命名项目"}
                    </span>
                    <ArrowRight
                      className="text-ink-3 size-4 flex-none opacity-0 group-hover:opacity-100"
                      strokeWidth={1.75}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogBody>
    </Dialog>
  );
}

export function ProjectExportHost() {
  const request = useTransferStore(s => s.projectExport);
  const close = useTransferStore(s => s.closeProjectExport);
  const [picked, setPicked] = useState<{ id: number; title: string } | null>(null);

  const projects = useQuery({
    queryKey: ["projects", "list"],
    queryFn: getProjectList,
    enabled: request?.projectId !== undefined,
  });
  const direct =
    request?.projectId !== undefined
      ? projects.data?.find(project => project.id === request.projectId)
      : undefined;
  const target = picked ?? (direct ? { id: direct.id, title: direct.title } : null);

  const closeAll = () => {
    setPicked(null);
    close();
  };

  if (!request) return null;
  if (target) {
    return (
      <BatchExportModal
        open
        onClose={closeAll}
        scope={{ type: "project", id: target.id, title: target.title }}
      />
    );
  }
  return (
    <ProjectPicker open={request.projectId === undefined} onPick={setPicked} onClose={closeAll} />
  );
}
