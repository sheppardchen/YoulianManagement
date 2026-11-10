
import {
  json,
  requireSameOrigin,
  readJson,
  getSession,
  makePasswordRecord,
  verifyPassword
} from "../_auth.js";

export async function onRequestPost({ request, env }) {
  if (!requireSameOrigin(request)) {
    return json({ error: "请求来源校验失败。" }, 403);
  }

  try {
    if (!env.ERP_AUTH) {
      return json({ error: "尚未配置 ERP_AUTH KV。" }, 500);
    }

    const session = await getSession(request, env);

    if (!session) {
      return json({ error: "登录已失效，请重新登录。" }, 401);
    }

    const body = await readJson(request);

    const oldPassword =
      typeof body.oldPassword === "string"
        ? body.oldPassword
        : "";

    const newPassword =
      typeof body.newPassword === "string"
        ? body.newPassword
        : "";

    if (!oldPassword) {
      return json({
        success: false,
        error: "请输入原密码。"
      }, 400);
    }

    if (newPassword.length < 8 || newPassword.length > 128) {
      return json({
        success: false,
        error: "新密码长度必须为 8 至 128 个字符。"
      }, 400);
    }

    if (oldPassword === newPassword) {
      return json({
        success: false,
        error: "新密码不能与原密码相同。"
      }, 400);
    }

    const passwordRecord = await env.ERP_AUTH.get(
      "admin:password_hash"
    );

    if (!passwordRecord) {
      return json({
        success: false,
        error: "管理员密码尚未初始化，请联系系统管理员。"
      }, 500);
    }

    const valid = await verifyPassword(
      oldPassword,
      passwordRecord
    );

    if (!valid) {
      return json({
        success: false,
        error: "原密码不正确。"
      }, 401);
    }

    const newPasswordRecord = await makePasswordRecord(
      newPassword
    );

    // 更新会话版本，使旧会话失效
    const newVersion = crypto.randomUUID();

    await env.ERP_AUTH.put(
      "admin:session_version",
      newVersion
    );

    // 保存新密码哈希
    await env.ERP_AUTH.put(
      "admin:password_hash",
      newPasswordRecord
    );

    return json({
      success: true,
      message: "密码修改成功，请使用新密码重新登录。"
    });

  } catch (error) {
    return json({
      success: false,
      error: "修改密码失败，请稍后重试。"
    }, 500);
  }
}
