/**
 * 轻量 JSON 数据仓库 —— 单集合读写 + 内存索引 + 防抖落盘
 * 说明：MVP 阶段使用文件持久化，后续可平滑替换为 MySQL / MongoDB，
 * 上层 API 只依赖本模块暴露的方法，无需改动业务代码。
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../../data');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function nowISO() {
  return new Date().toISOString();
}

function genId(prefix = '') {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}${t}${r}`;
}

class Store {
  constructor(name, defaults = []) {
    this.file = path.join(DATA_DIR, `${name}.json`);
    this.defaults = defaults;
    this.items = [];
    this._dirty = false;
    this._timer = null;
    this.load();
  }

  load() {
    ensureDir();
    try {
      if (fs.existsSync(this.file)) {
        const raw = fs.readFileSync(this.file, 'utf8').trim();
        this.items = raw ? JSON.parse(raw) : [...this.defaults];
      } else {
        this.items = [...this.defaults];
        this.saveSync();
      }
    } catch (err) {
      console.error(`[store] ${path.basename(this.file)} 损坏，已备份并从默认值恢复`, err.message);
      const bak = `${this.file}.corrupt-${Date.now()}`;
      try { fs.copyFileSync(this.file, bak); } catch { /* ignore */ }
      this.items = [...this.defaults];
      this.saveSync();
    }
    return this.items;
  }

  saveSync() {
    ensureDir();
    fs.writeFileSync(this.file, JSON.stringify(this.items, null, 2), 'utf8');
    this._dirty = false;
  }

  save() {
    this._dirty = true;
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      if (!this._dirty) return;
      this.saveSync();
    }, 120);
  }

  flush() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    this.saveSync();
  }

  all() { return this.items; }

  findById(id) { return this.items.find((x) => x.id === id) || null; }

  find(predicate) { return this.items.filter(predicate); }

  findOne(predicate) { return this.items.find(predicate) || null; }

  insert(doc) {
    const row = {
      id: doc.id || genId(),
      createdAt: doc.createdAt || nowISO(),
      updatedAt: doc.updatedAt || nowISO(),
      ...doc
    };
    this.items.unshift(row);
    this.save();
    return row;
  }

  update(id, patch) {
    const idx = this.items.findIndex((x) => x.id === id);
    if (idx === -1) return null;
    this.items[idx] = { ...this.items[idx], ...patch, id, updatedAt: nowISO() };
    this.save();
    return this.items[idx];
  }

  upsert(matcher, doc) {
    const found = this.items.find(matcher);
    if (found) return this.update(found.id, doc);
    return this.insert(doc);
  }

  remove(id) {
    const idx = this.items.findIndex((x) => x.id === id);
    if (idx === -1) return false;
    this.items.splice(idx, 1);
    this.save();
    return true;
  }

  count(predicate) {
    return predicate ? this.items.filter(predicate).length : this.items.length;
  }
}

/** 键值型配置仓库（用于后台qli设置、运营位配置等） */
class ConfigStore {
  constructor(name, defaults = {}) {
    this.file = path.join(DATA_DIR, `${name}.json`);
    this.data = { ...defaults };
    ensureDir();
    try {
      if (fs.existsSync(this.file)) {
        Object.assign(this.data, JSON.parse(fs.readFileSync(this.file, 'utf8') || '{}'));
      } else {
        fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
      }
    } catch {
      /* 使用默认值 */
    }
  }

  get(key, fallback = null) {
    return key in this.data ? this.data[key] : fallback;
  }

  set(key, value) {
    this.data[key] = value;
    fsp.writeFile(this.file, JSON.stringify(this.data, null, 2), 'utf8').catch(() => {});
    return value;
  }

  all() { return this.data; }

  patch(obj) {
    Object.assign(this.data, obj);
    fsp.writeFile(this.file, JSON.stringify(this.data, null, 2), 'utf8').catch(() => {});
    return this.data;
  }
}

module.exports = { Store, ConfigStore, DATA_DIR, genId, nowISO };
