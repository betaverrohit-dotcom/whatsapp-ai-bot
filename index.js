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

/* ==========================================
   GEMINI
========================================== */

let ai = null;

if (GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY
  });
}

/* ==========================================
   HOME
========================================== */

app.get("/", (req, res) => {
  res.status(200).send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>Sealdah Train Service AI Bot</title>

<style>

*{
  box-sizing:border-box;
}

body{
  margin:0;
  font-family:Arial,Helvetica,sans-serif;
  background:
    radial-gradient(circle at top,#172554 0%,#020617 45%,#000 100%);
  color:white;
  min-height:100vh;
}

.container{
  max-width:1100px;
  margin:auto;
  padding:70px 25px;
}

.hero{
  text-align:center;
  padding:50px 20px;
}

.logo{
  width:100px;
  height:100px;
  margin:auto;
  border-radius:30px;
  background:linear-gradient(135deg,#2563eb,#06b6d4);
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:50px;
  box-shadow:0 20px 60px rgba(37,99,235,.35);
}

h1{
  font-size:clamp(35px,6vw,70px);
  margin:30px 0 15px;
}

.subtitle{
  font-size:20px;
  color:#cbd5e1;
}

.status{
  display:inline-block;
  margin-top:25px;
  padding:12px 20px;
  border-radius:50px;
  background:rgba(34,197,94,.12);
  border:1px solid rgba(34,197,94,.35);
  color:#86efac;
}

.cards{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
  gap:20px;
  margin-top:50px;
}

.card{
  padding:28px;
  border-radius:22px;
  background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.1);
  backdrop-filter:blur(15px);
}

.card h3{
  margin-top:0;
}

.card p{
  color:#cbd5e1;
}

.footer{
  text-align:center;
  margin-top:60px;
  color:#94a3b8;
}

</style>
</head>

<body>

<div class="container">

<div class="hero">

<div class="logo">🚆</div>

<h1>Sealdah Train Service AI Bot</h1>

<div class="subtitle">
Smart Railway Assistance through WhatsApp
</div>

<div class="status">
● System Online
</div>

</div>

<div class="cards">

<div class="card">
<h3>📱 WhatsApp</h3>
<p>Connected and ready to receive messages.</p>
</div>

<div class="card">
<h3>🤖 AI Assistant</h3>
<p>Powered by Google Gemini AI.</p>
</div>

<div class="card">
<h3>🚆 Railway Assistance</h3>
<p>Ask railway and train-related questions in simple language.</p>
</div>

<div class="card">
<h3>⚡ Fast Response</h3>
<p>Designed for quick WhatsApp-based assistance.</p>
</div>

</div>

<div class="footer">
<p>Created by SumanMusix</p>
<p>WhatsApp: +91 70030 89284</p>
</div>

</div>

</body>
</html>
`);
});

/* ==========================================
   HEALTH CHECK
========================================== */

app.get("/api", (req, res) => {

  res.status(200).json({
    status: "online",
    service: "Sealdah Train Service AI Bot",
    whatsapp: WHATSAPP_TOKEN ? "configured" : "missing",
    phone_number_id: PHONE_NUMBER_ID ? "configured" : "missing",
    gemini: GEMINI_API_KEY ? "configured" : "missing",
    server: "running",
    timestamp: new Date().toISOString()
  });

});

/* ==========================================
   PRIVACY
========================================== */

app.get("/privacy", (req, res) => {

  res.status(200).send(`
<!DOCTYPE html>
<html>
<head>
<title>Privacy Policy</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body{
font-family:Arial;
max-width:900px;
margin:auto;
padding:40px 20px;
line-height:1.7;
}
</style>
</head>

<body>

<h1>Privacy Policy</h1>

<p>
Sealdah Train Service AI Bot provides automated railway information
and assistance through WhatsApp.
</p>

<h2>Information Processing</h2>

<p>
Messages sent to the bot may be processed by automated AI services
to generate responses.
</p>

<h2>Purpose</h2>

<p>
Information is processed only for providing the requested railway
assistance and related information.
</p>

<h2>Contact</h2>

<p>
WhatsApp: +91 70030 89284
</p>

</body>
</html>
`);

});

/* ==========================================
   WHATSAPP WEBHOOK VERIFICATION
========================================== */

app.get("/webhook", (req, res) => {

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("Webhook verification request received.");

  if (
    mode === "subscribe" &&
    token &&
    VERIFY_TOKEN &&
    token === VERIFY_TOKEN
  ) {

    console.log("WhatsApp Webhook Verified.");

    return res.status(200).send(challenge);
  }

  console.log("Webhook verification failed.");

  return res.sendStatus(403);

});

/* ==========================================
   SEND WHATSAPP MESSAGE
========================================== */

async function sendWhatsAppMessage(to, text) {

  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {

    console.error(
      "WhatsApp configuration missing."
    );

    return false;
  }

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
          body: String(text).substring(0, 4096)
        }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    console.log(
      "WhatsApp message sent successfully:",
      response.data?.messages?.[0]?.id || "OK"
    );

    return true;

  } catch (error) {

    console.error(
      "WhatsApp Send Error:",
      error.response?.data || error.message
    );

    return false;
  }

}

/* ==========================================
   GEMINI AI
========================================== */

async function generateAIReply(userMessage) {

  const message = String(userMessage || "").trim();

  if (!message) {
    return "নমস্কার! 🚆 কী জানতে চান?";
  }

  /* ------------------------------------------
     BASIC GREETINGS
  ------------------------------------------ */

  const lower = message.toLowerCase();

  if (
    lower === "hi" ||
    lower === "hello" ||
    lower === "hey" ||
    message === "হাই" ||
    message === "হ্যালো" ||
    message === "নমস্কার"
  ) {

    return `নমস্কার! 🚆

Sealdah Train Service AI Bot-এ আপনাকে স্বাগতম।

আপনি জানতে পারেন:
🚆 ট্রেনের তথ্য
📍 স্টেশন সম্পর্কিত তথ্য
🛤️ রুট
⏰ ট্রেনের সময়
🔢 ট্রেন নম্বর
📋 সাধারণ রেলওয়ে তথ্য

আপনার প্রশ্নটি লিখুন।`;

  }

  /* ------------------------------------------
     GEMINI NOT CONFIGURED
  ------------------------------------------ */

  if (!ai) {

    return `নমস্কার! 🚆

AI service বর্তমানে configure করা নেই।

দয়া করে কিছুক্ষণ পরে আবার চেষ্টা করুন।`;

  }

  /* ------------------------------------------
     SYSTEM INSTRUCTION
  ------------------------------------------ */

  const systemInstruction = `
তুমি "Sealdah Train Service AI Bot"।

তুমি WhatsApp-এর মাধ্যমে ভারতীয় রেল এবং বিশেষ করে
Sealdah Division-এর ট্রেন সম্পর্কিত প্রশ্নে সাহায্য করবে।

খুব গুরুত্বপূর্ণ নিয়ম:

1. ব্যবহারকারী বাংলায় লিখলে বাংলায় উত্তর দেবে।
2. ব্যবহারকারী ইংরেজিতে লিখলে ইংরেজিতে উত্তর দেবে।
3. উত্তর ছোট, পরিষ্কার এবং WhatsApp-friendly হবে।
4. কখনো বানানো train timing বা live location বলবে না।
5. তোমার কাছে সরাসরি live railway database না থাকলে সেটা পরিষ্কারভাবে বলবে।
6. কোনো তথ্য নিশ্চিত না হলে "সম্ভবত", "যাচাই করা প্রয়োজন" ইত্যাদি ব্যবহার করবে।
7. ব্যবহারকারী source এবং destination দিলে সেটা বুঝবে।
8. "আজ", "কাল", "আজকে", "আগামীকাল" ইত্যাদি বুঝবে।
9. Train number থাকলে সেটা বুঝবে।
10. ব্যবহারকারী শুধু সাধারণ প্রশ্ন করলে সহজভাবে উত্তর দেবে।
11. অপ্রয়োজনীয় প্রশ্ন করবে না।
12. ব্যবহারকারী যদি শুধু greeting করে, friendly greeting দেবে।
13. উত্তর সাধারণত 2-8 লাইনের মধ্যে রাখবে।
14. Railway safety বা official rule সম্পর্কে নিশ্চিত না হলে বানিয়ে বলবে না।
15. Live train running status-এর ক্ষেত্রে live data না থাকলে নিশ্চিত দাবি করবে না।
16. কোনো নির্দিষ্ট timetable তোমার কাছে যাচাই করা না থাকলে exact time হিসেবে উপস্থাপন করবে না।
17. ব্যবহারকারী যদি ট্রেনের সময় জানতে চায় এবং live railway data unavailable থাকে,
   তাহলে সেটা স্পষ্টভাবে জানাবে এবং প্রয়োজন হলে NTES/official railway source
   যাচাই করার পরামর্শ দেবে।
18. নিজের পরিচয় হিসেবে "Sealdah Train Service AI Bot" ব্যবহার করবে।

উত্তরের ভাষা হবে স্বাভাবিক, ভদ্র এবং সহজ।
`;

  try {

    console.log("Sending request to Gemini...");

    const response = await ai.models.generateContent({

      model: "gemini-3.5-flash-lite",

      contents: message,

      config: {
        systemInstruction: systemInstruction,
        temperature: 0.2,
        maxOutputTokens: 500
      }

    });

    const reply =
      response?.text ||
      "দুঃখিত, এই মুহূর্তে উত্তর তৈরি করা যাচ্ছে না।";

    console.log("Gemini response received.");

    return String(reply).trim();

  } catch (error) {

    console.error(
      "Gemini Error:",
      error?.response?.data ||
      error?.message ||
      error
    );

    return `দুঃখিত। এই মুহূর্তে AI service থেকে উত্তর পাওয়া যাচ্ছে না।

কিছুক্ষণ পরে আবার চেষ্টা করুন। 🚆`;

  }

}

/* ==========================================
   WHATSAPP WEBHOOK
========================================== */

app.post("/webhook", async (req, res) => {

  /* IMPORTANT:
     Always acknowledge Meta immediately.
  */

  res.sendStatus(200);

  try {

    console.log("");
    console.log("========== NEW WHATSAPP WEBHOOK ==========");

    const entry =
      req.body?.entry?.[0];

    const change =
      entry?.changes?.[0];

    const value =
      change?.value;

    const messages =
      value?.messages;

    /* --------------------------------------
       STATUS WEBHOOK
    -------------------------------------- */

    if (
      !messages ||
      !Array.isArray(messages) ||
      messages.length === 0
    ) {

      console.log(
        "Webhook received but no incoming message."
      );

      return;
    }

    const message =
      messages[0];

    const from =
      message?.from;

    if (!from) {

      console.log(
        "No sender number found."
      );

      return;
    }

    console.log(
      "ACTUAL SENDER NUMBER:",
      from
    );

    console.log(
      "BUSINESS PHONE NUMBER ID:",
      value?.metadata?.phone_number_id
    );

    /* --------------------------------------
       TEXT ONLY
    -------------------------------------- */

    if (message.type !== "text") {

      await sendWhatsAppMessage(
        from,
        "দুঃখিত। আপাতত আমি শুধুমাত্র text message গ্রহণ করতে পারি। 🚆"
      );

      return;
    }

    const userMessage =
      message?.text?.body?.trim();

    if (!userMessage) {
      return;
    }

    console.log(
      "USER MESSAGE:",
      userMessage
    );

    /* --------------------------------------
       AI RESPONSE
    -------------------------------------- */

    const reply =
      await generateAIReply(userMessage);

    console.log(
      "FINAL REPLY:",
      reply
    );

    /* --------------------------------------
       SEND REPLY
    -------------------------------------- */

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

/* ==========================================
   ERROR HANDLERS
========================================== */

process.on("uncaughtException", (error) => {

  console.error(
    "UNCAUGHT EXCEPTION:",
    error
  );

});

process.on("unhandledRejection", (error) => {

  console.error(
    "UNHANDLED REJECTION:",
    error
  );

});

/* ==========================================
   START SERVER
========================================== */

const server = app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log("");
    console.log("================================");
    console.log("🚆 SEALDAH TRAIN SERVICE AI BOT");
    console.log("================================");

    console.log(
      "Server running on port:",
      PORT
    );

    console.log(
      "Health:",
      "/api"
    );

    console.log(
      "Webhook:",
      "/webhook"
    );

    console.log(
      "Privacy:",
      "/privacy"
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
    console.log("✅ SERVER STARTED SUCCESSFULLY");
    console.log("================================");

  }
);

/* ==========================================
   SERVER ERROR
========================================== */

server.on("error", (error) => {

  console.error(
    "SERVER ERROR:",
    error
  );

});
