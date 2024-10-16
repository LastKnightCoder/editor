import Editor, { EditorRef } from '../src/components/Editor';

import profile from './profile';
import { Descendant } from "slate";
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import EditorOutline from "../src/layouts/ThreeColumnLayout/components/EditorOutline";
import { useMemoizedFn } from "ahooks";
import { useRef } from "react";
// @ts-ignore
import styles from './index.module.less';

const Profile = () => {
  const editorRef = useRef<EditorRef>(null);

  const onClickHeader = useMemoizedFn((index: number) => {
    if (!editorRef.current) return;
    editorRef.current.scrollHeaderIntoView(index);
  })

  return (
    <DndProvider backend={HTML5Backend}>
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.editor}>
            <Editor ref={editorRef} readonly={true} initValue={profile as Descendant[]}/>
          </div>
          <div className={styles.outlineContainer}>
            <EditorOutline
              className={styles.outline}
              content={profile as Descendant[]}
              show={true}
              onClickHeader={onClickHeader}
            />
          </div>
        </div>
      </div>
    </DndProvider>
  )
}

export default Profile;
