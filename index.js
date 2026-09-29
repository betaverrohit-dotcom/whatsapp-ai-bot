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
      <p>Messages are processed only for providing the requested service.</p>
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

  console.log("Webhook verification request received");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("WhatsApp Webhook Verified Successfully");
    return res.status(200).send(challenge);
  }

  console.log("Webhook verification failed");

  return res.sendStatus(403);
});

/*
==================================================
SEND WHATSAPP MESSAGE
==================================================

IMPORTANT:

The "to" number ALWAYS comes from message.from.

Therefore:

User sends message
        ↓
message.from
        ↓
same WhatsApp number
        ↓
AI reply

The PHONE_NUMBER_ID is only used to identify
the WhatsApp Business number that sends the reply.
==================================================
*/

async function sendWhatsAppMessage(to, text) {
  try {
    if (!to) {
      console.error("ERROR: Recipient number is missing");
      return;
    }

    if (!PHONE_NUMBER_ID) {
      console.error("ERROR: PHONE_NUMBER_ID is missing");
      return;
    }

    const url =
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

    console.log("--------------------------------");
    console.log("SENDING WHATSAPP MESSAGE");
    console.log("To:", to);
    console.log("Using Phone Number ID:", PHONE_NUMBER_ID);
    console.log("--------------------------------");

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

/*
==================================================
AI RESPONSE
==================================================
*/

async function generateAIReply(userMessage) {
  try {
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      temperature: 0.2,
      max_tokens: 700,

      messages: [
        {
          role: "system",
          content: `
তুমি "Sealdah Train Service" WhatsApp AI Assistant।

তোমার কাজ:

1. বাংলা ভাষায় সহজভাবে উত্তর দেবে।
2. ইংরেজিতে প্রশ্ন করলে ইংরেজিতে উত্তর দেবে।
3. Hindi-তে প্রশ্ন করলে Hindi-তে উত্তর দেওয়ার চেষ্টা করবে।
4. Sealdah Division এবং Indian Railways সম্পর্কিত সাধারণ তথ্য দিতে সাহায্য করবে।
5. Train number, train name, source, destination, station এবং timing সম্পর্কিত প্রশ্ন বুঝতে চেষ্টা করবে।
6. Live railway data নিশ্চিতভাবে পাওয়া না গেলে কোনো নির্দিষ্ট live time বা live status বানিয়ে বলবে না।
7. Train-এর live status জানতে হলে train number এবং journey date চাইবে।
8. Source এবং destination দিলে প্রয়োজনীয় তথ্য পরিষ্কারভাবে জানতে চাইবে।
9. উত্তর ছোট, পরিষ্কার এবং WhatsApp-friendly হবে।
10. কোনো তথ্য নিশ্চিত না হলে সেটি অনুমান করে সত্য হিসেবে বলবে না।

গুরুত্বপূর্ণ:

তোমার কাছে সরাসরি Indian Railways-এর live database নেই।
তাই live train location বা exact current running status আছে বলে মিথ্যা দাবি করবে না।

ব্যবহারকারী যদি সাধারণ train information জানতে চায়,
তাহলে যতটা সম্ভব সাহায্য করবে।
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
  WhatsApp-কে দ্রুত 200 response দেওয়া হচ্ছে।
  */

  res.sendStatus(200);

  try {

    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    /*
    Ignore status updates
    */

    if (!value?.messages) {
      console.log("Webhook received without message.");
      return;
    }

    const messages = value.messages;

    for (const message of messages) {

      /*
      ==============================================
      MESSAGE INFORMATION
      ==============================================
      */

      const from = message?.from;

      const incomingPhoneNumberId =
        value?.metadata?.phone_number_id;

      const displayPhoneNumber =
        value?.metadata?.display_phone_number;

      console.log("");
      console.log("================================");
