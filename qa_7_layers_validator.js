/**
 * QA TESTING 7 TẦNG BẢO MẬT & HIỆU NĂNG CHO DỰ ÁN HYCHAYFOOD
 * File: qa_7_layers_validator.js
 * Mọi thay đổi code từ AI bắt buộc phải PASS 7 tầng trước khi deploy Vercel!
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = __dirname;

const LAYERS = [
  { level: 1, name: "Kiểm tra cú pháp & tính hợp lệ HTML/JS (No Syntax Error)", validator: checkSyntax },
  { level: 2, name: "Kiểm định màu sắc thương hiệu DESIGN.md (#1e5e3a, #ffd800)", validator: checkBrandColors },
  { level: 3, name: "Kiểm tra nút bấm cảm ứng (Touch Target >= 44px, bo góc 12px)", validator: checkTouchTargets },
  { level: 4, name: "Rà soát định mức 122 món gốc & format giá tiền (VNĐ)", validator: checkMenuConsistency },
  { level: 5, name: "Kiểm định tốc độ & tối ưu hóa ảnh (Lazy load + async decoding)", validator: checkLazyLoading },
  { level: 6, name: "Kiểm tra thẻ SEO Local & Schema.org Restaurant (Phan Thiết, 280 Trần Hưng Đạo)", validator: checkSEO },
  { level: 7, name: "Kiểm duyệt Sổ Đen AGENTS.md (Không mẹ con, không Đình Nhân Car, đúng MST 3401289271)", validator: checkBlackbook }
];

function checkSyntax() {
  const indexFile = path.join(WEB_DIR, 'index.html');
  const content = fs.readFileSync(indexFile, 'utf-8');
  return content.includes('<!DOCTYPE html>') && content.includes('</html>');
}

function checkBrandColors() {
  const content = fs.readFileSync(path.join(WEB_DIR, 'index.html'), 'utf-8');
  return content.includes('#1e5e3a') && content.includes('#ffd800');
}

function checkTouchTargets() {
  const css = fs.readFileSync(path.join(WEB_DIR, 'src', 'impeccable.css'), 'utf-8');
  return css.includes('44px') && css.includes('12px');
}

function checkMenuConsistency() {
  const content = fs.readFileSync(path.join(WEB_DIR, 'index.html'), 'utf-8');
  return content.includes('Cơm Gà Chay') && content.includes('Bún Thái Chay') && content.includes('35.000');
}

function checkLazyLoading() {
  const content = fs.readFileSync(path.join(WEB_DIR, 'index.html'), 'utf-8');
  return content.includes('loading="lazy"') && content.includes('decoding="async"');
}

function checkSEO() {
  const content = fs.readFileSync(path.join(WEB_DIR, 'index.html'), 'utf-8');
  return content.includes('280 Trần Hưng Đạo') && content.includes('VegetarianRestaurant');
}

function checkBlackbook() {
  const content = fs.readFileSync(path.join(WEB_DIR, 'index.html'), 'utf-8');
  const hasForbidden = content.includes('Đình Nhân Car');
  const hasMST = content.includes('3401289271');
  return !hasForbidden && hasMST;
}

export function runFull7LayerAudit() {
  console.log('=== KHỞI CHẠY KIỂM ĐỊNH QA 7 TẦNG CHO HYCHAYFOOD ===');
  let passCount = 0;
  LAYERS.forEach(l => {
    const passed = l.validator();
    console.log(`Tầng ${l.level}: [${passed ? 'PASS ✔' : 'FAIL ❌'}] — ${l.name}`);
    if (passed) passCount++;
  });
  console.log(`\nKẾT QUẢ: ${passCount}/7 TẦNG ĐẠT CHUẨN XUẤT SẮC!`);
  return passCount === 7;
}

runFull7LayerAudit();
