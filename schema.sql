-- ============================================================
-- wthdwt 数据库结构（Cloudflare D1 / SQLite）
-- 在 D1 控制台的 Console 里整段执行一次即可
-- ============================================================

/* 内容文档：整份 content.json 存成一条记录，带版本号 */
CREATE TABLE IF NOT EXISTS content (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  json       TEXT    NOT NULL,
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);

/* 照片：文件本体在 R2，这里只存元数据 */
CREATE TABLE IF NOT EXISTS photos (
  id         TEXT PRIMARY KEY,              -- uuid
  key        TEXT NOT NULL,                 -- R2 对象键
  alt        TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '',
  city       TEXT NOT NULL DEFAULT '',
  cat        TEXT NOT NULL DEFAULT 'daily',
  width      INTEGER NOT NULL DEFAULT 0,
  height     INTEGER NOT NULL DEFAULT 0,
  author     TEXT NOT NULL,                 -- 谁传的（Access 邮箱）
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_photos_city ON photos(city);

/* 留言：只能删自己的，靠 author 校验 */
CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  body       TEXT NOT NULL,
  author     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

/* 初始内容（和现在线上一致，首次部署后可在后台改） */
INSERT OR IGNORE INTO content (id, json, updated_by) VALUES (
  1,
  '{"site":{"mark":"wth & dwt","titleA":"wth","titleB":"dwt","since":"2026-05-21"},"hero":{"en":"Some moments deserve to stay forever.","cn":"我们的故事 · Our Story"},"about":[{"name":"wth","born":"2007-10-20","zodiac":"天秤座"},{"name":"dwt","born":"2006-03-03","zodiac":"双鱼座"}],"trips":[{"city":"福州","lon":119.296,"lat":26.074,"date":"","status":"done","story":"第一次一起去的地方。","photos":[]},{"city":"长沙","lon":112.938,"lat":28.228,"date":"","status":"done","story":"第二次一起出门。","photos":[]},{"city":"庐山","lon":115.98,"lat":29.55,"date":"2027-01-01","status":"planning","story":"元旦一起去看雪。","photos":[]}],"plans":[{"title":"庐山看雪","place":"庐山","date":"2027-01-01","status":"planning","note":"元旦出发，第一次一起看雪。"}],"cards":[{"title":"我们的日常","sub":"生活碎片与日常照片"},{"title":"一起去过的地方","sub":"旅行、散步与风景"},{"title":"照片时间线","sub":"按照日期收藏回忆"},{"title":"写给彼此的话","sub":"留言、纪念日和小故事"}],"timeline":[{"when":"开始","title":"军训","text":"军训的时候，我们偶尔聊聊天，后来加了微信。"},{"when":"那天","title":"第一次牵手","text":"送你回到家乡的那次，你请我看了一场电影。电影中，我们牵了手。"}],"note":{"text":"坚持你的一切选择。","by":"wth"},"end":{"line":"谢谢你来这里看我们。","sign":"wth & dwt"},"footer":"保留所有照片权利"}',
  'seed'
);
