import Editor from '../src/components/Editor';

import defaultValue from './default';
import { Descendant } from "slate";
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

const Profile = () => {
  return (
    <DndProvider backend={HTML5Backend}>
      <div style={{ width: 720, margin: '20px auto' }}>
        <Editor readonly={false} initValue={defaultValue as Descendant[]}/>
      </div>
    </DndProvider>
  )
}

export default Profile;
