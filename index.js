require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require("@supabase/supabase-js");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
//Google GenAI
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

async function askGemini(text) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `คุณคือผู้ช่วยภาษาไทย ตอบสุภาพ เข้าใจง่าย:\n${text}`,
    });

    return response.text ?? 'ขออภัย ไม่สามารถตอบได้';
  } catch (error) {
    console.error('Gemini Error:', error);
    return 'ขออภัย เกิดข้อผิดพลาดกับ AI';
  }
}

async function askGeminiImage(inlineData) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        "รูปภาพนี้คือรูปอะไร (ถ้าเป็นสัตว์ให้บอกว่าเป็นสัตว์ชนิดอะไร) ขอคำตอบแบบสั้นๆ สุภาพ และเข้าใจง่าย",
        { inlineData: inlineData }
      ]
    });
    return response.text ?? 'ไม่สามารถระบุได้ว่าเป็นรูปอะไรครับ';
  } catch (error) {
    console.error('Gemini Image Analysis Error:', error);
    return 'ไม่สามารถวิเคราะห์รูปภาพได้ในขณะนี้ครับ';
  }
}


// ตั้งค่าจาก LINE Developers Console
// create LINE SDK config from env variables
const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

/**
 * ✅ สร้าง LINE client
 */
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

/**
 * ✅ Webhook endpoint
 */
app.post('/callback', line.middleware(config), (req, res) => {
  console.log('📩 Webhook received');

  // สำคัญมาก: ตอบ 200 ใหักับ LINE ทันที เพื่อป้องกัน LINE Webhook Timeout
  res.sendStatus(200);

  const events = req.body.events || [];

  // จัดการ Event แต่ละตัวใน background
  Promise.all(events.map(event => handleEvent(event)))
    .catch(error => {
      console.error('❌ Error handling event:', error);
    });
});

/**
 * ✅ สร้าง LINE Blob client (v9+)
 */
const lineBlobClient = new line.messagingApi.MessagingApiBlobClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
});

const downloadLineContent = async (messageId) => {
  const stream = await lineBlobClient.getMessageContent(messageId);
  const chunks = [];

  // รองรับทั้งแบบ Blob (มี arrayBuffer) และแบบ Stream
  if (stream.arrayBuffer) {
    const arrayBuffer = await stream.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType: stream.type || 'image/jpeg'
      },
      buffer: buffer
    };
  } else {
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    return {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType: 'image/jpeg'
      },
      buffer: buffer
    };
  }
};

async function handleImageMessage(event) {
  const userId = event.source?.userId || 'unknown';
  const replyToken = event.replyToken;
  const messageId = event.message.id;
  const messageType = event.message.type;

  try {
    // 1. ดาวน์โหลดรูปภาพจาก LINE (ด้วย SDK v9+)
    const imageContent = await downloadLineContent(messageId);
    const fileName = `${messageId}.jpg`;

    // 2. อัปโหลดเข้า Supabase Storage ("Uploads" bucket ในโฟลเดอร์ bot-uploads)
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('Uploads')
      .upload(`bot-uploads/${fileName}`, imageContent.buffer, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (uploadError) throw new Error(uploadError.message);

    // 3. ดึง Public URL
    const { data: publicUrlData } = supabase
      .storage
      .from('Uploads')
      .getPublicUrl(`bot-uploads/${fileName}`);

    const publicUrl = publicUrlData.publicUrl;

    // 3.5 ให้ Gemini วิเคราะห์รูปภาพว่าเป็นสัตว์ชนิดอะไร
    const aiAnalysis = await askGeminiImage(imageContent.inlineData);

    const botReplyText = publicUrl
      ? `✅ บันทึกรูปภาพเรียบร้อยแล้ว\nระบุตัวตน: ${aiAnalysis}`
      : `❌ ไม่สามารถอัปโหลดได้ แต่ระบบวิเคราะห์ได้ว่า: ${aiAnalysis}`;

    // 4. บันทึกข้อมูลลงฐานข้อมูล messages
    const { error: dbError } = await supabase
      .from('messages')
      .insert([
        {
          user_id: userId,
          message_id: messageId,
          type: messageType,
          content: publicUrl || 'upload_failed',
          reply_token: replyToken,
          reply_content: botReplyText,
        },
      ]);

    if (dbError) {
      console.error('Supabase Insert Error (Image):', dbError.message);
    }

    // 5. ตอบ LINE
    return await client.replyMessage({
      replyToken: replyToken,
      messages: [{ type: "text", text: botReplyText }]
    });

  } catch (error) {
    console.error("❌ Image Handle Error:", error);
    return null;
  }
}

/**
 * ✅ จัดการ event แต่ละอัน
 */
async function handleEvent(event) {
  if (event.type === "message" && event.message.type === "image") {
    return handleImageMessage(event);
  }

  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  const userId = event.source?.userId || 'unknown';
  const replyToken = event.replyToken;
  const messageId = event.message.id;
  const messageType = event.message.type;
  const content = event.message.text;

  try {
    // ✅ เรียก Gemini
    const botReplyText = await askGemini(content);


    // ✅ บันทึก Supabase
    const { error } = await supabase
      .from('messages')
      .insert([
        {
          user_id: userId,
          message_id: messageId,
          type: messageType,
          content: content,
          reply_token: replyToken,
          reply_content: botReplyText,
        },
      ]);

    if (error) {
      console.error('Supabase Insert Error:', error.message);
    }

    // ✅ ตอบ LINE
    return await client.replyMessage({
      replyToken: replyToken,
      messages: [
        {
          type: 'text',
          text: botReplyText,
        },
      ],
    });

  } catch (error) {
    console.error('เกิดข้อผิดพลาด:', error);
    return null;
  }
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