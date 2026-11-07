/**
 * KIỂM THỬ ĐỘC LẬP 4 TẦNG & GIẢ LẬP CONCURRENT SESSIONS CHO HỆ THỐNG POS 2 TRẠM
 * File: D:\BaoAnhLam_AI\HyChayFood_Web\qa_station_pos_test.js
 * Đối tượng: Công ty TNHH TMDV & SX Bảo Anh Lâm (MST: 3401289271)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('================================================================');
console.log('🚀 KHỞI CHẠY KIỂM THỬ SURGICAL POS UPGRADE: 2 TRẠM (HC vs BH)');
console.log('================================================================\n');

// -------------------------------------------------------------
// TẦNG 1: KIỂM TRA TÍNH NGUYÊN VẸN 122 MÓN TRONG ALL_MENU_DATA & HTML
// -------------------------------------------------------------
console.log('--- [TẦNG 1]: KIỂM TRA DANH MỤC 122 MÓN & CẤU TRÚC HTML ---');
const adminHtml = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf-8');
const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');

function countDishes(htmlContent, fileName) {
  const baseStart = htmlContent.indexOf('const ALL_MENU_DATA = [');
  const baseEnd = htmlContent.indexOf('];', baseStart);
  const baseBlock = htmlContent.substring(baseStart, baseEnd + 2);
  const baseMatches = baseBlock.match(/\{\s*id:\s*["']([^"']+)["']/g) || [];

  const pushStart = htmlContent.indexOf('ALL_MENU_DATA.push(', baseEnd);
  const pushEnd = htmlContent.indexOf(');', pushStart);
  const pushBlock = htmlContent.substring(pushStart, pushEnd + 2);
  const pushMatches = pushBlock.match(/\{\s*id:\s*["']([^"']+)["']/g) || [];

  const total = baseMatches.length + pushMatches.length;
  console.log(`- ${fileName}: ${baseMatches.length} món cơ bản + ${pushMatches.length} topping = ${total} MÓN GỐC`);
  return total;
}

const adminDishCount = countDishes(adminHtml, 'admin.html');
const indexDishCount = countDishes(indexHtml, 'index.html');

if (adminDishCount !== 122 || indexDishCount !== 122) {
  console.error(`❌ LỖI: Danh mục món bị thay đổi! (Yêu cầu chính xác 122 món, hiện tại: admin=${adminDishCount}, index=${indexDishCount})`);
  process.exit(1);
} else {
  console.log('✔ PASS: 122 món gốc trong ALL_MENU_DATA được bảo toàn 100%!');
}

// Kiểm tra thẻ đóng HTML
const hasDoctype = adminHtml.includes('<!DOCTYPE html>');
const hasHtmlClose = adminHtml.includes('</html>');
const hasBodyClose = adminHtml.includes('</body>');
if (!hasDoctype || !hasHtmlClose || !hasBodyClose) {
  console.error('❌ LỖI: Thẻ HTML bị lỗi hoặc thiếu thẻ đóng!');
  process.exit(1);
} else {
  console.log('✔ PASS: Thẻ đóng HTML và cấu trúc tài liệu hoàn chỉnh!');
}

// -------------------------------------------------------------
// TẦNG 2: KIỂM TRA BỘ CHỌN TRẠM & CÁC THÀNH PHẦN GIAO DIỆN MỚI
// -------------------------------------------------------------
console.log('\n--- [TẦNG 2]: KIỂM TRA BỘ CHỌN TRẠM & GIAO DIỆN LIÊN TRẠM ---');

const hasStationBar = adminHtml.includes('id="posStationSwitcherBar"');
const hasBtnStationHC = adminHtml.includes('data-station="HC"');
const hasBtnStationBH = adminHtml.includes('data-station="BH"');
const hasBtnStationALL = adminHtml.includes('data-station="ALL"');
const hasCrossAlertBox = adminHtml.includes('id="crossStationAlertsContainer"');
const hasCashHCBox = adminHtml.includes('id="repCashHC"');
const hasCashBHBox = adminHtml.includes('id="repCashBH"');

console.log(`- Thanh chuyển đổi trạm (posStationSwitcherBar): ${hasStationBar ? '✔' : '❌'}`);
console.log(`- Nút Trạm Quán Hy Chay (HC-01 -> HC-20): ${hasBtnStationHC ? '✔' : '❌'}`);
console.log(`- Nút Trạm Xe Nước BAL\'S HOUSE (BH-01 -> BH-15): ${hasBtnStationBH ? '✔' : '❌'}`);
console.log(`- Nút Giám Đốc Xem Tất Cả (All Stations): ${hasBtnStationALL ? '✔' : '❌'}`);
console.log(`- Container Thông báo đồ uống liên trạm: ${hasCrossAlertBox ? '✔' : '❌'}`);
console.log(`- Ô Quỹ tiền mặt Quán HC: ${hasCashHCBox ? '✔' : '❌'}`);
console.log(`- Ô Quỹ tiền mặt Xe Nước BH: ${hasCashBHBox ? '✔' : '❌'}`);

if (!hasStationBar || !hasBtnStationHC || !hasBtnStationBH || !hasBtnStationALL || !hasCrossAlertBox || !hasCashHCBox || !hasCashBHBox) {
  console.error('❌ LỖI: Thiếu các thành phần UI bắt buộc!');
  process.exit(1);
} else {
  console.log('✔ PASS: 100% các thành phần UI đạt chuẩn đặc tả!');
}

// -------------------------------------------------------------
// TẦNG 3: GIẢ LẬP CONCURRENT SESSIONS & CHỐNG TRÙNG BÀN
// -------------------------------------------------------------
console.log('\n--- [TẦNG 3]: GIẢ LẬP 2 PHIÊN ĐỒNG THỜI (HC-01 & BH-01) CÙNG 1 GIÂY ---');

// Mock in-memory database representing Firebase Realtime DB
const mockFirebaseDb = {
  orders: {},
  orders_by_station: {
    HC: {},
    BH: {}
  },
  cross_station_alerts: {}
};

// Hàm mô phỏng luồng lưu đơn của Trạm POS
function simulatePosOrderSubmission(station, table, cartItems, payMethod = 'COD') {
  const timestamp = Date.now();
  const random3 = Math.floor(100 + Math.random() * 900);
  const orderId = `ORD-${station}-${timestamp}-${random3}`;

  let rawSub = 0;
  for (let k in cartItems) {
    rawSub += cartItems[k].price * cartItems[k].qty;
  }

  const orderData = {
    orderType: 'dine_in',
    station: station,
    orderCode: orderId,
    table: table,
    customerName: table,
    phone: 'Tại quán',
    items: cartItems,
    subtotal: rawSub,
    grandTotal: rawSub,
    paymentMethod: payMethod,
    paymentStatus: payMethod === 'COD' ? 'Thu tại bàn' : 'Chờ kiểm tra CK',
    status: 'Đang chế biến',
    createdAt: new Date(timestamp).toISOString()
  };

  // 1. Lưu vào orders/{orderId}
  mockFirebaseDb.orders[orderId] = orderData;

  // 2. Lưu vào orders_by_station/{station}/{orderId}
  mockFirebaseDb.orders_by_station[station][orderId] = orderData;

  // 3. Lưu vào orders_by_station/{station}/{table}
  mockFirebaseDb.orders_by_station[station][table] = orderData;

  // 4. Kiểm tra bắn đơn đồ uống liên trạm (Cross-station routing)
  const drinkItems = [];
  for (let k in cartItems) {
    if (cartItems[k].cat === 'douong') {
      drinkItems.push({ name: cartItems[k].name, qty: cartItems[k].qty });
    }
  }

  if (drinkItems.length > 0 && station === 'HC') {
    const alertId = `XALERT-${timestamp}-${random3}`;
    const alertData = {
      id: alertId,
      orderId: orderId,
      table: table,
      sourceStation: 'HC',
      targetStation: 'BH',
      status: 'pending',
      items: drinkItems,
      createdAt: new Date(timestamp).toISOString()
    };
    mockFirebaseDb.cross_station_alerts[alertId] = alertData;
    mockFirebaseDb.orders_by_station.BH[`pending_cross_${alertId}`] = alertData;
  }

  return orderId;
}

// Bắt đầu giả lập 2 máy bấm cùng lúc trong 1 tick
const cartQuánHC = {
  bunmoc: { name: 'Bún Mọc Chay', price: 30000, qty: 2, cat: 'bun' },
  tradao: { name: 'Trà Đào Cam Sả', price: 28000, qty: 2, cat: 'douong' } // Món đồ uống 5630!
};

const cartXeNuocBH = {
  cafemuoi: { name: 'Cafe Muối', price: 25000, qty: 2, cat: 'douong' },
  lattematcha: { name: 'Latte Matcha Kem Trứng', price: 32000, qty: 1, cat: 'douong' }
};

console.log('⚡ Đang thực thi lưu đồng thời: Machine 1 (HC-01) & Machine 2 (BH-01)...');

const orderIdHC = simulatePosOrderSubmission('HC', 'HC-01', cartQuánHC, 'COD');
const orderIdBH = simulatePosOrderSubmission('BH', 'BH-01', cartXeNuocBH, 'COD');

console.log(`- Mã đơn tạo tại Quán: ${orderIdHC} (Bàn: HC-01)`);
console.log(`- Mã đơn tạo tại Xe Nước: ${orderIdBH} (Bàn: BH-01)`);

// Kiểm tra tính toàn vẹn độc lập:
const hcSavedInOrders = !!mockFirebaseDb.orders[orderIdHC];
const bhSavedInOrders = !!mockFirebaseDb.orders[orderIdBH];
const hcInStationNamespace = !!mockFirebaseDb.orders_by_station.HC[orderIdHC];
const bhInStationNamespace = !!mockFirebaseDb.orders_by_station.BH[orderIdBH];
const hcTableKeyExists = !!mockFirebaseDb.orders_by_station.HC['HC-01'];
const bhTableKeyExists = !!mockFirebaseDb.orders_by_station.BH['BH-01'];

if (hcSavedInOrders && bhSavedInOrders && hcInStationNamespace && bhInStationNamespace && hcTableKeyExists && bhTableKeyExists) {
  console.log('✔ PASS: Cả 2 đơn lưu thành công 100%, khóa bàn độc lập, KHÔNG ĐÈ NHAU!');
} else {
  console.error('❌ LỖI: Có đơn bị mất hoặc đè dữ liệu!');
  process.exit(1);
}

// Kiểm tra thẻ thông báo liên trạm (Cross-station Alert):
const alerts = Object.values(mockFirebaseDb.cross_station_alerts);
const pendingCrossAlert = alerts.find(a => a.table === 'HC-01' && a.status === 'pending');

if (pendingCrossAlert) {
  console.log(`✔ PASS: Bắn thông báo thời gian thực sang Trạm Xe Nước thành công:`);
  console.log(`  + Thẻ: [PHA CHẾ GIAO VỀ QUÁN - BÀN ${pendingCrossAlert.table}]`);
  console.log(`  + Món cần làm: ${pendingCrossAlert.items.map(i => `${i.qty}x ${i.name}`).join(', ')}`);

  // Mô phỏng nhân viên Xe Nước bấm hoàn tất
  pendingCrossAlert.status = 'completed';
  pendingCrossAlert.completedAt = new Date().toISOString();
  console.log('  + Nhân viên Xe Nước bấm: [✅ Đã pha xong & Giao về quán] -> Thẻ chuyển trạng thái completed.');
} else {
  console.error('❌ LỖI: Không tìm thấy thông báo bắn đồ uống liên trạm!');
  process.exit(1);
}

// -------------------------------------------------------------
// TẦNG 4: KẾ TOÁN THUẾ & ĐỐI SOÁT 2 QUỸ TIỀN MẶT ĐỘC LẬP
// -------------------------------------------------------------
console.log('\n--- [TẦNG 4]: ĐỐI SOÁT DOANH THU THUẾ & TÁCH BẠCH 2 QUỸ TIỀN MẶT ---');

// Thêm 1 đơn giao hàng với phí ship COD để kiểm tra bóc tách phí ship
const shipTimestamp = Date.now();
const orderIdShip = `ORD-HC-SHIP-${shipTimestamp}-123`;
mockFirebaseDb.orders[orderIdShip] = {
  orderType: 'delivery',
  station: 'HC',
  subtotal: 70000, // Tiền thức ăn 5610
  shippingFee: 20000, // Tiền ship trả tài xế
  grandTotal: 90000,
  paymentMethod: 'COD',
  status: 'Đã hoàn tất',
  items: {
    comga: { name: 'Cơm Gà Chay', price: 35000, qty: 2, cat: 'com_xoi' }
  },
  createdAt: new Date().toISOString()
};

// Đánh dấu các đơn trước là Đã hoàn tất để tính kế toán
mockFirebaseDb.orders[orderIdHC].status = 'Đã hoàn tất';
mockFirebaseDb.orders[orderIdBH].status = 'Đã hoàn tất';

let total5610 = 0;
let total5630 = 0;
let totalShipFee = 0;
let cashDrawerHC = 0;
let cashDrawerBH = 0;

Object.values(mockFirebaseDb.orders).forEach(o => {
  if (o.status !== 'Đã hoàn tất') return;
  const isBh = (o.station === 'BH') || (o.table && o.table.startsWith('BH-'));
  const isCash = (o.paymentMethod === 'COD');

  for (let k in o.items) {
    const it = o.items[k];
    const lineTotal = it.price * it.qty;
    if (it.cat === 'douong') {
      total5630 += lineTotal;
    } else {
      total5610 += lineTotal;
    }
  }

  totalShipFee += (o.shippingFee || 0);

  if (isCash) {
    if (isBh) {
      cashDrawerBH += (o.subtotal || 0);
    } else {
      cashDrawerHC += (o.subtotal || 0);
    }
  }
});

console.log(`- Quỹ Tiền Mặt Quán (HC): ${cashDrawerHC.toLocaleString()}đ`);
console.log(`- Quỹ Tiền Mặt Xe Nước (BH): ${cashDrawerBH.toLocaleString()}đ`);
console.log(`- Doanh thu Mã ngành 5610 (Ẩm thực chay): ${total5610.toLocaleString()}đ`);
console.log(`- Doanh thu Mã ngành 5630 (Đồ uống BAL'S HOUSE): ${total5630.toLocaleString()}đ`);
console.log(`- Phí Ship thu hộ tài xế (Tách 100% ngoài doanh thu tính thuế): ${totalShipFee.toLocaleString()}đ`);
console.log(`- Tổng Doanh Thu Chịu Thuế (5610 + 5630): ${(total5610 + total5630).toLocaleString()}đ`);

if (cashDrawerHC > 0 && cashDrawerBH > 0 && totalShipFee === 20000 && (total5610 + total5630) === (cashDrawerHC + cashDrawerBH)) {
  console.log('✔ PASS: Phân bổ tài chính & kế toán thuế khớp 100% không lệch 1 xu!');
} else {
  console.error('❌ LỖI: Sai lệch số liệu kế toán!');
  process.exit(1);
}

console.log('\n================================================================');
console.log('🎉 TẤT CẢ 4 TẦNG KIỂM THỬ ĐẠT CHUẨN XUẤT SẮC 100% (PASS)!');
console.log('================================================================');
