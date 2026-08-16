// beat-overlay.js - 节拍器 + 数拍子叠加
// 核心：以 audio 元素的 currentTime 为基准时钟，保证节拍与音乐精确同步

// 各舞种对应的喊拍音频文件
const VOICE_FILES = {
  'C': 'beat_cha_cha.mp3',     // 恰恰
  'R': 'beat_rumba.mp3',       // 伦巴
  'S': 'beat_samba.mp3',       // 桑巴
  'J': 'beat_jive.mp3',        // 牛仔
  'P': 'beat_paso.mp3',        // 斗牛
  'W': 'beat_waltz.mp3',       // 华尔兹
  'V': 'beat_viennese.mp3',    // 维也纳华尔兹
  'T': 'beat_tango.mp3',       // 探戈
  'F': 'beat_foxtrot.mp3',     // 狐步
  'Q': 'beat_quickstep.mp3',   // 快步
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
    this.audio = audioElement;        // 引用 HTML5 Audio 元素（基准时钟）
    this.voiceBuffers = {};
    this.numberBuffers = {};
    this._loaded = false;

    // 参数
    this.metronomeOn = false;
    this.voiceOn = false;
    this.metronomeVolume = 0.5;
    this.voiceVolume = 0.5;
    this.bpm = 120;
    this.section = 4;
    this.introBeats = 0;
    this.categoryAbbr = '';

    // 调度状态
    this._running = false;
    this._nextBeatTime = 0;   // 下一拍在"歌曲时间轴"上的位置（秒）
    this._scheduledVoices = new Set(); // 已调度的小节索引（避免重复）
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
    console.log('节拍音频加载完成:', Object.keys(this.voiceBuffers).length, '个舞种');
  }

  start(params = {}) {
    if (!this._loaded) {
      console.warn('节拍音频未加载完成');
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

    // 从 audio 的当前位置开始
    this._nextBeatTime = this.audio.currentTime || 0;
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

  setMetronome(on, volume) {
    this.metronomeOn = on;
    if (volume !== undefined) this.metronomeVolume = volume / 100;
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

  // 核心调度：以 audio.currentTime 为基准
  _schedule() {
    if (!this._running) return;

    const beatInterval = 60.0 / this.bpm;
    const measureDuration = this.section * beatInterval;
    const introDuration = this.introBeats * beatInterval;
    const SCHEDULE_AHEAD = 0.15; // 提前 150ms 调度

    // 基准：audio 元素的当前播放位置
    const audioNow = this.audio.currentTime;
    // 计算 audio 时钟 → AudioContext 时钟的偏移量
    const clockOffset = this.ctx.currentTime - audioNow;

    // 如果 audio 跳到了 _nextBeatTime 之前（seek），重置
    if (audioNow > this._nextBeatTime + measureDuration) {
      this._nextBeatTime = audioNow;
      this._scheduledVoices = new Set();
    }

    // 调度所有在 [audioNow, audioNow + SCHEDULE_AHEAD] 范围内的拍
    const audioTarget = audioNow + SCHEDULE_AHEAD;

    while (this._nextBeatTime <= audioTarget) {
      const beatTime = this._nextBeatTime;  // 歌曲时间轴上的位置
      const ctxTime = beatTime + clockOffset; // 对应的 AudioContext 时间

      if (beatTime < introDuration) {
        // === 前奏期间 ===
        if (this.metronomeOn) {
          // 前奏拍：弱 click
          const beatIdx = Math.round(beatTime / beatInterval);
          this._scheduleClick(ctxTime, false, this.metronomeVolume * 0.4);
        }
      } else {
        // === 正拍期间 ===
        const timeInVoice = beatTime - introDuration;
        const beatInMeasure = Math.round(timeInVoice / beatInterval) % this.section;
        const measureIndex = Math.floor(timeInVoice / measureDuration);
        const measureStartInVoice = measureIndex * measureDuration;
        const measureStartBeatTime = introDuration + measureStartInVoice;

        // 小节起点：调度喊拍
        if (this.voiceOn && !this._scheduledVoices.has(measureIndex)) {
          this._scheduledVoices.add(measureIndex);
          const measureCtxTime = measureStartBeatTime + clockOffset;
          this._scheduleVoice(measureCtxTime);
        }

        // 每拍：节拍器 click
        if (this.metronomeOn) {
          const isStrong = (beatInMeasure === 0);
          this._scheduleClick(ctxTime, isStrong);
        }
      }

      this._nextBeatTime += beatInterval;
    }

    // 定期重新调度（50ms 间隔）
    this._timerId = setTimeout(() => this._schedule(), 50);
  }

  // 调度喊拍语音（一小节）
  _scheduleVoice(ctxTime) {
    let buffer = this.voiceBuffers[this.categoryAbbr];

    if (!buffer) {
      // Fallback: 用数字音频逐拍
      this._scheduleNumberVoice(ctxTime);
      return;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    // 拉伸语音到一小节的时长
    const beatInterval = 60.0 / this.bpm;
    const measureDuration = this.section * beatInterval;
    source.playbackRate.value = buffer.duration / measureDuration;

    const gain = this.ctx.createGain();
    gain.gain.value = this.voiceVolume;
    source.connect(gain);
    gain.connect(this.ctx.destination);

    source.start(ctxTime);
  }

  // Fallback: 数字音频逐拍
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

  // 调度一个 click
  _scheduleClick(ctxTime, isAccent, forceVol = null) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.frequency.value = isAccent ? 1200 : 800;
    osc.type = 'sine';

    const vol = forceVol !== null ? forceVol :
      this.metronomeVolume * (isAccent ? 1.0 : 0.5);
    gain.gain.setValueAtTime(vol, ctxTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctxTime + 0.05);

    osc.start(ctxTime);
    osc.stop(ctxTime + 0.06);
  }
}
