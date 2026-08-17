// beat-overlay.js - 节拍器叠加（人声拍子已移除）
// 以 audio 元素的 currentTime 为基准时钟

export class BeatOverlay {
  constructor(audioContext, audioElement) {
    this.ctx = audioContext;
    this.audio = audioElement;
    this.metronomeOn = false;
    this.metroVolume = 0.6; // 0-1
    this.bpm = 120;
    this.section = 4;
    this.introBeats = 0;

    this._running = false;
    this._nextBeatTime = 0;
    this._timerId = null;
  }

  async loadSounds() {
    // 节拍器使用合成声音，无需加载
  }

  start(params = {}) {
    const {
      bpm = 120,
      section = 4,
      introBeats = 0,
    } = params;

    this.bpm = bpm;
    this.section = section;
    this.introBeats = introBeats;

    this._nextBeatTime = 0;
    this._running = true;
    this._schedule();
  }

  stop() {
    this._running = false;
    if (this._timerId) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
  }

  setMetronome(on) {
    this.metronomeOn = on;
  }

  setVolume(vol) {
    // vol 0-100 → 0-1
    this.metroVolume = Math.max(0, Math.min(1, vol / 100));
  }

  updateParams(params) {
    if (params.bpm !== undefined) this.bpm = params.bpm;
    if (params.section !== undefined) this.section = params.section;
    if (params.introBeats !== undefined) this.introBeats = params.introBeats;
  }

  // 核心调度
  _schedule() {
    if (!this._running) return;

    const beatInterval = 60.0 / this.bpm;
    const measureDuration = this.section * beatInterval;
    const introDuration = this.introBeats * beatInterval;
    const SCHEDULE_AHEAD = 0.3;

    const audioNow = this.audio.currentTime;
    const audioTarget = audioNow + SCHEDULE_AHEAD;

    // 如果 seek 到后面，重置调度状态
    if (audioNow > this._nextBeatTime + measureDuration) {
      this._nextBeatTime = Math.floor(audioNow / beatInterval) * beatInterval;
    }

    // 调度每一拍
    while (this._nextBeatTime <= audioTarget) {
      const beatTime = this._nextBeatTime;
      const ctxTime = beatTime + this._getClockOffset();

      if (this.metronomeOn) {
        if (beatTime < introDuration) {
          // 前奏：弱 click
          this._scheduleClick(ctxTime, false, 0.3);
        } else {
          // 正拍
          const timeInVoice = beatTime - introDuration;
          const beatInMeasure = Math.round(timeInVoice / beatInterval) % this.section;
          const isStrong = (beatInMeasure === 0);
          this._scheduleClick(ctxTime, isStrong);
        }
      }

      this._nextBeatTime += beatInterval;
    }

    this._timerId = setTimeout(() => this._schedule(), 30);
  }

  // 获取 audio 时钟 → AudioContext 时钟的偏移量
  _getClockOffset() {
    return this.ctx.currentTime - this.audio.currentTime;
  }

  _scheduleClick(ctxTime, isAccent, forceVol = null) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.frequency.value = isAccent ? 1200 : 800;
    osc.type = 'sine';

    const baseVol = forceVol !== null ? forceVol : (isAccent ? 0.8 : 0.4);
    const vol = baseVol * this.metroVolume;
    gain.gain.setValueAtTime(vol, ctxTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctxTime + 0.05);

    osc.start(ctxTime);
    osc.stop(ctxTime + 0.06);
  }
}
