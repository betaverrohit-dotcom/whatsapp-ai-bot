```javascript
require("dotenv").config();

const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash";

const GRAPH_API_VERSION =
  process.env.GRAPH_API_VERSION || "v23.0";

/*
====================================================
HEALTH CHECK
====================================================
*/

app.get("/", (req, res) => {
  res.status(200).send("WhatsApp AI bot is running.");
});

app.get("/api", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "WhatsApp AI Bot"
  });
});

/*
====================================================
META WHATSAPP WEBHOOK VERIFICATION
====================================================
*/

app.get("/webhook", (req, res) => {
  console.log("=================================");
  console.log("META WEBHOOK VERIFICATION");
  console.log("=================================");

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("Mode:", mode || "undefined");
  console.log("Token received:", token ? "YES" : "NO");
  console.log("Challenge received:", challenge ? "YES" : "NO");

  if (
    mode === "subscribe" &&
    token &&
    VERIFY_TOKEN &&
    token === VERIFY_TOKEN
  ) {
    console.log("WEBHOOK VERIFIED SUCCESSFULLY");

    return res.status(200).send(challenge);
  }

  console.log("WEBHOOK VERIFICATION FAILED");

  return res.sendStatus(403);
});

/*
====================================================
WHATSAPP INCOMING MESSAGE WEBHOOK
====================================================
*/

app.post("/webhook", (req, res) => {
  console.log("=================================");
  console.log("WHATSAPP WEBHOOK RECEIVED");
  console.log("=================================");

  console.log(JSON.stringify(req.body, null, 2));

  // Tell Meta immediately that webhook was received
  res.sendStatus(200);

  processWhatsAppMessage(req.body).catch((error) => {
    console.error(
      "MESSAGE PROCESSING ERROR:",
      error.response?.data || error.message
    );
  });
});

/*
====================================================
CONVERSATION MEMORY
====================================================
*/

const conversations = {};

/*
====================================================
AI SYSTEM INSTRUCTION
====================================================
*/

const SYSTEM_INSTRUCTION = `
তুমি একজন সহায়ক বাংলা AI assistant।

তুমি WhatsApp-এ ব্যবহারকারীর সঙ্গে স্বাভাবিকভাবে কথা বলবে।

নিয়ম:

1. বাংলায় সহজ, পরিষ্কার এবং সংক্ষিপ্তভাবে উত্তর দেবে।
2. WhatsApp-এর জন্য Markdown table ব্যবহার করবে না।
3. খুব বড় উত্তর দেবে না।
4. ব্যবহারকারী ইংরেজিতে প্রশ্ন করলে ইংরেজিতেও উত্তর দিতে পারো।
5. ট্রেন সম্পর্কিত প্রশ্ন হলে যতটা সম্ভব নির্ভুল তথ্য দেবে।
6. ট্রেনের সময়, স্টেশন, ট্রেন নম্বর বা বর্তমান তথ্য সম্পর্কে নিশ্চিত না হলে অনুমান করবে না।
7. প্রয়োজনে ব্যবহারকারীকে NTES বা Indian Railways-এর official source-এ যাচাই করতে বলবে।
8. ব্যবহারকারী যদি সাধারণ প্রশ্ন করে, স্বাভাবিক AI assistant-এর মতো উত্তর দেবে।
9. নিজের পরিচয় জানতে চাইলে বলবে তুমি একটি WhatsApp AI assistant।
10. উত্তর WhatsApp-এর উপযোগী ছোট ছোট paragraph বা list আকারে দেবে।
`;

/*
====================================================
PROCESS WHATSAPP MESSAGE
====================================================
*/

async function processWhatsAppMessage(body) {
  try {
    const value =
      body?.entry?.[0]?.changes?.[0]?.value;

    const message =
      value?.messages?.[0];

    if (!message) {
      console.log("No user message. Probably status/update event.");
      return;
    }

    const from = message.from;

    console.log("Message sender:", from);

    /*
    -----------------------------------------------
    TEXT MESSAGE
    -----------------------------------------------
    */

    const text = message.text?.body;

    if (!text) {
      await sendWhatsAppMessage(
        from,
        "দুঃখিত, আমি বর্তমানে শুধু text message বুঝতে পারি।"
      );

      return;
    }

    console.log("User message:", text);

    /*
    -----------------------------------------------
    CREATE USER MEMORY
    -----------------------------------------------
    */

    if (!conversations[from]) {
      conversations[from] = [];
    }

    conversations[from].push({
      role: "user",
      parts: [
        {
          text: text
        }
      ]
    });

    /*
    -----------------------------------------------
    GEMINI
    -----------------------------------------------
    */

    const aiReply =
      await callGemini(conversations[from]);

    /*
    -----------------------------------------------
    SAVE AI RESPONSE
    -----------------------------------------------
    */

    conversations[from].push({
      role: "model",
      parts: [
        {
          text: aiReply
        }
      ]
    });

    /*
    -----------------------------------------------
    LIMIT MEMORY
    -----------------------------------------------
    */

    if (conversations[from].length > 20) {
      conversations[from] =
        conversations[from].slice(-20);
    }

    console.log("AI reply:", aiReply);

    /*
    -----------------------------------------------
    SEND WHATSAPP REPLY
    -----------------------------------------------
    */

    await sendWhatsAppMessage(
      from,
      aiReply
    );

    console.log("WhatsApp reply sent successfully.");
  } catch (error) {
    console.error(
      "processWhatsAppMessage ERROR:",
      error.response?.data || error.message
    );
  }
}

/*
====================================================
GOOGLE GEMINI
====================================================
*/

async function callGemini(history) {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is missing."
    );
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateC_
```
