import { Modal } from "antd";
import classNames from "classnames";
import { IFileSyncStatus } from "@/types";
import { SettingButton } from "../../components";
import useThemeColors from "@/hooks/useThemeColors";

interface ConflictResolveModalProps {
  open: boolean;
  files: Array<{ name: string; status: IFileSyncStatus }>;
  onClose: () => void;
  onRetry?: () => Promise<unknown>;
}

const ConflictResolveModal = ({
  open,
  files,
  onClose,
  onRetry,
}: ConflictResolveModalProps) => {
  const themeColors = useThemeColors();

  return (
    <Modal
      title="问题文件"
      open={open}
      onCancel={onClose}
      footer={
        <div className="flex justify-between items-center">
          <div
            className={classNames("text-xs", themeColors.secondaryTextClass)}
          >
            同名文件按本地/远程存在情况自动同步，可重试失败项。
          </div>
          <div className="flex gap-2">
            <SettingButton variant="secondary" onClick={onClose}>
              关闭
            </SettingButton>
            {onRetry && (
              <SettingButton variant="primary" onClick={onRetry}>
                重试全部
              </SettingButton>
            )}
          </div>
        </div>
      }
      width={640}
    >
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {files.length === 0 ? (
          <div
            className={classNames("text-sm", themeColors.secondaryTextClass)}
          >
            当前没有失败的文件。
          </div>
        ) : (
          files.map(({ name, status }) => (
            <div
              key={name}
              className={classNames(
                "p-3 rounded-lg border",
                themeColors.cardBgClass,
                themeColors.cardBorderClass,
              )}
            >
              <div
                className={classNames(
                  "text-sm font-medium",
                  themeColors.activeTextClass,
                )}
              >
                {name}
              </div>
              <div
                className={classNames(
                  "text-xs mt-1",
                  themeColors.secondaryTextClass,
                )}
              >
                方向：
                {status.syncDirection === "upload"
                  ? "上传"
                  : status.syncDirection === "download"
                    ? "下载"
                    : "跳过"}
              </div>
              {status.errorMessage && (
                <div className="text-xs text-red-500 mt-1">
                  错误：{status.errorMessage}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </Modal>
  );
};

export default ConflictResolveModal;
