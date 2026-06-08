/**
 * Bobby 自动截图脚本
 *
 * 用 Puppeteer 打开 Bobby，模拟用户操作，截图关键页面。
 * 用途：更新 README 截图
 *
 * 运行：node scripts/screenshot.js
 */

const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BOBBY_URL = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');
const WAIT = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('启动 Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--window-size=390,844'], // iPhone 14 Pro 尺寸
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  // 清除 localStorage 模拟新用户
  await page.goto(BOBBY_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await WAIT(3000);

  // ═══ 1. 引导页 ═══
  console.log('截图 01: 引导页');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-onboarding.png') });

  // 点击进入
  try {
    await page.waitForSelector('#onboardingBtn', { timeout: 5000 });
    await page.click('#onboardingBtn');
    await WAIT(3000);
  } catch (e) {
    console.log('引导页按钮未找到，跳过');
  }

  // ═══ 2. 空聊天页面 ═══
  console.log('截图 02: 空聊天页面');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-chat-empty.png') });

  // ═══ 3. 发送消息并等待回复 ═══
  console.log('发送消息...');
  try {
    await page.waitForSelector('#inputBox', { timeout: 5000 });
    await page.type('#inputBox', '你好');
    await page.waitForSelector('#sendBtn:not([disabled])', { timeout: 2000 });
    await page.click('#sendBtn');
    await WAIT(3000); // 等 Bobby 回复

    console.log('截图 03: 单条回复');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-chat-reply.png') });

    // 多轮对话
    const messages = ['你在干嘛', '今天天气怎么样', '好累啊'];
    for (const msg of messages) {
      await page.type('#inputBox', msg);
      await page.waitForSelector('#sendBtn:not([disabled])', { timeout: 2000 });
      await page.click('#sendBtn');
      await WAIT(4000);
    }

    console.log('截图 04: 多轮对话');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-chat-conversation.png') });
  } catch (e) {
    console.log('聊天截图失败:', e.message);
  }

  // ═══ 5. 主页 ═══
  console.log('切换到主页...');
  try {
    await page.click('[data-page="profilePage"]');
    await WAIT(1500);
    console.log('截图 05: 主页');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-profile.png') });

    // 滚动查看更多
    await page.evaluate(() => {
      const el = document.querySelector('#profilePage .page-content') || document.querySelector('#profilePage');
      if (el) el.scrollTop = el.scrollHeight;
    });
    await WAIT(1000);
    console.log('截图 06: 主页滚动');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-profile-scroll.png') });
  } catch (e) {
    console.log('主页截图失败:', e.message);
  }

  // ═══ 7. 动态页 ═══
  console.log('切换到动态页...');
  try {
    await page.click('[data-page="notesPage"]');
    await WAIT(2000);
    console.log('截图 07: 动态页');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07-notes.png') });
  } catch (e) {
    console.log('动态页截图失败:', e.message);
  }

  // ═══ 8. 送礼面板 ═══
  console.log('回到主页打开礼物面板...');
  try {
    await page.click('[data-page="profilePage"]');
    await WAIT(1000);
    // 点击送礼按钮
    const giftBtn = await page.evaluateHandle(() => {
      const btns = document.querySelectorAll('button, div[onclick]');
      for (const b of btns) {
        if (b.textContent.includes('送') || b.textContent.includes('礼物') || b.className.includes('gift')) {
          return b;
        }
      }
      // 尝试找 gift-panel 相关的按钮
      return document.querySelector('.gift-trigger') || document.querySelector('[onclick*="gift"]');
    });
    if (giftBtn) {
      await giftBtn.click();
      await WAIT(1000);
    }
    console.log('截图 09: 礼物面板');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09-gift-panel.png') });
  } catch (e) {
    console.log('礼物面板截图失败:', e.message);
  }

  await browser.close();
  console.log('截图完成！');
}

main().catch(err => {
  console.error('截图脚本失败:', err);
  process.exit(1);
});
