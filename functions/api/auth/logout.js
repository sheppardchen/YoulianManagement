
import {
  json,
  requireSameOrigin,
  getSession,
  clearSessionCookie
} from "../_auth.js";

export async function onRequestPost({ request, env }) {
  // 检查请求来源
  if (!requireSameOrigin(request)) {
    return json({ error: "请求来源校验失败。" }, 403);
  }

  try {
    // 获取当前登录会话
    const session = await getSession(request, env);

    // 删除服务器端会话
    if (session && env.ERP_AUTH) {
      await env.ERP_AUTH.delete(`session:${session.token}`);
    }

    // 清除浏览器登录 Cookie
    return json(
      { success: true },
      200,
      {
        "Set-Cookie": clearSessionCookie()
      }
    );

  } catch (error) {
    return json(
      { error: "退出登录失败，请稍后重试。" },
      500
    );
  }
}
