require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');

const app = express();




// ตั้งค่าจาก LINE Developers Console
// create LINE SDK config from env variables
const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

/**
 * ✅ LINE middleware (จำเป็น)
 * ใช้เฉพาะ path /callback
 */
app.use('/callback', line.middleware(config));

/**
 * ✅ สร้าง LINE client
 */
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

/**
 * ✅ Webhook endpoint
 */
app.post('/callback', async (req, res) => {
  // ดู log เพื่อ debug ได้
  console.log('📩 Webhook received');
  console.log(JSON.stringify(req.body, null, 2));

  try {
    const events = req.body.events;

    for (const event of events) {
      await handleEvent(event);
    }

    // ต้องตอบ 200 ให้ LINE
    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error:', error);
    res.sendStatus(500);
  }
});

/**
 * ✅ จัดการ event แต่ละอัน
 */
async function handleEvent(event) {
  // รับเฉพาะข้อความ text
  if (event.type !== 'message' || event.message.type !== 'text') {
    return;
  }

  const userText = event.message.text;

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [
      {
        type: 'text',
        text: `คุณพิมพ์ว่า: ${userText}`
      }
    ]
  });
}

/**
 * ✅ Start server
 */
// เพิ่ม GET Method
app.get('/', (req, res) => {
  res.send('hello world, Phagamas');
});
const PORT = process.env.PORT || 3013;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});