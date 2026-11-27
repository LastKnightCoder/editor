/** 一份侧栏标签列表的管理状态：哪个标签在改名 / 删除，以及对应的两个弹窗 */

import { useState, type ReactNode } from "react";
import { DeleteTagDialog, RenameTagDialog, type TagManageTarget } from "./TagManageDialogs";

export function useTagManage({
  existing,
  entity,
  hierarchical,
  rename,
  remove,
  onRenamed,
  onRemoved,
}: {
  existing: TagManageTarget[];
  entity: "card" | "article" | "todo";
  hierarchical: boolean;
  rename: (from: string, to: string) => Promise<void>;
  remove: (tag: string) => Promise<void>;
  onRenamed?: (from: string, to: string) => void;
  onRemoved?: (tag: string) => void;
}): {
  startRename: (target: TagManageTarget) => void;
  startDelete: (target: TagManageTarget) => void;
  dialogs: ReactNode;
} {
  const [renaming, setRenaming] = useState<TagManageTarget | null>(null);
  const [deleting, setDeleting] = useState<TagManageTarget | null>(null);
  return {
    startRename: setRenaming,
    startDelete: setDeleting,
    dialogs: (
      <>
        <RenameTagDialog
          target={renaming}
          existing={existing}
          entity={entity}
          hierarchical={hierarchical}
          onOpenChange={open => !open && setRenaming(null)}
          onRename={async (from, to) => {
            await rename(from, to);
            onRenamed?.(from, to);
          }}
        />
        <DeleteTagDialog
          target={deleting}
          entity={entity}
          hierarchical={hierarchical}
          onOpenChange={open => !open && setDeleting(null)}
          onDelete={async tag => {
            await remove(tag);
            onRemoved?.(tag);
          }}
        />
      </>
    ),
  };
}
