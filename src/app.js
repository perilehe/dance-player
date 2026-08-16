// app.js - 主应用逻辑
import { MusicLoader } from './music-loader.js';
import { AudioEngine } from './audio-engine.js';
import { BpmDetector } from './bpm-detector.js';
import { BeatOverlay } from './beat-overlay.js';
import { PlaylistManager } from './playlist-manager.js';
import { storage } from './storage.js';

export class App {
  constructor() {
    this.loader = new MusicLoader();
    this.engine = new AudioEngine();
    this.bpmDetector = new BpmDetector();
    this.playlistManager = new PlaylistManager();
    this.beatOverlay = null; // 延迟初始化，需要 AudioContext

    this.allTracks = [];
    this.filteredTracks = [];
    this.currentFilter = '';
    this.currentSearch = '';
    this.selectedTrackId = null;

    this._initUI();
    this._initEvents();
    this._loadPreferences();
    this._initBeatOverlay();
    this._loadMusic();
  }

  _initUI() {
    // 缓存 DOM 元素
    this.$ = {
      trackTitle: document.getElementById('track-title'),
      trackCategory: document.getElementById('track-category'),
      trackBpm: document.getElementById('track-bpm'),
      currentTime: document.getElementById('current-time'),
      duration: document.getElementById('duration'),
      progress: document.getElementById('progress'),
      volume: document.getElementById('volume'),
      speed: document.getElementById('speed'),
      speedLabel: document.getElementById('speed-label'),
      bpmInput: document.getElementById('bpm-input'),
      btnPlay: document.getElementById('btn-play'),
      btnPrev: document.getElementById('btn-prev'),
      btnNext: document.getElementById('btn-next'),
      btnDetectBpm: document.getElementById('btn-detect-bpm'),
      toggleMetronome: document.getElementById('toggle-metronome'),
      toggleVoice: document.getElementById('toggle-voice'),
      metronomeVol: document.getElementById('metronome-vol'),
      voiceVol: document.getElementById('voice-vol'),
      timeSignature: document.getElementById('time-signature'),
      categoryFilter: document.getElementById('category-filter'),
      searchInput: document.getElementById('search-input'),
      trackList: document.getElementById('track-list'),
      playlistSelect: document.getElementById('playlist-select'),
      playlistTracks: document.getElementById('playlist-tracks'),
      btnNewPlaylist: document.getElementById('btn-new-playlist'),
      btnDeletePlaylist: document.getElementById('btn-delete-playlist'),
      btnAddToPlaylist: document.getElementById('btn-add-to-playlist'),
      btnExportPlaylist: document.getElementById('btn-export-playlist'),
      btnImportPlaylist: document.getElementById('btn-import-playlist'),
      loadingIndicator: document.getElementById('loading-indicator'),
    };
  }

