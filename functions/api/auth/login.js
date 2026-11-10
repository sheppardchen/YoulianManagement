
import {
  json,
  requireSameOrigin,
  readJson,
  getClientKey,
  getOrCreatePasswordRecord,
  verifyPassword,
  createSession,
  sessionCookie
} from "../_auth.js";

export async function onRequestPost({ request, env }) {
  // 检查请求来源
  if (!requireSameOrigin(request)) {
    return json({ error: "请求来源校验失败。" }, 403);
  }

  try {
    if (!env.ERP_AUTH) {
      return json({ error: "尚未配置 ERP_AUTH KV。" }, 500);
    }

    // 限制连续错误登录次数
    const rateKey = `login_attempts:${getClientKey(request)}`;
    const attempts = Number(
      await env.ERP_AUTH.get(rateKey) || 0
    );

    if (attempts >= 10) {
      return json(
        { error: "登录尝试次数过多，请 15 分钟后再试。" },
        429
      );
    }

    // 获取用户提交的密码
    const body = await readJson(request);

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    if (!password || password.length > 256) {
      return json(
        {
          authenticated: false,
          error: "请输入有效密码。"
        },
        400
      );
    }

    // 获取服务器保存的管理员密码哈希
    const record = await getOrCreatePasswordRecord(env);

    // 验证密码
    const valid = await verifyPassword(password, record);

    if (!valid) {
      await env.ERP_AUTH.put(
        rateKey,
        String(attempts + 1),
        { expirationTtl: 900 }
      );

      return json(
        {
          authenticated: false,
          error: "密码错误，请重新输入。"
        },
        401
      );
    }

    // 登录成功，清除失败次数
    await env.ERP_AUTH.delete(rateKey);

    // 创建服务器端登录会话
    const session = await createSession(
      env,
      body.remember === true
    );

    // 返回 HttpOnly 安全 Cookie
    return json(
      { authenticated: true },
      200,
      {
        "Set-Cookie": sessionCookie(
          session.token,
          session.maxAge
        )
      }
    );

  } catch (error) {
    return json(
      {
        error: error.message || "登录服务暂时不可用。"
      },
      500
    );
  }
}
