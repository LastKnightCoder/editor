import { memo } from "react";
import { Button, Switch, Flex } from "antd";
import { MdCloudUpload, MdFilePresent } from "react-icons/md";
import { useLocalStorageState, useMemoizedFn } from "ahooks";

interface FileUploadProps {
  onUploadLocal: (isUpload: boolean) => void;
}

const FileUpload = memo((props: FileUploadProps) => {
  const { onUploadLocal } = props;

  const [isUpload, setIsUpload] = useLocalStorageState(
    "table-attachment-upload",
    {
      defaultValue: false,
    },
  );

  const handleUploadLocal = useMemoizedFn(() => {
    onUploadLocal(!!isUpload);
  });

  return (
    <div className="w-80 p-4">
      <Flex vertical gap={16}>
        <Button
          icon={<MdCloudUpload />}
          onClick={handleUploadLocal}
          className="w-full h-12"
          size="large"
        >
          选择文件
        </Button>

        <Flex gap={8} align="center">
          <MdFilePresent className="text-gray-500" />
          <span className="text-sm text-gray-500 flex-1">是否上传到云端</span>
          <Switch size="small" checked={isUpload} onChange={setIsUpload} />
        </Flex>

        <div className="text-xs text-gray-500">
          支持选择多个文件，点击文件可打开所在位置
        </div>
      </Flex>
    </div>
  );
});

FileUpload.displayName = "FileUpload";

export default FileUpload;
