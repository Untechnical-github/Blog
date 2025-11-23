const fs = require('fs');
const path = require('path');

const ARTICLES_DIR = 'articles';
const OUTPUT_FILE = '_redirects';

const HEADER = `# Auto-generated _redirects by generate-redirects.js

# ============================================================
# 1. 固定ページ / 例外ルール
# ============================================================
# index.html はルートにリダイレクト
/index.html   /             301

# policy.html は /policy にリダイレクト (拡張子なし)
/policy.html  /policy       301
/policy       /policy.html  200

# ============================================================
# 2. 重複URLの解消 (301 Redirects) - 自動生成部分
# ============================================================
# "フォルダ名/ファイル名" が重複している場合 (例: slug/slug) を
# 強制的に短いURL (例: slug) へ転送します。
`;

const FOOTER = `
# ============================================================
# 4. 汎用クリーニングルール (301 Redirects)
# ============================================================

# (A) /articles/ プレフィックスを削除
# https://untechnical.info/articles/slug -> /slug
/articles/* /:splat       301

# (B) .html 拡張子を削除
# https://untechnical.info/slug.html -> /slug
/*.html       /:splat       301

# (C) 末尾スラッシュを削除
# https://untechnical.info/slug/ -> /slug
/*/           /:splat       301

# ============================================================
# 5. 内部転送フォールバック (200 Rewrite)
# ============================================================
# 自動生成された200ルールに漏れた場合の予備設定
/:slug        /articles/:slug.html  200
`;

function getAllHtmlFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllHtmlFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      if (file.endsWith('.html')) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });

  return arrayOfFiles;
}

function generateRedirects() {
  console.log('🔄 Generating _redirects file...');

  if (!fs.existsSync(ARTICLES_DIR)) {
    console.warn(`⚠️ Directory "${ARTICLES_DIR}" not found. skipping generation.`);
    return;
  }

  const files = getAllHtmlFiles(ARTICLES_DIR);
  
  let redirectRules301 = [];
  let rewriteRules200 = [];

  files.forEach(filePath => {

    const normalizedPath = filePath.replace(/\\/g, '/');
    
    const parts = normalizedPath.split('/');
    const fileName = parts[parts.length - 1];
    const fileNameNoExt = fileName.replace('.html', '');
    const parentDir = parts.length > 1 ? parts[parts.length - 2] : '';

    let urlParts = parts.slice(1); 
    
    urlParts[urlParts.length - 1] = fileNameNoExt;

    if (parentDir === fileNameNoExt) {
      urlParts.pop();
    }

    const cleanUrl = '/' + urlParts.join('/');

    if (parentDir === fileNameNoExt) {

      const dirtyUrlParts = [...urlParts, fileNameNoExt]; 
      const dirtyUrl = '/' + dirtyUrlParts.join('/');
      
      redirectRules301.push(`${dirtyUrl}  ${cleanUrl}  301`);
    }

    rewriteRules200.push(`${cleanUrl}  /${normalizedPath}  200`);
  });

  let content = HEADER;

  if (redirectRules301.length > 0) {
    content += redirectRules301.join('\n') + '\n';
  } else {
    content += '# No redundant paths found.\n';
  }

  content += `\n# ============================================================
# 3. ファイルへの内部マッピング (200 Rewrite) - 自動生成部分
# ============================================================
# きれいなURLと実際のファイルパスを紐付けます。\n`;

  rewriteRules200.sort((a, b) => b.length - a.length);
  content += rewriteRules200.join('\n') + '\n';

  content += FOOTER;

  fs.writeFileSync(OUTPUT_FILE, content);
  console.log(`✅ ${OUTPUT_FILE} has been generated successfully.`);
  console.log(`   - 301 Redirects generated: ${redirectRules301.length}`);
  console.log(`   - 200 Rewrites generated: ${rewriteRules200.length}`);
}

generateRedirects();