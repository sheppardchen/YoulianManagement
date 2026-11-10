
import {
  json,
  requireSameOrigin,
  readJson,
  getSession,
  makePasswordRecord,
  verifyPassword
} from "../_auth.js";

export async function onRequestPost({ request, env }) {
  // 1. 检查请求来源
  if (!requireSameOrigin(request)) {
    return json({ error: "请求来源校验失败。" }, 403);
  }

  try {
    // 2. 确认 KV 已配置
    if (!env.ERP_AUTH) {
      return json({ error: "尚未配置 ERP_AUTH KV。" }, 500);
    }

    // 3. 检查管理员登录状态
    const session = await getSession(request, env);

    if (!session) {
      return json({ error: "登录已失效，请重新登录。" }, 401);
    }

    // 4. 读取密码修改请求
    const body = await readJson(request);

    const oldPassword =
      typeof body.oldPassword === "string"
        ? body.oldPassword
        : "";

    const newPassword =
      typeof body.newPassword === "string"
        ? body.newPassword
        : "";

    // 5. 检查新密码
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

    // 6. 读取当前管理员密码哈希
    const passwordRecord = await env.ERP_AUTH.get(
      "admin:password_hash"
    );

    if (!passwordRecord) {
      return json({
        success: false,
        error: "管理员密码尚未初始化，请联系系统管理员。"
      }, 500);
    }

    // 7. 验证旧密码
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

    // 8. 生成新密码哈希并保存到 KV
    const newPasswordRecord = await makePasswordRecord(
      newPassword
    );

    await env.ERP_AUTH.put(
      "admin:password_hash",
      newPasswordRecord
    );

    // 9. 修改成功
    return json({
      success: true
    });

  } catch (error) {
    return json({
      success: false,
      error: "修改密码失败，请稍后重试。"
    }, 500);
  }
}
