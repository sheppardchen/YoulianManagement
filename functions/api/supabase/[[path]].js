
import {
  json,
  getSession,
  requireSameOrigin
} from "../_auth.js";

const ALLOWED_TABLES = new Set([
  "orders",
  "inventory",
  "recycled_items"
]);

const MAX_BODY_SIZE = 1024 * 1024;

export async function onRequest({ request, env }) {
  try {
    // 1. 只允许 GET、POST、PATCH、DELETE
    const method = request.method.toUpperCase();

    if (!["GET", "POST", "PATCH", "DELETE"].includes(method)) {
      return json({ error: "不支持的请求方法。" }, 405);
    }

    // 2. 验证请求来源
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);
    const fetchSite = request.headers.get("Sec-Fetch-Site");

    if (origin && origin !== url.origin) {
      return json({ error: "请求来源校验失败。" }, 403);
    }

    if (
      method !== "GET" &&
      !requireSameOrigin(request)
    ) {
      return json({ error: "请求来源校验失败。" }, 403);
    }

    if (
      fetchSite &&
      fetchSite !== "same-origin" &&
      fetchSite !== "none"
    ) {
      return json({ error: "不允许跨站请求。" }, 403);
    }

    // 3. 验证管理员登录状态
    const session = await getSession(request, env);

    if (!session) {
      return json({
        error: "登录已失效，请重新登录。"
      }, 401);
    }

    // 4. 检查服务器端 Supabase 配置
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return json({
        error: "Supabase 服务端配置不完整。"
      }, 500);
    }

    // 5. 只允许访问指定的三个数据表
    const prefix = "/api/supabase/";
    const requestPath = url.pathname.startsWith(prefix)
      ? url.pathname.slice(prefix.length)
      : "";

    const match = requestPath.match(
      /^rest\/v1\/([a-zA-Z0-9_]+)$/
    );

    if (!match || !ALLOWED_TABLES.has(match[1])) {
      return json({
        error: "不允许访问该数据表或接口。"
      }, 403);
    }

    const table = match[1];

    // 6. 限制查询参数长度
    const queryString = url.search;

    if (queryString.length > 6000) {
      return json({
        error: "查询参数过长。"
      }, 400);
    }

    // 7. 构建 Supabase 请求地址
    const baseUrl = supabaseUrl.replace(/\/+$/, "");

    const targetUrl =
      `${baseUrl}/rest/v1/${table}${queryString}`;

    // 8. 构建请求头
    const headers = new Headers();

    headers.set("apikey", supabaseKey);
    
    headers.set("Accept", "application/json");

    const contentType = request.headers.get("Content-Type");

    if (contentType) {
      headers.set("Content-Type", contentType);
    }

    // 只转发必要的 PostgREST 请求头
    for (const name of [
      "Prefer",
      "Range",
      "Range-Unit"
    ]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    // 9. 读取请求内容并限制大小
    let body = undefined;

    if (method === "POST" || method === "PATCH") {
      const declaredSize = Number(
        request.headers.get("Content-Length") || 0
      );

      if (declaredSize > MAX_BODY_SIZE) {
        return json({ error: "提交的数据过大。" }, 413);
      }

      body = await request.text();

      if (
        new TextEncoder().encode(body).length >
        MAX_BODY_SIZE
      ) {
        return json({ error: "提交的数据过大。" }, 413);
      }
    }

    // 10. 请求 Supabase
    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body,
      redirect: "manual"
    });

    // 不跟随外部重定向
    if (upstream.status >= 300 && upstream.status < 400) {
      return json({
        error: "Supabase 返回了非预期重定向。"
      }, 502);
    }

    // 11. 返回 Supabase 结果
    const responseHeaders = new Headers();

    responseHeaders.set(
      "Content-Type",
      upstream.headers.get("Content-Type") ||
      "application/json"
    );

    responseHeaders.set("Cache-Control", "no-store");

    for (const name of [
      "Content-Range",
      "Preference-Applied",
      "Range-Unit"
    ]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders
    });

  } catch (error) {
    return json({
      error: "数据库代理请求失败，请检查 Cloudflare 配置。"
    }, 500);
  }
}
