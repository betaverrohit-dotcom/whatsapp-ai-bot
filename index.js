require("dotenv").config();

const express = require("express");
const axios = require("axios");
const Groq = require("groq-sdk");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const groq = new Groq({
  apiKey: GROQ_API_KEY
});

/*
==================================================
HEALTH CHECK
==================================================
*/

app.get("/api", (req, res) => {
  res.json({
    status: "online",
    service: "Sealdah Train Service AI Bot",
    ai: "Groq",
    model: "openai/gpt-oss-20b"
  });
});

/*
==================================================
PRIVACY PAGE
==================================================
*/

app.get("/privacy", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Privacy Policy</title>
    </head>
    <body>
      <h1>Sealdah Train Service AI Bot</h1>
      <p>This service processes WhatsApp messages to provide automated replies.</p>
    </body>
    </html>
  `);
});

/*
==================================================
WHATSAPP WEBHOOK VERIFICATION
==================================================
*/

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("WhatsApp Webhook Verified");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

/*
==================================================
SEND WHATSAPP MESSAGE
==================================================
*/

async function sendWhatsAppMessage(to, text) {
  try {
    const url =
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

    console.log("Sending reply to:", to);

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
        },
        timeout: 30000
      }
    );

    console.log(
      "WhatsApp reply sent:",
      response.data
    );

  } catch (error) {
    console.error(
      "WhatsApp Send Error:",
      error.response?.data || error.message
    );
  }
}

/*
==================================================
AI RESPONSE
==================================================
*/

async function generateAIReply(userMessage) {
  try {
    const completion =
      await groq.chat.completions.create({

        model: "openai/gpt-oss-20b",

        temperature: 0.2,

        max_tokens: 700,

        messages: [
          {
            role: "system",

            content: `
তুমি "Sealdah Train Service" WhatsApp AI Assistant।

বাংলায় প্রশ্ন করলে সহজ বাংলায় উত্তর দেবে।

ইংরেজিতে প্রশ্ন করলে ইংরেজিতে উত্তর দেবে।

Train number, train name, source, destination,
station এবং timing সম্পর্কিত প্রশ্ন বুঝতে চেষ্টা করবে।

Live railway data তোমার কাছে না থাকলে
live status বা exact current time বানিয়ে বলবে না।

Live status জানতে হলে train number এবং journey date চাইবে।

উত্তর ছোট, পরিষ্কার এবং WhatsApp-friendly হবে।
`
          },

          {
            role: "user",
            content: userMessage
          }
        ]
      });

    return (
      completion.choices?.[0]?.message?.content ||
      "দুঃখিত, এই মুহূর্তে উত্তর তৈরি করা যাচ্ছে না।"
    );

  } catch (error) {

    console.error(
      "Groq Error:",
      error.response?.data || error.message
    );

    return "দুঃখিত, AI service এই মুহূর্তে ব্যস্ত আছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।";
  }
}

/*
==================================================
WHATSAPP INCOMING MESSAGE
==================================================
*/

app.post("/webhook", async (req, res) => {

  /*
  WhatsApp-কে সঙ্গে সঙ্গে 200 response দেওয়া হচ্ছে।
  */

  res.sendStatus(200);

  try {

    const value =
      req.body?.entry?.[0]?.changes?.[0]?.value;

    /*
    Status update বা অন্য event হলে ignore করবে।
    */

    if (!value?.messages?.length) {

      console.log(
        "Webhook event received without a message."
      );

      return;
    }

    /*
    Multiple messages থাকলেও process করবে।
    */

    for (const message of value.messages) {

      /*
      ==========================================
      IMPORTANT
      ==========================================

      message.from = যে WhatsApp number
      থেকে message এসেছে।

      Reply সবসময় এই number-এই যাবে।
      */

      const from = message?.from;

      console.log("");
      console.log("================================");
      console.log("WHATSAPP MESSAGE RECEIVED");
      console.log("================================");

      console.log(
        "From:",
        from
      );

      console.log(
        "Incoming Phone Number ID:",
        value?.metadata?.phone_number_id || "N/A"
      );

      console.log(
        "Business Display Number:",
        value?.metadata?.display_phone_number || "N/A"
      );

      console.log(
        "Configured Phone Number ID:",
        PHONE_NUMBER_ID || "MISSING"
      );

      console.log(
        "Message Type:",
        message?.type
      );

      /*
      ==========================================
      CHECK SENDER
      ==========================================
      */

      if (!from) {

        console.log(
          "Sender number missing."
        );

        continue;
      }

      /*
      ==========================================
      ONLY TEXT MESSAGE
      ==========================================
      */

      if (message.type !== "text") {

        await sendWhatsAppMessage(
          from,
          "দুঃখিত, আপাতত আমি শুধুমাত্র text message গ্রহণ করতে পারি।"
        );

        continue;
      }

      /*
      ==========================================
      GET USER MESSAGE
      ==========================================
      */

      const userMessage =
        message?.text?.body?.trim();

      if (!userMessage) {
        continue;
      }

      console.log(
        "User Message:",
        userMessage
      );

      /*
      ==========================================
      GENERATE AI REPLY
      ==========================================
      */

      const reply =
        await generateAIReply(userMessage);

      console.log(
        "AI Reply:",
        reply
      );

      /*
      ==========================================
      SEND TO SAME USER
      ==========================================
      */

      await sendWhatsAppMessage(
        from,
        reply
      );

      console.log(
        "REPLY SENT TO SAME NUMBER:",
        from
      );

      console.log(
        "================================"
      );
      console.log("");
    }

  } catch (error) {

    console.error(
      "Webhook Error:",
      error.response?.data ||
      error.message ||
      error
    );
  }
});

/*
==================================================
START SERVER
==================================================
*/

app.listen(PORT, () => {

  console.log(
    "================================"
  );

  console.log(
    "Sealdah Train Service AI Bot"
  );

  console.log(
    "================================"
  );

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
    "Groq API Key:",
    GROQ_API_KEY ? "OK" : "MISSING"
  );

  console.log(
    "WhatsApp Token:",
    WHATSAPP_TOKEN ? "OK" : "MISSING"
  );

  console.log(
    "Phone Number ID:",
    PHONE_NUMBER_ID ? "OK" : "MISSING"
  );

  console.log(
    "================================"
  );
});

