import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'node:fs/promises';
import { execSync } from 'node:child_process';

const apiKey = process.env.GEMINI_API_KEY;
const botToken = process.env.DISCORD_BOT_TOKEN;     
const channelId = process.env.DISCORD_CHANNEL_ID;   

if (!apiKey || !botToken || !channelId) {
  console.error("Error: Missing credentials.");
  process.exit(1);
}

const filePath = process.argv[2];
if (!filePath) process.exit(1);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  try {
    const originalText = await fs.readFile(filePath, 'utf-8');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-flash-latest",
      generationConfig: {
        temperature: 0.0,
      }
    });

        const prompt = `あなたは厳格な校正アシスタント兼プログラマーです。
以下の文章から【明らかなエラーのみ】を修正し、「修正内容の詳細」と「修正後のテキスト全体」を出力してください。

【厳守するルール】
1. HTMLの構造、コードブロック内の記述、インデントなどの「コードの書き方・構造」は絶対に改変しないでください。
2. コードに関して修正が許されるのは、「明らかなスペルミス」「タグやカッコの閉じ忘れ」といった致命的な構文エラーの補完のみです。
3. 日本語の文章において、句読点（、。）の追加・削除や、言い回しの変更といった「スタイルの修正」は一切行わないでください。
4. 明らかな「誤字脱字」「変換ミス」のみを修正対象としてください。修正すべき確証がない場合は絶対に元の文章を維持してください。
5. 修正箇所が一つもない場合は、要約に「修正なし」とだけ書いてください。

===SUMMARY===
（修正箇所ごとに、必ず以下の「Before ➡️ After」の形式で詳細にリストアップしてください。複数の同じ修正がある場合でも、「〇箇所」とまとめずに1つずつ分けて記載してください）
例：
・[Before] Andorid Wear ➡️ [After] Android Wear
・[Before] ありがとございます ➡️ [After] ありがとうございます

===TEXT===
（ここに修正後のテキスト全体）

【元の文章】
${originalText}`;

    let result;
    const maxRetries = 5;
    for (let i = 0; i < maxRetries; i++) {
      try {
        console.log(`Waiting for Gemini API... (Attempt ${i + 1}/${maxRetries})`);
        result = await model.generateContent(prompt);
        break;
      } catch (e) {
        console.error(`⚠️ API Error on attempt ${i + 1}: ${e.message}`);
        
        if (i === maxRetries - 1) {
          console.error(`❌ Max retries reached for ${filePath}.`);
          process.exit(0);
        }
        console.log(`Retrying in 10 seconds...`);
        await sleep(10000);
      }
    }

    if (!result) return;
    const responseText = result.response.text();
    const parts = responseText.split('===TEXT===');
    if (parts.length < 2) return;

    let summary = parts[0].replace('===SUMMARY===', '').trim();
    let fixedText = parts[1].trim();
    fixedText = fixedText.replace(/^```(html|md|markdown)?\n/i, '').replace(/\n```$/i, '');

    if (originalText === fixedText || summary.includes("修正なし")) {
       console.log(`No changes made by AI for ${filePath}.`);
       return;
    }

    await fs.writeFile(filePath, fixedText, 'utf-8');

    const branchName = `ai-fix-${Date.now()}`;

    try {
      execSync(`git config user.name "github-actions[bot]"`);
      execSync(`git config user.email "github-actions[bot]@users.noreply.github.com"`);
      execSync(`git checkout -b ${branchName}`);
      execSync(`git add "${filePath}"`);
      execSync(`git commit -m "🤖 AI校正案: ${filePath}"`);
      execSync(`git push origin ${branchName}`);
      
      execSync(`git checkout main`);
      execSync(`git branch -D ${branchName}`);
    } catch (gitError) {
      console.error("Git failed:", gitError);
      process.exit(0);
    }

    const payload = {
      content: `🤖 **AI校正完了:** \`${filePath}\`\n\n**【修正の要約】**\n${summary}\n\n反映しますか？`,
      components: [{
        type: 1, 
        components: [
          { type: 2, style: 1, label: "反映する", custom_id: `apply:${branchName}` },
          { type: 2, style: 4, label: "破棄する", custom_id: `reject:${branchName}` }
        ]
      }]
    };

    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${botToken}` },
      body: JSON.stringify(payload)
    });

  } catch (error) {
    console.error(`Error during AI proofreading for ${filePath}:`, error);
    process.exit(0); 
  }
}

main();
