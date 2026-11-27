import { memo } from "react";
import { FileUp } from "lucide-react";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { Button, Switch } from "@tau/ui";
import { useSharedDatabaseI18n } from "@/features/shared/database/i18n";

interface FileUploadProps {
  onUploadLocal: (isUpload: boolean) => void;
}

const FileUpload = memo((props: FileUploadProps) => {
  const { onUploadLocal } = props;
  const { t } = useSharedDatabaseI18n();

  const [isUpload, setIsUpload] = useLocalStorageState("table-attachment-upload", {
    defaultValue: false,
  });

  const handleUploadLocal = useMemoizedFn(() => {
    onUploadLocal(!!isUpload);
  });

  return (
    <div className="flex w-80 flex-col gap-4 p-4">
      <Button variant="primary" icon={FileUp} block onClick={handleUploadLocal}>
        {t("upload.choose")}
      </Button>

      <div className="flex items-center gap-2">
        <span className="text-tau-sm text-ink-2 flex-1">{t("upload.cloud")}</span>
        <Switch checked={!!isUpload} onCheckedChange={(checked: boolean) => setIsUpload(checked)} />
      </div>

      <div className="text-tau-micro text-ink-3">{t("upload.hint")}</div>
    </div>
  );
});

FileUpload.displayName = "FileUpload";

export default FileUpload;
