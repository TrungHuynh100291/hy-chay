/**
 * BAO ANH LAM - ORDER IDEMPOTENCY & MAX_LIMIT API GUARD (HY CHAY)
 * - Chống đơn trùng 2 lớp (10 phút client_request_id + 30 giây SĐT+tổng tiền+món + khóa đồng thời).
 * - Khóa trần truy vấn danh sách (default_limit = 50, max_limit = 100, mặc định hôm nay +07:00 VN).
 * - Ngoại lệ cho Báo cáo Thuế HTKK v5.7.8: lọc from_date..to_date tối đa 92 ngày/lần xuất, giữ nguyên 100% số liệu 5610/5630/ship.
 */

const FIREBASE_DB_ROOT = "https://hy-chay-default-rtdb.asia-southeast1.firebasedatabase.app";
const DB_ORDERS_PATH = "orders";
const DB_AUDIT_PATH = "audit_logs";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const REQ_ID_TTL_MS = 10 * 60 * 1000; // 10 phút
const SIG_TTL_MS = 30 * 1000;         // 30 giây
const MAX_TAX_DAYS = 92;

// Cache lưu trạng thái trong phiên runtime + hỗ trợ sandbox kiểm thử cục bộ (không ghi rác Production)
const liveRecentByReqId = new Map();
const liveRecentBySig = new Map();
const inflightByReqId = new Map();
const inflightBySig = new Map();
const sandboxOrdersStore = [];

function normalizePhone(phone) {
  return String(phone || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/^\+84/, "0")
    .replace(/[^0-9]/g, "");
}

function canonicalItems(items) {
  if (!items || typeof items !== "object") return "[]";
  const list = Array.isArray(items)
    ? items.map((it) => ({
        id: it?.id || "",
        name: String(it?.name || "").trim(),
        qty: Number(it?.qty || 0),
        price: Number(it?.price || 0)
      }))
    : Object.keys(items)
        .sort()
        .map((k) => ({
          k,
          name: String(items[k]?.name || "").trim(),
          qty: Number(items[k]?.qty || 0),
          price: Number(items[k]?.price || 0)
        }));
  list.sort((a, b) => (a.name || a.k || "").localeCompare(b.name || b.k || ""));
  return JSON.stringify(list);
}

function computeSignature(body) {
  const phone = normalizePhone(body.phone || body.customerPhone || "");
  const total = Math.round(Number(body.grandTotal ?? body.subtotal ?? 0));
  const itemsStr = canonicalItems(body.items);
  return `${phone}|${total}|${itemsStr}`;
}

function getVNDateStr(isoOrMs) {
  const d = isoOrMs ? new Date(isoOrMs) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const vnMs = d.getTime() + 7 * 60 * 60 * 1000;
  return new Date(vnMs).toISOString().slice(0, 10);
}

function clampLimit(rawLimit) {
  if (rawLimit === undefined || rawLimit === null || rawLimit === "") return DEFAULT_LIMIT;
  const parsed = Number.parseInt(String(rawLimit), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_LIMIT) return MAX_LIMIT;
  return parsed;
}

function pruneMap(map, ttlMs, nowMs) {
  for (const [k, entry] of map.entries()) {
    if (nowMs - entry.storedAt > ttlMs) map.delete(k);
  }
}

function parseDateYmd(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(str || "").trim())) return null;
  const d = new Date(`${str}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function readFirebaseJson(relPath, queryParams = "") {
  const authSuffix = process.env.FIREBASE_AUTH_SECRET ? `auth=${encodeURIComponent(process.env.FIREBASE_AUTH_SECRET)}` : "";
  const qs = [queryParams, authSuffix].filter(Boolean).join("&");
  const url = `${FIREBASE_DB_ROOT}/${relPath}.json${qs ? "?" + qs : ""}`;
  const resp = await fetch(url, { method: "GET" });
  if (!resp.ok) {
    throw new Error(`Firebase GET ${relPath} failed: HTTP ${resp.status}`);
  }
  return (await resp.json()) || {};
}

async function writeFirebaseOrder(relPath, orderData) {
  const authSuffix = process.env.FIREBASE_AUTH_SECRET ? `?auth=${encodeURIComponent(process.env.FIREBASE_AUTH_SECRET)}` : "";
  const url = `${FIREBASE_DB_ROOT}/${relPath}.json${authSuffix}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(orderData)
  });
  if (!resp.ok) {
    throw new Error(`Firebase POST ${relPath} failed: HTTP ${resp.status}`);
  }
  const data = await resp.json();
  return data.name;
}

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

