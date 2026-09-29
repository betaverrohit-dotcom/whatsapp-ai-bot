require("dotenv").config();

const express = require("express");
const axios = require("axios");
const { GoogleGenAI } = require("@google/genai");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY
});

/* ================================
   HOME
================================ */

app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Sealdah Train Service AI Bot</title>
      </head>
      <body style="font-family:Arial;text-align:center;padding:50px">
        <h1>🚆 Sealdah Train Service AI Bot</h1>
        <p>WhatsApp: Connected</p>
        <p>AI: Gemini</p>
        <p>Railway Data: AI Assistant</p>
        <p>Status: Online</p>
      </body>
    </html>
  `);
});

/* ================================
   HEALTH CHECK
================================ */

app.get("/api", (req, res) => {
  res.json({
    status: "online",
    service: "Sealdah Train Service AI Bot",
    whatsapp: "connected",
    ai: "Gemini"
  });
});

/* ================================
   PRIVACY
================================ */

app.get("/privacy", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Privacy Policy</title>
      </head>
      <body style="font-family:Arial;padding:30px">
        <h1>Privacy Policy</h1>
        <p>
          This WhatsApp AI Bot processes messages only to provide
          automated railway information and assistance.
        </p>
        <p>
          Messages are processed for providing the requested service.
        </p>
      </body>
    </html>
  `);
});

/* ================================
   WHATSAPP WEBHOOK VERIFY
================================ */

