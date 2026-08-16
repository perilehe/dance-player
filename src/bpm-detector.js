// bpm-detector.js - BPM 自动检测
import { analyze as analyzeBeat } from 'web-audio-beat-detector';
import { storage } from './storage.js';

export class BpmDetector {
  constructor() {
    this._detecting = false;
  }

  // 检测 BPM，返回 number 或 null
  async detect(audioBuffer, trackId = null) {
    // 检查缓存
    if (trackId) {
      const cached = storage.getBpm(trackId);
      if (cached) return cached;
    }

    if (this._detecting) return null;
    this._detecting = true;

    try {
      const result = await analyzeBeat(audioBuffer);
      const bpm = Math.round(result.bpm);

      // 缓存结果
      if (trackId && bpm > 0) {
        storage.setBpm(trackId, bpm);
      }

      return bpm > 0 ? bpm : null;
    } catch (e) {
      console.warn('BPM 检测失败:', e);
      // 简单回退：用音频时长和峰值估算
      return this._fallbackDetect(audioBuffer, trackId);
    } finally {
      this._detecting = false;
    }
  }

  // 简易 BPM 估算（基于能量峰值间隔）
  _fallbackDetect(audioBuffer, trackId) {
    try {
      const data = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;
      const windowSize = Math.floor(sampleRate * 0.05); // 50ms windows
      const energies = [];

      for (let i = 0; i < data.length; i += windowSize) {
        let sum = 0;
        for (let j = i; j < Math.min(i + windowSize, data.length); j++) {
          sum += data[j] * data[j];
        }
        energies.push(sum / windowSize);
      }

      // 找峰值
      const avg = energies.reduce((a, b) => a + b, 0) / energies.length;
      const peaks = [];
      for (let i = 1; i < energies.length - 1; i++) {
        if (energies[i] > avg * 1.5 && energies[i] > energies[i - 1] && energies[i] > energies[i + 1]) {
          peaks.push(i);
        }
      }

      if (peaks.length < 4) return null;

      // 计算平均间隔
      const intervals = [];
      for (let i = 1; i < peaks.length; i++) {
        intervals.push(peaks[i] - peaks[i - 1]);
      }
      intervals.sort((a, b) => a - b);
      const medianInterval = intervals[Math.floor(intervals.length / 2)];

      const secondsPerBeat = (medianInterval * windowSize) / sampleRate;
      let bpm = Math.round(60 / secondsPerBeat);

      // 归一化到合理范围
      while (bpm < 60) bpm *= 2;
      while (bpm > 200) bpm /= 2;

      if (trackId && bpm > 0) {
        storage.setBpm(trackId, Math.round(bpm));
      }

      return Math.round(bpm);
    } catch {
      return null;
    }
  }
}
