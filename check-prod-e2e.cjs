/**
 * check-prod-e2e.cjs — 生产包 E2E 残留检查
 * 搜索关键词：__ONE_BLADE_E2E__, forceArmorHit, forcePursuitHit
 * 用法：node check-prod-e2e.cjs [dir，默认 dist_prod_check]
 */
const fs = require('fs');
const path = require('path');

const targetDir = process.argv[2] || 'dist_prod_check';
const keywords = ['__ONE_BLADE_E2E__', 'forceArmorHit', 'forcePursuitHit'];

let found = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fp);
    } else if (entry.isFile()) {
      try {
        const content = fs.readFileSync(fp, 'utf-8');
        for (const kw of keywords) {
          if (content.includes(kw)) {
            console.error(`FAIL: E2E residue "${kw}" found in ${fp}`);
            found++;
          }
        }
      } catch { /* skip binary/empty */ }
    }
  }
}

if (!fs.existsSync(targetDir)) {
  console.error(`FAIL: directory "${targetDir}" not found`);
  process.exit(1);
}

walk(targetDir);

if (found > 0) {
  console.error(`FAIL: ${found} E2E residue(s) found`);
  process.exit(1);
}

console.log('OK: no E2E residue');