  _initEvents() {
    const { engine, $ } = this;

    // 播放控制
    $.btnPlay.addEventListener('click', () => this._togglePlay());
    $.btnPrev.addEventListener('click', () => this._playPrev());
    $.btnNext.addEventListener('click', () => this._playNext());

    // 进度条
    $.progress.addEventListener('input', () => {
      engine.seekPercent(parseFloat($.progress.value));
    });

    // 音量
    $.volume.addEventListener('input', () => {
      engine.volume = parseInt($.volume.value);
      storage.setPreferences({ volume: parseInt($.volume.value) });
    });

    // 速度
    $.speed.addEventListener('input', () => {
      const val = parseInt($.speed.value);
      engine.speed = val;
      $.speedLabel.textContent = (val / 100).toFixed(2) + 'x';
      this._updateSpeedPresets(val);
      if (this.beatOverlay) {
        this.beatOverlay.updateParams({ bpm: this._getEffectiveBpm() });
      }
      storage.setPreferences({ speed: val });
    });

    // 速度预设按钮
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.speed);
        $.speed.value = val;
        engine.speed = val;
        $.speedLabel.textContent = (val / 100).toFixed(2) + 'x';
        this._updateSpeedPresets(val);
        if (this.beatOverlay) {
          this.beatOverlay.updateParams({ bpm: this._getEffectiveBpm() });
        }
        storage.setPreferences({ speed: val });
      });
    });

    // BPM 检测
    $.btnDetectBpm.addEventListener('click', () => this._detectBpm());
    $.bpmInput.addEventListener('change', () => {
      const bpm = parseInt($.bpmInput.value);
      if (bpm > 0 && this.beatOverlay) {
        this.beatOverlay.updateParams({ bpm });
      }
    });

    // 节拍器
    $.toggleMetronome.addEventListener('change', () => this._updateBeatOverlay());
    $.toggleVoice.addEventListener('change', () => this._updateBeatOverlay());
    $.metronomeVol.addEventListener('input', () => this._updateBeatOverlay());
    $.voiceVol.addEventListener('input', () => this._updateBeatOverlay());
    $.timeSignature.addEventListener('change', () => {
      if (this.beatOverlay) this.beatOverlay.updateParams({ section: parseInt($.timeSignature.value) });
      storage.setPreferences({ timeSignature: $.timeSignature.value });
    });

    // 搜索 & 筛选
    $.categoryFilter.addEventListener('change', () => {
      this.currentFilter = $.categoryFilter.value;
      this._renderTrackList();
    });
    $.searchInput.addEventListener('input', () => {
      this.currentSearch = $.searchInput.value;
      this._renderTrackList();
    });

    // 播放列表
    $.btnNewPlaylist.addEventListener('click', () => this._createPlaylist());
    $.btnDeletePlaylist.addEventListener('click', () => this._deletePlaylist());
    $.playlistSelect.addEventListener('change', () => {
      this.playlistManager.select($.playlistSelect.value);
      this._renderPlaylist();
    });
    $.btnAddToPlaylist.addEventListener('click', () => this._addToPlaylist());
    $.btnExportPlaylist.addEventListener('click', () => this._exportPlaylist());
    $.btnImportPlaylist.addEventListener('click', () => this._importPlaylist());

    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => this._switchTab(tab.dataset.tab));
    });

    // 音频引擎事件
    engine.onTimeUpdate(() => this._updateProgress());
    engine.onEnded(() => this._playNext());
    engine.onLoaded(() => this._updateDuration());
    engine.onError(() => {
      $.trackTitle.textContent = '❌ 播放失败';
    });

    // 播放列表变化
    this.playlistManager.onChange(() => this._refreshPlaylistSelect());

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.code === 'Space') { e.preventDefault(); this._togglePlay(); }
      if (e.code === 'ArrowLeft') this._playPrev();
      if (e.code === 'ArrowRight') this._playNext();
    });
  }

  _loadPreferences() {
    const prefs = storage.getPreferences();
    this.$.volume.value = prefs.volume;
    this.engine.volume = prefs.volume;
    this.$.speed.value = prefs.speed;
    this.engine.speed = prefs.speed;
    this.$.speedLabel.textContent = (prefs.speed / 100).toFixed(2) + 'x';
    this._updateSpeedPresets(prefs.speed);
    this.$.toggleMetronome.checked = prefs.metronomeOn;
    this.$.toggleVoice.checked = prefs.voiceOn;
    this.$.metronomeVol.value = prefs.metronomeVol;
    this.$.voiceVol.value = prefs.voiceVol;
    this.$.timeSignature.value = prefs.timeSignature;
  }

  // 更新速度预设按钮高亮
  _updateSpeedPresets(currentVal) {
    document.querySelectorAll('.preset-btn').forEach(btn => {
      const val = parseInt(btn.dataset.speed);
      btn.classList.toggle('active', val === currentVal);
    });
  }

  async _initBeatOverlay() {
    // 需要等 AudioContext 就绪（用户第一次交互后）
    const initOnInteraction = async () => {
      if (this.beatOverlay) return;
      this.engine._ensureAudioContext();
      this.beatOverlay = new BeatOverlay(this.engine.audioContext, this.engine.audio);
      try {
        await this.beatOverlay.loadSounds();
      } catch (e) {
        console.warn('节拍音频加载失败:', e);
      }
      document.removeEventListener('click', initOnInteraction);
    };
    document.addEventListener('click', initOnInteraction, { once: false });
  }

  async _loadMusic() {
    this.$.loadingIndicator.classList.remove('hidden');
    try {
      const { tracks, categories, errors } = await this.loader.loadAll();
      this.allTracks = tracks;

      // 填充分类筛选
      categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        this.$.categoryFilter.appendChild(opt);
      });

      this._renderTrackList();

      if (errors.length > 0) {
        console.warn('部分音乐仓库加载失败:', errors);
      }
    } catch (e) {
      console.error('音乐加载失败:', e);
      this.$.trackList.innerHTML = '<div class="error">音乐库加载失败，请检查网络</div>';
    } finally {
      this.$.loadingIndicator.classList.add('hidden');
    }
  }

  _renderTrackList() {
    const tracks = this.loader.filterTracks(this.currentFilter, this.currentSearch);
    this.filteredTracks = tracks;
    const container = this.$.trackList;

    container.innerHTML = tracks.map((t, i) => `
      <div class="track-item ${t.id === this.selectedTrackId ? 'selected' : ''}"
           data-index="${i}" data-id="${t.id}">
        <div class="track-title">${this._escHtml(t.title)}</div>
        <div class="track-sub">
          <span class="tag">${this._escHtml(t._category)}</span>
          ${t.bpm ? `<span class="tag bpm">${t.bpm} BPM</span>` : ''}
          <a class="btn-download" href="${t.url}" download="${this._escHtml(t.filename || t.title + '.mp3')}" title="下载" onclick="event.stopPropagation()">⬇</a>
        </div>
      </div>
    `).join('');

    // 点击事件
    container.querySelectorAll('.track-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index);
        this.selectedTrackId = el.dataset.id;
        this._playFromLibrary(idx);
        this._renderTrackList(); // 更新选中样式
      });
    });
  }

  _playFromLibrary(index) {
    const track = this.filteredTracks[index];
    if (!track) return;
    this._playTrack(track);
  }

  async _playTrack(track) {
    try {
      await this.engine.play(track);
      this.$.trackTitle.textContent = track.title;
      this.$.trackCategory.textContent = track._category || track.category || '-';

      // 设置 BPM 和节拍信息
      const bpm = track.bpm || storage.getBpm(track.id);
      this.$.trackBpm.textContent = bpm || '?';
      this.$.bpmInput.value = bpm || '';
      this.$.bpmInput.placeholder = bpm || '自动';

      // 启动节拍叠加（传入完整节拍参数）
      if (this.beatOverlay && (this.$.toggleMetronome.checked || this.$.toggleVoice.checked)) {
        this.beatOverlay.stop();
        this.beatOverlay.start(this._getBeatParams(track));
      }

      this.$.btnPlay.textContent = '⏸';
      this._updateDuration();
    } catch (e) {
      console.error('播放失败:', e);
      this.$.trackTitle.textContent = '❌ ' + track.title;
    }
  }

  _togglePlay() {
    if (!this.engine.currentTrack) {
      // 没有曲目，播放第一首
      if (this.filteredTracks.length > 0) {
        this._playFromLibrary(0);
      }
      return;
    }
    this.engine.togglePlay();
    this.$.btnPlay.textContent = this.engine.isPlaying ? '⏸' : '▶';

    // 同步节拍叠加
    if (this.beatOverlay) {
      if (this.engine.isPlaying) {
        this.beatOverlay.start(this._getBeatParams(this.engine.currentTrack));
      } else {
        this.beatOverlay.stop();
      }
    }
  }

  _playNext() {
    // 优先从播放列表取下一首
    let next = this.playlistManager.next();
    if (!next && this.filteredTracks.length > 0) {
      // 从当前筛选列表取下一首
      const currentIdx = this.filteredTracks.findIndex(
        t => t.id === this.engine.currentTrack?.id
      );
      const nextIdx = (currentIdx + 1) % this.filteredTracks.length;
      next = this.filteredTracks[nextIdx];
    }
    if (next) this._playTrack(next);
  }

  _playPrev() {
    let prev = this.playlistManager.prev();
    if (!prev && this.filteredTracks.length > 0) {
      const currentIdx = this.filteredTracks.findIndex(
        t => t.id === this.engine.currentTrack?.id
      );
      const prevIdx = (currentIdx - 1 + this.filteredTracks.length) % this.filteredTracks.length;
      prev = this.filteredTracks[prevIdx];
    }
    if (prev) this._playTrack(prev);
  }

  _updateProgress() {
    const { currentTime, duration } = this.engine;
    if (duration > 0) {
      this.$.progress.value = (currentTime / duration) * 100;
    }
    this.$.currentTime.textContent = this._formatTime(currentTime);
  }

  _updateDuration() {
    const d = this.engine.duration;
    this.$.duration.textContent = d ? this._formatTime(d) : '0:00';
  }

  _formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  async _detectBpm() {
    const track = this.engine.currentTrack;
    if (!track) return;
    this.$.btnDetectBpm.textContent = '检测中...';
    this.$.btnDetectBpm.disabled = true;
    try {
      const buffer = await this.engine.getAudioBuffer(track);
      const bpm = await this.bpmDetector.detect(buffer, track.id);
      if (bpm) {
        this.$.trackBpm.textContent = bpm;
        this.$.bpmInput.value = bpm;
        if (this.beatOverlay) this.beatOverlay.updateParams({ bpm });
        // 更新 track 对象
        track.bpm = bpm;
      }
    } catch (e) {
      console.error('BPM 检测失败:', e);
    } finally {
      this.$.btnDetectBpm.textContent = '检测';
      this.$.btnDetectBpm.disabled = false;
    }
  }

  _getEffectiveBpm() {
    const manual = parseInt(this.$.bpmInput.value);
    if (manual > 0) return manual;
    const track = this.engine.currentTrack;
    if (track?.bpm) return track.bpm;
    if (track) {
      const cached = storage.getBpm(track.id);
      if (cached) return cached;
    }
    return 120; // 默认
  }

  // 获取完整节拍参数（传给 BeatOverlay）
  _getBeatParams(track) {
    if (!track) return { bpm: 120, section: 4, introBeats: 0, categoryAbbr: '' };
    const bpm = parseInt(this.$.bpmInput.value) || track.bpm || storage.getBpm(track.id) || 120;
    return {
      bpm,
      section: track.section || 4,
      introBeats: track.intro_beats || track.introBeats || 0,
      categoryAbbr: track.category_abbr || track.categoryAbbr || '',
    };
  }

  _updateBeatOverlay() {
    const metronomeOn = this.$.toggleMetronome.checked;
    const voiceOn = this.$.toggleVoice.checked;
    const metronomeVol = parseInt(this.$.metronomeVol.value);
    const voiceVol = parseInt(this.$.voiceVol.value);

    storage.setPreferences({ metronomeOn, voiceOn, metronomeVol, voiceVol });

    if (!this.beatOverlay) return; // 未初始化

    this.beatOverlay.setMetronome(metronomeOn, metronomeVol);
    this.beatOverlay.setVoice(voiceOn, voiceVol);

    // 如果正在播放且开启了节拍，重新启动
    if (this.engine.isPlaying && (metronomeOn || voiceOn)) {
      this.beatOverlay.stop();
      this.beatOverlay.start(this._getBeatParams(this.engine.currentTrack));
    } else if (!metronomeOn && !voiceOn) {
      this.beatOverlay.stop();
    }
  }

  // --- 播放列表操作 ---

  _refreshPlaylistSelect() {
    const names = this.playlistManager.getNames();
    const current = this.playlistManager.currentPlaylist;
    this.$.playlistSelect.innerHTML = '<option value="">-- 选择播放列表 --</option>';
    names.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === current) opt.selected = true;
      this.$.playlistSelect.appendChild(opt);
    });
  }

  _createPlaylist() {
    const name = prompt('输入播放列表名称:');
    if (name && this.playlistManager.create(name)) {
      this._refreshPlaylistSelect();
      this.$.playlistSelect.value = name;
      this.playlistManager.select(name);
      this._renderPlaylist();
    }
  }

  _deletePlaylist() {
    const name = this.playlistManager.currentPlaylist;
    if (!name) return;
    if (confirm(`确定删除播放列表 "${name}"？`)) {
      this.playlistManager.delete(name);
      this._refreshPlaylistSelect();
      this._renderPlaylist();
    }
  }

  _addToPlaylist() {
    const name = this.playlistManager.currentPlaylist;
    if (!name) {
      alert('请先选择或创建一个播放列表');
      return;
    }
    const track = this.engine.currentTrack ||
      this.filteredTracks.find(t => t.id === this.selectedTrackId);
    if (track) {
      const added = this.playlistManager.addTrack(name, track);
      if (!added) alert('曲目已在列表中');
      this._renderPlaylist();
    }
  }

  _renderPlaylist() {
    const list = this.playlistManager.getCurrent();
    const container = this.$.playlistTracks;
    this.$.btnAddToPlaylist.disabled = !this.playlistManager.currentPlaylist;

    if (!list || list.tracks.length === 0) {
      container.innerHTML = '<div class="empty">播放列表为空，从曲库中添加曲目</div>';
      return;
    }

    container.innerHTML = list.tracks.map((t, i) => `
      <div class="track-item" data-index="${i}" draggable="true">
        <span class="track-num">${i + 1}</span>
        <div class="track-title">${this._escHtml(t.title)}</div>
        <div class="track-sub">
          <span class="tag">${this._escHtml(t._category || '')}</span>
          ${t.bpm ? `<span class="tag bpm">${t.bpm} BPM</span>` : ''}
        </div>
        <button class="btn-remove" data-index="${i}" title="移除">✕</button>
      </div>
    `).join('');

    // 点击播放
    container.querySelectorAll('.track-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-remove')) return;
        const idx = parseInt(el.dataset.index);
        this.playlistManager.setCurrentIndex(idx - 1); // -1 because next() will +1
        const track = this.playlistManager.getCurrentTrack();
        if (track) this._playTrack(track);
      });
    });

    // 移除按钮
    container.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        this.playlistManager.removeTrack(this.playlistManager.currentPlaylist, idx);
        this._renderPlaylist();
      });
    });

    // 拖拽排序
    this._initDragSort(container);
  }

  _initDragSort(container) {
    let dragIdx = null;
    container.querySelectorAll('.track-item').forEach(el => {
      el.addEventListener('dragstart', (e) => {
        dragIdx = parseInt(el.dataset.index);
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
      });
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        const toIdx = parseInt(el.dataset.index);
        if (dragIdx !== null && dragIdx !== toIdx) {
          this.playlistManager.moveTrack(this.playlistManager.currentPlaylist, dragIdx, toIdx);
          this._renderPlaylist();
        }
      });
    });
  }

  _exportPlaylist() {
    const name = this.playlistManager.currentPlaylist;
    if (!name) return;
    const json = this.playlistManager.export(name);
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  _importPlaylist() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const name = this.playlistManager.import(reader.result);
        if (name) {
          this._refreshPlaylistSelect();
          this.$.playlistSelect.value = name;
          this.playlistManager.select(name);
          this._renderPlaylist();
        } else {
          alert('导入失败，请检查文件格式');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  _switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `${tabName}-tab`));

    if (tabName === 'playlist') {
      this._refreshPlaylistSelect();
      this._renderPlaylist();
    }
  }

  _escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
}
