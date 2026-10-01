CREATE TABLE audio_notes(id INTEGER PRIMARY KEY,meta_info TEXT);
CREATE TABLE audio_note_item(id INTEGER PRIMARY KEY,audio_note_id INTEGER,content_id INTEGER);
CREATE INDEX idx_audio_note_item_audio ON audio_note_item(audio_note_id);
CREATE TABLE audio_note_chats(id INTEGER PRIMARY KEY,messages TEXT);
INSERT INTO audio_notes VALUES(1,'{}');
INSERT INTO audio_note_chats VALUES(1,'[]');
INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES
  (100,1,1,'[]',0,1),(101,1,1,'[]',0,2),(102,1,1,'[]',0,1),
  (103,1,1,'[]',0,1),(104,1,1,'[]',0,2),
  (105,1,1,'[{"type":"audio","url":"saved.mp3"}]',0,1);
INSERT INTO audio_note_item VALUES(1,1,100),(2,1,101),(3,1,102);
INSERT INTO cards(id,create_time,update_time,content_id) VALUES(1,1,1,101);
INSERT INTO cards(id,create_time,update_time,content_id) VALUES(2,1,1,102);
INSERT INTO articles(id,title,create_time,update_time,content_id) VALUES(1,'共享正文',1,1,102);
INSERT INTO project(id,create_time,update_time,title,children) VALUES
  (1,1,1,'项目一','[10,11,12]'),(2,1,1,'项目二','[20]');
INSERT INTO project_item(id,create_time,update_time,title,children,parents,projects,project_item_type,ref_type,ref_id,content_id) VALUES
  (10,1,1,'普通父节点','[20,21,24]','[]','[1]','document','',0,NULL),
  (11,1,1,'根音频','[26]','[]','[1]','audio-note','audio-note',1,104),
  (12,1,1,'普通兄弟','[]','[]','[1]','document','',0,NULL),
  (20,1,1,'共享音频','[22,23]','[10]','[1,2]','audio-note','audio-note',1,103),
  (21,1,1,'含通用音频块的文档','[]','[10,22]','[1,2]','document','',0,105),
  (22,1,1,'嵌套音频','[21]','[20]','[1,2]','audio-note','audio-note',1,NULL),
  (23,1,1,'普通后代','[]','[20]','[1,2]','document','',0,NULL),
  (24,1,1,'旧音频引用','[25]','[10]','[1]','document','audio-note',1,NULL),
  (25,1,1,'普通后代二','[]','[24]','[1]','document','',0,NULL),
  (26,1,1,'根音频的子文档','[]','[11]','[1]','document','',0,NULL);
INSERT INTO white_board_contents(id,create_time,update_time,name,data,ref_count) VALUES(100,1,1,'保留白板','[]',1);
UPDATE project_item SET project_item_type='white-board',white_board_content_id=100 WHERE id=12;
