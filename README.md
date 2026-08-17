# 微信小程序设备指纹采集器 (WeChat Mini-Program Device Fingerprint Collector)

一个**学习用途**的原生微信小程序，按维度采集设备信息并生成本地设备指纹，用于研究
小程序端设备指纹的原理与实现。纯本地采集展示，无网络上报、无权限申请、零依赖。

> 声明：本项目仅用于技术学习与研究，请勿用于任何侵犯用户隐私或违反平台规范的行为。

## 功能特性

- **多维度采集**：设备信息、窗口信息、应用环境、网络、时区、电池、传感器、Canvas2D / WebGL 渲染指纹
- **渲染指纹**：隐藏 canvas 绘制固定图案，经 `getImageData` / `readPixels` 采样像素生成指纹（借鉴阿里云 / 数美隐藏 canvas 方案）
- **模拟器嫌疑检测**：基于 platform / abi / 渲染器 / model / 跑分 / 安全区联合打分，输出 `likely_emulator / suspicious / real_device` 结论与逐维度明细
- **稳定指纹**：动态维度（电池 / 传感器 / 网络）仅展示、不进入指纹种子，同设备重复采集 fpId 恒定
- **指纹算法**：稳定化 JSON 拼接 + FNV-1a 32bit，指纹版本参与种子
- **本地缓存**：fpId 存入 storage，二次进入复用
- **一键导出**：复制完整采集 JSON 到剪贴板，便于对比分析

## 快速开始

1. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 打开开发者工具 → 「导入项目」→ 选择本项目根目录
3. AppID 使用测试号（项目已配置 `touristappid`）或替换为你的 AppID
4. 编译运行，页面自动采集并展示各维度数据与指纹 ID

真机预览：点击右上角「预览」扫码，用两台不同设备对比指纹差异。

## 采集维度

| 分组 | 数据源 | 说明 |
|---|---|---|
| device | `wx.getDeviceInfo` | brand / model / system / platform / abi / benchmarkLevel |
| window | `wx.getWindowInfo` | pixelRatio / 屏幕尺寸 / 安全区 / 状态栏 |
| app | `wx.getAppBaseInfo` | SDKVersion / 小程序版本 / 语言 / 主题 / 字体 / 宿主 |
| network | `wx.getNetworkType` | 网络类型 / 信号强度（动态） |
| misc | JS 原生 | 时区偏移 / Intl 时区 / UA |
| battery | `wx.getBatteryInfo` | 电量 / 充电状态（动态） |
| sensors | 传感器 API | 加速度计 / 罗盘 / 陀螺仪首读数（动态） |
| canvas2d | 隐藏 `<canvas type="2d">` | 固定图案渲染像素哈希 |
| webgl | 隐藏 `<canvas type="webgl">` | GPU 厂商/渲染器 + readPixels 像素哈希 |
| simulator | 派生分析 | 模拟器/开发者工具嫌疑结论与逐维度明细 |

> 动态维度（network / battery / sensors）随时间变化，仅作展示与辅助判断，不参与指纹生成。

## 指纹生成原理

```
fpId = FNV-1a( fpVersion || stableJSON(静态维度) )
```

- 静态维度（device / window / app / misc / canvas2d / webgl / simulator）进入种子
- 动态维度（battery / sensors / network）与派生明细（simulator.rules）剔除，保证同设备指纹稳定
- `fpVersion` 参与种子：指纹算法或维度集合变更后，历史 fpId 不再可比（详见版本约定）

## 模拟器嫌疑检测

基于已采集维度联合打分，每条规则输出 维度名 / 观测值 / 权重 / 是否命中：

| 规则 | 观测值示例 | 权重 |
|---|---|---|
| platform | devtools | +100 |
| abi | x86_64 | +60 |
| model | sdk_gphone64_x86_64 | +50 |
| renderer | SwiftShader / llvmpipe | +70 |
| renderer(ANGLE+桌面GPU) | ANGLE (Intel, ...) | +40 |
| vendor | Microsoft | +20 |
| benchmarkLevel | < 20 | +30 |
| safeArea | missing | +15 |

结论：`score >= 90` → likely_emulator；`>= 40` → suspicious；其余 → real_device。

> 注意：静态启发式规则只能给「嫌疑分」，商用级判定依赖指纹库比对 + 模型，本项目不构成风控能力。

## 项目结构

```
├── app.js / app.json / app.wxss / sitemap.json   # 小程序骨架
├── project.config.json                            # 开发者工具配置
├── utils/
│   └── fingerprint.js                             # 采集核心 + 指纹算法 + 模拟器检测
├── pages/
│   └── index/                                     # 采集展示页
└── docs/
    ├── design/                                    # 版本化设计文档（v1.0.0 ~ v1.2.1）
    └── research/                                  # 商业设备指纹方案调研
```

## 设计文档与版本约定

- [docs/design/README.md](docs/design/README.md)：版本索引与演进约定
- [docs/design/CHANGELOG.md](docs/design/CHANGELOG.md)：变更记录
- [docs/research/commercial-device-fingerprint.md](docs/research/commercial-device-fingerprint.md)：数美 / 顶象 / 阿里云等厂商方案调研

语义化版本：MAJOR 算法变更 / MINOR 新增维度能力 / PATCH 缺陷修复。

## 已知限制

- 微信开发者工具中 Canvas / WebGL 渲染特征基本一致，多设备差异需真机验证
- `Intl.DateTimeFormat().timeZone` 部分安卓机型返回 unknown（平台限制）
- 低端机 `readPixels` 可能失败，已降级处理
- 传感器 API 在开发者工具中通常 fail，显示 `unsupported` 属正常现象

## 合规说明

- 纯本地采集展示，无任何网络请求，无位置 / 蓝牙 / WiFi 等权限申请
- 不采集 openid / 手机号等身份信息，仅限本项目自身运行

## 路线图

- [ ] v1.3.x 行为节奏采集（触摸轨迹 / 频率）做相似度关联
- [ ] 上报至自建服务端做跨设备指纹比对（需先接入隐私披露文案）
- [ ] 指纹重置入口

## License

[MIT](LICENSE)