import { useEffect, useRef, useState } from 'react';
import { AutoComplete, Button, InputNumber } from "antd";
import { Descendant } from "slate";
import Editor, { EditorRef } from "@/components/Editor";
import { getAllEventTypes, createTimeRecord } from "@/commands";

import styles from './index.module.less';
import useUploadImage from "@/hooks/useUploadImage";
import WindowControl from "@/components/WindowControl";
import dayjs from "dayjs";

const initValue: Descendant[] = [{
  type: 'paragraph',
  children: [{ type: 'formatted', text: '' }],
}];

const QuickTimeRecord = () => {
  const [content, setContent] = useState(initValue);

  const [eventType, setEventType] = useState<string>('');
  const [allEventTypes, setAllEventTypes] = useState<string[]>([]);
  const [cost, setCost] = useState<number>(0);
  const [saveLoading, setSaveLoading] = useState(false);
  const uploadImage = useUploadImage();
  const editorRef = useRef<EditorRef>(null);

  useEffect(() => {
    getAllEventTypes().then((res) => {
      setAllEventTypes(res);
    })
  }, []);

  const eventTypeOptions = allEventTypes.map((eventType) => ({
    value: eventType,
  }));

  const onSave = async () => {
    setSaveLoading(true);
    await createTimeRecord({
      content,
      eventType,
      cost,
      timeType: '',
      date: dayjs().format('YYYY-MM-DD'),
    });
    setSaveLoading(false);
    editorRef.current?.setEditorValue(initValue);
    setContent(initValue);
    setCost(0);
    setEventType('');
    getAllEventTypes().then((res) => {
      setAllEventTypes(res);
    })
  }

  return (
    <div className={styles.quickTimeRecordContainer}>
      <div
        data-tauri-drag-region
        className={styles.titleBar}
      >
        <div className={styles.title}>快捷时间记录</div>
        <WindowControl className={styles.windowControl} notShowFullscreen initAlwaysOnTop />
      </div>
      <div className={styles.form}>
        <div className={styles.content}>
          <div style={{ lineHeight: 1.8 }}>事件：</div>
          <Editor
            ref={editorRef}
            initValue={initValue}
            onChange={setContent}
            readonly={false}
            uploadImage={uploadImage}
            style={{
              flex: 'auto',
            }}
          />
        </div>
        <div className={styles.eventType}>
          <div>事件类型：</div>
          <AutoComplete
            value={eventType}
            style={{ width: 200 }}
            options={eventTypeOptions}
            filterOption={(inputValue, option) => {
              return !!option?.value.includes(inputValue);
            }}
            onChange={setEventType}
          />
        </div>
        <div className={styles.cost}>
          <div>花费时间：</div>
          <InputNumber
            value={cost}
            onChange={(value) => {
              if (typeof value === 'number') {
                setCost(value);
              }
            }}
          />
          <div>分钟</div>
        </div>
      </div>
      <div className={styles.buttons}>
        <Button loading={saveLoading} onClick={onSave}>保存</Button>
      </div>
    </div>
  )
}

export default QuickTimeRecord;