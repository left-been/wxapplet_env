/**
 * 设备指纹采集核心模块
 * - 按维度采集：设备 / 窗口 / 应用环境 / 网络 / 时区 / 电池 / 传感器 / Canvas2D / WebGL
 * - 模拟器嫌疑检测（基于 device/win/webgl 联合规则打分）
 * - 稳定化 JSON + FNV-1a 生成指纹 ID（借鉴数美/顶象「本地哈希」思路）
 * - fpId 写入 storage 缓存，二次进入直接复用
 * 所有维度失败均降级处理，不阻塞整体采集。
 */
const FPVersion = '1.2.0'
const FP_KEY = 'fp_demo_device_id'
const DRAW_SIZE = 160

/**
 * FNV-1a 32bit 哈希
 * 把任意字符串压缩为固定长度指纹摘要，异或 + 32 位乘质数，雪崩特性好、实现轻量。
 * @param {string} str 输入字符串
 * @returns {string} 8 位十六进制哈希串
 */
function fnv1a(str) {
  let hash = 0x811c9dc5 // FNV-1a 32位的初始偏移基准（offset basis）
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * 稳定化序列化：对象 key 排序、嵌套数组/对象规范化。
 * 消除键序抖动，保证同一数据在任何环境下序列化结果一致（指纹跨设备可比的前提）。
 * @param {*} obj 任意可序列化数据
 * @returns {string} 稳定排序后的 JSON 字符串
 */
function stableStringify(obj) {
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']'
  }
  if (obj && typeof obj === 'object') {
    const keys = Object.keys(obj).sort()
    return '{' + keys.map(function (k) {
      return JSON.stringify(k) + ':' + stableStringify(obj[k])
    }).join(',') + '}'
  }
  return JSON.stringify(obj)
}

/**
 * 从 API 返回对象中挑选非空字段，裁剪冗余数据、保证指纹字段集合可控。
 * @param {object} obj 数据源
 * @param {string[]} keys 需要的字段名列表
 * @returns {object} 仅含非空字段的对象
 */
function pick(obj, keys) {
  const out = {}
  keys.forEach(function (k) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') {
      out[k] = obj[k]
    }
  })
  return out
}

/**
 * 采集「设备信息」维度：品牌 / 型号 / 系统 / 平台 / ABI / 跑分。
 * 优先使用新拆分 API wx.getDeviceInfo，旧基础库回退 wx.getSystemInfoSync。
 * @returns {object} 设备信息字段集合
 */
function collectDevice() {
  try {
    if (wx.getDeviceInfo) {
      return pick(wx.getDeviceInfo(), ['brand', 'model', 'system', 'platform', 'abi', 'benchmarkLevel'])
    }
    const sys = wx.getSystemInfoSync()
    return pick(sys, ['brand', 'model', 'system', 'platform', 'abi', 'benchmarkLevel'])
  } catch (e) {
    return { error: e.message }
  }
}

/**
 * 采集「窗口信息」维度：像素比 / 屏幕宽高 / 状态栏 / 安全区等。
 * 优先 wx.getWindowInfo，旧基础库回退 wx.getSystemInfoSync。
 * @returns {object} 窗口信息字段集合
 */
function collectWindow() {
  try {
    if (wx.getWindowInfo) {
      return pick(wx.getWindowInfo(), ['pixelRatio', 'screenWidth', 'screenHeight', 'statusBarHeight', 'screenTop', 'windowWidth', 'windowHeight', 'safeArea'])
    }
    const sys = wx.getSystemInfoSync()
    return pick(sys, ['pixelRatio', 'screenWidth', 'screenHeight', 'statusBarHeight', 'screenTop', 'windowWidth', 'windowHeight', 'safeArea'])
  } catch (e) {
    return { error: e.message }
  }
}

/**
 * 采集「应用环境」维度：基础库版本 / 小程序版本 / 语言 / 主题 / 字体 / 宿主等。
 * 优先 wx.getAppBaseInfo，旧基础库回退 wx.getSystemInfoSync。
 * @returns {object} 应用环境字段集合
 */
function collectApp() {
  try {
    if (wx.getAppBaseInfo) {
      return pick(wx.getAppBaseInfo(), ['SDKVersion', 'version', 'language', 'theme', 'fontSizeSetting', 'host', 'enableDebug'])
    }
    const sys = wx.getSystemInfoSync()
    return pick(sys, ['SDKVersion', 'version', 'language', 'theme', 'fontSizeSetting', 'host', 'enableDebug'])
  } catch (e) {
    return { error: e.message }
  }
}

/**
 * 采集「网络」维度：网络类型（callback API，包装为 Promise）。
 * @returns {Promise<object>} networkType / signalStrength，失败返回空对象
 */
