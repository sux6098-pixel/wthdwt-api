/* ============================================================
   wthdwt API  ·  Cloudflare Worker + D1 + R2
   ------------------------------------------------------------
   权限模型
   - 所有 /api/admin/* 必须在 Cloudflare Access 之后（边缘已验签）
   - Worker 再从 Cf-Access-Jwt-Assertion 里取邮箱，作为「谁」
   - 留言删除时校验 author，不是本人返回 403
   ============================================================ */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      const path = url.pathname;

      /* ---------- 公开读取 ---------- */
      if (path === "/api/public" && request.method === "GET") {
        return json(await publicPayload(env), 200, cors);
      }

      /* ---------- 以下都需要登录 ---------- */
      const email = await identity(request);
      if (!email) {
        return json({ error: "未登录" }, 401, cors);
      }

      if (path === "/api/me" && request.method === "GET") {
        return json({ email }, 200, cors);
      }

      /* 内容文档：整份读写 */
      if (path === "/api/content" && request.method === "GET") {
        const row = await env.DB.prepare("SELECT json, updated_at, updated_by FROM content WHERE id = 1").first();
        return json({ content: row ? JSON.parse(row.json) : null, updated_at: row?.updated_at, updated_by: row?.updated_by }, 200, cors);
      }
      if (path === "/api/content" && request.method === "PUT") {
        const body = await request.json();
        if (!body || typeof body !== "object") return json({ error: "内容格式不对" }, 400, cors);
        await env.DB.prepare(
          "UPDATE content SET json = ?, updated_at = datetime('now'), updated_by = ? WHERE id = 1"
        ).bind(JSON.stringify(body), email).run();
        return json({ ok: true, updated_by: email }, 200, cors);
      }

      /* 照片：列表 / 上传 / 修改 / 删除 */
      if (path === "/api/photos" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM photos ORDER BY created_at DESC"
        ).all();
        return json({ photos: results.map(publicPhoto) }, 200, cors);
      }

      if (path === "/api/photos" && request.method === "POST") {
        return registerPhoto(request, env, email, cors);
      }

      const photoMatch = path.match(/^\/api\/photos\/([\w-]+)$/);
      if (photoMatch) {
        const id = photoMatch[1];
        const row = await env.DB.prepare("SELECT * FROM photos WHERE id = ?").bind(id).first();
        if (!row) return json({ error: "没有这张照片" }, 404, cors);

        if (request.method === "PATCH") {
          const body = await request.json();
          await env.DB.prepare(
            "UPDATE photos SET alt = COALESCE(?, alt), note = COALESCE(?, note), city = COALESCE(?, city), cat = COALESCE(?, cat) WHERE id = ?"
          ).bind(body.alt ?? null, body.note ?? null, body.city ?? null, body.cat ?? null, id).run();
          return json({ ok: true }, 200, cors);
        }
        if (request.method === "DELETE") {
          if (row.author !== email) return json({ error: "只能删除自己上传的照片" }, 403, cors);
          await env.DB.prepare("DELETE FROM photos WHERE id = ?").bind(id).run();
          return json({ ok: true, key: row.key }, 200, cors);
        }
      }

      /* 留言 */
      if (path === "/api/messages" && request.method === "POST") {
        const body = await request.json();
        const text = String(body.body || "").trim();
        if (!text) return json({ error: "内容不能为空" }, 400, cors);
        if (text.length > 500) return json({ error: "太长了" }, 400, cors);
        const id = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO messages (id, body, author) VALUES (?, ?, ?)"
        ).bind(id, text, email).run();
        return json({ ok: true, id }, 201, cors);
      }

      const msgMatch = path.match(/^\/api\/messages\/([\w-]+)$/);
      if (msgMatch && request.method === "DELETE") {
        const id = msgMatch[1];
        const row = await env.DB.prepare("SELECT author FROM messages WHERE id = ?").bind(id).first();
        if (!row) return json({ error: "没有这条留言" }, 404, cors);
        if (row.author !== email) return json({ error: "只能删除自己的留言" }, 403, cors);
        await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(id).run();
        return json({ ok: true }, 200, cors);
      }

      return json({ error: "没有这个接口" }, 404, cors);
    } catch (err) {
      return json({ error: String(err && err.message ? err.message : err) }, 500, cors);
    }
  }
};

/* ---------------- 工具 ---------------- */

function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) ? origin : allowed[0] || "*";
  return {
    "Access-Control-Allow-Origin": ok,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Accept",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

/* 从 Access 注入的 JWT 里取邮箱（边缘已验签，这里只读声明） */
async function identity(request) {
  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!jwt) return "";
  const part = jwt.split(".")[1];
  if (!part) return "";
  try {
    const padded = part.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((part.length + 3) % 4);
    const payload = JSON.parse(atob(padded));
    if (payload.exp && payload.exp * 1000 < Date.now()) return "";
    return payload.email || "";
  } catch {
    return "";
  }
}

function publicPhoto(row) {
  return {
    id: row.id,
    src: row.key.startsWith("http") ? row.key : "/" + row.key.replace(/^\/+/, ""),
    key: row.key,
    alt: row.alt,
    note: row.note,
    city: row.city,
    cat: row.cat,
    width: row.width,
    height: row.height,
    author: row.author,
    created_at: row.created_at
  };
}

async function publicPayload(env) {
  const contentRow = await env.DB.prepare("SELECT json FROM content WHERE id = 1").first();
  const photos = await env.DB.prepare("SELECT * FROM photos ORDER BY created_at DESC").all();
  const messages = await env.DB.prepare("SELECT id, body, author, created_at FROM messages ORDER BY created_at DESC").all();
  let content = {};
  try { content = contentRow ? JSON.parse(contentRow.json) : {}; } catch { content = {}; }
  return {
    content,
    photos: (photos.results || []).map(publicPhoto),
    messages: messages.results || []
  };
}

/* 注册照片元数据（文件本身已由管理端提交到 GitHub 仓库） */
async function registerPhoto(request, env, email, cors) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "请求体不是 JSON" }, 400, cors); }

  const key = String(body.key || "").trim().replace(/^\/+/, "");
  if (!key || !/^images\/[\w.\-]+$/.test(key)) {
    return json({ error: "key 必须是 images/ 下的文件名" }, 400, cors);
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO photos (id, key, alt, note, city, cat, width, height, author) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    id,
    key,
    String(body.alt || ""),
    String(body.note || ""),
    String(body.city || ""),
    String(body.cat || "daily"),
    parseInt(body.width || "0", 10) || 0,
    parseInt(body.height || "0", 10) || 0,
    email
  ).run();

  return json({
    ok: true,
    photo: { id, src: "/" + key, alt: body.alt || "", note: body.note || "", city: body.city || "",
             cat: body.cat || "daily", width: body.width || 0, height: body.height || 0, author: email }
  }, 201, cors);
}
