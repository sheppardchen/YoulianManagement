const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');
const key = process.env.SUPABASE_KEY || '';
html = html.replace('__SUPABASE_KEY_PLACEHOLDER__', key);
// 输出到 dist 目录供 Cloudflare Pages 托管
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', html);
