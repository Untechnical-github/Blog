import { Buffer } from 'node:buffer';

// 設定
const SITE_DOMAIN = 'https://untechnical.info';
const ARTICLES_JSON_URL = `${SITE_DOMAIN}/articles.json`;
const IFTTT_KEY = process.env.IFTTT_KEY;
const IFTTT_EVENT = 'broken_link_alert';

async function sendDiscordNotification(brokenLinks) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('Error: DISCORD_WEBHOOK_URL is not set.');
    return;
  }

  const message = brokenLinks.map(link => `- ${link.url} (Status: ${link.status})`).join('\n');
  const payload = {
    content: `⚠️ **リンク切れを検知しました**\n${message}`
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (response.ok) console.log('Notification sent to Discord.');
  } catch (err) {
    console.error('Failed to send Discord notification:', err);
  }
}

async function checkUrl(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
    return res.status;
  } catch (err) {
    return 'TIMEOUT/ERROR';
  }
}

async function main() {
  console.log('Starting link check...');
  const brokenLinks = [];

  try {
    // 1. 記事一覧を取得
    const res = await fetch(ARTICLES_JSON_URL);
    const articles = await res.json(); // 形式は想定: [{ "path": "/posts/..." }, ...]

    // 2. 各記事自体の存在チェック
    for (const article of articles) {
      const fullUrl = `${SITE_DOMAIN}${article.path}`;
      process.stdout.write(`Checking: ${fullUrl} ... `);
      
      const status = await checkUrl(fullUrl);
      if (status !== 200) {
        console.log('❌ BROKEN');
        brokenLinks.push({ url: fullUrl, status, source: 'Article List' });
      } else {
        console.log('✅ OK');
      }

      // ※ 記事内部の外部リンクチェックを追加したい場合は、
      // ここで fetch(fullUrl) して HTMLを取得し、正規表現で href="http..." を抽出してループします。
      // 今回は基本のページ存在チェックのみとしています。
    }

    // 3. リンク切れがあれば通知
    if (brokenLinks.length > 0) {
      await sendIftttNotification(brokenLinks);
    } else {
      console.log('No broken links found.');
    }

  } catch (err) {
    console.error('Critical error during execution:', err);
    process.exit(1);
  }
}

main();
