import { useRef, useState } from "react";
import type { Editor } from "slate";
import { Bookmark, Upload } from "lucide-react";
import { Button, Dialog, DialogBody, Input, Textarea, cn } from "@tau/ui";
import { getCommandElementPath, notifierOf } from "@tau/editor/api";
import { IResourceService } from "@tau/shared/host-services";

import type { BookmarkElement, BookmarkOverrides } from "../types";
import { setBookmarkFields } from "../operations";

type CoverChoice = "page" | "custom" | "none";

const CHIP =
  "cursor-pointer rounded-[7px] border px-2.5 py-[3px] text-[12px] transition-colors " +
  "border-line-1 text-ink-2 hover:bg-hover";
const CHIP_ON = "border-accent bg-accent-soft text-accent-text hover:bg-accent-soft";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-ink-3 text-[12px]">{label}</span>
      {children}
    </label>
  );
}

interface EditDialogProps {
  editor: Editor;
  element: BookmarkElement;
  open: boolean;
  onClose: () => void;
  onAfterClose: () => void;
}

/** 改写标题、描述与封面；留空的字段跟随网页信息。 */
export default function BookmarkEditDialog({
  editor,
  element,
  open,
  onClose,
  onAfterClose,
}: EditDialogProps) {
  const { meta, overrides } = element;
  const [title, setTitle] = useState(overrides?.title ?? meta?.title ?? "");
  const [description, setDescription] = useState(overrides?.description ?? meta?.description ?? "");
  const [cover, setCover] = useState<CoverChoice>(
    overrides?.image === null ? "none" : overrides?.image ? "custom" : "page"
  );
  const [customImage, setCustomImage] = useState(overrides?.image || "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = editor.tryGetService?.(IResourceService)?.upload;

  const pickFile = async (file: File | undefined) => {
    if (!file || !upload) return;
    setUploading(true);
    try {
      const url = await upload(file);
      if (!url) throw new Error("上传失败");
      setCustomImage(url);
      setCover("custom");
    } catch (error) {
      console.error("书签封面上传失败:", error);
      notifierOf(editor).error("封面上传失败");
    } finally {
      setUploading(false);
    }
  };

  const save = () => {
    const next: BookmarkOverrides = {};
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    if (trimmedTitle && trimmedTitle !== meta?.title) next.title = trimmedTitle;
    if (trimmedDescription !== (meta?.description ?? "")) next.description = trimmedDescription;
    if (cover === "none") next.image = null;
    else if (cover === "custom" && customImage) next.image = customImage;
    if (getCommandElementPath(editor, { element }))
      setBookmarkFields(editor, element, {
        overrides: Object.keys(next).length ? next : undefined,
      });
    onClose();
  };

  const restore = () => {
    setTitle(meta?.title ?? "");
    setDescription(meta?.description ?? "");
    setCover("page");
    setCustomImage("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onClose()}
      onAfterClose={onAfterClose}
      title="编辑书签"
      subtitle={element.url}
      icon={<Bookmark className="size-4" strokeWidth={1.75} />}
      locked={uploading}
      footer={
        <>
          <Button variant="ghost" size="sm" className="mr-auto" onClick={restore}>
            恢复为网页信息
          </Button>
          <Button variant="secondary" size="sm" disabled={uploading} onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" size="sm" disabled={uploading} onClick={save}>
            完成
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-4">
          <Field label="标题">
            <Input
              value={title}
              placeholder={element.url}
              onChange={e => setTitle(e.target.value)}
            />
          </Field>
          <Field label="描述">
            <Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-ink-3 text-[12px]">封面</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className={cn(CHIP, cover === "page" && CHIP_ON)}
                onClick={() => setCover("page")}
              >
                网页封面
              </button>
              {upload && (
                <button
                  type="button"
                  className={cn(
                    CHIP,
                    "inline-flex items-center gap-1",
                    cover === "custom" && CHIP_ON
                  )}
                  disabled={uploading}
                  onClick={() => (customImage ? setCover("custom") : fileRef.current?.click())}
                >
                  <Upload size={12} strokeWidth={1.75} />
                  {uploading ? "上传中…" : customImage ? "自定义图片" : "上传图片"}
                </button>
              )}
              {customImage && (
                <button
                  type="button"
                  className="text-accent-text cursor-pointer border-none bg-transparent px-1 text-[12px]"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  更换
                </button>
              )}
              <button
                type="button"
                className={cn(CHIP, cover === "none" && CHIP_ON)}
                onClick={() => setCover("none")}
              >
                不显示
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={event => {
                void pickFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
        </div>
      </DialogBody>
    </Dialog>
  );
}
