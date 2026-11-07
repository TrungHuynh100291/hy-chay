const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
const rootDir = __dirname;

if (fs.existsSync(publicDir)) {
  const entries = fs.readdirSync(publicDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(publicDir, entry.name);
    const destPath = path.join(rootDir, entry.name);
    try {
      fs.cpSync(srcPath, destPath, { recursive: true, force: true });
      console.log(`[vercel_prepare] Copied: ${entry.name}`);
    } catch (err) {
      console.warn(`[vercel_prepare] Warning copying ${entry.name}:`, err.message);
    }
  }
  console.log('[vercel_prepare] All static assets from public/ are now at root.');
} else {
  console.log('[vercel_prepare] No public/ directory found, skipping.');
}
