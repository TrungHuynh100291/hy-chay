import os
import re

ADMIN_PATH = r"D:\BaoAnhLam_AI\HyChayFood_Web\admin.html"

with open(ADMIN_PATH, "r", encoding="utf-8") as f:
    content = f.read()

# ----------------------------------------------------------------------
# 1. CSS FOR MODULE 33: POS STATION SWITCHER & CROSS STATION ALERT
# ----------------------------------------------------------------------
css_addition = """
    /* MODULE 33: THANH CHUYEN DOI TRAM POS (QUAN HY CHAY & XE NUOC BAL'S HOUSE) */
    .pos-station-switcher-bar {
      background: linear-gradient(90deg, #0f172a 0%, #1e293b 100%);
      color: #ffffff;
      padding: 10px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      border-bottom: 3px solid #ffd800;
      box-shadow: 0 4px 14px rgba(0,0,0,0.2);
    }
    .station-switcher-group {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .station-badge-title {
      font-size: 0.85rem;
      font-weight: 900;
      color: #ffd800;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .station-btn {
      padding: 8px 16px;
      border-radius: 10px;
      border: 1.5px solid #475569;
      font-weight: 800;
      font-size: 0.84rem;
      cursor: pointer;
      transition: all 0.2s ease;
      background: #1e293b;
      color: #cbd5e1;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .station-btn:hover {
      background: #334155;
      color: #ffffff;
      border-color: #94a3b8;
    }
    .station-btn.active[data-station="HC"] {
      background: #15803d;
      color: #ffffff;
      border-color: #ffd800;
      box-shadow: 0 0 12px rgba(34,197,94,0.45);
    }
    .station-btn.active[data-station="BH"] {
      background: #d97706;
      color: #ffffff;
      border-color: #ffd800;
      box-shadow: 0 0 12px rgba(245,158,11,0.45);
    }
    .station-btn.active[data-station="ALL"] {
      background: #4f46e5;
      color: #ffffff;
      border-color: #ffd800;
      box-shadow: 0 0 12px rgba(99,102,241,0.45);
    }
    .station-current-indicator {
      font-size: 0.84rem;
      padding: 6px 14px;
      border-radius: 8px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.18);
      color: #f8fafc;
      font-weight: 700;
    }
    .cross-station-alert-card {
      background: #fffbeb;
      border: 2px solid #f59e0b;
      border-radius: 12px;
      padding: 14px 18px;
      margin-bottom: 14px;
      box-shadow: 0 4px 16px rgba(245,158,11,0.22);
    }
  </style>"""

if "MODULE 33: THANH CHUYEN DOI TRAM POS" not in content:
    content = content.replace("  </style>", css_addition, 1)
    print("[1] Injected CSS for Station Switcher & Alerts")
else:
    print("[1] CSS already present")

# ----------------------------------------------------------------------
# 2. HTML: STATION SWITCHER BAR BELOW HEADER
# ----------------------------------------------------------------------
html_station_bar = """    </header>

    <!-- ========================================================= -->
    <!-- THANH CHUYỂN ĐỔI NHANH TRẠM LÀM VIỆC (STATION SWITCHER) -->
    <!-- ========================================================= -->
    <div class="pos-station-switcher-bar no-print" id="posStationSwitcherBar">
      <div class="station-switcher-group">
        <span class="station-badge-title">🏢 VỊ TRÍ LÀM VIỆC:</span>
        <button type="button" class="station-btn active" data-station="HC" onclick="setPosStation('HC')">
          🏠 TRẠM QUÁN HY CHAY <small style="opacity:0.85;">(Mã bàn: HC-01 → HC-20)</small>
        </button>
        <button type="button" class="station-btn" data-station="BH" onclick="setPosStation('BH')">
          🧋 TRẠM XE NƯỚC BAL'S HOUSE <small style="opacity:0.85;">(Mã bàn: BH-01 → BH-15)</small>
        </button>
        <button type="button" class="station-btn" data-station="ALL" onclick="setPosStation('ALL')">
          👑 GIÁM ĐỐC XEM TẤT CẢ <small style="opacity:0.85;">(All Stations)</small>
        </button>
      </div>
      <div class="station-current-indicator" id="currentStationBadge">
        Đang trực: <b style="color:#22c55e;">🏠 Trạm Quán Hy Chay (HC-01 → HC-20)</b>
      </div>
    </div>"""

if "posStationSwitcherBar" not in content:
    content = content.replace("    </header>", html_station_bar, 1)
    print("[2] Injected HTML Station Switcher Bar")
else:
    print("[2] HTML Station Switcher Bar already present")

# ----------------------------------------------------------------------
# 3. HTML: CROSS-STATION DRINK ALERTS CONTAINER IN VIEW ORDERS
# ----------------------------------------------------------------------
cross_alerts_html = """        <!-- HỘP THÔNG BÁO PHA CHẾ LIÊN TRẠM (GIAO VỀ XE NƯỚC BAL'S HOUSE) -->
        <div id="crossStationAlertsContainer" class="no-print" style="display:none;"></div>
        <div id="ordersContainer" class="orders-grid"></div>"""

