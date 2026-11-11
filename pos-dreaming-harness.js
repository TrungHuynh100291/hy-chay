window.BAL_POS_HARNESS = (function () {
  // 1. TẦNG BỘ NHỚ TỔ CHỨC (READ-ONLY ORG CONVENTIONS)
  const ORG_CONVENTIONS = Object.freeze({
    companyName: 'CÔNG TY TNHH THƯƠNG MẠI DỊCH VỤ VÀ SẢN XUẤT BẢO ANH LÂM',
    taxCode: '3401289271',
    address: '280 Trần Hưng Đạo, Phường Phan Thiết, Tỉnh Lâm Đồng',
    hotline: '0903 242 400',
    requiredMenuCount: 122,
    taxCategories: {
      hyChayFood: '5610',
      balsHouseDrink: '5630'
    },
    packagingFeeDefault: 3000
  });

  function computeHash(payload) {
    const str = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  // 2. CHỐT CHẶN BẢO VỆ 122 MÓN ĂN GỐC (INTEGRITY GUARD)
  function verifyMenuIntegrity(menuArray) {
    const count = Array.isArray(menuArray) ? menuArray.length : 0;
    return {
      valid: count >= ORG_CONVENTIONS.requiredMenuCount,
      count,
      expected: ORG_CONVENTIONS.requiredMenuCount
    };
  }

  // 3. TÁCH BẠCH DOANH THU CHỊU THUẾ (5610/5630) VÀ PHÍ SHIP THU HỘ TÀI XẾ
  function calculateTaxSeparatedOrder(order) {
    let items = [];
    if (Array.isArray(order?.items)) {
      items = order.items;
    } else if (order?.items && typeof order.items === 'object') {
      items = Object.values(order.items);
    }
    let revenue5610 = 0;
    let revenue5630 = 0;

    for (const item of items) {
      if (!item) continue;
      const lineTotal = (Number(item.price) || 0) * (Number(item.qty || item.quantity) || 1);
      if (item.brand === "BAL'S HOUSE" || item.categoryCode === '5630' || item.cat === 'douong') {
        revenue5630 += lineTotal;
      } else {
        revenue5610 += lineTotal;
      }
    }

    const packagingFee = Number(order?.packagingFee ?? ORG_CONVENTIONS.packagingFeeDefault);
    const taxableSubTotal = revenue5610 + revenue5630 + packagingFee;
    const vatAmount = Math.round(taxableSubTotal * 0.1);
    const driverPassThroughShipFee = Number(order?.shippingFee || 0);

    return {
      revenue5610,
      revenue5630,
      packagingFee,
      taxableSubTotal,
      vatAmount,
      driverPassThroughShipFee,
      grandTotalCustomerPays: taxableSubTotal + vatAmount + driverPassThroughShipFee
    };
  }

  // 4. KHÓA MÃ BĂM CHỐNG 2 TÀI XẾ NHẬN CÙNG 1 ĐƠN (CONCURRENCY HASH PRECONDITION)
  function guardDriverAcceptOrder(currentOrder, shipperPhone, expectedHash) {
    const actualHash = computeHash({
      id: currentOrder?.id,
      status: currentOrder?.status,
      shipper: currentOrder?.hyChayShipperPhone || currentOrder?.shipperPhone || ''
    });

    if (
      (currentOrder?.status !== 'PENDING' && currentOrder?.status !== 'Đang chờ tài xế' && (currentOrder?.hyChayShipperPhone || currentOrder?.shipperPhone)) ||
      (currentOrder?.shipperPhone && currentOrder.shipperPhone !== shipperPhone)
    ) {
      return {
        allowed: false,
        reason: `Đơn hàng đã được tài xế (${currentOrder.hyChayShipperPhone || currentOrder.shipperPhone}) nhận trước đó!`
      };
    }

    if (expectedHash && expectedHash !== actualHash) {
      return {
        allowed: false,
        reason: `Phát hiện xung đột trạng thái đơn (Hash mismatch: ${expectedHash} != ${actualHash}). Vui lòng tải lại đơn mới nhất!`
      };
    }

    const updatedOrder = {
      ...currentOrder,
      status: 'ACCEPTED',
      hyChayShipperPhone: shipperPhone,
      shipperPhone: shipperPhone,
      acceptedAt: new Date().toISOString()
    };
    updatedOrder.stateHash = computeHash({
      id: updatedOrder.id,
      status: updatedOrder.status,
      shipper: updatedOrder.hyChayShipperPhone || updatedOrder.shipperPhone
    });

    return {
      allowed: true,
      updatedOrder
    };
  }

  // 5. QUY TRÌNH "DREAMING" KIỂM TOÁN CUỐI CA (VERIFY • ORGANISE • ENRICH)
  function runEndOfShiftDreaming(ordersList) {
    const orders = Array.isArray(ordersList) ? ordersList : [];
    let total5610 = 0;
    let total5630 = 0;
    let totalPackaging = 0;
    let totalVat = 0;
    let totalShipPassThrough = 0;
    const dishCounter = {};

    for (const ord of orders) {
      if (ord.status === 'CANCELLED' || ord.status === 'Đã hủy') continue;
      const breakdown = calculateTaxSeparatedOrder(ord);
      total5610 += breakdown.revenue5610;
      total5630 += breakdown.revenue5630;
      totalPackaging += breakdown.packagingFee;
      totalVat += breakdown.vatAmount;
      totalShipPassThrough += breakdown.driverPassThroughShipFee;

      let items = [];
      if (Array.isArray(ord?.items)) {
        items = ord.items;
      } else if (ord?.items && typeof ord.items === 'object') {
        items = Object.values(ord.items);
      }

      for (const it of items) {
        if (!it) continue;
        const name = it.name || 'Món ăn';
        dishCounter[name] = (dishCounter[name] || 0) + (Number(it.qty || it.quantity) || 1);
      }
    }

    const topDishes = Object.entries(dishCounter)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([n, c]) => `${n} (${c} phần)`);

    const learnedInsight =
      topDishes.length > 0
        ? `Món bán chạy nhất ca: ${topDishes.join(', ')}. Đề xuất bếp chuẩn bị dư 15% nguyên liệu nhóm này cho ca tiếp theo.`
        : 'Chưa phát sinh đơn hoàn tất trong ca.';

    const dreamRecord = {
      timestamp: new Date().toLocaleString('vi-VN'),
      hash: computeHash({ total5610, total5630, totalShipPassThrough, count: orders.length }),
      taxableRevenue5610: total5610,
      taxableRevenue5630: total5630,
      packagingTotal: totalPackaging,
      vat10Percent: totalVat,
      driverShipPassThrough: totalShipPassThrough,
      learnedInsight
    };

    try {
      const history = JSON.parse(localStorage.getItem('bal_pos_dream_history') || '[]');
      history.unshift(dreamRecord);
      localStorage.setItem('bal_pos_dream_history', JSON.stringify(history.slice(0, 30)));
    } catch {}

    return dreamRecord;
  }

  return {
    ORG_CONVENTIONS,
    computeHash,
    verifyMenuIntegrity,
    calculateTaxSeparatedOrder,
    guardDriverAcceptOrder,
    runEndOfShiftDreaming
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.BAL_POS_HARNESS;
}
