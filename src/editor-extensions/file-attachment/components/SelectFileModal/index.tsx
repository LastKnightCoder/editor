import { Button, Flex, Switch, App } from "antd";
import { useState } from "react";
import { useLocalStorageState } from "ahooks";
import { selectFile, readBinaryFile, getFileBaseName } from '@/commands';
import useUploadImage from "@/hooks/useUploadImage.ts";
import { CheckOutlined, PlusOutlined } from "@ant-design/icons";

interface SelectFileModalProps {
  onOk: (filePath: string, isLocal: boolean, fileName?: string) => void;
  onCancel: () => void;
}

const SelectFileModal = (props: SelectFileModalProps) => {
  const { onOk, onCancel } = props;

  const { message } = App.useApp();

  const uploadFile = useUploadImage();
  const [filePath, setFilePath] = useState<string | undefined>();
  const [fileName, setFileName] = useState<string | undefined>();
  const [file, setFile] = useState<File>();
  const [isUpload, setIsUpload] = useLocalStorageState('file-attachment-upload', {
    defaultValue: false
  });

  // const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = async () => {
    // inputRef.current?.click();
    setFile(undefined);
    const filePath = await selectFile();
    if (!filePath) return;
    if (Array.isArray(filePath)) return;
    const fileData = await readBinaryFile(filePath);
    const fileName = await getFileBaseName(filePath);
    const file = new File([fileData], fileName);
    setFilePath(filePath);
    setFileName(fileName);
    setFile(file);
  }

  // const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  //   const files = e.target.files;
  //   if (files && files.length > 0) {
  //     setFile(files[0]);
  //   }
  //   e.target.value = '';
  // }

  const handleClickOk = async () => {
    if (!file || !filePath || !fileName) {
      message.warning('请先选择文件');
      return;
    }

    const realFilePath = isUpload ? await uploadFile(file) : filePath;

    if (realFilePath) {
      onOk(realFilePath, !isUpload, fileName);
      setFile(undefined);
      setFilePath(undefined);
      setFileName(undefined);
    }
  }

  const handleClickCancel = () => {
    onCancel();
  }


  return (
    <Flex vertical gap={24}>
      <Flex vertical={true} align={'center'} gap={12}>
        <div
          style={{
            width: 120,
            height: 120,
            border: '1px solid var(--line-color)',
            borderRadius: 4,
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            fontSize: 24,
        }}
          onClick={handleClick}
        >
          {
            file ? (
              <CheckOutlined />
            ) : (
              <PlusOutlined />
            )
          }
        </div>
        {
          filePath && (
            <div style={{ fontSize: '0.9em', opacity: .8 }}>{filePath}</div>
          )
        }
        <Flex gap={8} align={'center'}>
          <div style={{ fontSize: '0.9em', opacity: .8 }}>是否上传到云端（在图床配置中设置）</div>
          <Switch size={'small'} checked={isUpload} onChange={setIsUpload} />
        </Flex>
      </Flex>
      <Flex justify={'flex-end'} gap={12}>
        <Button onClick={handleClickCancel}>取消</Button>
        <Button onClick={handleClickOk}>确定</Button>
      </Flex>
    </Flex>
  )
}

export default SelectFileModal;