if "crossStationAlertsContainer" not in content:
    content = content.replace('<div id="ordersContainer" class="orders-grid"></div>', cross_alerts_html, 1)
    print("[3] Injected crossStationAlertsContainer")
else:
    print("[3] crossStationAlertsContainer already present")

# ----------------------------------------------------------------------
# 4. HTML: SEPARATE CASH DRAWERS (QUÁN HC vs XE NƯỚC BH) IN SHIFT REPORT
# ----------------------------------------------------------------------
shift_report_old = """          <!-- 5 Ô CHỈ SỐ TÀI CHÍNH CỐT LÕI -->
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:20px;">
            <div class="rep-box"><span>DT 5610 (HY CHAY)</span><h3 id="repTaxable5610" style="color:var(--primary);">0đ</h3></div>
            <div class="rep-box"><span>DT 5630 (BAL'S HOUSE)</span><h3 id="repTaxable5630" style="color:#d97706;">0đ</h3></div>
            <div class="rep-box" style="background:#ecfdf5; border-color:#86efac;"><span>TỔNG DT CHỊU THUẾ (QUÁN)</span><h3 id="repTotalTaxable" style="color:#15803d;">0đ</h3></div>
            <div class="rep-box" style="background:#eff6ff; border-color:#bfdbfe;"><span>SỔ SHIP THU HỘ (TRẢ TÀI XẾ)</span><h3 id="repDeliveryRev" style="color:#2563eb;">0đ</h3></div>
            <div class="rep-box"><span>TỔNG ĐƠN HOÀN TẤT</span><h3 id="repDoneCount" style="color:#16a34a;">0 đơn</h3></div>
          </div>"""

shift_report_new = """          <!-- 7 Ô CHỈ SỐ TÀI CHÍNH CỐT LÕI (BỔ SUNG 2 QUỸ TIỀN MẶT ĐỘC LẬP THEO TRẠM) -->
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:10px; margin-bottom:20px;">
            <div class="rep-box" style="border-left:4px solid #16a34a; background:#f0fdf4;"><span>💵 QUỸ TIỀN MẶT QUÁN (HC)</span><h3 id="repCashHC" style="color:#16a34a;">0đ</h3></div>
            <div class="rep-box" style="border-left:4px solid #d97706; background:#fffbeb;"><span>🧋 QUỸ TIỀN MẶT XE NƯỚC (BH)</span><h3 id="repCashBH" style="color:#d97706;">0đ</h3></div>
            <div class="rep-box"><span>DT 5610 (HY CHAY)</span><h3 id="repTaxable5610" style="color:var(--primary);">0đ</h3></div>
            <div class="rep-box"><span>DT 5630 (BAL'S HOUSE)</span><h3 id="repTaxable5630" style="color:#d97706;">0đ</h3></div>
            <div class="rep-box" style="background:#ecfdf5; border-color:#86efac;"><span>TỔNG DT CHỊU THUẾ (QUÁN)</span><h3 id="repTotalTaxable" style="color:#15803d;">0đ</h3></div>
            <div class="rep-box" style="background:#eff6ff; border-color:#bfdbfe;"><span>SỔ SHIP THU HỘ (TRẢ TÀI XẾ)</span><h3 id="repDeliveryRev" style="color:#2563eb;">0đ</h3></div>
            <div class="rep-box"><span>TỔNG ĐƠN HOÀN TẤT</span><h3 id="repDoneCount" style="color:#16a34a;">0 đơn</h3></div>
          </div>"""

if "repCashHC" not in content:
    content = content.replace(shift_report_old, shift_report_new, 1)
    print("[4] Injected Separate Cash Drawer Cards in Shift Report")
else:
    print("[4] Shift Report Cash Cards already present")

# ----------------------------------------------------------------------
# 5. JS LOGIC: DYNAMIC STATION SWITCHER, TABLES, & NAMESPACE
# ----------------------------------------------------------------------
old_tables_block = """    let currentPosDrinkSubCat = 'all_drink';
    let currentEditDrinkSubCat = 'all_drink';
    let isTableDeleteMode = false;
    let tablesListCache = ["Bàn 1", "Bàn 2", "Bàn 3", "Bàn 4", "Bàn 5", "Bàn 6", "Bàn 7", "Bàn 8", "Mang Về"];

    // 16.1. ĐỒNG BỘ DANH SÁCH BÀN ĂN TỪ FIREBASE (TẠO THÊM BÀN / XÓA BÀN)
    onValue(ref(db, 'restaurant_config/tables'), (snap) => {
      if (snap.exists() && Array.isArray(snap.val()) && snap.val().length > 0) {
        tablesListCache = snap.val();
      }
      renderDynamicTablePills();
    });

    function renderDynamicTablePills() {
      const box = document.getElementById('dynamicTablePills');
      if (!box) return;
      if (!tablesListCache.includes(selectedTable)) {
        selectedTable = tablesListCache[0] || "Bàn 1";
        if (document.getElementById('currentSelectedTable')) {
          document.getElementById('currentSelectedTable').innerText = selectedTable;
        }
      }
      let html = '';
      tablesListCache.forEach((tName, idx) => {
        const isActive = (tName === selectedTable);
        const safeT = tName.replace(/'/g, "\\'");
        if (isTableDeleteMode) {
          html += `<button type="button" class="btn-table-pill" style="background:#fee2e2; color:#b91c1c; border-color:#ef4444;" onclick="removeTableAtIndex(${idx})">❌ Xóa "${tName}"</button>`;
        } else {
          html += `<button type="button" class="btn-table-pill ${isActive ? 'active' : ''}" onclick="selectTable('${safeT}', this)">${tName}</button>`;
        }
      });
      box.innerHTML = html;
    }"""

