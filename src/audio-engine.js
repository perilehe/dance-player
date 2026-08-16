// audio-engine.js - 音频播放引擎
// 使用 HTML5 Audio 播放 + Web Audio API 分析

export class AudioEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audioContext = null;
    this.gainNode = null;
    this._ready = false;
    this._onTimeUpdate = null;
    this._onEnded = null;
    this._onLoaded = null;
    this._onError = null;
    this.currentTrack = null;

    // 事件绑定
    this.audio.addEventListener('timeupdate', () => this._onTimeUpdate?.());
    this.audio.addEventListener('ended', () => this._onEnded?.());
    this.audio.addEventListener('loadedmetadata', () => this._onLoaded?.());
    this.audio.addEventListener('error', (e) => this._onError?.(e));

    // 间隔更新进度
    this._progressInterval = null;
  }

  // 初始化 Web Audio API（需要用户交互后调用）
  _ensureAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  // 加载并播放曲目
  async play(track) {
    this._ensureAudioContext();
    this.currentTrack = track;

    if (this.audio.src !== track.url) {
      this.audio.src = track.url;
    }
    await this.audio.play();
  }

  pause() {
    this.audio.pause();
  }

  resume() {
    this._ensureAudioContext();
    this.audio.play();
  }

  togglePlay() {
    if (this.audio.paused) {
      this.resume();
    } else {
      this.pause();
    }
  }

  get isPlaying() {
    return !this.audio.paused;
  }

  get currentTime() {
    return this.audio.currentTime;
  }

  get duration() {
    return this.audio.duration || 0;
  }

  seek(time) {
    this.audio.currentTime = time;
  }

  seekPercent(percent) {
    if (this.audio.duration) {
      this.audio.currentTime = (percent / 100) * this.audio.duration;
    }
  }

  // 音量 0-100
  set volume(v) {
    this.audio.volume = Math.max(0, Math.min(1, v / 100));
  }

  get volume() {
    return this.audio.volume * 100;
  }

  // 速度 50-200 (即 0.5x - 2.0x)
  set speed(s) {
    this.audio.playbackRate = s / 100;
  }

  get speed() {
    return this.audio.playbackRate * 100;
  }

  // 获取 AudioBuffer（用于 BPM 检测）
  async getAudioBuffer(track) {
    const resp = await fetch(track.url);
    const arrayBuffer = await resp.arrayBuffer();
    this._ensureAudioContext();
    return await this.audioContext.decodeAudioData(arrayBuffer);
  }

  // 事件回调设置
  onTimeUpdate(cb) { this._onTimeUpdate = cb; }
  onEnded(cb) { this._onEnded = cb; }
  onLoaded(cb) { this._onLoaded = cb; }
  onError(cb) { this._onError = cb; }

  // 启动进度更新定时器
  startProgressUpdates() {
    this.stopProgressUpdates();
    this._progressInterval = setInterval(() => this._onTimeUpdate?.(), 250);
  }

  stopProgressUpdates() {
    if (this._progressInterval) {
      clearInterval(this._progressInterval);
      this._progressInterval = null;
    }
  }

  destroy() {
    this.stopProgressUpdates();
    this.audio.pause();
    this.audio.src = '';
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}
