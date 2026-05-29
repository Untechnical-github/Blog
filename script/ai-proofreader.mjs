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
        topP: 0.1,
        topK: 1,
        responseMimeType: "application/json"
      }
    });

    const prompt = `あなたはコードを絶対に破壊しない、超精密な校正プログラムの一部です。
与えられたHTML/Markdownファイルから、【明らかな誤字脱字、変換ミス、タグの致命的な構文エラー】のみを検出し、その修正前と修正後のペアを必ず以下のJSON配列形式【のみ】で返してください。

【厳守ルール】
1. 修正が必要な箇所「だけ」を抜き出してください。修正後の全文を出力してはいけません。
2. スタイルの変更、言い回しの変更、より良い表現へのリライトは一切禁止します。
3. 修正すべき確証がない場合は、その箇所をリストに含めないでください。
4. 修正箇所が一切ない場合は、空の配列 [] を返してください。
5. プロフィール、問い合わせフォーム（<section id="about"> 内など）、SNSのアカウント名やメールアドレスの記述は校正の対象外です。コロン（：や︰）などの記号を含め、一切修正リストに含めないでください。

【出力フォーマット】
[
  {
    "before": "修正前の1行（または問題のフレーズ）",
    "after": "修正後の1行（または修正後のフレーズ）"
  }
]

【解析対象のファイル内容】
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
        if (i === maxRetries - 1) process.exit(0);
        await sleep(10000);
      }
    }

    if (!result) return;
    const responseText = result.response.text().trim();
    
    let patches = [];
    try {
      patches = JSON.parse(responseText);
    } catch (jsonErr) {
      console.error("❌ AIの出力が正しいJSON形式ではありませんでした。処理を中断します。");
      process.exit(0);
    }

    if (!Array.isArray(patches) || patches.length === 0) {
      console.log(`No changes made by AI for ${filePath}.`);
      return;
    }

    let fixedText = originalText;
    let summaryLines = [];
    let actualChangeCount = 0;

    for (const patch of patches) {
      if (!patch.before || !patch.after) continue;
      
      if (fixedText.includes(patch.before)) {
        fixedText = fixedText.replaceAll(patch.before, patch.after);
        summaryLines.push(`・[Before] \`${patch.before}\` ➡️ [After] \`${patch.after}\``);
        actualChangeCount++;
      } else {
        console.warn(`⚠️ 警告: 修正対象が見つかりません（スキップ）: ${patch.before}`);
      }
    }

    if (actualChangeCount === 0) {
      console.log(`No applicable changes for ${filePath}.`);
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

    const summary = summaryLines.join('\n');
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