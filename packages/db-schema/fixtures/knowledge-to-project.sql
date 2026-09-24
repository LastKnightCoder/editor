-- 仅供升级测试使用的历史知识库表。
CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY NOT NULL,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL,
            title TEXT NOT NULL,
            desc TEXT,
            children TEXT,
            content TEXT,
            is_top INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS document_items (
            id INTEGER PRIMARY KEY NOT NULL,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL,
            title TEXT NOT NULL,
            tags TEXT,
            children TEXT,
            is_article INTEGER DEFAULT 0,
            article_id INTEGER DEFAULT 0,
            is_card INTEGER DEFAULT 0,
            card_id INTEGER DEFAULT 0,
            ref_type TEXT DEFAULT '',
            ref_id INTEGER DEFAULT 0,
            parents TEXT DEFAULT '[]', content_id INTEGER, documents TEXT DEFAULT '[]');
INSERT INTO project(id,create_time,update_time,title,desc,children) VALUES(5,1,2,'已有项目','[]','[]');
INSERT INTO migration_meta(key,value) VALUES('project:id-seq','8');
INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES
 (20,1,2,'[{"type":"paragraph","children":[{"text":"共同正文"}]}]',4,2),
 (21,1,2,'[{"type":"content-link","contentType":"document-item","refId":2,"contentId":20,"children":[{"text":"引用"}]}]',2,1);
INSERT INTO project_item(id,create_time,update_time,title,children,parents,projects,content_id) VALUES(4,1,2,'已有节点','[]','[]','[5]',20);
UPDATE project SET children='[4]' WHERE id=5;
INSERT INTO documents(id,create_time,update_time,title,desc,children,content,is_top) VALUES
 (1,11,12,'甲库','简介','[1]','[{"type":"paragraph","children":[{"text":"根正文"}]}]',1),
 (2,13,14,'乙库','','[2]','[]',0);
INSERT INTO document_items(id,create_time,update_time,title,tags,children,parents,documents,content_id) VALUES
 (1,15,16,'父文档','["标签"]','[2]','[]','[]',21),
 (2,17,18,'共享文档','[]','[]','[1]','[1,2]',20);
UPDATE contents SET ref_count=3 WHERE id=20;
INSERT INTO publish_selections(content_type,content_id,parent_path,selected,update_time) VALUES
 ('document',1,'{"mode":"partial","nodes":[2]}',1,18);
INSERT INTO publish_history(file_path,content_hash,source_type,source_id,publish_time) VALUES
 ('/docs/document/1/2.html','old','document',1,18);
INSERT INTO statistic(date,statistic_type,content) VALUES
 ('2026-01-01','project-item','{"count":1,"wordsCount":4}'),
 ('2026-01-02','document-item','{"count":2,"wordsCount":6}'),
 ('2026-01-03','project-item','{"count":2,"wordsCount":8}'),
 ('2026-01-04','document-item','{"count":0.5,"wordsCount":1.5}');
