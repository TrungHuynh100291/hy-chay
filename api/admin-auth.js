/**
 * BAO ANH LAM - SERVER-SIDE ADMIN AUTHENTICATION ENDPOINT
 * Xac thuc tai khoan quan tri qua Vercel Environment Variables hoac Firebase RTDB admin_users.
 * Tuyet doi khong luu mat khau quan tri tran trong ma nguon client.
 */
const crypto = require("crypto");

const FIREBASE_DB_ROOT = "https://hy-chay-default-rtdb.asia-southeast1.firebasedatabase.app";

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") {
    try {
      return Promise.resolve(JSON.parse(req.body || "{}"));
    } catch {
      return Promise.resolve({});
    }
  }
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function safeTimingEqual(a, b) {
  const hashA = crypto.createHash("sha256").update(String(a || "")).digest();
  const hashB = crypto.createHash("sha256").update(String(b || "")).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function sanitizeUserKey(username) {
  return String(username || "").trim().toLowerCase().replace(/\./g, "_").replace(/[#$\[\]\/]/g, "-");
}

function loadEnvAdminAccounts() {
  const accounts = [];

  if (process.env.ADMIN_ACCOUNTS_JSON) {
    try {
      const parsed = JSON.parse(process.env.ADMIN_ACCOUNTS_JSON);
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          if (item && item.username && item.password) {
            accounts.push({
              username: String(item.username).trim().toLowerCase(),
              password: String(item.password),
              role: String(item.role || "manager").trim() || "manager"
            });
          }
        });
      } else if (parsed && typeof parsed === "object") {
        Object.entries(parsed).forEach(([uname, cfg]) => {
          if (!uname || !cfg) return;
          if (typeof cfg === "string") {
            accounts.push({ username: uname.trim().toLowerCase(), password: cfg, role: "root" });
          } else if (cfg.password) {
            accounts.push({
              username: uname.trim().toLowerCase(),
              password: String(cfg.password),
              role: String(cfg.role || "manager").trim() || "manager"
            });
          }
        });
      }
    } catch (_) {}
  }

  if (process.env.ADMIN_ROOT_USER && process.env.ADMIN_ROOT_PASS) {
    accounts.push({
      username: String(process.env.ADMIN_ROOT_USER).trim().toLowerCase(),
      password: String(process.env.ADMIN_ROOT_PASS),
      role: "root"
    });
  }

  if (process.env.ADMIN_LEGACY_USER && process.env.ADMIN_LEGACY_PASS) {
    accounts.push({
      username: String(process.env.ADMIN_LEGACY_USER).trim().toLowerCase(),
      password: String(process.env.ADMIN_LEGACY_PASS),
      role: "root"
    });
  }

  if (process.env.ADMIN_MANAGER_ACCOUNTS) {
    String(process.env.ADMIN_MANAGER_ACCOUNTS)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((pair) => {
        const idx = pair.indexOf(":");
        if (idx > 0) {
          const u = pair.slice(0, idx).trim().toLowerCase();
          const p = pair.slice(idx + 1);
          if (u && p) accounts.push({ username: u, password: p, role: "manager" });
        }
      });
  }

  return accounts;
}

async function fetchFirebaseAdminUser(safeKey) {
  const authSuffix = process.env.FIREBASE_AUTH_SECRET
    ? `?auth=${encodeURIComponent(process.env.FIREBASE_AUTH_SECRET)}`
    : "";
  const url = `${FIREBASE_DB_ROOT}/admin_users/${encodeURIComponent(safeKey)}.json${authSuffix}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const resp = await fetch(url, { method: "GET", signal: ctrl.signal });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data && typeof data === "object" ? data : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method === "GET") {
    const envAccounts = loadEnvAdminAccounts();
    return res.status(200).json({
      service: "BAL_ADMIN_AUTH",
      envAccountsConfigured: envAccounts.length > 0
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const body = await readJsonBody(req);
    const mode = String(body.mode || "login").trim();
    const envAccounts = loadEnvAdminAccounts();

    if (mode === "verify_root_pin") {
      const pin = String(body.pin || body.password || "");
      if (!pin) return res.status(400).json({ ok: false, error: "Thiếu mật khẩu xác nhận Chủ quán!" });
      for (const acc of envAccounts) {
        if (acc.role === "root" && safeTimingEqual(pin, acc.password)) {
          return res.status(200).json({ ok: true, role: "root", source: "vercel_env" });
        }
      }
      return res.status(401).json({ ok: false, error: "Không đúng mật khẩu Chủ quán!" });
    }

    const rawUser = String(body.username || body.user || "").trim();
    const lowerUser = rawUser.toLowerCase();
    const pass = String(body.password || "");

    if (!lowerUser || !pass) {
      return res.status(400).json({ ok: false, error: "Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu!" });
    }

    for (const acc of envAccounts) {
      if (acc.username === lowerUser && safeTimingEqual(pass, acc.password)) {
        return res.status(200).json({
          ok: true,
          user: lowerUser,
          role: acc.role || "manager",
          source: "vercel_env"
        });
      }
    }

    const safeKey = sanitizeUserKey(rawUser);
    if (safeKey) {
      const dbUser = await fetchFirebaseAdminUser(safeKey);
      if (dbUser && dbUser.password && String(dbUser.password).trim() !== "" && safeTimingEqual(pass, String(dbUser.password))) {
        return res.status(200).json({
          ok: true,
          user: dbUser.originalName || rawUser,
          role: dbUser.role || "cashier",
          source: "admin_users"
        });
      }
    }

    return res.status(401).json({ ok: false, error: "Sai tên đăng nhập hoặc mật khẩu!" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Lỗi xác thực máy chủ!", detail: err.message });
  }
};
