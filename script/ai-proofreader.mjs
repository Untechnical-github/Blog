import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'node:fs/promises';

const apiKey = process.env.GEMINI_API_KEY;
const botToken = process.env.DISCORD_BOT_TOKEN;     // 変更: WebhookからBotTokenへ
const channelId = process.env.DISCORD_CHANNEL_ID;   // 変更: 送信先チャンネルID

if (!apiKey || !botToken || !channelId) {
  console.error("Error: Missing credentials (API Key, Bot Token, or Channel ID).");
  process.exit(1);
}

const filePath = process.argv[2];
if (!filePath) process.exit(1);

async function main() {
  try {
    const originalText = await fs.readFile(filePath, 'utf-8');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // AIへ「要約」と「本文」を分けて出させるプロンプトに変更
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

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // AIの出力を「要約」と「本文」に分割
    const parts = responseText.split('===TEXT===');
    if (parts.length < 2) {
       console.log("AI format error, skipping.");
       return;
    }

    let summary = parts[0].replace('===SUMMARY===', '').trim();
    let fixedText = parts[1].trim();
    fixedText = fixedText.replace(/^```(html|md|markdown)?\n/i, '').replace(/\n```$/i, '');

    // 修正が全くなければスキップする
    if (originalText === fixedText || summary.includes("修正なし")) {
       console.log(`No changes made by AI for ${filePath}.`);
       return;
    }

    // ファイルを上書き保存
    await fs.writeFile(filePath, fixedText, 'utf-8');

    // Webhookではなく、BotのAPIを使って直接送信する（これでボタンが表示されます）
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
        'Authorization': `Bot ${botToken}` // Botとして送信
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`❌ Discord API Error: Status ${response.status}`);
      console.error(await response.text());
    }

  } catch (error) {
    console.error("Error during AI proofreading:", error);
    process.exit(1);
  }
}

main();