function collectNetwork() {
  return new Promise(function (resolve) {
    if (!wx.getNetworkType) {
      resolve({})
      return
    }
    wx.getNetworkType({
      success: function (res) {
        resolve(pick(res, ['networkType', 'signalStrength']))
      },
      fail: function () {
        resolve({})
      }
    })
  })
}

/**
 * 采集「时区 / 环境」维度：时区偏移、Intl 时区名、UA。
 * 各子项独立 try/catch，单项失败不影响其它。
 * @returns {object} timezoneOffsetHours / timezone / ua
 */
function collectMisc() {
  const out = {}
  try {
    const d = new Date()
    out.timezoneOffsetHours = -d.getTimezoneOffset() / 60
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      out.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'
    }
  } catch (e) {
    out.miscError = e.message
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.userAgent) {
      out.ua = navigator.userAgent
    }
  } catch (e) {}
  return out
}

/**
 * 采集「电池」维度：电量 + 是否充电。
 * 优先 sync API，回退 callback API；两者都不可用返回空对象。
 * @returns {Promise<object>} { level, isCharging }
 */
function collectBattery() {
  return new Promise(function (resolve) {
    try {
      if (wx.getBatteryInfoSync) {
        resolve(pick(wx.getBatteryInfoSync(), ['level', 'isCharging']))
        return
      }
    } catch (e) {}
    if (wx.getBatteryInfo) {
      wx.getBatteryInfo({
        success: function (res) {
          resolve(pick(res, ['level', 'isCharging']))
        },
        fail: function () {
          resolve({})
        }
      })
    } else {
      resolve({})
    }
  })
}

// 传感器探测配置：key / 启动 / 停止 / 监听 / 字段
const SENSOR_PROBES = [
  { key: 'accelerometer', start: 'startAccelerometer', stop: 'stopAccelerometer', on: 'onAccelerometerChange', off: 'offAccelerometerChange', fields: ['x', 'y', 'z'] },
  { key: 'compass', start: 'startCompass', stop: 'stopCompass', on: 'onCompassChange', off: 'offCompassChange', fields: ['direction', 'accuracy'] },
  { key: 'gyroscope', start: 'startGyroscope', stop: 'stopGyroscope', on: 'onGyroscopeChange', off: 'offGyroscopeChange', fields: ['x', 'y', 'z'] }
]

/**
 * 探测单个传感器：注册监听 → 启动 → 取首个有效读数后停止。
 * 模拟器/开发者工具常失败或返回全 0（本身就是一种区分信号）。
 * @param {object} cfg 传感器配置（见 SENSOR_PROBES）
 * @returns {Promise<object>} { key: {x,y,z} | {unsupported} }
 */
function probeSensor(cfg) {
  return new Promise(function (resolve) {
    const startFn = wx[cfg.start]
    const onFn = wx[cfg.on]
    const offFn = wx[cfg.off]
    const stopFn = wx[cfg.stop]
    if (!startFn || !onFn) {
      resolve({ [cfg.key]: { unsupported: 'api missing' } })
      return
    }
    let done = false
    let timer = null
    const finish = function (data) {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      try { if (offFn) offFn(handler) } catch (e) {}
      try { if (stopFn) stopFn({}) } catch (e) {}
      resolve({ [cfg.key]: data })
    }
    const handler = function (res) {
      const clean = pick(res, cfg.fields)
      if (Object.keys(clean).length) finish(clean)
    }
    timer = setTimeout(function () {
      finish({ unsupported: 'timeout / no data' })
    }, 1000)
    try {
      onFn(handler)
      startFn({
        interval: 'normal',
        success: function () {},
        fail: function () { finish({ unsupported: 'start fail' }) }
      })
    } catch (e) {
      finish({ unsupported: e.message })
    }
  })
}

/**
 * 采集「传感器」维度：加速度计 / 罗盘 / 陀螺仪并行探测。
 * @returns {Promise<object>} { accelerometer, compass, gyroscope }，各自可能带 unsupported
 */
function collectSensors() {
  return Promise.all(SENSOR_PROBES.map(probeSensor)).then(function (arr) {
    const out = {}
    arr.forEach(function (o) {
      Object.assign(out, o)
    })
    return out
  })
}

