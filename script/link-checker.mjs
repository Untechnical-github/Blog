import { Buffer } from 'node:buffer';
import { JSDOM } from 'jsdom';

const SITE_DOMAIN = 'https://untechnical.info';
const ARTICLES_JSON_URL = `${SITE_DOMAIN}/articles.json`;

async function sendDiscordNotification(brokenLinks) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('Error: DISCORD_WEBHOOK_URL is not set.');
    return;
  }

  let message = brokenLinks.map(link => `- [${link.type}] ${link.url} (Status: ${link.status})\n  Source: ${link.source}`).join('\n\n');
  const prefix = `⚠️ **リンク切れを検知しました**\n`;

  if (prefix.length + message.length > 2000) {
    message = message.substring(0, 1900) + '\n... (文字数制限のため以降は省略されました)';
  }

  const payload = {
    content: prefix + message
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      console.log('✅ Notification sent to Discord.');
    } else {
      console.error(`❌ Discord API Error: Status ${response.status}`);
      console.error(await response.text());
    }
  } catch (err) {
    console.error('❌ Network error when sending to Discord:', err);
  }
}

async function checkUrl(url, type) {
  try {
    const options = {
      signal: AbortSignal.timeout(10000), 
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': type === 'Image' ? 'image/webp,image/apng,image/*,*/*;q=0.8' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    };
    
    let res = await fetch(url, { ...options, method: 'HEAD' });
    let contentType = res.headers.get('content-type') || '';
    
    if (res.status === 403 || res.status === 405 || res.status === 500 || res.status === 503 || (type === 'Image' && contentType.includes('text/html'))) {
      res = await fetch(url, { ...options, method: 'GET' });
      contentType = res.headers.get('content-type') || '';
    }

    if (type === 'Image' && res.ok && contentType.includes('text/html')) {
      return 'FAKE_200_HTML (パス間違い)'; 
    }

    const isExternal = !url.startsWith(SITE_DOMAIN);
    if (type === 'TextLink' && isExternal && (res.status === 403 || res.status === 503)) {
      return 'BOT_PROTECTION_IGNORED'; 
    }
    
    return res.status;
  } catch (err) {
    const isExternal = !url.startsWith(SITE_DOMAIN);
    if (type === 'TextLink' && isExternal) {
      return 'EXTERNAL_TIMEOUT_IGNORED';
    }
    return 'TIMEOUT/ERROR';
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('Starting link check (Pages, Images & Text Links)...');
  const brokenLinks = [];

  try {
    const res = await fetch(ARTICLES_JSON_URL);
    const articles = await res.json(); 

    for (const article of articles) {
      const fullUrl = new URL(article.path, SITE_DOMAIN).href; 
      console.log(`\nChecking Page: ${fullUrl} ...`);
      
      const pageRes = await fetch(fullUrl);
      if (!pageRes.ok) {
        if (pageRes.status >= 400) {
          console.log(`❌ Page BROKEN: ${pageRes.status}`);
          brokenLinks.push({ type: 'Page', url: fullUrl, status: pageRes.status, source: 'articles.json' });
        } else {
          console.log(`⚠️ Page ERROR / IGNORED: ${pageRes.status}`);
        }
        continue; 
      }
      console.log('✅ Page OK');

      const html = await pageRes.text();
      const dom = new JSDOM(html);
      const document = dom.window.document;
      
      const images = document.querySelectorAll('img');
      for (const img of images) {
        let src = img.getAttribute('src');
        if (!src || src.startsWith('data:')) continue; 

        let imgUrl;
        try {
          imgUrl = new URL(src, fullUrl).href;
        } catch (e) {
          console.log(`❌ BROKEN (INVALID URL): ${src}`);
          brokenLinks.push({ type: 'Image', url: src, status: 'INVALID', source: fullUrl });
          continue;
        }
        
        process.stdout.write(`  Checking Image: ${imgUrl} ... `);
        const imgStatus = await checkUrl(imgUrl, 'Image'); 
        
        if (imgStatus === 'TIMEOUT/ERROR' || imgStatus === 'FAKE_200_HTML (パス間違い)' || (typeof imgStatus === 'number' && imgStatus >= 400)) {
          console.log(`❌ BROKEN (${imgStatus})`);
          brokenLinks.push({ type: 'Image', url: imgUrl, status: imgStatus, source: fullUrl });
        } else {
          console.log(`✅ OK (${imgStatus})`);
        }
        await sleep(500); 
      }

      const links = document.querySelectorAll('a');
      for (const link of links) {
        let href = link.getAttribute('href');
        
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:') || href.includes('/cdn-cgi/l/email-protection')) {
          continue;
        }

        let linkUrl;
        try {
          linkUrl = new URL(href, fullUrl).href;
        } catch (e) {
          console.log(`❌ BROKEN (INVALID URL): ${href}`);
          brokenLinks.push({ type: 'TextLink', url: href, status: 'INVALID', source: fullUrl });
          continue;
        }
        
        process.stdout.write(`  Checking Link: ${linkUrl} ... `);
        const linkStatus = await checkUrl(linkUrl, 'TextLink'); 
        
        if (linkStatus === 'EXTERNAL_TIMEOUT_IGNORED' || linkStatus === 'BOT_PROTECTION_IGNORED') {
          console.log(`✅ IGNORED (Bot Protection / Timeout)`);
        } else if (linkStatus === 'TIMEOUT/ERROR' || (typeof linkStatus === 'number' && linkStatus >= 400)) {
          console.log(`❌ BROKEN (${linkStatus})`);
          brokenLinks.push({ type: 'TextLink', url: linkUrl, status: linkStatus, source: fullUrl });
        } else {
          console.log(`✅ OK (${linkStatus})`);
        }
        await sleep(500); 
      }
      
      await sleep(1000);
    }

    if (brokenLinks.length > 0) {
      await sendDiscordNotification(brokenLinks);
    } else {
      console.log('\nNo broken links found.');
    }

  } catch (err) {
    console.error('Critical error during execution:', err);
    process.exit(1);
  }
}

main();