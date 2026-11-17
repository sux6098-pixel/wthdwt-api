# wthdwt-api

wthdwt 网站的后端：Cloudflare Worker + D1（数据）+ Access（登录）。

照片文件仍然放在 GitHub 仓库（`images/`），这里只保存照片的**元数据**
（说明、碎碎念、所属城市、上传者）。这样不需要开通 R2、不用绑银行卡。

**跟现有静态站完全独立**。这个 Worker 只提供 `/api/*`，
现有网站不改也能正常访问。

## 接口一览

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/public` | 公开 | 内容 + 照片元数据 + 留言，展示页用 |
| GET | `/api/me` | 登录 | 返回当前登录邮箱 |
| GET/PUT | `/api/content` | 登录 | 整份 content.json 读写 |
| GET | `/api/photos` | 登录 | 照片元数据列表 |
| POST | `/api/photos` | 登录 | 注册照片（JSON：key/alt/note/city/cat/width/height）|
| PATCH | `/api/photos/:id` | 登录 | 改说明、碎碎念、城市、分类 |
| DELETE | `/api/photos/:id` | 登录 | **只能删自己注册的** |
| POST | `/api/messages` | 登录 | 发留言 |
| DELETE | `/api/messages/:id` | 登录 | **只能删自己的** |

权限由 Cloudflare Access 在边缘完成（邮箱验证码），Worker 从
`Cf-Access-Jwt-Assertion` 里读邮箱作为身份。

## 部署步骤

### 1. D1 数据库

已创建，Database ID 写在 `wrangler.toml` 里。
建表：D1 → 该数据库 → `控制台` → 粘贴 `schema.sql` → 执行。

### 2. 部署 Worker

`Workers 和 Pages` → `创建` → `导入现有 Git 存储库` → 选 `wthdwt-api`
- 构建命令：留空
- 部署命令：`npx wrangler deploy`

D1 绑定会在 `wrangler.toml` 里自动生效。

### 3. 加 Access 保护

`Zero Trust` → `Access` → `应用` → `添加应用` → `自托管`
- 应用名：`wthdwt admin`
- 域名：Worker 域名 + `/api`
- 策略：`Allow` → `Emails` → 两个人的邮箱
- 会话时长：24 小时

## 本地开发

```bash
npx wrangler dev
```

## 注意

- `ALLOWED_ORIGINS` 必须包含展示站域名，否则浏览器跨域被拦
- 删除照片只删元数据，仓库里的图片文件由管理端另行删除
