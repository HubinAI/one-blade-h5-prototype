# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: boss-reactive-full-pointer.spec.ts >> Reactive Boss 全Pointer三甲→pursuit >> 真实鼠标循环命中完成三甲并进入追击
- Location: e2e\boss-reactive-full-pointer.spec.ts:11:3

# Error details

```
Error: page.evaluate: TypeError: Cannot read properties of undefined (reading 'getState')
    at eval (eval at evaluate (:303:30), <anonymous>:1:32)
    at UtilityScript.evaluate (<anonymous>:305:16)
    at UtilityScript.<anonymous> (<anonymous>:1:44)
```

# Page snapshot

```yaml
- main [ref=e3]:
  - generic [ref=e4]:
    - heading "挑战失败" [level=1] [ref=e5]
    - paragraph [ref=e6]: 未能挡住雷将攻势
    - paragraph [ref=e7]: 防线失守
    - button "再试一次" [ref=e8]
    - button "重新挑战（从头开始）" [ref=e9]
    - button "返回" [ref=e10]
```