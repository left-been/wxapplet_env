# CHANGELOG

本文件记录各版本的功能新增 / 变更 / 回退。遵循语义化版本。

## [v1.2.0] - 2026-08-17

### 新增
- 检测维度「模拟器嫌疑」：`detectSimulator` 基于 device / window / webgl 联合打分。
  - 强信号：platform=devtools、abi 含 x86、WebGL 软件渲染器（SwiftShader/llvmpipe/Basic Render）、model 模拟器关键字。
  - 弱信号：ANGLE+桌面 GPU、benchmarkLevel 异常低、无 safeArea。
- 输出 `{ verdict, score, signals }`，verdict ∈ { likely_emulator, suspicious, real_device }。
- 页面新增「模拟器检测」分组展示；`FPVersion` 提升至 `1.2.0`。

### 说明
- 静态启发式规则，非模型判定；开发者工具因 ANGLE 渲染常被判 suspicious，属预期。
- 指纹算法未变，仅新增派生维度入种子。

## [v1.1.0] - 2026-08-16

### 新增
- 采集维度「电池」：`wx.getBatteryInfoSync`（回退 `wx.getBatteryInfo`），采集 level / isCharging。
- 采集维度「传感器」：加速度计 / 罗盘 / 陀螺仪并行探测（on + start → 取首个有效读数 → off + stop），
  1s 无数据降级 `unsupported`。
- 页面新增「电池」「传感器」两个分组展示。
- `FPVersion` 提升至 `1.1.0`（新维度进入指纹种子，本版 fpId 与 v1.0.0 不可比）。

### 说明
- 指纹算法未变（仍为稳定化 JSON + FNV-1a），仅维度扩展。
- 开发者工具中传感器 API 通常 fail，显示 unsupported 属正常现象。

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
