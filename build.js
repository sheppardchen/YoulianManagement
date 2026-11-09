const fs = require('fs');
const key = process.env.SUPABASE_ANON_KEY || '';
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace('__SUPABASE_KEY_PLACEHOLDER__', key);
fs.writeFileSync('index.html', html);
console.log('Supabase key injected successfully!');