function seedSandboxOrdersIfEmpty() {
  if (sandboxOrdersStore.length > 0) return;
  const todayVN = getVNDateStr();
  const baseMs = Date.now();
  for (let i = 1; i <= 140; i++) {
    const isToday = i > 35;
    const createdAt = isToday
      ? new Date(baseMs - (140 - i) * 1000).toISOString()
      : new Date(baseMs - (10 + i) * 86400000).toISOString();
    sandboxOrdersStore.push({
      id: `-SANDBOX-HC-${String(i).padStart(4, "0")}`,
      orderType: "delivery",
      customerName: `Khách kiểm thử #${i}`,
      phone: `0903242${String(100 + (i % 899)).padStart(3, "0")}`,
      items: {
        bun_thai: { name: "Bún Thái Chay", price: 35000, qty: 1 },
        tra_sua: { name: "Cafe Muối BAL'S HOUSE", price: 25000, qty: 1, cat: "douong" }
      },
      subtotal: 60000,
      shippingFee: 15000,
      grandTotal: 75000,
      status: "Đã hoàn tất",
      createdAt,
      vnDate: getVNDateStr(createdAt),
      client_request_id: `seed-hc-${i}`,
      sandbox: true
    });
  }
  void todayVN;
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  const reqUrl = new URL(req.url || "/api/orders", "http://localhost");
  const isSandbox = req.headers["x-bal-test-mode"] === "sandbox" || reqUrl.searchParams.get("sandbox") === "1";

  if (req.method === "GET") {
    try {
      const mode = String(reqUrl.searchParams.get("mode") || "ops").trim();
      const target = String(reqUrl.searchParams.get("target") || "orders").trim();

      // Ngoại lệ cho Báo cáo Thuế HTKK / Đối soát: cho phép xuất đủ dữ liệu trong kỳ <= 92 ngày
      if (mode === "tax_htkk" || mode === "reconcile") {
        const fromDateStr = reqUrl.searchParams.get("from_date") || "";
        const toDateStr = reqUrl.searchParams.get("to_date") || "";
        const fromD = parseDateYmd(fromDateStr);
        const toD = parseDateYmd(toDateStr);
        if (!fromD || !toD) {
          return res.status(400).json({
            error: "Bắt buộc truyền from_date và to_date định dạng YYYY-MM-DD cho báo cáo thuế/đối soát."
          });
        }
        const spanDays = Math.floor((toD.getTime() - fromD.getTime()) / 86400000) + 1;
        if (spanDays < 1 || spanDays > MAX_TAX_DAYS) {
          return res.status(400).json({
            error: `Khoảng ngày xuất thuế không hợp lệ (${spanDays} ngày). Tối đa ${MAX_TAX_DAYS} ngày/lần xuất.`,
            maxDays: MAX_TAX_DAYS
          });
        }

        let allOrders = [];
        if (isSandbox) {
          seedSandboxOrdersIfEmpty();
          allOrders = sandboxOrdersStore.slice();
        } else {
          const obj = await readFirebaseJson(DB_ORDERS_PATH);
          allOrders = Object.keys(obj).map((id) => ({ id, ...obj[id] }));
        }

        const matched = allOrders.filter((o) => {
          if (!o || !o.createdAt) return false;
          const vnD = getVNDateStr(o.createdAt);
          return vnD >= fromDateStr && vnD <= toDateStr;
        });
        matched.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return res.status(200).json({
          mode,
          from_date: fromDateStr,
          to_date: toDateStr,
          spanDays,
          maxDays: MAX_TAX_DAYS,
          count: matched.length,
          orders: matched
        });
      }

      // Luồng vận hành hằng ngày (Khóa trần default=50, max=100, mặc định chỉ ngày hôm nay +07:00 VN)
      const requestedLimit = reqUrl.searchParams.get("limit");
      const appliedLimit = clampLimit(requestedLimit);
      const scope = String(reqUrl.searchParams.get("scope") || "today_vn").trim();
      const todayVN = getVNDateStr();

      let rows = [];
      if (isSandbox) {
        seedSandboxOrdersIfEmpty();
        rows = sandboxOrdersStore.slice();
      } else if (target === "audit_logs") {
        const obj = await readFirebaseJson(DB_AUDIT_PATH, `orderBy=%22%24key%22&limitToLast=${MAX_LIMIT}`);
        rows = Object.keys(obj).map((id) => ({ id, ...obj[id] }));
      } else {
        const obj = await readFirebaseJson(DB_ORDERS_PATH, `orderBy=%22%24key%22&limitToLast=${MAX_LIMIT}`);
        rows = Object.keys(obj).map((id) => ({ id, ...obj[id] }));
      }

      rows.sort((a, b) => new Date(b.createdAt || b.timestamp || 0) - new Date(a.createdAt || a.timestamp || 0));
      if (scope === "today_vn" && target !== "audit_logs") {
        rows = rows.filter((r) => r && r.createdAt && getVNDateStr(r.createdAt) === todayVN);
      }
      const sliced = rows.slice(0, appliedLimit);

      return res.status(200).json({
        mode: "ops",
        target,
        scope,
        todayVN,
        defaultLimit: DEFAULT_LIMIT,
        maxLimit: MAX_LIMIT,
        requestedLimit: requestedLimit ? Number(requestedLimit) : null,
        appliedLimit,
        count: sliced.length,
        items: sliced
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const sandboxMode = isSandbox || Boolean(body.sandbox);
      const nowMs = Date.now();
      pruneMap(liveRecentByReqId, REQ_ID_TTL_MS, nowMs);
      pruneMap(liveRecentBySig, SIG_TTL_MS, nowMs);

      const clientRequestId = String(body.client_request_id || body.clientRequestId || "").trim();
      if (!clientRequestId) {
        return res.status(400).json({ error: "Thiếu client_request_id (UUID v4) để chống trùng đơn." });
      }
      const signature = computeSignature(body);

      // Lớp 1A: Kiểm tra giao dịch trùng client_request_id trong vòng 10 phút
      if (liveRecentByReqId.has(clientRequestId)) {
        const existing = liveRecentByReqId.get(clientRequestId);
        return res.status(200).json({
          ok: true,
          deduplicated: true,
          reason: "client_request_id_10m",
          orderId: existing.orderId,
          order: existing.order
        });
      }
      // Lớp 1B: Kiểm tra trùng SĐT + Tổng tiền + Món trong vòng 30 giây
      if (liveRecentBySig.has(signature)) {
        const existing = liveRecentBySig.get(signature);
        return res.status(200).json({
          ok: true,
          deduplicated: true,
          reason: "signature_30s",
          orderId: existing.orderId,
          order: existing.order
        });
      }

      // Khóa đồng thời (chặn 3 request song song trong cùng 1 mili-giây)
      if (inflightByReqId.has(clientRequestId)) {
        const created = await inflightByReqId.get(clientRequestId);
        return res.status(200).json({
          ok: true,
          deduplicated: true,
          reason: "concurrent_client_request_id",
          orderId: created.orderId,
          order: created.order
        });
      }
      if (inflightBySig.has(signature)) {
        const created = await inflightBySig.get(signature);
        return res.status(200).json({
          ok: true,
          deduplicated: true,
          reason: "concurrent_signature_30s",
          orderId: created.orderId,
          order: created.order
        });
      }

      const workPromise = (async () => {
        if (!sandboxMode) {
          // Kiểm tra thêm trong 100 bản ghi gần nhất trên Firebase RTDB (phòng trường hợp serverless cold start)
          const recentSnap = await readFirebaseJson(DB_ORDERS_PATH, `orderBy=%22%24key%22&limitToLast=${MAX_LIMIT}`);
          for (const [oid, existingOrd] of Object.entries(recentSnap)) {
            if (!existingOrd || !existingOrd.createdAt) continue;
            const ageMs = nowMs - new Date(existingOrd.createdAt).getTime();
            if (ageMs <= REQ_ID_TTL_MS && existingOrd.client_request_id && existingOrd.client_request_id === clientRequestId) {
              const hit = { orderId: oid, order: existingOrd, storedAt: nowMs, deduplicatedFromDb: true };
              liveRecentByReqId.set(clientRequestId, hit);
              liveRecentBySig.set(signature, hit);
              return hit;
            }
            if (ageMs >= 0 && ageMs <= SIG_TTL_MS && computeSignature(existingOrd) === signature) {
              const hit = { orderId: oid, order: existingOrd, storedAt: nowMs, deduplicatedFromDb: true };
              liveRecentByReqId.set(clientRequestId, hit);
              liveRecentBySig.set(signature, hit);
              return hit;
            }
          }
        }

        const newOrder = {
          ...body,
          sandbox: sandboxMode,
          client_request_id: clientRequestId,
          createdAt: body.createdAt || new Date(nowMs).toISOString()
        };

        let orderId;
        if (sandboxMode) {
          seedSandboxOrdersIfEmpty();
          orderId = `-SBX-HC-${nowMs}-${Math.floor(100 + Math.random() * 900)}`;
          sandboxOrdersStore.push({ id: orderId, ...newOrder });
        } else {
          orderId = await writeFirebaseOrder(DB_ORDERS_PATH, newOrder);
        }

        const created = { orderId, order: newOrder, storedAt: nowMs, deduplicatedFromDb: false };
        liveRecentByReqId.set(clientRequestId, created);
        liveRecentBySig.set(signature, created);
        return created;
      })();

      inflightByReqId.set(clientRequestId, workPromise);
      inflightBySig.set(signature, workPromise);

      try {
        const result = await workPromise;
        return res.status(result.deduplicatedFromDb ? 200 : 201).json({
          ok: true,
          deduplicated: Boolean(result.deduplicatedFromDb),
          reason: result.deduplicatedFromDb ? "firebase_recent_match" : "created",
          orderId: result.orderId,
          order: result.order
        });
      } finally {
        inflightByReqId.delete(clientRequestId);
        inflightBySig.delete(signature);
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method Not Allowed" });
};
