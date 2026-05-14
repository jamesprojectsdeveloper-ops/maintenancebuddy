import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  '/api/anthropic',
  createProxyMiddleware({
    target: 'https://api.anthropic.com',
    changeOrigin: true,
    pathRewrite: { '^/api/anthropic': '' },
    on: {
      proxyReq: (proxyReq) => {
        proxyReq.setHeader('x-api-key', process.env.ANTHROPIC_KEY || '');
        proxyReq.setHeader('anthropic-version', '2023-06-01');
        proxyReq.removeHeader('origin');
      },
    },
  })
);

app.use(express.static(join(__dirname, 'dist')));

app.get('/{*path}', (_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MaintenanceBuddy running on port ${PORT}`);
});