new_tables_block = """    let currentPosDrinkSubCat = 'all_drink';
    let currentEditDrinkSubCat = 'all_drink';
    let isTableDeleteMode = false;

    // QUY CHUẨN ĐẶC TẢ BÀN THEO 2 TRẠM LÀM VIỆC: QUÁN HY CHAY (HC) & XE NƯỚC BAL'S HOUSE (BH)
    const HC_TABLES_DEFAULT = Array.from({length: 20}, (_, i) => `HC-${String(i+1).padStart(2, '0')}`).concat(['HC-Mang Về']);
    const BH_TABLES_DEFAULT = Array.from({length: 15}, (_, i) => `BH-${String(i+1).padStart(2, '0')}`).concat(['BH-Mang Về']);
    let tablesListCache = [...HC_TABLES_DEFAULT, ...BH_DEFAULT_TABLES];
    let currentPosStation = localStorage.getItem('BAL_POS_STATION') || 'HC';

    window.getStationTablesList = function() {
      const station = localStorage.getItem('BAL_POS_STATION') || 'HC';
      if (station === 'HC') {
        const list = tablesListCache.filter(t => t.startsWith('HC-') || (!t.startsWith('BH-') && t !== 'Mang Về'));
        return list.length > 0 ? list : HC_TABLES_DEFAULT;
      } else if (station === 'BH') {
        const list = tablesListCache.filter(t => t.startsWith('BH-'));
        return list.length > 0 ? list : BH_DEFAULT_TABLES;
      } else {
        return tablesListCache.length > 0 ? tablesListCache : [...HC_TABLES_DEFAULT, ...BH_DEFAULT_TABLES];
      }
    };

    window.setPosStation = function(st) {
      localStorage.setItem('BAL_POS_STATION', st);
      currentPosStation = st;

      document.querySelectorAll('.station-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-station') === st);
      });

      const badgeEl = document.getElementById('currentStationBadge');
      if (badgeEl) {
        if (st === 'HC') {
          badgeEl.innerHTML = 'Đang trực: <b style="color:#22c55e;">🏠 Trạm Quán Hy Chay (HC-01 → HC-20)</b>';
        } else if (st === 'BH') {
          badgeEl.innerHTML = 'Đang trực: <b style="color:#f59e0b;">🧋 Trạm Xe Nước BAL\\'S HOUSE (BH-01 → BH-15)</b>';
        } else {
          badgeEl.innerHTML = 'Đang trực: <b style="color:#818cf8;">👑 Giám Đốc Xem Tất Cả (All Stations)</b>';
        }
      }

      if (st === 'BH') {
        if (!selectedTable.startsWith('BH-')) selectedTable = 'BH-01';
      } else if (st === 'HC') {
        if (!selectedTable.startsWith('HC-')) selectedTable = 'HC-01';
      }
      if (document.getElementById('currentSelectedTable')) {
        document.getElementById('currentSelectedTable').innerText = selectedTable;
      }

      renderDynamicTablePills();
      if (typeof renderOrders === 'function') renderOrders();
      if (typeof renderCrossStationAlertsUI === 'function') renderCrossStationAlertsUI();
    };

    // 16.1. ĐỒNG BỘ DANH SÁCH BÀN ĂN TỪ FIREBASE (TẠO THÊM BÀN / XÓA BÀN)
    onValue(ref(db, 'restaurant_config/tables'), (snap) => {
      if (snap.exists() && Array.isArray(snap.val()) && snap.val().length > 0) {
        const custom = snap.val();
        // Giữ cấu trúc tiền tố HC & BH
        const hasStationPrefix = custom.some(t => t.startsWith('HC-') || t.startsWith('BH-'));
        if (hasStationPrefix) {
          tablesListCache = custom;
        } else {
          tablesListCache = [...HC_TABLES_DEFAULT, ...BH_DEFAULT_TABLES, ...custom];
        }
      }
      renderDynamicTablePills();
    });

    function renderDynamicTablePills() {
      const box = document.getElementById('dynamicTablePills');
      if (!box) return;
      const currentStation = localStorage.getItem('BAL_POS_STATION') || 'HC';
      const stationTables = window.getStationTablesList();

      if (!stationTables.includes(selectedTable)) {
        selectedTable = stationTables[0] || (currentStation === 'BH' ? 'BH-01' : 'HC-01');
        if (document.getElementById('currentSelectedTable')) {
          document.getElementById('currentSelectedTable').innerText = selectedTable;
        }
      }
      let html = '';
      stationTables.forEach((tName, idx) => {
        const isActive = (tName === selectedTable);
        const safeT = tName.replace(/'/g, "\\\\'");
        const isBH = tName.startsWith('BH-');
        const badgeColor = isBH ? '#d97706' : '#15803d';
        const badgeBg = isBH ? '#fffbeb' : '#f0fdf4';
        if (isTableDeleteMode) {
          html += `<button type="button" class="btn-table-pill" style="background:#fee2e2; color:#b91c1c; border-color:#ef4444;" onclick="removeTableAtIndex(${idx})">❌ Xóa "${tName}"</button>`;
        } else {
          html += `<button type="button" class="btn-table-pill ${isActive ? 'active' : ''}" style="${isActive ? '' : `background:${badgeBg}; color:${badgeColor}; border-color:${badgeColor}44;`}" onclick="selectTable('${safeT}', this)">${tName}</button>`;
        }
      });
      box.innerHTML = html;
    }"""

