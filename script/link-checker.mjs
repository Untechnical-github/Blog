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

  const message = brokenLinks.map(link => `- [${link.type}] ${link.url} (Status: ${link.status})\n  Source: ${link.source}`).join('\n\n');
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
    const res = await fetch(url, { 
      method: 'HEAD', 
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    return res.status;
  } catch (err) {
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
        console.log(`❌ Page BROKEN: ${pageRes.status}`);
        brokenLinks.push({ type: 'Page', url: fullUrl, status: pageRes.status, source: 'articles.json' });
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

        const imgUrl = new URL(src, fullUrl).href;
        
        process.stdout.write(`  Checking Image: ${imgUrl} ... `);
        const imgStatus = await checkUrl(imgUrl);
        if (imgStatus !== 200) {
          console.log(`❌ BROKEN`);
          brokenLinks.push({ type: 'Image', url: imgUrl, status: imgStatus, source: fullUrl });
        } else {
          console.log(`✅ OK`);
        }
        await sleep(500); 
      }

      const links = document.querySelectorAll('a');
      for (const link of links) {
        let href = link.getAttribute('href');
        
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
          continue;
        }

        const linkUrl = new URL(href, fullUrl).href;
        
        process.stdout.write(`  Checking Link: ${linkUrl} ... `);
        const linkStatus = await checkUrl(linkUrl);
        
        if (typeof linkStatus === 'number' && linkStatus >= 200 && linkStatus < 400) {
          console.log(`✅ OK (${linkStatus})`);
        } else {
          console.log(`❌ BROKEN (${linkStatus})`);
          brokenLinks.push({ type: 'TextLink', url: linkUrl, status: linkStatus, source: fullUrl });
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