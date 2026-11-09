const fs = require('fs');

console.log("正在开始构建并注入环境变量...");

let html = fs.readFileSync('index.html', 'utf8');
const supabaseKey = process.env.SUPABASE_KEY || '';

if (!supabaseKey) {
  console.error("【构建错误】未检测到 SUPABASE_KEY 环境变量！请检查 Cloudflare 后台配置。");
  process.exit(1);
} else {
  console.log(`【构建成功】成功获取到环境变量，密钥长度为: ${supabaseKey.length} 字符`);
}

// 替换 HTML 中的占位符
if (!html.includes('__SUPABASE_KEY_PLACEHOLDER__')) {
  console.warn("【警告】在 index.html 中没有找到 __SUPABASE_KEY_PLACEHOLDER__ 占位符！");
}

html = html.replace('__SUPABASE_KEY_PLACEHOLDER__', supabaseKey);

fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', html);
console.log("【构建完成】已成功输出至 dist/index.html");
