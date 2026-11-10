
const COOKIE_NAME = "erp_session";

// 统一返回 JSON
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

// 检查请求是否来自本站，防止跨站请求
export function requireSameOrigin(request) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const fetchSite = request.headers.get("Sec-Fetch-Site");

  if (origin !== url.origin) return false;
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return false;
  }
  return true;
}

// 读取 Cookie
function cookieValue(request, name) {
  const cookie = request.headers.get("Cookie") || "";

  for (const part of cookie.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;

    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }

  return null;
}

// 创建安全登录 Cookie
export function sessionCookie(token, maxAge) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

// 清除登录 Cookie
export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

// 验证当前登录会话
export async function getSession(request, env) {
  if (!env.ERP_AUTH) {
    throw new Error("Cloudflare KV binding ERP_AUTH is missing.");
  }

  const token = cookieValue(request, COOKIE_NAME);

  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return null;
  }

  const value = await env.ERP_AUTH.get(`session:${token}`);

  if (!value) return null;

  try {
    const session = JSON.parse(value);

    if (!session.expiresAt || session.expiresAt <= Date.now()) {
      await env.ERP_AUTH.delete(`session:${token}`);
      return null;
    }

    return { token, ...session };
  } catch {
    await env.ERP_AUTH.delete(`session:${token}`);
    return null;
  }
}

// 创建登录会话
export async function createSession(env, remember) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  const token = Array.from(bytes, b =>
    b.toString(16).padStart(2, "0")
  ).join("");

  const maxAge = remember
    ? 7 * 24 * 60 * 60
    : 12 * 60 * 60;

  const expiresAt = Date.now() + maxAge * 1000;

  await env.ERP_AUTH.put(
    `session:${token}`,
    JSON.stringify({
      createdAt: Date.now(),
      expiresAt
    }),
    { expirationTtl: maxAge }
  );

  return { token, maxAge };
}

// 根据密码和随机盐生成 PBKDF2 哈希
async function derivePasswordHash(password, saltBytes) {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 310000,
      hash: "SHA-256"
    },
    key,
    256
  );

  return Array.from(new Uint8Array(bits), b =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

// 十六进制转换为字节数组
function fromHex(hex) {
  if (!/^(?:[a-f0-9]{2})+$/i.test(hex)) {
    throw new Error("Invalid password record.");
  }

  const bytes = new Uint8Array(hex.length / 2);

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}

// 创建密码记录，只保存哈希，不保存明文
export async function makePasswordRecord(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(password, salt);

  return JSON.stringify({
    algorithm: "PBKDF2-SHA256",
    iterations: 310000,
    salt: Array.from(salt, b =>
      b.toString(16).padStart(2, "0")
    ).join(""),
    hash
  });
}

// 验证密码
export async function verifyPassword(password, recordText) {
  if (!recordText) return false;

  try {
    const record = JSON.parse(recordText);

    if (
      record.algorithm !== "PBKDF2-SHA256" ||
      record.iterations !== 310000
    ) {
      return false;
    }

    const actual = await derivePasswordHash(
      password,
      fromHex(record.salt)
    );

    if (actual.length !== record.hash.length) return false;

    let diff = 0;

    for (let i = 0; i < actual.length; i++) {
      diff |= actual.charCodeAt(i) ^ record.hash.charCodeAt(i);
    }

    return diff === 0;
  } catch {
    return false;
  }
}

// 第一次登录时初始化管理员密码哈希
export async function getOrCreatePasswordRecord(env) {
  if (!env.ERP_AUTH) {
    throw new Error("Cloudflare KV binding ERP_AUTH is missing.");
  }

  let record = await env.ERP_AUTH.get("admin:password_hash");

  if (record) return record;

  if (!env.ADMIN_INITIAL_PASSWORD) {
    throw new Error("Cloudflare secret ADMIN_INITIAL_PASSWORD is missing.");
  }

  record = await makePasswordRecord(env.ADMIN_INITIAL_PASSWORD);

  await env.ERP_AUTH.put("admin:password_hash", record);

  return record;
}

// 安全读取 JSON 请求
export async function readJson(request, maxBytes = 8192) {
  const declared = Number(request.headers.get("Content-Length") || 0);

  if (declared > maxBytes) {
    throw new Error("Request body too large.");
  }

  const text = await request.text();

  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new Error("Request body too large.");
  }

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

// 获取客户端 IP，用于登录失败次数限制
export function getClientKey(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}
