// V0723014+ 通用一键验证脚本
// 用法: node verify-all.cjs
// 运行顺序与 CI test job 完全一致：
//   check:version → test(vitest) → build → check:prod-no-e2e → test:e2e
// 判定规则：execSync 不抛异常即通过（exit code 0），不依赖 stdout 关键字
// 失败时输出完整 stderr/stdout 便于定位

const { execSync } = require('child_process');

const steps = [
  { name: 'check:version', cmd: 'npm run check:version' },
  { name: 'Vitest', cmd: 'npm run test' },
  { name: 'Build', cmd: 'npm run build' },
  { name: 'check:prod-no-e2e', cmd: 'npm run check:prod-no-e2e' },
  { name: 'E2E', cmd: 'npm run test:e2e' },
];

const results = [];
let allPass = true;

for (const step of steps) {
  process.stdout.write(`[${step.name}] running... `);
  try {
    const output = execSync(step.cmd, {
      encoding: 'utf-8',
      timeout: 600000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // execSync 不抛异常 = exit code 0 = 通过
    results.push({ name: step.name, pass: true, output });
    console.log('PASS');
  } catch (err) {
    // execSync 抛异常 = exit code 非 0 = 失败，保留完整输出
    const output = (err.stdout || '') + (err.stderr || '');
    results.push({ name: step.name, pass: false, output });
    console.log('FAIL');
    allPass = false;
  }
}

console.log('\n========================================');
console.log('  验证汇总');
console.log('========================================');
for (const r of results) {
  console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}`);
}
console.log('========================================');
console.log(`  ${allPass ? '✅ 全部通过，可以合并 main' : '❌ 有失败项，需修复'}`);
console.log('========================================');

if (!allPass) {
  console.log('\n失败详情（完整 stderr/stdout）：');
  for (const r of results) {
    if (!r.pass) {
      console.log(`\n--- ${r.name} ---`);
      console.log(r.output);
    }
  }
}

process.exit(allPass ? 0 : 1);