app.get("/webhook", (req, res) => {

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token === VERIFY_TOKEN
  ) {
    console.log("WhatsApp Webhook Verified");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

/* ================================
   SEND WHATSAPP MESSAGE
================================ */

async function sendWhatsAppMessage(to, text) {

  try {

    const url =
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

    const response = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "text",
        text: {
          preview_url: false,
          body: text
        }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log(
      "WhatsApp message sent successfully:",
      response.data?.messages?.[0]?.id || "OK"
    );

  } catch (error) {

    console.error(
      "WhatsApp Send Error:",
      error.response?.data || error.message
    );

  }
}

/* ================================
   GEMINI AI
================================ */

async function generateAIReply(userMessage) {

  try {

    const systemInstruction = `
তুমি "Sealdah Train Service" WhatsApp AI Assistant।

তোমার কাজ হলো ভারতীয় রেলের বিশেষ করে Sealdah Division-এর
ট্রেন সংক্রান্ত প্রশ্নে ব্যবহারকারীকে সহজ ভাষায় সাহায্য করা।

নিয়ম:

1. ব্যবহারকারী বাংলায় লিখলে বাংলায় উত্তর দেবে।
2. ব্যবহারকারী ইংরেজিতে লিখলে ইংরেজিতে উত্তর দেবে।
3. উত্তর ছোট এবং WhatsApp-friendly রাখবে।
4. "হ্যালো", "হাই", "Hello" ইত্যাদির সুন্দরভাবে উত্তর দেবে।
5. ব্যবহারকারী ট্রেন সম্পর্কে প্রশ্ন করলে প্রশ্নটি বুঝে প্রয়োজনীয় তথ্য চাইবে।
6. ব্যবহারকারী যদি source ও destination দেয়, সেটি বুঝবে।
7. "আজ", "কাল", "আজকে", "২৯ তারিখ" ইত্যাদি তারিখের কথা বুঝতে চেষ্টা করবে।
8. Train number থাকলে সেটি বুঝবে।
9. Live train location বা live running status সম্পর্কে নিশ্চিত তথ্য না থাকলে
   কখনো বানিয়ে বলবে না।
10. তোমার কাছে সরাসরি live railway database নেই।
11. কোনো নির্দিষ্ট train time নিশ্চিত না হলে সেটিকে নিশ্চিত সময় হিসেবে বলবে না।
12. ব্যবহারকারীকে অপ্রয়োজনীয় প্রশ্ন করবে না।
13. সাধারণ railway information, station, route, train name,
   railway rules এবং travel guidance দিতে পারবে।
14. উত্তর সর্বদা পরিষ্কার এবং সহজ হবে।

উদাহরণ:

User: হ্যালো
Answer: নমস্কার! 🚆 Sealdah Train Service AI Bot-এ আপনাকে স্বাগতম। কী জানতে চান?

User: শান্তিপুর থেকে শিয়ালদা যাওয়ার ট্রেন
Answer: অবশ্যই। শান্তিপুর থেকে শিয়ালদা যাওয়ার ট্রেনের তথ্য দিতে পারি। আপনি আজকের ট্রেন চান, নাকি অন্য কোনো তারিখের?

User: আজকে ২৯ তারিখ বারোটার পর শান্তিপুর থেকে শিয়ালদা
Answer: বুঝেছি। আপনি ২৯ তারিখ দুপুর ১২টার পর শান্তিপুর থেকে শিয়ালদা যাওয়ার ট্রেন জানতে চাইছেন। নির্দিষ্ট live timetable যাচাই ছাড়া আমি সময় বানিয়ে বলব না। চাইলে আমি উপলব্ধ railway data অনুযায়ী খুঁজে দেখার জন্য প্রয়োজনীয় তথ্য নিতে পারি।
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: userMessage,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.2,
        maxOutputTokens: 500
      }
    });

    const reply =
      response.text ||
      "দুঃখিত, এই মুহূর্তে উত্তর তৈরি করা যাচ্ছে না।";

    return reply.trim();

  } catch (error) {

    console.error(
      "Gemini Error:",
      error?.message || error
    );

    return "দুঃখিত, AI service এই মুহূর্তে ব্যস্ত আছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।";

  }
}

/* ================================
   WHATSAPP WEBHOOK
================================ */

app.post("/webhook", async (req, res) => {

  res.sendStatus(200);

  try {

    console.log("========== NEW WHATSAPP WEBHOOK ==========");

    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    const messages = value?.messages;

    if (
      !messages ||
      messages.length === 0
    ) {

      console.log(
        "Webhook received but no incoming message."
      );

      return;
    }

    const message = messages[0];

    const from = message.from;

    console.log(
      "ACTUAL SENDER NUMBER:",
      from
    );

    console.log(
      "BUSINESS PHONE NUMBER ID:",
      value?.metadata?.phone_number_id
    );

    /* ================================
       ONLY TEXT
    ================================ */

    if (message.type !== "text") {

      await sendWhatsAppMessage(
        from,
        "দুঃখিত, আপাতত আমি শুধুমাত্র text message গ্রহণ করতে পারি।"
      );

      return;
    }

    const userMessage =
      message.text?.body?.trim();

    if (!userMessage) {
      return;
    }

    console.log(
      "USER MESSAGE:",
      userMessage
    );

    /* ================================
       GEMINI
    ================================ */

    const reply =
      await generateAIReply(userMessage);

    console.log(
      "FINAL REPLY:",
      reply
    );

    /* ================================
       IMPORTANT:
       REPLY TO SAME NUMBER
    ================================ */

    console.log(
      "Sending WhatsApp reply to:",
      from
    );

    await sendWhatsAppMessage(
      from,
      reply
    );

    console.log(
      "Reply completed for:",
      from
    );

    console.log(
      "=========================================="
    );

  } catch (error) {

    console.error(
      "Webhook Error:",
      error?.response?.data ||
      error?.message ||
      error
    );

  }
});

/* ================================
   START SERVER
================================ */

app.listen(PORT, () => {

  console.log("================================");
  console.log("Sealdah Train Service AI Bot");
  console.log("================================");

  console.log(
    "Server running on port:",
    PORT
  );

  console.log(
    "Health: /api"
  );

  console.log(
    "Webhook: /webhook"
  );

  console.log(
    "Privacy: /privacy"
  );

  console.log(
    "Gemini API Key:",
    GEMINI_API_KEY ? "OK" : "MISSING"
  );

  console.log(
    "WhatsApp Token:",
    WHATSAPP_TOKEN ? "OK" : "MISSING"
  );

  console.log(
    "Phone Number ID:",
    PHONE_NUMBER_ID ? "OK" : "MISSING"
  );

  console.log("================================");

});