if "window.getStationTablesList" not in content:
    content = content.replace(old_tables_block, new_tables_block, 1)
    print("[5] Injected Station-aware Dynamic Table Pills & setPosStation")
else:
    print("[5] Station Tables logic already present")

# ----------------------------------------------------------------------
# 6. JS LOGIC: CROSS-STATION DRINK ROUTING ENGINE (REALTIME LISTENER)
# ----------------------------------------------------------------------
cross_routing_engine = """
    // ==========================================
    // 16.2. CƠ CHẾ ĐỊNH TUYẾN ĐỒ UỐNG LIÊN TRẠM (CROSS-STATION DRINK ROUTING)
    // ==========================================
    let crossStationAlertsCache = {};
    let alertedDrinkIds = {};

    onValue(ref(db, 'cross_station_alerts'), (snap) => {
      crossStationAlertsCache = snap.val() || {};
      const currentStation = localStorage.getItem('BAL_POS_STATION') || 'HC';

      // Phát âm thanh chuông cảnh báo nếu có đơn mới cần pha chế gửi về xe nước
      Object.keys(crossStationAlertsCache).forEach(aId => {
        const a = crossStationAlertsCache[aId];
        if (a && a.status === 'pending' && !alertedDrinkIds[aId]) {
          alertedDrinkIds[aId] = true;
          if (currentStation === 'BH' || currentStation === 'ALL') {
            try { playHardwareBeep(); } catch(e) {}
            if (typeof speakAlert === 'function') {
              speakAlert(`Có đồ uống từ bàn ${a.table} cần pha chế giao về quán`, false);
            }
          }
        }
      });

      renderCrossStationAlertsUI();
    });

    window.renderCrossStationAlertsUI = function() {
      const container = document.getElementById('crossStationAlertsContainer');
      if (!container) return;
      const currentStation = localStorage.getItem('BAL_POS_STATION') || 'HC';

      // Chỉ hiển thị trên màn hình Trạm Xe Nước (BH) hoặc Giám Đốc (ALL)
      if (currentStation === 'HC') {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
      }

      const pending = Object.keys(crossStationAlertsCache)
        .map(k => ({ id: k, ...crossStationAlertsCache[k] }))
        .filter(a => a && a.status === 'pending');

      if (pending.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
      }

      container.style.display = 'block';
      let html = `
        <div style="background:#fffbeb; border:2px solid #f59e0b; border-radius:14px; padding:12px 16px; margin-bottom:14px; box-shadow:0 4px 14px rgba(245,158,11,0.18);">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; border-bottom:1px dashed #fcd34d; padding-bottom:6px;">
            <b style="color:#b45309; font-size:0.95rem; display:flex; align-items:center; gap:8px;">
              <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#ef4444; box-shadow:0 0 8px #ef4444;"></span>
              🧋 DANH SÁCH ĐỒ UỐNG BẮN TỪ BÀN QUÁN HY CHAY (${pending.length} YÊU CẦU ĐANG CHỜ PHA CHẾ)
            </b>
            <span style="font-size:0.78rem; font-weight:700; color:#78350f;">Trạm Xe Nước BAL\\'S HOUSE</span>
          </div>
      `;

      pending.forEach(a => {
        const timeStr = a.createdAt ? new Date(a.createdAt).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'}) : '';
        const itemsList = (a.items || []).map(it => `
          <div style="display:inline-block; background:#ffffff; border:1.5px solid #fcd34d; border-radius:8px; padding:5px 10px; margin:3px 4px; font-weight:800; color:#0f172a; box-shadow:0 1px 3px rgba(0,0,0,0.06);">
            <span style="color:#d97706; font-size:1.05rem; font-weight:900;">${it.qty}x</span> ${it.name}
          </div>
        `).join('');

        html += `
          <div class="cross-station-alert-card" style="margin-bottom:10px; background:#ffffff; border:1.5px solid #f59e0b; border-radius:10px; padding:12px 14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="background:#dc2626; color:#ffffff; padding:3px 8px; border-radius:6px; font-weight:900; font-size:0.75rem;">🔔 LIÊN TRẠM</span>
                <b style="color:#92400e; font-size:1.05rem;">[PHA CHẾ GIAO VỀ QUÁN - BÀN ${a.table}]</b>
              </div>
              <span style="font-size:0.8rem; font-weight:700; color:#78350f;">Gửi lúc: ${timeStr} | Đơn: #${(a.orderId || '').slice(-6)}</span>
            </div>
            <div style="margin:8px 0; padding:8px 10px; background:#fffbeb; border-radius:8px;">
              ${itemsList}
              ${a.note ? `<div style="margin-top:6px; font-size:0.82rem; color:#475569;">📝 <i>Ghi chú: ${a.note}</i></div>` : ''}
            </div>
            <div style="display:flex; justify-content:flex-end;">
              <button type="button" onclick="completeCrossStationAlert('${a.id}')" style="background:#16a34a; color:#ffffff; border:none; padding:8px 18px; border-radius:8px; font-weight:900; font-size:0.88rem; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 3px 8px rgba(22,163,74,0.35);">
                ✅ Đã pha xong & Giao về quán
              </button>
            </div>
          </div>
        `;
      });

      html += `</div>`;
      container.innerHTML = html;
    };

    window.completeCrossStationAlert = function(alertId) {
      const a = crossStationAlertsCache[alertId];
      if (!a) return;
      const nowIso = new Date().toISOString();
      update(ref(db, `cross_station_alerts/${alertId}`), {
        status: 'completed',
        completedAt: nowIso,
        completedBy: 'BAL_HOUSE_STAFF'
      }).then(() => {
        try { playHardwareBeep(); } catch(e) {}
        if (typeof speakAlert === 'function') {
          speakAlert(`Đã xác nhận giao đồ uống về bàn ${a.table}`, false);
        }
      });
      update(ref(db, `orders_by_station/BH/pending_cross/${alertId}`), {
        status: 'completed',
        completedAt: nowIso
      }).catch(() => {});
      if (a.orderId) {
        update(ref(db, `orders/${a.orderId}`), {
          drinksStatus: 'Đã pha xong & Giao về quán',
          drinksDeliveredAt: nowIso
        }).catch(() => {});
      }
    };
"""

