# A股短线盯盘助手 Pro V3

这一版新增：
- 服务器后台每 60 秒检查自选股（交易时段）
- Web Push 手机通知
- 自定义“关注买点 / 止盈观察 / 风险位”
- 自动获取最新行情
- 自动计算 MA5、MA10、MA20、RSI、量能
- 信号发生“偏多 / 风险”变化时自动推送
- 不自动下单

## 本地运行
需要 Node.js 18+：

```bash
npm install
npm run gen-vapid
```

把生成的两段 VAPID key 配为环境变量：
- VAPID_PUBLIC
- VAPID_PRIVATE
- VAPID_SUBJECT（例如 mailto:your@email.com）

然后：
```bash
npm start
```

浏览器打开 http://localhost:3000

## 部署到手机可访问的服务器
可部署到支持 Node.js 的 HTTPS 平台。部署时设置上述 3 个环境变量。

### iPhone 推送
1. 必须使用 HTTPS。
2. Safari 打开网站。
3. 分享 → “添加到主屏幕”。
4. 从主屏幕打开 App。
5. 点击“开启通知”。

## 说明
- 服务器必须持续运行，才能在你不打开网页时继续盯盘。
- 当前默认每 60 秒检查一次，适合提醒用途，不是毫秒级行情交易系统。
- 公开行情源可能延迟、限流或发生接口变化。
- 本软件仅辅助决策，不保证收益，不自动交易。
