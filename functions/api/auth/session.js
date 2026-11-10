
import {
  json,
  getSession
} from "../_auth.js";

export async function onRequestGet({ request, env }) {
  try {
    const session = await getSession(request, env);

    if (!session) {
      return json({
        authenticated: false
      });
    }

    return json({
      authenticated: true
    });

  } catch (error) {
    return json({
      authenticated: false,
      error: "登录状态检查失败。"
    }, 500);
  }
}
