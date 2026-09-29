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
========================================
HEALTH CHECK
========================================
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
========================================
PRIVACY PAGE
========================================
*/

app.get("/privacy", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Privacy Policy</title>
      </head>
      <body>
        <h1>WhatsApp AI Bot Privacy Policy</h1>
        <p>This service processes WhatsApp messages to provide automated replies.</p>
        <p>Messages are processed only for providing the requested service.</p>
      </body>
    </html>
  `);
});

/*
========================================
WHATSAPP WEBHOOK VERIFICATION
========================================
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
========================================
SEND WHATSAPP MESSAGE
========================================
*/

async function sendWhatsAppMessage(to, text) {
  try {
    if (!to) {
      console.error("ERROR: Recipient number is missing");
      return;
    }

    const url =
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

    console.log("================================");
    console.log("SENDING WHATSAPP MESSAGE");
    console.log("To:", to);
    console.log("Phone Number ID:", PHONE_NUMBER_ID);
    console.log("================================");

    await axios.post(
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

    console.log("Reply sent successfully to:", to);

  } catch (error) {
    console.error(
      "WhatsApp Send Error:",
      error.response?.data || error.message
    );
  }
}

/*
========================================
AI RESPONSE
========================================
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

1. বাংলা ভাষায় সহজভাবে উত্তর দেওয়া।
2. ইংরেজিতে প্রশ্ন করলে ইংরেজিতে উত্তর দেওয়া।
3. Sealdah Division এবং Indian Railways সম্পর্কিত তথ্য দিতে সাহায্য করা।
4. Train number, train name, source, destination, station এবং timing সম্পর্কিত প্রশ্ন বুঝতে চেষ্টা করা।
5. তথ্য নিশ্চিত না হলে অনুমান করে নির্দিষ্ট সময় বা live status তৈরি করবে না।
6. Live train status-এর জন্য ব্যবহারকারীকে train number এবং journey date দিতে বলবে।
7. Source এবং destination দেওয়া হলে প্রয়োজনীয় তথ্য পরিষ্কারভাবে জানাবে।
8. উত্তর ছোট, পরিষ্কার এবং WhatsApp-friendly হবে।
9. ব্যবহারকারী যদি শুধু একটি destination বা station-এর নাম দেয়, তাহলে তার প্রশ্নটি বুঝে প্রয়োজনীয় clarification চাইবে।
10. Live railway data না থাকলে কখনো মিথ্যা live timing তৈরি করবে না।

গুরুত্বপূর্ণ:
তুমি কোনো live railway database access আছে বলে মিথ্যা দাবি করবে না।
যে তথ্য নিশ্চিত নয় সেটিকে নিশ্চিত তথ্য হিসেবে বলবে না।
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
      error.response?.data || error.message || error
    );

    return "দুঃখিত, AI service এই মুহূর্তে ব্যস্ত আছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।";
  }
}

/*
========================================
WHATSAPP INCOMING MESSAGE
========================================
*/

app.post("/webhook", async (req, res) => {

  /*
  WhatsApp expects a quick 200 response.
  */
  res.sendStatus(200);

  try {

    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    /*
    ========================================
    WHATSAPP DEBUG INFORMATION
    ========================================
    */

    console.log("");
    console.log("========================================");
    console.log("WHATSAPP WEBHOOK RECEIVED");
    console.log("========================================");

    console.log(
      "Business Phone Number ID:",
      value?.metadata?.phone_number_id
    );

    console.log(
      "Business Display Number:",
      value?.metadata?.display_phone_number
    );

    console.log("========================================");

    const messages = value?.messages;

    if (!messages || messages.length === 0) {
      console.log("No incoming message found.");
      return;
    }

    const message = messages[0];

    /*
    ========================================
    USER'S WHATSAPP NUMBER
    ========================================

    message.from = যে WhatsApp number থেকে
    message এসেছে।

    আমরা এই নম্বরেই reply পাঠাব।
    */

    const from = message.from;

    console.log("Incoming message FROM:", from);

    console.log(
      "Incoming message TO:",
      value?.metadata?.display_phone_number
    );

    console.log("Message type:", message.type);

    /*
    ========================================
    ONLY PROCESS TEXT MESSAGES
    ========================================
    */

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
      console.log("Empty message received.");
      return;
    }

    console.log("User message:", userMessage);

    /*
    ========================================
    GENERATE AI REPLY
    ========================================
    */

    const reply =
      await generateAIReply(userMessage);

    console.log("AI reply:", reply);

    /*
    ========================================
    SEND REPLY TO SAME USER
    ========================================

    খুব গুরুত্বপূর্ণ:
    এখানে from ব্যবহার করা হয়েছে।

    অর্থাৎ:

    9477509768 থেকে message এলে
    reply যাবে 9477509768-এ।

    অন্য কোনো fixed/test number ব্যবহার করা হয়নি।
    */

    await sendWhatsAppMessage(
      from,
      reply
    );

  } catch (error) {

    console.error(
      "Webhook Error:",
      error.response?.data || error.message || error
    );

  }
});

/*
========================================
START SERVER
========================================
*/

app.listen(PORT, () => {

  console.log("================================");
  console.log("Sealdah Train Service AI Bot");
  console.log("================================");

  console.log("Server running on port:", PORT);
  console.log("Health: /api");
  console.log("Webhook: /webhook");
  console.log("Privacy: /privacy");

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

  console.log("================================");
});
