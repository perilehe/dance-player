import { defineConfig } from 'vite';
import { readFileSync, readdirSync, statSync, existsSync, createReadStream } from 'fs';
import { join } from 'path';

// 开发时将 E:/法考/downloads/ 的 MP3 文件作为 /music/ 目录服务
const DOWNLOADS_DIR = 'E:/法考/downloads';

function serveMusicFiles() {
  return {
    name: 'serve-music-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // 只处理 MP3 文件请求（manifest.json 由 Vite 从 public/ 提供）
        if (req.url?.startsWith('/music/') && !req.url.includes('manifest.json')) {
          const filename = decodeURIComponent(req.url.slice(7));
          const filePath = join(DOWNLOADS_DIR, filename);

          try {
            const stat = statSync(filePath);
            if (stat.isFile() && filePath.toLowerCase().endsWith('.mp3')) {
              res.setHeader('Content-Type', 'audio/mpeg');
              res.setHeader('Content-Length', stat.size);
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Accept-Ranges', 'bytes');

              // 支持 Range 请求（进度条拖动）
              const range = req.headers.range;
              if (range) {
                const parts = range.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
                const chunkSize = end - start + 1;

                res.statusCode = 206;
                res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
                res.setHeader('Content-Length', chunkSize);

                // 使用 stream 读取
                const stream = createReadStream(filePath, { start, end });
                stream.pipe(res);
              } else {
                const data = readFileSync(filePath);
                res.end(data);
              }
              return;
            }
          } catch {
            // 文件不存在，继续下一个中间件
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 3000,
  },
  plugins: [serveMusicFiles()],
});
