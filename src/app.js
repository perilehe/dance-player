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
    this.beatOverlay = null;

    this.allTracks = [];
    this.filteredTracks = [];
    this.currentFilter = '';
    this.currentSearch = '';
    this.selectedTrackId = null;

    // 播放模式: 'list' | 'single' | 'shuffle'
    this.repeatMode = storage.getPreferences().repeatMode || 'list';
    // 用于 shuffle 的打乱索引
    this._shuffleOrder = [];
    this._shufflePos = -1;
    // 在曲库播放时的列表引用
    this._libraryPlayList = null;
    this._libraryPlayIdx = -1;

    this._initUI();
    this._initEvents();
    this._loadPreferences();
    this._initBeatOverlay();
    this._loadMusic();
  }

  _initUI() {
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
      btnRepeat: document.getElementById('btn-repeat'),
      btnShuffle: document.getElementById('btn-shuffle'),
      repeatLabel: document.getElementById('repeat-label'),
      btnDetectBpm: document.getElementById('btn-detect-bpm'),
      toggleMetronome: document.getElementById('toggle-metronome'),
      timeSignature: document.getElementById('time-signature'),
      categoryFilter: document.getElementById('category-filter'),
      searchInput: document.getElementById('search-input'),
      trackList: document.getElementById('track-list'),
      playlistSelect: document.getElementById('playlist-select'),
      playlistTracks: document.getElementById('playlist-tracks'),
      btnNewPlaylist: document.getElementById('btn-new-playlist'),
      btnDeletePlaylist: document.getElementById('btn-delete-playlist'),
      btnExportPlaylist: document.getElementById('btn-export-playlist'),
      btnImportPlaylist: document.getElementById('btn-import-playlist'),
      addCategoryFilter: document.getElementById('add-category-filter'),
      addSearchInput: document.getElementById('add-search-input'),
      addTrackList: document.getElementById('add-track-list'),
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

    // 循环/随机模式
    $.btnRepeat.addEventListener('click', () => this._cycleRepeatMode());
    $.btnShuffle.addEventListener('click', () => this._toggleShuffle());
    this._updateModeButtons();

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
    $.timeSignature.addEventListener('change', () => {
      if (this.beatOverlay) this.beatOverlay.updateParams({ section: parseInt($.timeSignature.value) });
      storage.setPreferences({ timeSignature: $.timeSignature.value });
    });

    // 曲库搜索 & 筛选
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
    $.btnExportPlaylist.addEventListener('click', () => this._exportPlaylist());
    $.btnImportPlaylist.addEventListener('click', () => this._importPlaylist());

    // 播放列表 - 添加曲目区域的筛选
    $.addCategoryFilter.addEventListener('change', () => this._renderAddTrackList());
    $.addSearchInput.addEventListener('input', () => this._renderAddTrackList());

    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => this._switchTab(tab.dataset.tab));
    });

    // 音频引擎事件
    engine.onTimeUpdate(() => this._updateProgress());
    engine.onEnded(() => this._onTrackEnded());
    engine.onLoaded(() => this._updateDuration());
    engine.onError(() => {
      $.trackTitle.textContent = '❌ 播放失败';
    });

    // 播放列表变化
    this.playlistManager.onChange(() => {
      this._refreshPlaylistSelect();
      this._renderPlaylist();
      this._renderAddTrackList();
    });

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
    this.$.timeSignature.value = prefs.timeSignature;
  }

  _updateSpeedPresets(currentVal) {
    document.querySelectorAll('.preset-btn').forEach(btn => {
      const val = parseInt(btn.dataset.speed);
      btn.classList.toggle('active', val === currentVal);
    });
  }

  // === 循环/随机模式 ===

  _cycleRepeatMode() {
    // list -> single -> list
    this.repeatMode = this.repeatMode === 'list' ? 'single' : 'list';
    storage.setPreferences({ repeatMode: this.repeatMode });
    this._updateModeButtons();
  }

  _toggleShuffle() {
    if (this.repeatMode === 'shuffle') {
      this.repeatMode = 'list';
    } else {
      this.repeatMode = 'shuffle';
      this._buildShuffleOrder();
    }
    storage.setPreferences({ repeatMode: this.repeatMode });
    this._updateModeButtons();
  }

  _updateModeButtons() {
    this.$.btnRepeat.classList.toggle('active', this.repeatMode === 'single');
    this.$.btnShuffle.classList.toggle('active', this.repeatMode === 'shuffle');

    const labels = { list: '列表循环', single: '单曲循环', shuffle: '随机播放' };
    this.$.repeatLabel.textContent = labels[this.repeatMode] || '列表循环';
  }

  _buildShuffleOrder() {
    const list = this._getActiveTrackList();
    this._shuffleOrder = list.map((_, i) => i);
    // Fisher-Yates shuffle
    for (let i = this._shuffleOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this._shuffleOrder[i], this._shuffleOrder[j]] = [this._shuffleOrder[j], this._shuffleOrder[i]];
    }
    // 当前位置放到开头
    const currentIdx = this._getCurrentIndexInList();
    if (currentIdx >= 0) {
      const posInShuffle = this._shuffleOrder.indexOf(currentIdx);
      if (posInShuffle > 0) {
        this._shuffleOrder.splice(posInShuffle, 1);
        this._shuffleOrder.unshift(currentIdx);
      }
      this._shufflePos = 0;
    } else {
      this._shufflePos = -1;
    }
  }

  _getActiveTrackList() {
    if (this.playlistManager.currentPlaylist) {
      const pl = this.playlistManager.getCurrent();
      if (pl && pl.tracks.length > 0) return pl.tracks;
    }
    return this.filteredTracks;
  }

  _getCurrentIndexInList() {
    const list = this._getActiveTrackList();
    return list.findIndex(t => t.id === this.engine.currentTrack?.id);
  }

  _onTrackEnded() {
    if (this.repeatMode === 'single') {
      // 单曲循环：重新播放
      const track = this.engine.currentTrack;
      this.engine.seekPercent(0);
      this.engine.play(track).then(() => {
        if (this.beatOverlay && this.$.toggleMetronome.checked) {
          this.beatOverlay.stop();
          this.beatOverlay.start(this._getBeatParams(track));
        }
      });
      return;
    }
    this._playNext();
  }

  async _initBeatOverlay() {
    const initOnInteraction = async () => {
      if (this.beatOverlay) return;
      this.engine._ensureAudioContext();
      this.beatOverlay = new BeatOverlay(this.engine.audioContext, this.engine.audio);
      document.removeEventListener('click', initOnInteraction);
    };
    document.addEventListener('click', initOnInteraction, { once: false });
  }

  async _loadMusic() {
    this.$.loadingIndicator.classList.remove('hidden');
    try {
      const { tracks, categories } = await this.loader.loadAll();
      this.allTracks = tracks;

      // 填充分类筛选（曲库 + 播放列表添加区域）
      categories.forEach(cat => {
        const opt1 = document.createElement('option');
        opt1.value = cat;
        opt1.textContent = cat;
        this.$.categoryFilter.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = cat;
        opt2.textContent = cat;
        this.$.addCategoryFilter.appendChild(opt2);
      });

      this._renderTrackList();
      this._renderAddTrackList();
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
          <button class="btn-action btn-add-pl" data-id="${t.id}" title="添加到播放列表" onclick="event.stopPropagation()">➕</button>
          <a class="btn-action" href="${t.url}" download="${this._escHtml(t.filename || t.title + '.mp3')}" title="下载" onclick="event.stopPropagation()">⬇</a>
        </div>
      </div>
    `).join('');

    // 点击事件
    container.querySelectorAll('.track-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index);
        this.selectedTrackId = el.dataset.id;
        this._playFromLibrary(idx);
        this._renderTrackList();
      });
    });

    // 添加到播放列表按钮
    container.querySelectorAll('.btn-add-pl').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const track = this.allTracks.find(t => t.id === id);
        if (track) this._quickAddToPlaylist(track, btn);
      });
    });
  }

  // 播放列表标签页 - 添加曲目列表
  _renderAddTrackList() {
    const cat = this.$.addCategoryFilter.value;
    const search = (this.$.addSearchInput.value || '').toLowerCase();
    let tracks = this.allTracks;
    if (cat) tracks = tracks.filter(t => t._category === cat);
    if (search) tracks = tracks.filter(t => (t.title || '').toLowerCase().includes(search));

    const container = this.$.addTrackList;
    if (!container) return;

    if (tracks.length === 0) {
      container.innerHTML = '<div class="empty">无匹配曲目</div>';
      return;
    }

    container.innerHTML = tracks.map(t => `
      <div class="track-item" data-id="${t.id}">
        <div class="track-title">${this._escHtml(t.title)}</div>
        <div class="track-sub">
          <span class="tag">${this._escHtml(t._category)}</span>
          ${t.bpm ? `<span class="tag bpm">${t.bpm} BPM</span>` : ''}
          <button class="btn-action btn-quick-add" data-id="${t.id}" title="添加到当前播放列表" onclick="event.stopPropagation()">➕</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-quick-add').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const track = this.allTracks.find(t => t.id === id);
        if (track) this._quickAddToPlaylist(track, btn);
      });
    });
  }

  _quickAddToPlaylist(track, triggerBtn) {
    const name = this.playlistManager.currentPlaylist;
    if (!name) {
      const newName = prompt('输入播放列表名称（或留空取消）:');
      if (!newName) return;
      this.playlistManager.create(newName);
      this.playlistManager.select(newName);
      this._refreshPlaylistSelect();
    }
    const plName = this.playlistManager.currentPlaylist;
    const added = this.playlistManager.addTrack(plName, track);
    if (added && triggerBtn) {
      const orig = triggerBtn.textContent;
      triggerBtn.textContent = '✓';
      setTimeout(() => { triggerBtn.textContent = orig; }, 800);
    }
    this._renderPlaylist();
  }

  _playFromLibrary(index) {
    const track = this.filteredTracks[index];
    if (!track) return;
    // 记录曲库播放位置
    this._libraryPlayList = this.filteredTracks;
    this._libraryPlayIdx = index;
    this._playTrack(track);
  }

  async _playTrack(track) {
    try {
      await this.engine.play(track);
      this.$.trackTitle.textContent = track.title;
      this.$.trackCategory.textContent = track._category || track.category || '-';

      const bpm = track.bpm || storage.getBpm(track.id);
      this.$.trackBpm.textContent = bpm || '?';
      this.$.bpmInput.value = bpm || '';
      this.$.bpmInput.placeholder = bpm || '自动';

      if (this.beatOverlay && this.$.toggleMetronome.checked) {
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
      if (this.filteredTracks.length > 0) {
        this._playFromLibrary(0);
      }
      return;
    }
    this.engine.togglePlay();
    this.$.btnPlay.textContent = this.engine.isPlaying ? '⏸' : '▶';

    if (this.beatOverlay) {
      if (this.engine.isPlaying && this.$.toggleMetronome.checked) {
        this.beatOverlay.start(this._getBeatParams(this.engine.currentTrack));
      } else {
        this.beatOverlay.stop();
      }
    }
  }

  _playNext() {
    let next = null;

    if (this.playlistManager.currentPlaylist) {
      const pl = this.playlistManager.getCurrent();
      if (pl && pl.tracks.length > 0) {
        if (this.repeatMode === 'shuffle') {
          if (this._shuffleOrder.length === 0) this._buildShuffleOrder();
          this._shufflePos = (this._shufflePos + 1) % this._shuffleOrder.length;
          next = pl.tracks[this._shuffleOrder[this._shufflePos]];
        } else {
          next = this.playlistManager.next();
        }
      }
    }

    if (!next && this._libraryPlayList && this._libraryPlayList.length > 0) {
      if (this.repeatMode === 'shuffle') {
        if (this._shuffleOrder.length === 0 || this._shuffleOrder[0] !== this._libraryPlayList.length) {
          this._shuffleOrder = this._libraryPlayList.map((_, i) => i);
          for (let i = this._shuffleOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this._shuffleOrder[i], this._shuffleOrder[j]] = [this._shuffleOrder[j], this._shuffleOrder[i]];
          }
          const curIdx = this._libraryPlayList.findIndex(t => t.id === this.engine.currentTrack?.id);
          if (curIdx >= 0) {
            const p = this._shuffleOrder.indexOf(curIdx);
            if (p > 0) { this._shuffleOrder.splice(p, 1); this._shuffleOrder.unshift(curIdx); }
            this._shufflePos = 0;
          }
        }
        this._shufflePos = (this._shufflePos + 1) % this._shuffleOrder.length;
        next = this._libraryPlayList[this._shuffleOrder[this._shufflePos]];
      } else {
        const curIdx = this._libraryPlayList.findIndex(t => t.id === this.engine.currentTrack?.id);
        const nextIdx = (curIdx + 1) % this._libraryPlayList.length;
        next = this._libraryPlayList[nextIdx];
        this._libraryPlayIdx = nextIdx;
      }
    }

    if (!next && this.filteredTracks.length > 0) {
      const curIdx = this.filteredTracks.findIndex(t => t.id === this.engine.currentTrack?.id);
      const nextIdx = (curIdx + 1) % this.filteredTracks.length;
      next = this.filteredTracks[nextIdx];
    }

    if (next) this._playTrack(next);
  }

  _playPrev() {
    let prev = null;

    if (this.playlistManager.currentPlaylist) {
      const pl = this.playlistManager.getCurrent();
      if (pl && pl.tracks.length > 0) {
        if (this.repeatMode === 'shuffle') {
          if (this._shuffleOrder.length === 0) this._buildShuffleOrder();
          this._shufflePos = (this._shufflePos - 1 + this._shuffleOrder.length) % this._shuffleOrder.length;
          prev = pl.tracks[this._shuffleOrder[this._shufflePos]];
        } else {
          prev = this.playlistManager.prev();
        }
      }
    }

    if (!prev && this._libraryPlayList && this._libraryPlayList.length > 0) {
      const curIdx = this._libraryPlayList.findIndex(t => t.id === this.engine.currentTrack?.id);
      const prevIdx = (curIdx - 1 + this._libraryPlayList.length) % this._libraryPlayList.length;
      prev = this._libraryPlayList[prevIdx];
      this._libraryPlayIdx = prevIdx;
    }

    if (!prev && this.filteredTracks.length > 0) {
      const curIdx = this.filteredTracks.findIndex(t => t.id === this.engine.currentTrack?.id);
      const prevIdx = (curIdx - 1 + this.filteredTracks.length) % this.filteredTracks.length;
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
    return 120;
  }

  _getBeatParams(track) {
    if (!track) return { bpm: 120, section: 4, introBeats: 0 };
    const bpm = parseInt(this.$.bpmInput.value) || track.bpm || storage.getBpm(track.id) || 120;
    return {
      bpm,
      section: track.section || 4,
      introBeats: track.intro_beats || track.introBeats || 0,
    };
  }

  _updateBeatOverlay() {
    const metronomeOn = this.$.toggleMetronome.checked;
    storage.setPreferences({ metronomeOn });

    if (!this.beatOverlay) return;
    this.beatOverlay.setMetronome(metronomeOn);

    if (this.engine.isPlaying && metronomeOn) {
      this.beatOverlay.stop();
      this.beatOverlay.start(this._getBeatParams(this.engine.currentTrack));
    } else if (!metronomeOn) {
      this.beatOverlay.stop();
    }
  }

  // --- 播放列表 ---

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

  _renderPlaylist() {
    const list = this.playlistManager.getCurrent();
    const container = this.$.playlistTracks;

    if (!list || list.tracks.length === 0) {
      container.innerHTML = '<div class="empty">播放列表为空，从下方添加曲目</div>';
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
        // 设置播放列表索引
        this.playlistManager.setCurrentIndex(idx);
        const track = list.tracks[idx];
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
      this._renderAddTrackList();
    }
  }

  _escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
}