/**
 * 模拟器/开发者工具嫌疑检测（借鉴数美/顶象多特征联合思路）。
 * 基于已采集的 device / window / webgl 维度做规则打分，输出结论供展示。
 * 规则（强→弱）：
 *   devtools      平台=devtools（开发者工具）
 *   emu_abi      abi 含 x86 / emulator（真机几乎全为 arm 架构）
 *   soft_renderer WebGL 渲染器为软件渲染（SwiftShader/llvmpipe/Basic Render）或 ANGLE+桌面GPU
 *   emu_model     model 含 sdk_gphone / Emulator / SDK built for x86 等模拟器型号
 *   weak_bench    benchmarkLevel 异常低
 *   pc_like       无安全区信息（PC 显示器/无刘海）
 * @param {object} categories 已采集的维度数据
 * @returns {object} { verdict, score, signals }；verdict: likely_emulator / suspicious / real_device
 */
function detectSimulator(categories) {
  const device = categories.device || {}
  const window = categories.window || {}
  const webgl = categories.webgl || {}
  const signals = []
  let score = 0

  function addRule(name, value, weight, hit) {
    const v = (value === undefined || value === null || value === '') ? '—' : String(value)
    if (hit) {
      score += weight
      signals.push(name + '=' + v)
    }
  }

  addRule('platform', device.platform, 100, device.platform === 'devtools')
  const abi = String(device.abi || '')
  addRule('abi', abi, 60, /x86|emulator/i.test(abi.toLowerCase()))
  const model = String(device.model || '')
  addRule('model', model, 50, /sdk_gphone|emulator|android sdk built|unknown/i.test(model.toLowerCase()))
  const renderer = String(webgl.renderer || '')
  addRule('renderer', renderer, 70, /swiftshader|llvmpipe|basic render/i.test(renderer.toLowerCase()))
  addRule('renderer(ANGLE+桌面GPU)', renderer, 40, /angle/i.test(renderer.toLowerCase()) && /intel|microsoft|amd|nvidia/i.test(renderer.toLowerCase()))
  const vendor = String(webgl.vendor || '')
  addRule('vendor', vendor, 20, /microsoft|google inc/i.test(vendor.toLowerCase()))
  const benchmarkLevel = device.benchmarkLevel
  addRule('benchmarkLevel', benchmarkLevel, 30, typeof benchmarkLevel === 'number' && benchmarkLevel > 0 && benchmarkLevel < 20)
  addRule('safeArea', window.safeArea ? 'present' : 'missing', 15, !window.safeArea && window.windowHeight > 0)

  let verdict = 'real_device'
  if (score >= 90) verdict = 'likely_emulator'
  else if (score >= 40) verdict = 'suspicious'
  return { verdict: verdict, score: score, signals: signals }
}

/**
 * 通过 SelectorQuery 获取隐藏 canvas 节点（含尺寸信息）。
 * 2d 与 webgl 节点通用；节点未就绪返回 null。
 * @param {string} selector canvas 节点的 id 选择器（如 '#fp-canvas-2d'）
 * @returns {Promise<object|null>} { node, width, height } 或 null
 */
function getCanvasNode(selector) {
  return new Promise(function (resolve) {
    wx.createSelectorQuery()
      .select(selector)
      .fields({ node: true, size: true })
      .exec(function (res) {
        const info = res && res[0]
        resolve(info && info.node ? info : null)
      })
  })
}

/**
 * Canvas2D 渲染指纹：在隐藏 canvas 上绘制固定图案（渐变 + 文本 + 弧线 + 噪点），
 * 经 getImageData 取像素序列抽稀后 FNV 哈希。
 * 渲染结果受 GPU / 字体 / 抗锯齿实现影响 → 天然的设备区分特征（借鉴阿里云/数美的隐藏 canvas 方案）。
 * @returns {Promise<object>} 尺寸 / 像素数 / 采样数 / 像素哈希；失败降级 { unsupported }
 */
function collectCanvas2D() {
  return getCanvasNode('#fp-canvas-2d').then(function (info) {
    if (!info) return { unsupported: 'canvas 2d node not found' }
    const node = info.node
    try {
      node.width = DRAW_SIZE
      node.height = DRAW_SIZE
      const ctx = node.getContext('2d')
      const w = DRAW_SIZE
      const h = DRAW_SIZE
      const grad = ctx.createLinearGradient(0, 0, w, h)
      grad.addColorStop(0, '#ff6600')
      grad.addColorStop(0.5, '#00aaff')
      grad.addColorStop(1, '#00ff66')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#000000'
      ctx.font = 'bold 18px sans-serif'
      ctx.fillText('FP-DEMO-' + FPVersion, 6, h / 2 - 6)
      ctx.font = '12px monospace'
      ctx.fillText(w + 'x' + h, 6, h / 2 + 16)
      ctx.beginPath()
      ctx.arc(w / 2, h / 2, 14, 0, Math.PI * 2)
      ctx.strokeStyle = '#ff0000'
      ctx.lineWidth = 2
      ctx.stroke()
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = 'rgb(' + (i * 5 % 255) + ',' + (i * 13 % 255) + ',' + (i * 7 % 255) + ')'
        ctx.fillRect((i * 7) % w, (i * 11) % h, 1, 1)
      }
      const imgData = ctx.getImageData(0, 0, w, h)
      const data = imgData.data
      const sample = []
      for (let i = 0; i < data.length; i += 16) {
        sample.push(data[i] + '-' + data[i + 1] + '-' + data[i + 2])
      }
      return {
        width: w,
        height: h,
        pixelCount: data.length / 4,
        sampled: sample.length,
        hash: fnv1a(sample.join(','))
      }
    } catch (e) {
      return { unsupported: '2d draw error: ' + e.message }
    }
  })
}

