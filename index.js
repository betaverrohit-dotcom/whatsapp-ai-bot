const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

// ========================================
// HOME
// ========================================

app.get("/", (req, res) => {
res.status(200).send("Sealdah Train Service WhatsApp AI Bot is running.");
});

// ========================================
// HEALTH CHECK
// ========================================

app.get("/api", (req, res) => {
res.status(200).json({
status: "ok",
whatsapp: "connected",
ai: "Groq",
model: GROQ_MODEL
});
});

// ========================================
// PRIVACY POLICY
// ========================================

app.get("/privacy", (req, res) => {
res.type("text/plain").send(
`Privacy Policy

This WhatsApp AI Bot receives messages sent by users through WhatsApp.

Messages may be processed by Groq AI to generate responses.

We do not sell personal information.

Users can contact the bot owner regarding deletion of information.`
);
});

// ========================================
// WHATSAPP WEBHOOK VERIFICATION
// ========================================

app.get("/webhook", (req, res) => {

console.log("================================");
console.log("META WEBHOOK VERIFICATION");
console.log("================================");

const mode = req.query["hub.mode"];
const token = req.query["hub.verify_token"];
const challenge = req.query["hub.challenge"];

if (mode === "subscribe" && token === VERIFY_TOKEN) {

```
console.log("Webhook verification successful.");

return res.status(200).send(challenge);
```

}

console.log("Webhook verification failed.");

return res.sendStatus(403);
});

// ========================================
// WHATSAPP INCOMING MESSAGE
// ========================================

app.post("/webhook", async (req, res) => {

console.log("================================");
console.log("WHATSAPP WEBHOOK RECEIVED");
console.log("================================");

console.log(JSON.stringify(req.body, null, 2));

// Respond to Meta immediately
res.sendStatus(200);

try {

```
const value =
  req.body?.entry?.[0]?.changes?.[0]?.value;

if (!value) {
  console.log("No webhook value.");
  return;
}

const message = value.messages?.[0];

// Ignore status updates
if (!message) {
  console.log("No user message. Probably a status update.");
  return;
}

// Only text messages
if (message.type !== "text") {

  console.log(
    "Message type not supported:",
    message.type
  );

  return;
}

/*
  IMPORTANT

  message.from = যে WhatsApp number
  থেকে user message করেছে।

  তাই reply একই number-এ যাবে।
*/

const from = message.from;

const userMessage =
  message.text?.body?.trim();

if (!from) {
  console.log("Sender number not found.");
  return;
}

if (!userMessage) {
  console.log("Empty message.");
  return;
}

console.log("User:", from);
console.log("Message:", userMessage);

// ========================================
// GET AI RESPONSE
// ========================================

const reply = await getAIReply(userMessage);

console.log("AI Reply:", reply);

// ========================================
// SEND REPLY TO SAME NUMBER
// ========================================

await sendWhatsAppMessage(
  from,
  reply
);
```

} catch (error) {

```
console.error(
  "Webhook processing error:",
  error.response?.data || error.message
);
```

}

});

// ========================================
// GROQ AI
// ========================================

async function getAIReply(userMessage) {

if (!GROQ_API_KEY) {

```
console.error(
  "GROQ_API_KEY is missing."
);

return "দুঃখিত, AI service এখন configure করা হয়নি।";
```

}

const systemInstruction = `
তুমি "Sealdah Train Service" WhatsApp AI Assistant।

তোমার প্রধান কাজ হলো ব্যবহারকারীদের Eastern Railway এবং Sealdah Division-এর ট্রেন সংক্রান্ত তথ্য বুঝতে সাহায্য করা।

নিয়ম:

1. ব্যবহারকারী বাংলায় প্রশ্ন করলে বাংলায় উত্তর দেবে।
2. ব্যবহারকারী ইংরেজিতে প্রশ্ন করলে ইংরেজিতে উত্তর দেবে।
3. উত্তর ছোট, সহজ এবং পরিষ্কার রাখবে।
4. ব্যবহারকারী ট্রেনের নাম, ট্রেন নম্বর, স্টেশন, সময়সূচি, route অথবা train running status সম্পর্কে প্রশ্ন করতে পারে।
5. তোমার কাছে live railway data না থাকলে কখনো নিজের থেকে সময় বা running status বানিয়ে বলবে না।
6. নিশ্চিত তথ্য না থাকলে পরিষ্কারভাবে জানাবে যে live railway data বর্তমানে পাওয়া যাচ্ছে না।
7. সাধারণ প্রশ্ন করলে সাধারণভাবেই সাহায্য করবে।
8. WhatsApp-এর জন্য Markdown table ব্যবহার করবে না।
9. অপ্রয়োজনীয় বড় উত্তর দেবে না।
   `;

const url =
"https://api.groq.com/openai/v1/chat/completions";

try {

```
const response = await axios.post(

  url,

  {
    model: GROQ_MODEL,

    messages: [

      {
        role: "system",
        content: sys
```
