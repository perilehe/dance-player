// beat-overlay.js - 节拍器 + 数拍子叠加
// 以 audio 元素的 currentTime 为基准时钟

const VOICE_FILES = {
  'C': 'beat_cha_cha.mp3',
  'R': 'beat_rumba.mp3',
  'S': 'beat_samba.mp3',
  'J': 'beat_jive.mp3',
  'P': 'beat_paso.mp3',
  'W': 'beat_waltz.mp3',
  'V': 'beat_viennese.mp3',
  'T': 'beat_tango.mp3',
  'F': 'beat_foxtrot.mp3',
  'Q': 'beat_quickstep.mp3',
};

const NUMBER_FILES = {
  1: 'beat_1.mp3',
  2: 'beat_2.mp3',
  3: 'beat_3.mp3',
  4: 'beat_4.mp3',
};

export class BeatOverlay {
  constructor(audioContext, audioElement) {
    this.ctx = audioContext;
    this.audio = audioElement;
    this.voiceBuffers = {};
    this.numberBuffers = {};
    this._loaded = false;

    this.metronomeOn = false;
    this.voiceOn = false;
    this.voiceVolume = 0.7;
    this.bpm = 120;
    this.section = 4;
    this.introBeats = 0;
    this.categoryAbbr = '';

    this._running = false;
    this._nextBeatTime = 0;
    this._scheduledVoices = new Set();
    this._timerId = null;
  }

  async loadSounds(basePath = './sounds/beats/') {
    const promises = [];

    for (const [abbr, filename] of Object.entries(VOICE_FILES)) {
      promises.push(
        fetch(basePath + filename)
          .then(r => r.arrayBuffer())
          .then(buf => this.ctx.decodeAudioData(buf))
          .then(decoded => { this.voiceBuffers[abbr] = decoded; })
          .catch(() => {})
      );
    }

    for (const [num, filename] of Object.entries(NUMBER_FILES)) {
      promises.push(
        fetch(basePath + filename)
          .then(r => r.arrayBuffer())
          .then(buf => this.ctx.decodeAudioData(buf))
          .then(decoded => { this.numberBuffers[num] = decoded; })
          .catch(() => {})
      );
    }

    await Promise.all(promises);
    this._loaded = true;
    console.log('Beat sounds loaded:', Object.keys(this.voiceBuffers).length, 'dance types');
  }

  start(params = {}) {
    if (!this._loaded) {
      console.warn('Beat sounds not loaded yet');
      return;
    }

    const {
      bpm = 120,
      section = 4,
      introBeats = 0,
      categoryAbbr = '',
    } = params;

    this.bpm = bpm;
    this.section = section;
    this.introBeats = introBeats;
    this.categoryAbbr = categoryAbbr;

    this._nextBeatTime = 0;
    this._scheduledVoices = new Set();
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

  setVoice(on, volume) {
    this.voiceOn = on;
    if (volume !== undefined) this.voiceVolume = volume / 100;
  }

  updateParams(params) {
    if (params.bpm !== undefined) this.bpm = params.bpm;
    if (params.section !== undefined) this.section = params.section;
    if (params.introBeats !== undefined) this.introBeats = params.introBeats;
    if (params.categoryAbbr !== undefined) this.categoryAbbr = params.categoryAbbr;
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
      this._scheduledVoices = new Set();
    }

    // 调度每一拍
    while (this._nextBeatTime <= audioTarget) {
      const beatTime = this._nextBeatTime;
      const ctxTime = beatTime + this._getClockOffset();

      if (beatTime < introDuration) {
        // 前奏：弱 click
        if (this.metronomeOn) {
          this._scheduleClick(ctxTime, false, 0.3);
        }
      } else {
        // 正拍期间
        const timeInVoice = beatTime - introDuration;
        const beatInMeasure = Math.round(timeInVoice / beatInterval) % this.section;
        const measureIndex = Math.floor(timeInVoice / measureDuration);
        const measureStart = introDuration + measureIndex * measureDuration;

        // 小节起点：调度喊拍
        if (this.voiceOn && !this._scheduledVoices.has(measureIndex)) {
          this._scheduledVoices.add(measureIndex);
          const voiceCtxTime = measureStart + this._getClockOffset();
          this._scheduleVoice(voiceCtxTime);
        }

        // 每拍：节拍器
        if (this.metronomeOn) {
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

  // 调度喊拍语音
  _scheduleVoice(ctxTime) {
    let buffer = this.voiceBuffers[this.categoryAbbr];

    if (!buffer) {
      this._scheduleNumberVoice(ctxTime);
      return;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const beatInterval = 60.0 / this.bpm;
    const measureDuration = this.section * beatInterval;
    source.playbackRate.value = buffer.duration / measureDuration;

    const gain = this.ctx.createGain();
    gain.gain.value = this.voiceVolume;
    source.connect(gain);
    gain.connect(this.ctx.destination);

    source.start(ctxTime);
  }

  // Fallback: 数字音频
  _scheduleNumberVoice(measureCtxTime) {
    const beatInterval = 60.0 / this.bpm;
    for (let b = 0; b < this.section; b++) {
      const num = (b % 4) + 1;
      const buf = this.numberBuffers[num];
      if (!buf) continue;

      const source = this.ctx.createBufferSource();
      source.buffer = buf;
      source.playbackRate.value = buf.duration / beatInterval;

      const gain = this.ctx.createGain();
      gain.gain.value = this.voiceVolume * (b === 0 ? 1.0 : 0.7);
      source.connect(gain);
      gain.connect(this.ctx.destination);

      source.start(measureCtxTime + b * beatInterval);
    }
  }

  _scheduleClick(ctxTime, isAccent, forceVol = null) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.frequency.value = isAccent ? 1200 : 800;
    osc.type = 'sine';

    const vol = forceVol !== null ? forceVol : (isAccent ? 0.8 : 0.4);
    gain.gain.setValueAtTime(vol, ctxTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctxTime + 0.05);

    osc.start(ctxTime);
    osc.stop(ctxTime + 0.06);
  }
}
