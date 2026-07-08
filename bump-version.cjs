#!/usr/bin/env node
/**
 * 我只要一刀 — 版本号自动更新脚本
 *
 * 版本号格式：V + 4位日期(MMDD) + 3位修改序号(NNN)
 * 示例：7月8日第2次修改 → V0708002
 *
 * 用法：
 *   node bump-version.js          # 自增当日修改序号，替换所有版本标记
 *   node bump-version.js --show   # 仅显示当前版本号，不修改文件
 *   node bump-version.js --set V0708003  # 手动指定版本号
 *
 * 脚本会更新以下位置：
 *   - package.json           version 字段
 *   - index.html             title 标签
 *   - src/components/MainMenu.tsx   印章文字
 *   - src/game/Game.ts       HUD 版本号
 *   - src/components/ResultScreen.tsx  版本标签
 *   - README.md              标题行
 *   - .version-state.json    版本状态持久化（脚本内部使用，不提交到仓库）
 */

const fs = require("fs");
const path = require("path");

// ─── 项目根目录 ───
const ROOT = path.resolve(__dirname);

// ─── 版本状态文件（本地状态，不入仓库）───
const STATE_FILE = path.join(ROOT, ".version-state.json");

// ─── 需要替换版本号的文件及其替换规则 ───
const TARGETS = [
  {
    file: "package.json",
    // package.json 用语义化版本：V0708002 → "0708.002"
    replace: (content, ver, semver) => {
      return content.replace(
        /"version"\s*:\s*"[^"]*"/,
        `"version": "${semver}"`
      );
    },
  },
  {
    file: "index.html",
    // 匹配完整版本标记（含V前缀），替换为新版本号（ver已含V前缀）
    replace: (content, ver) =>
      content.replace(/V(?:\d{7}|[\d.]+)( IAA版)/, `${ver}$1`),
  },
  {
    file: "src/components/MainMenu.tsx",
    replace: (content, ver) =>
      content.replace(/V(?:\d{7}|[\d.]+)( IAA版)/, `${ver}$1`),
  },
  {
    file: "src/game/Game.ts",
    replace: (content, ver) =>
      content.replace(/"V(?:\d{7}|[\d.]+(?: IAA)?)"/, `"${ver}"`),
  },
  {
    file: "src/components/ResultScreen.tsx",
    replace: (content, ver) =>
      content.replace(/V(?:\d{7}|[\d.]+)( IAA版)/, `${ver}$1`),
  },
  {
    file: "README.md",
    replace: (content, ver) =>
      content.replace(/V(?:\d{7}|[\d.]+)( IAA版)/, `${ver}$1`),
  },
];

// ─── 工具函数 ───

function todayMMDD() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return mm + dd;
}

function todayYYYYMMDD() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toSemver(ver) {
  // V0708002 → "0708.002" (符合 package.json 语义化版本规范)
  const mmdd = ver.slice(1, 5);
  const nnn = ver.slice(5);
  return `${mmdd}.${nnn}`;
}

function readState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    } catch {
      return {};
    }
  }
  return {};
}

function writeState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n", "utf8");
}

function generateNextVersion(forceVer) {
  if (forceVer) return forceVer;

  const state = readState();
  const today = todayYYYYMMDD();
  const mmdd = todayMMDD();

  // 如果今天已有修改记录，自增序号；否则从001开始
  let seq;
  if (state.lastDate === today && typeof state.lastSeq === "number") {
    seq = state.lastSeq + 1;
  } else {
    seq = 1;
  }

  const ver = `V${mmdd}${String(seq).padStart(3, "0")}`;

  // 持久化状态
  writeState({ lastDate: today, lastSeq: seq, currentVersion: ver });

  return ver;
}

// ─── 主流程 ───

function main() {
  const args = process.argv.slice(2);

  // --show: 仅显示当前版本
  if (args[0] === "--show") {
    const state = readState();
    const current = state.currentVersion || "未初始化";
    console.log(`当前版本: ${current}`);
    console.log(`下次版本: V${todayMMDD()}${String((state.lastDate === todayYYYYMMDD() ? state.lastSeq || 0 : 0) + 1).padStart(3, "0")}`);
    return;
  }

  // --set V0708003: 手动指定版本号
  let forceVer = null;
  if (args[0] === "--set" && args[1]) {
    // 验证格式：V + 4位数字 + 3位数字
    if (!/^V\d{4}\d{3}$/.test(args[1])) {
      console.error(`❌ 版本号格式错误: ${args[1]}`);
      console.error(`   正确格式: V + MMDD + NNN，例如 V0708002`);
      process.exit(1);
    }
    forceVer = args[1];
    // 更新状态文件
    const mmdd = forceVer.slice(1, 5);
    const nnn = parseInt(forceVer.slice(5), 10);
    writeState({ lastDate: todayYYYYMMDD(), lastSeq: nnn, currentVersion: forceVer });
  }

  const newVer = generateNextVersion(forceVer);
  const newSemver = toSemver(newVer);
  const changedFiles = [];

  console.log(`\n🔄 版本号更新: → ${newVer} (semver: ${newSemver})\n`);

  for (const target of TARGETS) {
    const filePath = path.join(ROOT, target.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`  ⚠️ 文件不存在，跳过: ${target.file}`);
      continue;
    }

    const original = fs.readFileSync(filePath, "utf8");
    const updated = target.replace(original, newVer, newSemver);

    if (updated !== original) {
      fs.writeFileSync(filePath, updated, "utf8");
      changedFiles.push(target.file);
      console.log(`  ✅ ${target.file}`);
    } else {
      console.log(`  ⏭️ ${target.file} (无匹配版本标记)`);
    }
  }

  if (changedFiles.length > 0) {
    console.log(`\n✨ 已更新 ${changedFiles.length} 个文件，版本号: ${newVer}`);
    console.log(`\n💡 下一步: git add ${changedFiles.join(" ")} .version-state.json && git commit -m "${newVer}"`);
  } else {
    console.log(`\n⚠️ 没有找到可替换的版本标记。检查文件内容是否包含旧版本号。`);
  }

  // 确保 .version-state.json 在 .gitignore 中
  const gitignorePath = path.join(ROOT, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const gi = fs.readFileSync(gitignorePath, "utf8");
    if (!gi.includes(".version-state.json")) {
      fs.writeFileSync(gitignorePath, gi + "\n.version-state.json\n", "utf8");
      console.log(`\n📝 已将 .version-state.json 加入 .gitignore`);
    }
  } else {
    fs.writeFileSync(gitignorePath, ".version-state.json\n", "utf8");
    console.log(`\n📝 已创建 .gitignore，包含 .version-state.json`);
  }
}

main();