/**
 * WebGL 渲染指纹：读取 GPU 厂商/渲染器（UNMASKED）、GL 版本、容量参数、扩展数，
 * 再 clear + readPixels 采样像素哈希。
 * readPixels 在部分低端机不可用，已降级为 pixelHash='unavailable'。
 * @returns {Promise<object>} GPU 参数 + 像素哈希；失败降级 { unsupported }
 */
function collectWebGL() {
  return getCanvasNode('#fp-canvas-webgl').then(function (info) {
    if (!info) return { unsupported: 'webgl canvas node not found' }
    const node = info.node
    try {
      node.width = DRAW_SIZE
      node.height = DRAW_SIZE
      const gl = node.getContext('webgl')
      if (!gl) return { unsupported: 'webgl context unavailable' }
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS)
      const out = {
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        version: gl.getParameter(gl.VERSION),
        shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        maxViewportW: viewport ? viewport[0] : 0,
        maxViewportH: viewport ? viewport[1] : 0,
        extensions: (gl.getSupportedExtensions() || []).length
      }
      try {
        gl.clearColor(0.1, 0.4, 0.8, 1.0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        const buf = new Uint8Array(node.width * node.height * 4)
        gl.readPixels(0, 0, node.width, node.height, gl.RGBA, gl.UNSIGNED_BYTE, buf)
        const sample = []
        for (let i = 0; i < buf.length; i += 64) {
          sample.push(buf[i])
        }
        out.pixelCount = node.width * node.height
        out.pixelHash = fnv1a(sample.join(','))
      } catch (err) {
        out.pixelHash = 'unavailable'
      }
      return out
    } catch (e) {
      return { unsupported: 'webgl error: ' + e.message }
    }
  })
}

/**
 * 生成指纹 ID：以「指纹版本 + 稳定化全量维度 JSON」为种子做 FNV-1a。
 * fpVersion 参与种子 → 指纹算法升级后历史 fpId 不再可比。
 * @param {object} categories 全量采集维度数据
 * @returns {string} 8 位十六进制指纹 ID
 */
function generateFpId(categories) {
  const seed = FPVersion + stableStringify(categories)
  return fnv1a(seed)
}

/**
 * 采集总入口：同步采集基础维度，Canvas2D / WebGL / 网络并行采集，
 * 组装完整结果 { fpVersion, fpId, collectedAt, categories }。
 * @returns {Promise<object>} 采集结果；任一维度失败以降级字段呈现，不整体失败
 */
function collectAll() {
  return new Promise(function (resolve, reject) {
    try {
      const categories = {
        device: collectDevice(),
        window: collectWindow(),
        app: collectApp(),
        misc: collectMisc()
      }
      Promise.all([collectCanvas2D(), collectWebGL(), collectNetwork(), collectBattery(), collectSensors()]).then(function (arr) {
        categories.canvas2d = arr[0]
        categories.webgl = arr[1]
        categories.network = arr[2]
        categories.battery = arr[3]
        categories.sensors = arr[4]
        categories.simulator = detectSimulator(categories)
        resolve({
          fpVersion: FPVersion,
          fpId: generateFpId(categories),
          collectedAt: new Date().toISOString(),
          categories: categories
        })
      }, reject)
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * 读取本地缓存的 fpId（storage key: fp_demo_device_id）。
 * @returns {string} 缓存的指纹 ID，无则返回空串
 */
function getCachedFpId() {
  try {
    return wx.getStorageSync(FP_KEY) || ''
  } catch (e) {
    return ''
  }
}

/**
 * 写入 fpId 到本地缓存，供二次进入直接复用。
 * @param {string} id 指纹 ID
 */
function saveFpId(id) {
  try {
    wx.setStorageSync(FP_KEY, id)
  } catch (e) {}
}

module.exports = {
  FPVersion: FPVersion,
  collectAll: collectAll,
  generateFpId: generateFpId,
  stableStringify: stableStringify,
  getCachedFpId: getCachedFpId,
  saveFpId: saveFpId
}
