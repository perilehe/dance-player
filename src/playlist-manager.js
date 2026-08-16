// playlist-manager.js - 播放列表管理
import { storage } from './storage.js';

export class PlaylistManager {
  constructor() {
    this.playlists = storage.getPlaylists();
    this.currentPlaylist = null;
    this.currentIndex = -1;
    this._onChange = null;
  }

  // 获取所有播放列表名称
  getNames() {
    return Object.keys(this.playlists);
  }

  // 获取指定播放列表
  get(name) {
    return this.playlists[name] || null;
  }

  // 获取当前播放列表
  getCurrent() {
    if (!this.currentPlaylist) return null;
    return this.playlists[this.currentPlaylist] || null;
  }

  // 创建播放列表
  create(name) {
    if (!name || this.playlists[name]) return false;
    this.playlists[name] = { tracks: [], created: Date.now() };
    this._save();
    return true;
  }

  // 删除播放列表
  delete(name) {
    if (!this.playlists[name]) return false;
    delete this.playlists[name];
    if (this.currentPlaylist === name) {
      this.currentPlaylist = null;
      this.currentIndex = -1;
    }
    this._save();
    return true;
  }

  // 选择播放列表
  select(name) {
    this.currentPlaylist = name || null;
    this.currentIndex = -1;
    storage.setPreferences({ lastPlaylist: name || '' });
  }

  // 添加曲目到播放列表
  addTrack(playlistName, track) {
    if (!this.playlists[playlistName]) return false;
    // 避免重复
    const exists = this.playlists[playlistName].tracks.some(
      t => t.id === track.id || t.filename === track.filename
    );
    if (exists) return false;
    this.playlists[playlistName].tracks.push({ ...track });
    this._save();
    return true;
  }

  // 移除曲目
  removeTrack(playlistName, index) {
    if (!this.playlists[playlistName]) return false;
    this.playlists[playlistName].tracks.splice(index, 1);
    this._save();
    return true;
  }

  // 移动曲目（拖拽排序）
  moveTrack(playlistName, fromIndex, toIndex) {
    const list = this.playlists[playlistName];
    if (!list) return false;
    const [item] = list.tracks.splice(fromIndex, 1);
    list.tracks.splice(toIndex, 0, item);
    this._save();
    return true;
  }

  // 获取当前播放列表的当前曲目
  getCurrentTrack() {
    const list = this.getCurrent();
    if (!list || this.currentIndex < 0 || this.currentIndex >= list.tracks.length) return null;
    return list.tracks[this.currentIndex];
  }

  // 下一首
  next() {
    const list = this.getCurrent();
    if (!list || list.tracks.length === 0) return null;
    this.currentIndex = (this.currentIndex + 1) % list.tracks.length;
    return this.getCurrentTrack();
  }

  // 上一首
  prev() {
    const list = this.getCurrent();
    if (!list || list.tracks.length === 0) return null;
    this.currentIndex = (this.currentIndex - 1 + list.tracks.length) % list.tracks.length;
    return this.getCurrentTrack();
  }

  // 设置当前索引
  setCurrentIndex(index) {
    this.currentIndex = index;
  }

  // 导出播放列表为 JSON
  export(name) {
    const list = this.playlists[name];
    if (!list) return null;
    return JSON.stringify({ name, tracks: list.tracks }, null, 2);
  }

  // 导入播放列表
  import(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      if (!data.name || !data.tracks) return false;
      let name = data.name;
      // 重名时自动加后缀
      let i = 1;
      while (this.playlists[name]) {
        name = `${data.name} (${i++})`;
      }
      this.playlists[name] = { tracks: data.tracks, created: Date.now() };
      this._save();
      return name;
    } catch {
      return false;
    }
  }

  onChange(cb) {
    this._onChange = cb;
  }

  _save() {
    storage.setPlaylists(this.playlists);
    this._onChange?.();
  }
}