if "16.2. CƠ CHẾ ĐỊNH TUYẾN ĐỒ UỐNG LIÊN TRẠM" not in content:
    # Inject after renderDynamicTablePills
    marker = "window.removeTableAtIndex = function(idx) {"
    idx = content.find(marker)
    if idx != -1:
        end_marker = "};\n\n    // 16.3."
        idx2 = content.find(end_marker, idx)
        if idx2 != -1:
            content = content[:idx2 + 2] + cross_routing_engine + content[idx2 + 2:]
            print("[6] Injected Cross-Station Drink Routing Engine")
        else:
            # fallback: find next function
            next_func = "\n    // 16."
            idx_next = content.find(next_func, idx)
            content = content[:idx_next] + cross_routing_engine + content[idx_next:]
            print("[6] Injected Cross-Station Drink Routing Engine (fallback)")
else:
    print("[6] Cross-Station Drink Routing Engine already present")

# ----------------------------------------------------------------------
# 7. JS LOGIC: SURGICAL UPGRADE OF submitDineInOrder (ACTIVE AT LINE 6080)
# ----------------------------------------------------------------------
old_submit_pos = """      const nextSeq = getNextDailyOrderSequenceNumber();
      const seqFormatted = String(nextSeq).padStart(2, '0');

      if (currentPosOrderMode === 'delivery') {"""

new_submit_prefix = """      const currentStation = localStorage.getItem('BAL_POS_STATION') || 'HC';
      let finalTable = selectedTable || 'HC-01';
      const orderStation = (currentStation === 'BH' || finalTable.startsWith('BH-')) ? 'BH' : 'HC';
      if (!finalTable.startsWith('HC-') && !finalTable.startsWith('BH-')) {
        finalTable = orderStation + '-' + finalTable;
      }

      const nextSeq = getNextDailyOrderSequenceNumber();
      const seqFormatted = String(nextSeq).padStart(2, '0');

      if (currentPosOrderMode === 'delivery') {"""

# Replace in the active submitDineInOrder function
if "const orderStation = (currentStation === 'BH'" not in content:
    content = content.replace(old_submit_pos, new_submit_prefix)
    print("[7A] Injected orderStation and finalTable normalization")
else:
    print("[7A] orderStation already present")

# Replace delivery order id generation
old_deliv_ref = """        const newOrderRef = push(ref(db, 'orders'));
        const newOrderId = newOrderRef.key;
        if (typeof announcedNewOrderIds !== 'undefined') announcedNewOrderIds[newOrderId] = true;
        if (typeof orderLastVoiceReminderAt !== 'undefined') orderLastVoiceReminderAt[newOrderId] = Date.now();
        ordersCache[newOrderId] = deliveryOrderData;
        dailyOrderSeqMap[newOrderId] = seqFormatted;

        set(newOrderRef, deliveryOrderData).then(() => {"""

