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

    const prompt = `あなたは厳格な校正アシスタント兼プログラマーです。
以下の文章から【明らかなエラーのみ】を修正し、「修正内容の要約」と「修正後のテキスト全体」を以下のフォーマットで出力してください。

【厳守するルール】
1. HTMLの構造、コードブロック内の記述、インデントなどの「コードの書き方・構造」は絶対に改変しないでください。
2. コードに関して修正が許されるのは、「明らかなスペルミス」「タグやカッコの閉じ忘れ」といった致命的な構文エラーの補完のみです。
3. 日本語の文章において、句読点（、。）の追加・削除や、言い回しの変更といった「スタイルの修正」は一切行わないでください。
4. 明らかな「誤字脱字」「変換ミス」のみを修正対象としてください。修正すべき確証がない場合は絶対に元の文章を維持してください。
5. 修正箇所が一つもない場合は、要約に「修正なし」とだけ書いてください。

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

        // --- (省略) AIによる校正処理の後 ---

    // 1. ファイルを上書き保存
    await fs.writeFile(filePath, fixedText, 'utf-8');

    // 2. ユニークな一時ブランチ名（ai-fix-1713... の形式）
    const branchName = `ai-fix-${Date.now()}`;

    // 3. Git操作（そのファイルだけをPush）
    try {
      execSync(`git config user.name "github-actions[bot]"`);
      execSync(`git config user.email "github-actions[bot]@users.noreply.github.com"`);
      execSync(`git checkout -b ${branchName}`);
      execSync(`git add "${filePath}"`);
      execSync(`git commit -m "🤖 AI校正案: ${filePath}"`);
      execSync(`git push origin ${branchName}`);
      
      // 作業後はmainに戻り、ローカルのブランチは即座に消す（GitHub上のブランチはWorkerが消します）
      execSync(`git checkout main`);
      execSync(`git branch -D ${branchName}`);
    } catch (gitError) {
      console.error("Git failed:", gitError);
      process.exit(0);
    }

    // 4. Discordへボタン付きで送信
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
