const fs = require('fs');
const path = require('path');

// 读取源码中的 index.html
let html = fs.readFileSync('index.html', 'utf8');

// 从 Cloudflare 环境变量中获取 SUPABASE_KEY
const supabaseKey = process.env.SUPABASE_KEY || '';

if (!supabaseKey) {
  console.error("错误: 未检测到 SUPABASE_KEY 环境变量！");
  process.exit(1);
}

// 将占位符替换为真实密钥
html = html.replace('__SUPABASE_KEY_PLACEHOLDER__', supabaseKey);

// 输出到 dist 目录供 Cloudflare Pages 托管
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', html);

console.log("成功：Supabase 密钥已通过环境变量动态注入并打包至 dist/index.html");
