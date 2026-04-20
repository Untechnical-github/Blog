import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'node:fs/promises';

const apiKey = process.env.GEMINI_API_KEY;
const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

if (!apiKey || !webhookUrl) {
  console.error("Error: GEMINI_API_KEY or DISCORD_WEBHOOK_URL is missing.");
  process.exit(1);
}

const filePath = process.argv[2];
if (!filePath) {
  console.error("Error: Target file path is required.");
  process.exit(1);
}

async function main() {
  try {
    console.log(`Starting AI proofreading for: ${filePath}`);
    
    const originalText = await fs.readFile(filePath, 'utf-8');

    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const prompt = `あなたはプロのWebライター兼プログラマーです。
以下のHTMLまたはMarkdownの文章を読み、誤字脱字、文法エラー、不自然な表現を修正してください。

【重要ルール】
1. 修正後のテキスト全体のみを出力してください。挨拶や説明コメントは一切不要です。
2. 技術用語はそのまま維持してください。
3. HTMLタグやコードブロックのロジック自体は改変しないでください。
4. ただし、「カッコの閉じ忘れ」や「タグの閉じ忘れ」など、そのままではエラーになるレベルの【明らかな構文エラー（タイポ）】を発見した場合のみ、正しい形に補完・修正してください。

【元の文章】
${originalText}`;

    console.log("Waiting for Gemini API...");
    const result = await model.generateContent(prompt);
    let fixedText = result.response.text();

    fixedText = fixedText.replace(/^```(html|md|markdown)?\n/i, '').replace(/\n```$/i, '');

    await fs.writeFile(filePath, fixedText, 'utf-8');
    console.log("File updated with AI suggestions.");

    const payload = {
      content: `🤖 **AI校正のお知らせ**\n\`${filePath}\` の校正案が作成されました。\n修正を本番に反映しますか？`,
      components: [{
        type: 1,
        components: [
          {
            type: 2,
            style: 1,
            label: "修正を反映する",
            custom_id: "apply_fix"
          },
          {
            type: 2,
            style: 4,
            label: "破棄する",
            custom_id: "reject_fix"
          }
        ]
      }]
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log('✅ Discord notification with buttons sent.');
    } else {
      console.error(`❌ Discord API Error: Status ${response.status}`);
    }

  } catch (error) {
    console.error("Error during AI proofreading:", error);
    process.exit(1);
  }
}

main();