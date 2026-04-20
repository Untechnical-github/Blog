import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'node:fs/promises';

const apiKey = process.env.GEMINI_API_KEY;
const botToken = process.env.DISCORD_BOT_TOKEN;     
const channelId = process.env.DISCORD_CHANNEL_ID;   

if (!apiKey || !botToken || !channelId) {
  console.error("Error: Missing credentials (API Key, Bot Token, or Channel ID).");
  process.exit(1);
}

const filePath = process.argv[2];
if (!filePath) process.exit(1);

// リトライ用の待機関数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  try {
    const originalText = await fs.readFile(filePath, 'utf-8');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `あなたはプロのWebライター兼プログラマーです。
以下の文章を校正し、「修正内容の要約」と「修正後のテキスト全体」を必ず以下のフォーマットで出力してください。

【重要ルール】
1. 技術用語やコードブロックのロジックは絶対に改変しないでください。
2. 明らかな構文エラー（タグの閉じ忘れなど）は補完してください。
3. 修正箇所がない場合は、要約に「修正なし」と書いてください。

===SUMMARY===
（ここに修正した箇所の箇条書き要約。例：・〇〇を××に修正、など）
===TEXT===
（ここに修正後のテキスト全体）

【元の文章】
${originalText}`;

    let result;
    const maxRetries = 3; // 最大3回まで再挑戦する

    // Gemini API呼び出し（リトライ機能付き）
    for (let i = 0; i < maxRetries; i++) {
      try {
        console.log(`Waiting for Gemini API... (Attempt ${i + 1}/${maxRetries})`);
        result = await model.generateContent(prompt);
        break; // 成功したらループを抜ける
      } catch (e) {
        console.warn(`⚠️ API Error: ${e.message}`);
        if (i === maxRetries - 1) {
          console.error(`❌ Max retries reached for ${filePath}. Skipping this file.`);
          process.exit(0); // エラーで全体を止めないよう、正常終了扱いにして次のファイルへ進める
        }
        console.log(`Server busy. Retrying in 10 seconds...`);
        await sleep(10000); // 10秒待ってから再挑戦
      }
    }

    if (!result) return;

    const responseText = result.response.text();
    const parts = responseText.split('===TEXT===');
    if (parts.length < 2) {
       console.log("AI format error, skipping.");
       return;
    }

    let summary = parts[0].replace('===SUMMARY===', '').trim();
    let fixedText = parts[1].trim();
    fixedText = fixedText.replace(/^```(html|md|markdown)?\n/i, '').replace(/\n```$/i, '');

    if (originalText === fixedText || summary.includes("修正なし")) {
       console.log(`No changes made by AI for ${filePath}.`);
       return;
    }

    await fs.writeFile(filePath, fixedText, 'utf-8');

    // DiscordへBotとして通知を送信（要約とボタン付き）
    const payload = {
      content: `🤖 **AI校正完了:** \`${filePath}\`\n\n**【修正の要約】**\n${summary}\n\nこの修正を本番に反映しますか？`,
      components: [{
        type: 1, 
        components: [
          { type: 2, style: 1, label: "修正を反映する", custom_id: "apply_fix" },
          { type: 2, style: 4, label: "破棄する", custom_id: "reject_fix" }
        ]
      }]
    };

    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bot ${botToken}` 
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`❌ Discord API Error: Status ${response.status}`);
      console.error(await response.text());
    } else {
      console.log('✅ Discord notification sent via Bot.');
    }

  } catch (error) {
    // 予期せぬエラーでも全体の処理を止めないように process.exit(0) を使用
    console.error(`Error during AI proofreading for ${filePath}:`, error);
    process.exit(0); 
  }
}

main();
