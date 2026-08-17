# 商业设备指纹方案调研（面向微信小程序）

> 调研日期：2026-08-16
> 用途：为学习版小程序指纹采集提供行业参考（信号维度、算法思路、合规要点）。
> 说明：以下为公开渠道调研整理，仅作技术学习参考。

## 一、结论速览

微信小程序环境下，**设备指纹的差异化主要靠 Canvas/WebGL 渲染指纹 + 设备信息组合**，
因为小程序 API 封闭，拿不到 IMEI / 字体列表 / 插件等浏览器指纹常见信号。
主流厂商（数美 / 顶象 / 阿里云）的共性做法：

1. 隐藏 canvas 节点采集渲染像素（2d + webgl）；
2. 本地归一化拼接属性 → 哈希（SHA-256 / MD5 / FNV 类）生成设备 ID；
3. 采集结果生成 token/deviceToken，随业务请求上报服务端比对 + 风险评分；
4. 指纹版本化（fp_version），可选权限（位置/蓝牙/WiFi）默认不申请、拒绝不阻塞。

## 二、支持微信小程序的厂商清单

| 厂商 | 产品/文档 | 小程序采集要点 | 形态 |
|---|---|---|---|
| 数美科技 | 设备指纹 SDK（weapp-fp）[help.ishumei.com/docs/tw/sdk/weapp](https://help.ishumei.com/docs/tw/sdk/weapp/developDoc) | 支持微信/QQ/字节/支付宝小程序；`SMSdk.initConf({organization, publicKey})` 启动；采集 OS/屏幕/网络 + Canvas/WebGL；40+ 风险标签、50+ 属性标签；识别模拟器/多开；上报域名 `fp-it.fengkongcloud.com` 等 | SaaS，等保三级 |
| 顶象科技 | 设备指纹 Risk 小程序版 [dingxiang-inc.com/docs/detail/const-id](https://www.dingxiang-inc.com/docs/detail/const-id) | `constid-xcx-saas.js` 下载本地引入；`new ConstId({appId, server, cache})`；采集设备型号/系统/手机样式，可选蓝牙/GPS/WiFi 列表；出指纹 token（token ≠ 指纹） | SaaS/私有化 |
| 阿里云 | 设备风控 · 微信小程序 SDK [help.aliyun.com 接入文档](https://help.aliyun.com/zh/fraud-detection/developer-reference/wechat-applet-sdk-access) | 引入 `AliyunFP`，页面埋隐藏 `feilin-view`（canvas type=2d + type=webgl）；`onReady` 里 `AliyunFP.init({appKey, appName, openId, endpoints})`；`getToken()` 取 deviceToken；上报域名 `cloudauth-device.aliyuncs.com` / `cn-shanghai.device.saf.aliyuncs.com` | 云服务 |
| 网易易盾 | 设备指纹微信小程序接入 [support.dun.163.com](https://support.dun.163.com/documents/609099986339037184?docId=674394684073484288) | 服务端域名 `fp-upload.dun.163.com` 需加白名单；客户端/服务端两种版本；设计上不采通讯录、位置等敏感权限 | SaaS/私有化 |
| 同盾 TrustDecision | 设备指纹/反欺诈（出海） | 轻量 JS/移动 SDK，70+ 风险标签，识别模拟器/越狱/多开；设备指纹+身份反欺诈全家桶 | SaaS |
| 邦盛科技 | 设备指纹 Pro | 私有化部署，跨渠道一致设备 ID，改机/重置/卸载重装后指纹仍稳定 | 私有化 |
| 白骑士 | 反欺诈云 · 设备指纹 | 金融风控向，采集设备型号/OS/屏幕/IMEI/UUID | SaaS |
| Fingerprint.com | Fingerprint Pro | Web+移动；Canvas/WebGL/音频/行为生物特征；ISO 27001、SOC2、GDPR/CCPA | 海外 SaaS |

## 三、信号维度设计（厂商共性）

| 层级 | 信号 | 小程序内的实现 |
|---|---|---|
| 基础设备 | brand/model/system/platform/abi/跑分 | `wx.getDeviceInfo`（旧库 `getSystemInfoSync`） |
| 窗口 | 分辨率/像素比/安全区/状态栏 | `wx.getWindowInfo` |
| 应用环境 | 基础库版本/小程序版本/语言/主题/字体 | `wx.getAppBaseInfo` |
| 渲染指纹 | Canvas2D / WebGL 像素 | 隐藏 canvas 节点 + `getImageData` / `readPixels` |
| 网络/环境 | 网络类型/时区/UA | `wx.getNetworkType`、Intl、navigator |
| 可选权限 | 位置/WiFi 列表/蓝牙 | `wx.getLocation` / `wx.getBluetoothDevices`（默认不申请） |

## 四、算法与工程要点

- **指纹生成**：属性归一化（去噪、标准化）→ 定序拼接 → SHA-256/MD5 → 固定长度 ID。
- **稳定性策略**：同族分辨率归并、时间戳离散化，避免系统小升级导致指纹跳变。
- **版本化**：指纹算法带 `fp_version`，迭代不破坏历史数据（本项目 fpId 已含 FPVersion 种子）。
- **采集失败降级**：采集率 <100% 属常态，厂商均建议业务不强依赖指纹字段。
- **相似度关联**：高配方案融合行为节奏（触摸轨迹/点击间隔）与多属性做模糊匹配，应对属性微调。

## 五、合规要点（学习版必须对齐的部分）

- 隐私政策披露：SDK 名称、收集字段、用途、运营方（参照顶象/数美的合规文档格式）。
- 最小化收集：可选权限默认不申请；用户拒绝后不阻塞风控业务。
- 等保三级 / GDPR-CCPA 是商用标配；学习项目无需申请权限、不做跨 appid 追踪即最干净。

## 六、对本项目 v1.0.0 的映射

本项目已落地：设备/窗口/应用环境/网络/时区 + Canvas2D/WebGL 渲染指纹 + 本地 FNV-1a 哈希 + storage 缓存，
均为纯本地展示。后续迭代候选（对应厂商方案）：
- v1.1.0 上报至自建服务端做跨设备指纹比对（对齐数美/顶象 SaaS 上报链路）。
- v1.2.0 可选权限维度（位置/蓝牙/WiFi）+ 隐私披露文案（对齐顶象/阿里云权限设计）。
- v1.3.0 行为节奏采集做相似度关联（对齐同盾/数美的模糊匹配思路）。