new_deliv_ref = """        const newOrderId = `ORD-${orderStation}-SHIP-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
        deliveryOrderData.orderCode = newOrderId;
        deliveryOrderData.station = orderStation;
        const newOrderRef = ref(db, `orders/${newOrderId}`);
        if (typeof announcedNewOrderIds !== 'undefined') announcedNewOrderIds[newOrderId] = true;
        if (typeof orderLastVoiceReminderAt !== 'undefined') orderLastVoiceReminderAt[newOrderId] = Date.now();
        ordersCache[newOrderId] = deliveryOrderData;
        dailyOrderSeqMap[newOrderId] = seqFormatted;

        set(newOrderRef, deliveryOrderData).then(() => {
          set(ref(db, `orders_by_station/${orderStation}/${newOrderId}`), deliveryOrderData).catch(() => {});"""

if "ORD-${orderStation}-SHIP-" not in content:
    content = content.replace(old_deliv_ref, new_deliv_ref)
    print("[7B] Injected delivery orderId with station prefix and orders_by_station write")
else:
    print("[7B] delivery orderId already updated")

# Replace dine-in order submission
old_dinein_ref = """      const orderData = {
        orderType: 'dine_in',
        dailySeq: nextSeq,
        table: selectedTable,
        customerName: selectedTable,
        phone: 'Tại quán',
        address: '280 Trần Hưng Đạo',
        note: noteVal,
        items: posCart,
        rawSubtotal: rawSub,
        discountPercent: pct,
        discount: discAmt,
        subtotal: netSub,
        shippingFee: 0,
        grandTotal: netSub,
        paymentMethod: 'COD',
        paymentStatus: 'Thu tại bàn',
        status: 'Đang chế biến',
        createdAt: new Date().toISOString(),
        archived: false
      };

      const newOrderRef = push(ref(db, 'orders'));
      const newOrderId = newOrderRef.key;
      if (typeof announcedNewOrderIds !== 'undefined') announcedNewOrderIds[newOrderId] = true;
      if (typeof orderLastVoiceReminderAt !== 'undefined') orderLastVoiceReminderAt[newOrderId] = Date.now();
      ordersCache[newOrderId] = orderData;
      dailyOrderSeqMap[newOrderId] = seqFormatted;

      set(newOrderRef, orderData).then(() => {
        const voiceOrderText = `Order mới ${selectedTable} gồm: ${spokenDishes.join(', ')}.${pct > 0 ? ' Ưu đãi giảm ' + pct + ' phần trăm.' : ''}${rawNote ? ' Lưu ý bếp: ' + rawNote : ''}`;
        broadcastAndSpeakKitchenAlert(voiceOrderText);
        window.printKitchenTicket(newOrderId, orderData);
        alert(`✅ Đã gửi đơn ${selectedTable} (#${seqFormatted}) xuống bếp!`);"""

new_dinein_ref = """      const newOrderId = `ORD-${orderStation}-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
      const orderData = {
        orderType: 'dine_in',
        dailySeq: nextSeq,
        station: orderStation,
        orderCode: newOrderId,
        table: finalTable,
        customerName: finalTable,
        phone: 'Tại quán',
        address: '280 Trần Hưng Đạo',
        note: noteVal,
        items: posCart,
        rawSubtotal: rawSub,
        discountPercent: pct,
        discount: discAmt,
        subtotal: netSub,
        shippingFee: 0,
        grandTotal: netSub,
        paymentMethod: 'COD',
        paymentStatus: 'Thu tại bàn',
        status: 'Đang chế biến',
        createdAt: new Date().toISOString(),
        archived: false
      };

      const newOrderRef = ref(db, `orders/${newOrderId}`);
      if (typeof announcedNewOrderIds !== 'undefined') announcedNewOrderIds[newOrderId] = true;
      if (typeof orderLastVoiceReminderAt !== 'undefined') orderLastVoiceReminderAt[newOrderId] = Date.now();
      ordersCache[newOrderId] = orderData;
      dailyOrderSeqMap[newOrderId] = seqFormatted;

      set(newOrderRef, orderData).then(() => {
        // Ghi dữ liệu lên phân hệ Namespace riêng để chống trùng bàn và tránh đè dữ liệu
        set(ref(db, `orders_by_station/${orderStation}/${newOrderId}`), orderData).catch(() => {});
        set(ref(db, `orders_by_station/${orderStation}/${finalTable}`), orderData).catch(() => {});

        // ĐỊNH TUYẾN ĐỒ UỐNG LIÊN TRẠM: Kiểm tra nếu bàn HC gọi đồ uống BAL'S HOUSE (Mã ngành 5630)
        const drinkItems = [];
        const unified = typeof getUnifiedMenuList === 'function' ? getUnifiedMenuList() : ALL_MENU_DATA;
        for (let k in posCart) {
          const it = posCart[k];
          const dishBase = unified.find(d => d.name === it.name || d.id === k);
          if (it.cat === 'douong' || (dishBase && dishBase.cat === 'douong')) {
            drinkItems.push({ name: it.name, qty: it.qty, price: it.price });
          }
        }

        if (drinkItems.length > 0 && orderStation === 'HC') {
          const alertId = `XALERT-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
          const crossData = {
            id: alertId,
            orderId: newOrderId,
            table: finalTable,
            sourceStation: 'HC',
            targetStation: 'BH',
            status: 'pending',
            items: drinkItems,
            note: noteVal,
            createdAt: new Date().toISOString()
          };
          set(ref(db, `cross_station_alerts/${alertId}`), crossData).catch(() => {});
          set(ref(db, `orders_by_station/BH/pending_cross/${alertId}`), crossData).catch(() => {});
        }

        const voiceOrderText = `Order mới ${finalTable} gồm: ${spokenDishes.join(', ')}.${pct > 0 ? ' Ưu đãi giảm ' + pct + ' phần trăm.' : ''}${rawNote ? ' Lưu ý bếp: ' + rawNote : ''}`;
        broadcastAndSpeakKitchenAlert(voiceOrderText);
        window.printKitchenTicket(newOrderId, orderData);
        alert(`✅ Đã gửi đơn ${finalTable} (#${seqFormatted}) xuống bếp!`);"""

