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

function generateUnifiedOrderId(nowMs, station) {
  const cleanStation = String(station || "QUAN_280").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "") || "QUAN_280";
  const rand5 = Math.floor(10000 + Math.random() * 90000);
  return `ORD-Z-${nowMs}-${cleanStation}-${rand5}`;
}

async function writeFirebaseOrderWithKey(relPath, orderId, orderData) {
  const authSuffix = process.env.FIREBASE_AUTH_SECRET ? `?auth=${encodeURIComponent(process.env.FIREBASE_AUTH_SECRET)}` : "";
  const url = `${FIREBASE_DB_ROOT}/${relPath}/${encodeURIComponent(orderId)}.json${authSuffix}`;
  const resp = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(orderData)
  });
  if (!resp.ok) {
    throw new Error(`Firebase PUT ${relPath}/${orderId} failed: HTTP ${resp.status}`);
  }
  await resp.json();
  return orderId;
}

async function notifyTelegramNewOrder(orderId, order) {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!botToken || !chatId || !order) return false;

  const shortId = `#HC-${String(orderId || "").slice(-5).toUpperCase()}`;
  const station = order.station || order.branch_id || "QUAN_280";
  const itemsObj = order.items && typeof order.items === "object" ? order.items : {};
  const itemLines = Object.values(itemsObj)
    .filter(Boolean)
    .map((it) => `- ${Number(it.qty || 1)}x ${String(it.name || "Món")} (${(Number(it.price || 0) * Number(it.qty || 1)).toLocaleString("vi-VN")}đ)`)
    .join("\n");

  const subtotal = Number(order.subtotal || 0);
  const shipFee = Number(order.shippingFee || 0);
  const grandTotal = Number(order.grandTotal || (subtotal + shipFee));
  const payStr = `${order.paymentMethod || "COD"} (${order.paymentStatus || "Thu tiền mặt"})`;
  const msg = [
    `🔔 ĐƠN HÀNG MỚI ${shortId} [${station}]`,
    `👤 Khách: ${order.customerName || "Khách"}`,
    `📞 SĐT: ${order.phone || "--"}`,
    `📍 Địa chỉ: ${order.address || order.table || "--"}`,
    `🍲 Món đặt:\n${itemLines || "- (Không có chi tiết)"}`,
    `💵 Tiền món: ${subtotal.toLocaleString("vi-VN")}đ | Ship thu hộ: ${shipFee.toLocaleString("vi-VN")}đ`,
    `💰 Tổng thu: ${grandTotal.toLocaleString("vi-VN")}đ`,
    `💳 Hình thức TT: ${payStr}`,
    order.note ? `📝 Ghi chú: ${order.note}` : ""
  ].filter(Boolean).join("\n");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3500);
  try {
    const resp = await fetch(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        chat_id: chatId,
        text: msg,
        disable_web_page_preview: true
      })
    });
    clearTimeout(timer);
    return resp.ok;
  } catch (err) {
    clearTimeout(timer);
    console.warn("Telegram notify warning:", err?.message || err);
    return false;
  }
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
  const [yy, mm, dd] = todayVN.split("-").map((v) => parseInt(v, 10));
  const ymStr = `${yy}-${String(mm).padStart(2, "0")}`;
  const prevY = mm === 1 ? yy - 1 : yy;
  const prevM = mm === 1 ? 12 : mm - 1;
  const prevYmStr = `${prevY}-${String(prevM).padStart(2, "0")}`;
  const baseMs = Date.now();
  const todayStartMs = Date.parse(`${todayVN}T00:00:00.000+07:00`);

  const pushSeed = (i, createdAt) => {
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
  };

  // 15 đơn thuộc tháng trước (phục vụ kiểm thử khoảng nhiều ngày / 60 ngày, không cộng nhầm vào tháng hiện tại)
  for (let i = 1; i <= 15; i++) {
    const prevDay = String(10 + (i % 15)).padStart(2, "0");
    const createdAt = new Date(`${prevYmStr}-${prevDay}T12:00:00.000+07:00`).toISOString();
    pushSeed(i, createdAt);
  }

  // 55 đơn rải các ngày trước trong CÙNG tháng hiện tại (+07:00)
  for (let j = 0; j < 55; j++) {
    const idx = 16 + j;
    let createdAt;
    if (dd > 1) {
      const targetDay = String(1 + (j % (dd - 1))).padStart(2, "0");
      createdAt = new Date(`${ymStr}-${targetDay}T12:${String(j % 60).padStart(2, "0")}:00.000+07:00`).toISOString();
    } else {
      createdAt = new Date(todayStartMs + (j + 1) * 60000).toISOString();
    }
    pushSeed(idx, createdAt);
  }

  // 110 đơn ngày hôm nay (+07:00) => Tổng tháng hiện tại = 55 + 110 = 165 đơn (> 150)
  for (let k = 0; k < 110; k++) {
    const idx = 71 + k;
    const tsMs = Math.max(todayStartMs, baseMs - (110 - k) * 1000);
    pushSeed(idx, new Date(tsMs).toISOString());
  }
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
        const obj = await readFirebaseJson(DB_AUDIT_PATH, `orderBy=%22timestamp%22&limitToLast=${MAX_LIMIT}`);
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
          // Kiểm tra thêm trong 100 bản ghi cuối theo $key (ORD-Z- đảm bảo xếp cuối theo thời gian)
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

        const latVal = body.deliveryLat !== undefined && body.deliveryLat !== null && body.deliveryLat !== "" && Number.isFinite(Number(body.deliveryLat)) && Number(body.deliveryLat) !== 0
          ? Number(body.deliveryLat)
          : null;
        const lngVal = body.deliveryLng !== undefined && body.deliveryLng !== null && body.deliveryLng !== "" && Number.isFinite(Number(body.deliveryLng)) && Number(body.deliveryLng) !== 0
          ? Number(body.deliveryLng)
          : null;
        const newOrder = {
          ...body,
          station: body.station || "QUAN_280",
          branch_id: body.branch_id || body.station || "QUAN_280",
          deliveryLat: latVal,
          deliveryLng: lngVal,
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
          orderId = generateUnifiedOrderId(nowMs, newOrder.station);
          await writeFirebaseOrderWithKey(DB_ORDERS_PATH, orderId, newOrder);
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
        if (!sandboxMode && !result.deduplicatedFromDb) {
          await notifyTelegramNewOrder(result.orderId, result.order);
        }
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
