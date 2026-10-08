import { memo } from "react";
import { FileUp } from "lucide-react";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { Button, Switch } from "@tau/ui";

interface FileUploadProps {
  onUploadLocal: (isUpload: boolean) => void;
}

const FileUpload = memo((props: FileUploadProps) => {
  const { onUploadLocal } = props;

  const [isUpload, setIsUpload] = useLocalStorageState("table-attachment-upload", {
    defaultValue: false,
  });

  const handleUploadLocal = useMemoizedFn(() => {
    onUploadLocal(!!isUpload);
  });

  return (
    <div className="flex w-80 flex-col gap-4 p-4">
      <Button variant="primary" icon={FileUp} block onClick={handleUploadLocal}>
        选择文件
      </Button>

      <div className="flex items-center gap-2">
        <span className="text-tau-sm text-ink-2 flex-1">是否上传到云端</span>
        <Switch checked={!!isUpload} onCheckedChange={(checked: boolean) => setIsUpload(checked)} />
      </div>

      <div className="text-tau-micro text-ink-3">支持选择多个文件，点击文件可打开所在位置</div>
    </div>
  );
});

FileUpload.displayName = "FileUpload";

export default FileUpload;
