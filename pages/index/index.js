const fp = require('../../utils/fingerprint.js')

// 采集维度的展示元信息：分组标签（顺序即展示顺序）
const CATEGORY_META = {
  device: { label: '设备信息' },
  window: { label: '窗口信息' },
  app: { label: '应用环境' },
  network: { label: '网络' },
  misc: { label: '时区 / 环境' },
  battery: { label: '电池' },
  sensors: { label: '传感器' },
  canvas2d: { label: 'Canvas2D 渲染指纹' },
  webgl: { label: 'WebGL 渲染指纹' },
  simulator: { label: '模拟器检测' }
}

/**
 * 值格式化：null/undefined → 空串，对象 → JSON，其余 → 字符串
 * @param {*} v 原始字段值
 * @returns {string} 展示用的字符串
 */
function fmt(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/**
 * 把采集结果 categories 转成页面分组结构，供 WXML 列表渲染。
 * @param {object} categories 采集模块返回的全量维度数据
 * @returns {Array<{id:string,label:string,items:Array<{k:string,v:string}>}>} 分组列表
 */
function buildSections(categories) {
  const sections = []
  Object.keys(CATEGORY_META).forEach(function (key) {
    const raw = categories[key]
    if (!raw) return
    const items = Object.keys(raw).map(function (k) {
      return { k: k, v: fmt(raw[k]) }
    })
    sections.push({ id: key, label: CATEGORY_META[key].label, items: items })
  })
  return sections
}

Page({
  data: {
    loading: true,
    fpId: '',
    collectedAt: '',
    sections: [],
    copyTip: ''
  },

  // 页面就绪后自动采集一次（此时隐藏 canvas 节点已可用）
  onReady() {
    this.refresh()
  },

  /**
   * 重新采集：全维度采集 → 缓存 fpId（未变化则复用）→ 渲染分组列表
   */
  refresh() {
    this.setData({ loading: true, copyTip: '' })
    fp.collectAll().then((result) => {
      this._result = result
      const cached = fp.getCachedFpId()
      if (!cached || cached !== result.fpId) {
        fp.saveFpId(result.fpId)
      }
      this.setData({
        loading: false,
        fpId: result.fpId,
        collectedAt: result.collectedAt,
        sections: buildSections(result.categories)
      })
    }).catch((err) => {
      this.setData({ loading: false })
      wx.showToast({ title: '采集失败：' + err.message, icon: 'none' })
    })
  },

  /**
   * 复制 JSON：把最近一次采集结果 { fpVersion, fpId, collectedAt, categories } 写入剪贴板
   */
  onCopy() {
    const payload = this._result
      ? {
        fpVersion: this._result.fpVersion,
        fpId: this._result.fpId,
        collectedAt: this._result.collectedAt,
        categories: this._result.categories
      }
      : { sections: this.data.sections }
    wx.setClipboardData({
      data: JSON.stringify(payload, null, 2),
      success: () => {
        this.setData({ copyTip: '已复制到剪贴板' })
      }
    })
  }
})
