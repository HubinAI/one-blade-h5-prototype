// V0723014+ 通用一键验证脚本
// 用法: node verify-all.cjs
// 自动执行: tsc + vitest + check:version + check:prod-no-e2e + e2e
// 输出汇总结果，绿了就可以合并 main

const { execSync } = require('child_process');

const steps = [
  { name: 'TypeScript', cmd: 'npx tsc --noEmit', expect: '0 errors' },
  { name: 'Vitest', cmd: 'npx vitest run', expect: 'all passed' },
  { name: 'check:version', cmd: 'npm run check:version', expect: 'Version OK' },
  { name: 'check:prod-no-e2e', cmd: 'npm run check:prod-no-e2e', expect: 'no E2E residue' },
  { name: 'E2E', cmd: 'npm run test:e2e -- e2e/boss-reactive-real-input.spec.ts e2e/boss-reactive-full-pointer.spec.ts --reporter=list', expect: 'passed' },
];

const results = [];
let allPass = true;

for (const step of steps) {
  process.stdout.write(`[${step.name}] running... `);
  try {
    const output = execSync(step.cmd, { encoding: 'utf-8', timeout: 300000, stdio: ['pipe', 'pipe', 'pipe'] });
    const pass = output.includes(step.expect) || output.includes('passed') || output.includes('OK');
    results.push({ name: step.name, pass, output: output.slice(-500) });
    console.log(pass ? 'PASS' : 'CHECK OUTPUT');
    if (!pass) allPass = false;
  } catch (err) {
    const output = (err.stdout || '') + (err.stderr || '');
    results.push({ name: step.name, pass: false, output: output.slice(-500) });
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
  console.log('\n失败详情:');
  for (const r of results) {
    if (!r.pass) {
      console.log(`\n--- ${r.name} ---`);
      console.log(r.output);
    }
  }
}

process.exit(allPass ? 0 : 1);
