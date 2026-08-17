// music-loader.js - 从音乐仓库加载 manifest 和曲目
import sources from './music-sources.json';

export class MusicLoader {
  constructor() {
    this.sources = sources.sources;
    this.allTracks = []; // 合并后的所有曲目
    this.categories = new Set();
  }

  // 加载所有音乐仓库的 manifest
  async loadAll() {
    this.allTracks = [];
    this.categories = new Set();
    const results = await Promise.allSettled(
      this.sources.map(src => this.loadSource(src))
    );

    const errors = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        const { tracks, trackCategories } = result.value;
        tracks.forEach(t => {
          t._source = this.sources[i];
          t._category = t.category;
          this.categories.add(t.category);
        });
        this.allTracks.push(...tracks);
      } else {
        errors.push({ source: this.sources[i].name, error: result.reason });
      }
    });

    if (errors.length) {
      console.warn('音乐仓库加载失败:', errors);
    }

    return { tracks: this.allTracks, categories: [...this.categories], errors };
  }

  // 加载单个音乐仓库
  async loadSource(source) {
    const resp = await fetch(source.manifestUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const manifest = await resp.json();

    const category = manifest.category || source.name;
    const baseUrl = source.baseUrl || new URL('.', source.manifestUrl).href;

    const tracks = (manifest.tracks || []).map(t => {
      // 优先使用每首曲目自己的分类（如拉丁组合里的牛仔/桑巴/斗牛）
      const trackCategory = t.category || category;
      return {
        id: t.id || t.filename,
        title: t.title || t.filename.replace(/\.mp3$/i, ''),
        filename: t.filename,
        url: baseUrl + encodeURIComponent(t.filename),
        category: trackCategory,
        bpm: t.bpm || null,
        section: t.section || 4,
        intro_beats: t.intro_beats || t.introBeats || 0,
        category_abbr: t.category_abbr || t.categoryAbbr || '',
        duration: t.duration || null,
        size: t.size || null,
      };
    });

    // 收集分类：优先用每首自己的分类
    const trackCategories = new Set(tracks.map(t => t.category));

    return { tracks, trackCategories };
  }

  // 按分类筛选
  filterTracks(category = '', search = '') {
    let tracks = this.allTracks;
    if (category) {
      tracks = tracks.filter(t => t._category === category);
    }
    if (search) {
      const q = search.toLowerCase();
      tracks = tracks.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.filename && t.filename.toLowerCase().includes(q))
      );
    }
    return tracks;
  }

  // 根据 ID 找曲目
  getTrackById(id) {
    return this.allTracks.find(t => t.id === id || t.filename === id);
  }
}
