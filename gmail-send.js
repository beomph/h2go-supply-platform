// H2GO — Gmail 테스트 메일 발송
// .env에 GMAIL_USER, GMAIL_APP_PASSWORD 설정 필요
// Gmail 앱 비밀번호 발급: https://myaccount.google.com/apppasswords
// (Google 계정 2단계 인증 활성화 후 앱 비밀번호 생성)

require('dotenv').config();
const nodemailer = require('nodemailer');

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error('오류: .env에 GMAIL_USER, GMAIL_APP_PASSWORD를 올바르게 설정하세요.');
    process.exit(1);
}

const now = new Date();
const dateStr = now.toISOString().slice(0, 10);
const timeStr = now.toISOString().slice(0, 19).replace('T', ' ');

async function sendMail() {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: GMAIL_USER,
            pass: GMAIL_APP_PASSWORD,
        },
    });

    const info = await transporter.sendMail({
        from: GMAIL_USER,
        to: GMAIL_USER,
        subject: dateStr,
        text: timeStr,
    });

    console.log('메일 발송 완료:', info.messageId);
}

sendMail().catch((err) => {
    console.error('메일 발송 오류:', err.message);
    process.exit(1);
});
