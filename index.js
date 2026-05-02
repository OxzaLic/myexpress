const express = require('express');
const line = require('@line/bot-sdk');

const app = express();

/**
 * 🔑 ใส่ค่าจาก LINE Developers Console
 * Messaging API
 */
const config = {
  channelAccessToken: 'uMUxAdB/JDm15pyY7ldin+5polvdfZgG8ksoTHrur689xlh6MuTywu5qBUD9yTZ4QBTmnAE4AjxCzT56MbdQJoZmZQctNjAOcBVWnHvWDKuLTkRic/lIA1lVUBRebUQ7175rBTic3CoeS/NDH9zjbgdB04t89/1O/w1cDnyilFU=',
  channelSecret: '6f5fdf60c8efffbbd75385a372dc20f1'
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
  channelAccessToken: config.channelAccessToken
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
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});