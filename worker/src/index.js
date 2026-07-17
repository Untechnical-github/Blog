function hex2bin(hex) {
  const buf = new Uint8Array(Math.ceil(hex.length / 2));
  for (let i = 0; i < buf.length; i++) { buf[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16); }
  return buf;
}

async function verifySignature(request, env) {
  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');
  const body = await request.clone().text();
  if (!signature || !timestamp || !env.DISCORD_PUBLIC_KEY) return false;
  try {
    const encoder = new TextEncoder();
    const pubKey = await crypto.subtle.importKey('raw', hex2bin(env.DISCORD_PUBLIC_KEY), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', pubKey, hex2bin(signature), encoder.encode(timestamp + body));
  } catch (e) { return false; }
}

// 🌟 [強化1] HTMLエンティティ（&amp;など）を通常の文字に戻す関数
function unescapeHTML(str) {
  if (!str) return '';
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#039;/g, "'");
}

// 🌟 [強化2] 複数のメタタグ名（og:, twitter:, name=）を順番に探し、最初に見つけたものを返す関数
function extractMeta(html, names) {
  for (const name of names) {
    const regexes = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`, 'i')
    ];
    for (const reg of regexes) {
      const match = html.match(reg);
      if (match && match[1]) return unescapeHTML(match[1].trim());
    }
  }
  return '';
}

// 🌟 [強化3] 相対パス（/img/ogp.png）を絶対URL（https://.../img/ogp.png）に変換する関数
function resolveUrl(urlStr, baseStr) {
  if (!urlStr) return null;
  try { return new URL(urlStr, baseStr).href; } catch { return urlStr; }
}

// レスポンスの Content-Type / <meta charset> から文字コードを判定し、
// TextDecoder が受理できる名称に正規化する（切り出すことで単体テスト可能にしている）
function detectCharset(buffer, contentTypeHeader) {
  let charset = 'utf-8';

  const matchHeader = (contentTypeHeader || '').match(/charset=([\w\-]+)/i);
  if (matchHeader) {
    charset = matchHeader[1].toLowerCase();
  } else {
    const peekStr = new TextDecoder('ascii').decode(buffer.slice(0, 2000));
    const metaCharset = peekStr.match(/<meta[^>]*charset=["']?([\w\-]+)["']?/i) || peekStr.match(/<meta[^>]*http-equiv=["']?content-type["']?[^>]*content=["']?[^>]*charset=([\w\-]+)["']?/i);
    if (metaCharset) charset = metaCharset[1].toLowerCase();
  }

  if (charset === 'shift_jis' || charset === 'sjis' || charset === 'x-sjis') charset = 'shift-jis';
  if (charset === 'euc_jp') charset = 'euc-jp';

  return charset;
}

// OGP APIは任意URLをスクレイピングできてしまうため、自サイトからの呼び出し以外は拒否し、
// 第三者に踏み台（無料の公開スクレイピングプロキシ）として使われるのを防ぐ
const ALLOWED_ORIGIN = 'https://untechnical.info';

function isAllowedCaller(request) {
  const origin = request.headers.get('Origin');
  if (origin) return origin === ALLOWED_ORIGIN;

  const referer = request.headers.get('Referer');
  if (referer) {
    try { return new URL(referer).origin === ALLOWED_ORIGIN; } catch { return false; }
  }

  return false;
}

// 単体テスト用（Worker本体の挙動には影響しない）
export { unescapeHTML, extractMeta, resolveUrl, detectCharset, isAllowedCaller, ALLOWED_ORIGIN };

export default {
  async fetch(request, env, ctx) {
    // ──────────────────────────────────────────
    // 🌟 1. GETリクエスト時：強力なOGPスクレイピング
    // ──────────────────────────────────────────
    if (request.method === 'GET') {
      // エラー応答（403/400/500）はここでは長期キャッシュしない。成功レスポンスにのみ
      // 個別に Cache-Control を付与する（正当なリクエストが一時的な403を1日引きずらないように）。
      const corsHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'no-store',
      };

      if (!isAllowedCaller(request)) {
        return new Response(JSON.stringify({ status: 'error', message: 'Forbidden' }), { headers: corsHeaders, status: 403 });
      }

      const urlStr = new URL(request.url).searchParams.get('url');
      if (!urlStr) {
        return new Response(JSON.stringify({ status: 'error', message: 'Missing url parameter' }), { headers: corsHeaders, status: 400 });
      }

      // 外部サイトのOGPは1日単位でしか変わらないため、Cloudflareのエッジキャッシュに載せて
      // 同じURLへの再スクレイピングを避ける（自サイトのオートコンプリートと同じ手法）
      const cache = caches.default;
      const cacheKey = new Request(request.url, request);
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) return cachedResponse;

      try {
        // [強化4] 一般的なブラウザ（Chrome）に偽装してアクセス拒否を回避
        const fetchOptions = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
          }
        };
        const res = await fetch(urlStr, fetchOptions);
        if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);

        // [強化5] Shift_JISやEUC-JPなどの文字化けを防ぐため、バイナリで取得
        const buffer = await res.arrayBuffer();
        const contentType = res.headers.get('content-type') || '';
        const charset = detectCharset(buffer, contentType);

        let html = '';
        try {
          html = new TextDecoder(charset).decode(buffer);
        } catch(e) {
          html = new TextDecoder('utf-8').decode(buffer); // 失敗時はUTF-8で強行
        }

        // データの抽出（og系がダメならtwitter系、それもダメなら通常のタグにフォールバック）
        let title = extractMeta(html, ['og:title', 'twitter:title']);
        if (!title) {
          const tMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          title = tMatch ? unescapeHTML(tMatch[1].trim().replace(/\s+/g, ' ')) : '';
        }

        let description = extractMeta(html, ['og:description', 'twitter:description', 'description']);

        let image = extractMeta(html, ['og:image', 'twitter:image', 'image_src']);
        if (!image) { // 画像が見つからない場合はAppleタッチアイコンで代用
          const iconMatch = html.match(/<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i) || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon["']/i);
          if (iconMatch) image = iconMatch[1];
        }

        // URLの正規化（相対パスを絶対URLに直す）
        const absoluteImageUrl = resolveUrl(image, urlStr);

        // 外部サイトのOGPは1日単位でしか変わらないため、成功レスポンスにだけ長期キャッシュを許可する
        const ogResponse = new Response(JSON.stringify({
          status: 'success',
          data: {
            title: title || new URL(urlStr).hostname, // タイトルが無い場合はドメイン名を表示
            description: description,
            image: absoluteImageUrl ? { url: absoluteImageUrl } : null
          }
        }), { headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=86400' } });

        ctx.waitUntil(cache.put(cacheKey, ogResponse.clone()));
        return ogResponse;

      } catch (err) {
        return new Response(JSON.stringify({ status: 'error', message: err.message }), { headers: corsHeaders, status: 500 });
      }
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }

    // ──────────────────────────────────────────
    // 2. POSTリクエスト時：既存のDiscord Bot関連処理
    // ──────────────────────────────────────────
    if (request.method !== 'POST') return new Response('Not found', { status: 404 });
    const isValid = await verifySignature(request, env);
    if (!isValid) return new Response('Invalid request', { status: 401 });

    const interaction = await request.json();
    const repoPath = 'Untechnical-github/Blog';

    if (interaction.type === 1) return new Response(JSON.stringify({ type: 1 }), { headers: { 'Content-Type': 'application/json' } });

    if (interaction.type === 4) {
      try {
        const focusedOption = interaction.data.options.find(opt => opt.focused === true);
        const focusedValue = (focusedOption && typeof focusedOption.value === 'string') ? focusedOption.value.toLowerCase() : "";

        const url = `https://api.github.com/repos/${repoPath}/git/trees/main?recursive=1`;
        const cache = caches.default;
        let res = await cache.match(url);

        if (!res) {
          res = await fetch(url, { headers: { 'Authorization': `Bearer ${env.GITHUB_PAT}`, 'User-Agent': 'Cloudflare-Worker' } });
          if (res.ok) {
            const responseToCache = new Response(res.clone().body, res);
            responseToCache.headers.set('Cache-Control', 'max-age=60');
            ctx.waitUntil(cache.put(url, responseToCache));
          }
        }

        const treeData = await res.json();
        if (!res.ok) {
          return new Response(JSON.stringify({ type: 8, data: { choices: [{ name: `❌ エラー: ${treeData.message}`, value: "error" }] } }), { headers: { 'Content-Type': 'application/json' } });
        }

        const choices = (treeData.tree || [])
          .filter(f => f.type === 'blob' && f.path.startsWith('articles/') && (f.path.endsWith('.html') || f.path.endsWith('.md')))
          .filter(f => f.path.toLowerCase().includes(focusedValue))
          .slice(0, 25)
          .map(f => ({ name: f.path.length > 100 ? '...' + f.path.slice(-97) : f.path, value: f.path }));

        return new Response(JSON.stringify({ type: 8, data: { choices: choices.length > 0 ? choices : [{ name: "⚠️ 一致するファイルがありません", value: "empty" }] } }), { headers: { 'Content-Type': 'application/json' } });
      } catch (err) {
        return new Response(JSON.stringify({ type: 8, data: { choices: [{ name: `❌ 通信エラー: ${err.message}`, value: "error" }] } }), { headers: { 'Content-Type': 'application/json' } });
      }
    }

    if (interaction.type === 2 && interaction.data.name === 'proofread') {
      const selectedPathsArray = interaction.data.options
        .map(opt => opt.value)
        .filter(val => val && val !== "error" && val !== "empty");

      if(selectedPathsArray.length === 0) {
         return new Response(JSON.stringify({ type: 4, data: { content: "⚠️ 正しいファイルを選択してください。" } }), { headers: { 'Content-Type': 'application/json' } });
      }

      const combinedPaths = selectedPathsArray.join(' ');
      await fetch(`https://api.github.com/repos/${repoPath}/actions/workflows/ai-proofread-manual.yml/dispatches`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.GITHUB_PAT}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Cloudflare-Worker' },
        body: JSON.stringify({ ref: 'main', inputs: { keywords: combinedPaths } })
      });

      return new Response(JSON.stringify({
        type: 4,
        data: { content: `🚀 ${selectedPathsArray.length}件の記事の校正依頼を受け付けました。順番に処理します。\n\`${combinedPaths}\`` }
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (interaction.type === 2 && interaction.data.name === 'rebuild') {
      await fetch(`https://api.github.com/repos/${repoPath}/actions/workflows/rebuild-all.yml/dispatches`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.GITHUB_PAT}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Cloudflare-Worker' },
        body: JSON.stringify({ ref: 'main' })
      });

      return new Response(JSON.stringify({
        type: 4,
        data: { content: `🔄 サイト全体の再構築リクエストをGitHubに送信しました！数十秒後に articles.json が更新されます。` }
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (interaction.type === 3) {
      const [action, branchName] = interaction.data.custom_id.split(':');

      const immediateResponse = new Response(JSON.stringify({
        type: 7,
        data: {
          content: interaction.message.content + `\n\n⏳ **通信中... (GitHubで処理を行っています)**`,
          components: []
        }
      }), { headers: { 'Content-Type': 'application/json' } });

      ctx.waitUntil((async () => {
        let responseText = "";
        try {
          if (action === 'apply') {
            const mergeRes = await fetch(`https://api.github.com/repos/${repoPath}/merges`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${env.GITHUB_PAT}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Cloudflare-Worker' },
              body: JSON.stringify({ base: 'main', head: branchName, commit_message: `🤖 AI修正を反映: ${branchName}` })
            });

            if (mergeRes.ok) {
              responseText = "✅ **承認されました**。修正を本番に反映しました！";
            } else {
              responseText = "❌ **マージ失敗**。競合が起きている可能性があります。";
            }
          } else {
            responseText = "🗑️ **破棄されました**。修正案を取り消しました。";
          }

          await fetch(`https://api.github.com/repos/${repoPath}/git/refs/heads/${branchName}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${env.GITHUB_PAT}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Cloudflare-Worker' }
          });
        } catch (err) {
          responseText = `⚠️ エラーが発生しました: ${err.message}`;
        }

        await fetch(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: interaction.message.content + `\n\n${responseText}`,
            components: []
          })
        });
      })());

      return immediateResponse;
    }

    return new Response('OK', { status: 200 });
  }
};
