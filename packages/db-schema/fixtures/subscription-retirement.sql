-- RSS 订阅与稍后读域表

CREATE TABLE IF NOT EXISTS rss_feed (
    id INTEGER PRIMARY KEY,
    create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    url TEXT NOT NULL UNIQUE,
    site_url TEXT,
    image_url TEXT,
    feed_type TEXT NOT NULL DEFAULT 'rss' CHECK(feed_type IN ('rss', 'atom', 'json')),
    last_fetched_at INTEGER,
    last_entry_at INTEGER,
    fetch_interval INTEGER DEFAULT 1800000,
    error_count INTEGER DEFAULT 0,
    last_error TEXT,
    is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS rss_subscription (
    id INTEGER PRIMARY KEY,
    create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL,
    feed_id INTEGER NOT NULL,
    title TEXT,
    category TEXT,
    view_type TEXT DEFAULT 'article' CHECK(view_type IN ('article', 'podcast', 'video', 'picture', 'notification')),
    is_muted INTEGER DEFAULT 0,
    FOREIGN KEY(feed_id) REFERENCES rss_feed(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rss_entry (
    id INTEGER PRIMARY KEY,
    create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL,
    feed_id INTEGER NOT NULL,
    guid TEXT NOT NULL,
    title TEXT,
    url TEXT,
    author TEXT,
    description TEXT,
    content TEXT,
    readability_content TEXT,
    published_at INTEGER,
    media TEXT,
    categories TEXT,
    enclosure_url TEXT,
    enclosure_type TEXT,
    enclosure_length INTEGER,
    is_read INTEGER DEFAULT 0,
    is_starred INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    FOREIGN KEY(feed_id) REFERENCES rss_feed(id) ON DELETE CASCADE,
    UNIQUE(feed_id, guid)
);

CREATE TABLE IF NOT EXISTS read_later (
    id INTEGER PRIMARY KEY,
    create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL,
    source_type TEXT NOT NULL CHECK(source_type IN ('rss_entry', 'web_clip', 'web_link', 'article', 'url')),
    source_id INTEGER,
    title TEXT NOT NULL,
    url TEXT,
    excerpt TEXT,
    content TEXT,
    is_archived INTEGER DEFAULT 0,
    is_starred INTEGER DEFAULT 0,
    tags TEXT,
    reading_progress REAL DEFAULT 0
);

CREATE INDEX idx_rss_entry_read ON rss_entry(is_read);
INSERT INTO rss_feed(id,create_time,update_time,title,url) VALUES(1,1,1,'订阅','https://example.test/feed');
INSERT INTO rss_subscription(id,create_time,update_time,feed_id) VALUES(1,1,1,1);
INSERT INTO rss_entry(id,create_time,update_time,feed_id,guid,content,is_starred) VALUES(1,1,1,1,'entry','抓取正文',1);
INSERT INTO read_later(id,create_time,update_time,source_type,source_id,title,content) VALUES(1,1,1,'rss_entry',1,'稍后读','稍后读正文');
INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(900,1,1,'[]',0,2);
INSERT INTO articles(id,title,create_time,update_time,content_id) VALUES(900,'已另存文章',1,1,900);
INSERT INTO project(id,create_time,update_time,title,children) VALUES(900,1,1,'项目','[900]');
INSERT INTO project_item(id,create_time,update_time,title,content_id,projects) VALUES(900,1,1,'已另存文档',900,'[900]');
INSERT INTO video_notes(id,create_time,update_time,meta_info) VALUES(900,1,1,'{}');
