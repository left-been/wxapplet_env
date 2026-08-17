# CHANGELOG

本文件记录各版本的功能新增 / 变更 / 回退。遵循语义化版本。

## [v1.0.0] - 2026-08-16

### 新增
- 首个可运行版本：原生微信小程序「设备指纹采集器」。
- 采集维度：
  - 设备信息：brand / model / system / platform / abi / benchmarkLevel（`wx.getDeviceInfo`，回退 `wx.getSystemInfoSync`）
  - 窗口信息：pixelRatio / screenWidth / screenHeight / statusBarHeight / safeArea 等（`wx.getWindowInfo`）
  - 应用环境：SDKVersion / version / language / theme / fontSizeSetting / host（`wx.getAppBaseInfo`）
  - 网络：networkType（`wx.getNetworkType`）
  - 时区/环境：timezoneOffset / timezone / UA
  - Canvas2D 渲染指纹：隐藏 canvas 绘制固定图案（渐变+文本+弧线+噪点）→ `getImageData` 采样哈希
  - WebGL 渲染指纹：`WEBGL_debug_renderer_info` VENDOR/RENDERER、容量参数、扩展数 + `readPixels` 像素哈希
- 指纹生成：各分组稳定化 JSON 拼接 → FNV-1a 32bit → `fpId`。
- 本地缓存：`fpId` 存 `wx.setStorageSync`，二次进入复用。
- 页面交互：分组卡片展示、重新采集、复制 JSON（含 fpId/采集时间/各维度）。

### 说明
- 纯本地展示，无网络上报，无权限申请（合规干净）。
- Canvas/WebGL 在微信开发者工具中多设备特征一致，真机才具区分度（已知限制，详见设计文档）。