if "ORD-${orderStation}-" not in content:
    content = content.replace(old_dinein_ref, new_dinein_ref)
    print("[7C] Injected dine-in orderId, namespace write & cross-station drink detection")
else:
    print("[7C] dine-in order submission already updated")

# ----------------------------------------------------------------------
# 8. JS LOGIC: ORDER FILTERING BY STATION IN renderOrders()
# ----------------------------------------------------------------------
old_filter_code = """        if (currentOrderStatusFilter === 'active_only' && !isPending && !isShipperIssue && !isCooking && !isDriverToStore) return;
        if (currentOrderStatusFilter === 'Chờ xác nhận' && !isPending && !isShipperIssue) return;
        if (currentOrderStatusFilter === 'Đang chế biến' && !isCooking && !isDriverToStore) return;
        if (currentOrderStatusFilter === 'shipper_delivering' && !isDelivering) return;
        if (currentOrderStatusFilter === 'done_cancel' && !isDone && !isCanceled) return;"""

new_filter_code = """        // LỌC ĐƠN THEO TRẠM POS ĐANG CHỌN (HC vs BH vs ALL)
        const curStation = localStorage.getItem('BAL_POS_STATION') || 'HC';
        const isBh = (order.station === 'BH') || (order.table && order.table.startsWith('BH-')) || id.includes('-BH-');
        const isHc = (order.station === 'HC') || (order.table && order.table.startsWith('HC-')) || id.includes('-HC-') || (!isBh);

        if (curStation === 'HC' && !isHc) return;
        if (curStation === 'BH' && !isBh) return;

        if (currentOrderStatusFilter === 'active_only' && !isPending && !isShipperIssue && !isCooking && !isDriverToStore) return;
        if (currentOrderStatusFilter === 'Chờ xác nhận' && !isPending && !isShipperIssue) return;
        if (currentOrderStatusFilter === 'Đang chế biến' && !isCooking && !isDriverToStore) return;
        if (currentOrderStatusFilter === 'shipper_delivering' && !isDelivering) return;
        if (currentOrderStatusFilter === 'done_cancel' && !isDone && !isCanceled) return;"""

if "LỌC ĐƠN THEO TRẠM POS ĐANG CHỌN" not in content:
    content = content.replace(old_filter_code, new_filter_code, 1)
    print("[8] Injected station filter in renderOrders()")
else:
    print("[8] Station filter in renderOrders() already present")

# ----------------------------------------------------------------------
# 9. JS LOGIC: SEPARATE CASH DRAWER CALCULATION IN getTaxReportData()
# ----------------------------------------------------------------------
old_tax_decl = "let total5610 = 0, total5630 = 0, totalShip = 0, count = 0, daily = {}, dishStats = {}, rawList = [];"
new_tax_decl = "let total5610 = 0, total5630 = 0, totalShip = 0, count = 0, daily = {}, dishStats = {}, rawList = [];\n      let cashHC = 0, cashBH = 0;"

old_tax_ret = "return { labelPeriod, total5610, total5630, totalTaxable: total5610 + total5630, totalShip, count, daily, dishStats, rawList };"
new_tax_ret = "return { labelPeriod, total5610, total5630, totalTaxable: total5610 + total5630, totalShip, count, daily, dishStats, rawList, cashHC, cashBH };"

if "let cashHC = 0, cashBH = 0;" not in content:
    content = content.replace(old_tax_decl, new_tax_decl, 1)
    
    # In order loop inside getTaxReportData, add cash segregation
    old_loop_tail = """          o.id = id;
          o.calc5610 = orderTotal5610;
          o.calc5630 = orderTotal5630;
          o.calcTaxable = orderTotal5610 + orderTotal5630;
          rawList.push(o);"""

    new_loop_tail = """          o.id = id;
          o.calc5610 = orderTotal5610;
          o.calc5630 = orderTotal5630;
          o.calcTaxable = orderTotal5610 + orderTotal5630;
          rawList.push(o);

          // TÁCH BIỆT QUỸ TIỀN MẶT CUỐI NGÀY THEO 2 TRẠM
          const isBhOrder = (o.station === 'BH') || (o.table && o.table.startsWith('BH-')) || (o.id && o.id.includes('-BH-'));
          const isCash = (o.paymentMethod === 'COD' || o.paymentMethod !== 'VIETQR');
          if (isCash) {
            if (isBhOrder) {
              cashBH += (o.subtotal || o.calcTaxable || 0);
            } else {
              cashHC += (o.subtotal || o.calcTaxable || 0);
            }
          }"""

    content = content.replace(old_loop_tail, new_loop_tail, 1)
    content = content.replace(old_tax_ret, new_tax_ret, 1)
    print("[9] Injected Cash Drawer segregation in getTaxReportData()")
