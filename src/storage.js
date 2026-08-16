// storage.js - localStorage 封装
const PREFIX = 'dance-player:';

export const storage = {
  get(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : defaultValue;
    } catch {
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
      console.warn('localStorage write failed:', e);
    }
  },

  remove(key) {
    localStorage.removeItem(PREFIX + key);
  },

  // BPM 缓存: { trackId: bpm }
  getBpmCache() {
    return this.get('bpm-cache', {});
  },

  setBpm(trackId, bpm) {
    const cache = this.getBpmCache();
    cache[trackId] = bpm;
    this.set('bpm-cache', cache);
  },

  getBpm(trackId) {
    return this.getBpmCache()[trackId] || null;
  },

  // 播放列表: { name: { tracks: [trackObj, ...] } }
  getPlaylists() {
    return this.get('playlists', {});
  },

  setPlaylists(playlists) {
    this.set('playlists', playlists);
  },

  // 用户偏好
  getPreferences() {
    return this.get('preferences', {
      volume: 80,
      speed: 100,
      metronomeOn: false,
      metronomeVol: 50,
      voiceOn: false,
      voiceVol: 50,
      timeSignature: '8',
      lastPlaylist: '',
    });
  },

  setPreferences(prefs) {
    this.set('preferences', { ...this.getPreferences(), ...prefs });
  },
};
