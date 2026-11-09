const fs = require('fs');

console.log("正在执行构建脚本...");

let html = fs.readFileSync('index.html', 'utf8');
const supabaseKey = process.env.SUPABASE_KEY || '';

if (!supabaseKey) {
  console.error("【错误】未检测到 SUPABASE_KEY 环境变量！");
  process.exit(1);
}

// 1. 使用正则替换 index.html 中的占位符（支持带或不带引号）
html = html.replace(/['"]?__SUPABASE_KEY_PLACEHOLDER__['"]?/g, `"${supabaseKey}"`);

// 2. 双重保障：在 dist 目录生成一个全局环境变量文件
const envJsContent = `window.RAW_SUPABASE_KEY = "${supabaseKey}";`;
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/env.js', envJsContent);

// 3. 在 HTML 的 <head> 中最优先引入该变量文件
html = html.replace('<head>', '<head>\n    <script src="./env.js"></script>');

// 4. 输出最终文件
fs.writeFileSync('dist/index.html', html);
console.log("【成功】Supabase 密钥已通过环境变量动态注入并打包完成！");