else:
    print("[9] Cash Drawer segregation in getTaxReportData() already present")

# ----------------------------------------------------------------------
# 10. JS LOGIC: UPDATE renderShiftReport() & printShiftReport()
# ----------------------------------------------------------------------
old_shift_ui = """      document.getElementById('repTaxable5610').innerText = data.total5610.toLocaleString() + 'đ';
      document.getElementById('repTaxable5630').innerText = data.total5630.toLocaleString() + 'đ';
      if (document.getElementById('repTotalTaxable')) document.getElementById('repTotalTaxable').innerText = data.totalTaxable.toLocaleString() + 'đ';
      document.getElementById('repDeliveryRev').innerText = data.totalShip.toLocaleString() + 'đ';
      document.getElementById('repDoneCount').innerText = data.count + ' đơn';"""

new_shift_ui = """      document.getElementById('repTaxable5610').innerText = data.total5610.toLocaleString() + 'đ';
      document.getElementById('repTaxable5630').innerText = data.total5630.toLocaleString() + 'đ';
      if (document.getElementById('repTotalTaxable')) document.getElementById('repTotalTaxable').innerText = data.totalTaxable.toLocaleString() + 'đ';
      document.getElementById('repDeliveryRev').innerText = data.totalShip.toLocaleString() + 'đ';
      document.getElementById('repDoneCount').innerText = data.count + ' đơn';
      if (document.getElementById('repCashHC')) document.getElementById('repCashHC').innerText = (data.cashHC || 0).toLocaleString() + 'đ';
      if (document.getElementById('repCashBH')) document.getElementById('repCashBH').innerText = (data.cashBH || 0).toLocaleString() + 'đ';"""

if "repCashHC" not in content or "repCashBH" not in content or "repCashHC').innerText" not in content:
    content = content.replace(old_shift_ui, new_shift_ui, 1)
    print("[10A] Injected cash drawer figures into renderShiftReport()")

# Add cash drawer breakdown to 80mm printout
old_print_totals = """            <div style="display:flex; justify-content:space-between;"><span>DT 5610 (Hy Chay):</span><span>${data.total5610.toLocaleString()}đ</span></div>
            <div style="display:flex; justify-content:space-between;"><span>DT 5630 (BAL'S HOUSE):</span><span>${data.total5630.toLocaleString()}đ</span></div>"""

new_print_totals = """            <div style="display:flex; justify-content:space-between; color:#15803d; font-weight:900;"><span>💵 Quỹ Tiền Mặt Quán (HC):</span><span>${(data.cashHC || 0).toLocaleString()}đ</span></div>
            <div style="display:flex; justify-content:space-between; color:#b45309; font-weight:900; margin-bottom:4px;"><span>🧋 Quỹ Tiền Mặt Xe Nước (BH):</span><span>${(data.cashBH || 0).toLocaleString()}đ</span></div>
            <div style="display:flex; justify-content:space-between;"><span>DT 5610 (Hy Chay):</span><span>${data.total5610.toLocaleString()}đ</span></div>
            <div style="display:flex; justify-content:space-between;"><span>DT 5630 (BAL'S HOUSE):</span><span>${data.total5630.toLocaleString()}đ</span></div>"""

if "Quỹ Tiền Mặt Quán (HC):" not in content:
    content = content.replace(old_print_totals, new_print_totals, 1)
    print("[10B] Injected cash drawer figures into printShiftReport() 80mm slip")

# ----------------------------------------------------------------------
# 11. BOOTSTRAP CALL: INITIALIZE STATION SWITCHER ON PAGE LOAD
# ----------------------------------------------------------------------
init_code = """
    // KHỞI CHẠY BỘ CHỌN TRẠM POS VỊ TRÍ LÀM VIỆC KHI TẢI TRANG
    setTimeout(() => {
      const savedStation = localStorage.getItem('BAL_POS_STATION') || 'HC';
      if (typeof window.setPosStation === 'function') {
        window.setPosStation(savedStation);
      }
    }, 100);
"""

if "KHỞI CHẠY BỘ CHỌN TRẠM POS VỊ TRÍ LÀM VIỆC" not in content:
    content = content.replace("  </script>\n</body>", init_code + "  </script>\n</body>", 1)
    print("[11] Injected Station Switcher Bootstrapper")

# ----------------------------------------------------------------------
# WRITE MODIFIED ADMIN.HTML
# ----------------------------------------------------------------------
with open(ADMIN_PATH, "w", encoding="utf-8") as f:
    f.write(content)

print("\n>>> Successfully updated D:\\BaoAnhLam_AI\\HyChayFood_Web\\admin.html!")
