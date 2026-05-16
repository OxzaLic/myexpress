const { GoogleGenAI } = require("@google/genai");

// You will need to export GEMINI_API_KEY for this to work
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function test() {
    const res = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "สวัสดี"
    });
    console.log(res.text);
}
test().catch(console.error);
