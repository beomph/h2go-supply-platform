/**
 * 네이버 로그인 → 내게메일쓰기 → 제목:'오늘 날짜', 내용:'메일작성 시각' → 발송 → 로그아웃
 * .env의 NAVER_ID, NAVER_PW 사용
 * 각 단계 3회 재시도 후 실패 시 해당 단계에서 종료
 */
require('dotenv').config();
const { chromium } = require('playwright');

const NAVER_ID = process.env.NAVER_ID;
const NAVER_PW = process.env.NAVER_PW;
const MAX_RETRIES = 3;

if (!NAVER_ID || !NAVER_PW || NAVER_ID.includes('여기에') || NAVER_PW.includes('여기에')) {
  console.error('오류: .env에 NAVER_ID, NAVER_PW를 올바르게 설정하세요.');
  process.exit(1);
}

function getTodayDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const dayName = weekdays[now.getDay()];
  return `${y}년 ${m}월 ${d}일 (${dayName})`;
}

function getMailWriteTime() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const sec = String(now.getSeconds()).padStart(2, '0');
  return `${y}년 ${m}월 ${d}일 ${h}:${min}:${sec}`;
}

async function withRetry(fn, stepName) {
  for (let i = 1; i <= MAX_RETRIES; i++) {
    try {
      await fn();
      return true;
    } catch (e) {
      console.error(`[${stepName}] ${i}/${MAX_RETRIES}회 실패:`, e.message);
      if (i === MAX_RETRIES) {
        console.error(`[${stepName}] ${MAX_RETRIES}회 재시도 후 종료`);
        return false;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return false;
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // === 1단계: 로그인 ===
    const loginOk = await withRetry(async () => {
      console.log('[1단계] 네이버 로그인 중...');
      await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1500);
      await page.locator('#id').first().click();
      await page.keyboard.insertText(NAVER_ID);
      await page.locator('#pw').first().click();
      await page.keyboard.insertText(NAVER_PW);
      await page.locator('#log\\.login').first().click();
      await page.waitForURL(/naver\.com/, { timeout: 20000 });
      console.log('[1단계] 로그인 완료');
    }, '로그인');
    if (!loginOk) { await browser.close(); process.exit(1); }

    // === 2단계: 메일 접속 ===
    const mailOk = await withRetry(async () => {
      console.log('[2단계] 메일 페이지 접속 중...');
      await page.goto('https://mail.naver.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);
      console.log('[2단계] 메일 접속 완료');
    }, '메일접속');
    if (!mailOk) { await browser.close(); process.exit(1); }

    // === 3단계: 내게메일쓰기 + 작성 + 전송 ===
    const composeOk = await withRetry(async () => {
      console.log('[3단계] 내게메일쓰기 진입 중...');
      const toEmail = encodeURIComponent(NAVER_ID + '@naver.com');
      await page.goto(`https://mail.naver.com/write?to=${toEmail}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(4000);

      const subjectStr = '오늘 날짜';
      const bodyStr = getMailWriteTime();

      // 받는 사람 (URL로 전달됐을 수 있음)
      const toInput = page.locator('input[placeholder*="받는"], input[name="to"], #recipient_input_element').first();
      if (await toInput.count() > 0) {
        await toInput.fill(NAVER_ID + '@naver.com', { timeout: 5000 });
      }

      // 제목
      const subjectInput = page.locator('input[placeholder*="제목"], input[name="subject"], #subject_title').first();
      await subjectInput.fill(subjectStr, { timeout: 8000 });

      // 본문 (iframe)
      let bodyFilled = false;
      const iframes = await page.locator('iframe').all();
      for (const iframe of iframes) {
        try {
          const frame = await iframe.contentFrame();
          const body = frame.locator('body').first();
          await body.click({ timeout: 2000 });
          await body.pressSequentially(bodyStr);
          bodyFilled = true;
          break;
        } catch (_) {}
      }
      if (!bodyFilled) {
        const editable = page.locator('[contenteditable="true"]').first();
        if (await editable.count() > 0) {
          await editable.click();
          await editable.pressSequentially(bodyStr);
        }
      }

      await page.waitForTimeout(1500);

      // 보내기
      await page.locator('button:has-text("보내기"), a:has-text("보내기"), .button_write_task').first().click({ timeout: 8000 });
      await page.waitForTimeout(3000);
      console.log('[3단계] 메일 전송 완료');
    }, '메일작성/전송');
    if (!composeOk) { await browser.close(); process.exit(1); }

    // === 4단계: 로그아웃 ===
    console.log('[4단계] 로그아웃 중...');
    await page.goto('https://nid.naver.com/nidlogin.logout', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(2000);
    console.log('[4단계] 로그아웃 완료');

  } catch (err) {
    console.error('오류:', err.message);
  } finally {
    await browser.close();
    console.log('브라우저 종료');
  }
})();
