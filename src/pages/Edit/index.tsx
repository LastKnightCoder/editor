import Editor from "@/pages/Editor";
import styles from './index.module.less';


const EditPage = () => {
  return (
    <div className={styles.container}>
      <div className={styles.editorContainer}>
        <div className={styles.editor}>
          <Editor initValue={[{type: 'paragraph', children:[{ type: 'formatted', text: '' }]}]} readonly={false} />
        </div>
      </div>
    </div>
  )
}

export default EditPage;
