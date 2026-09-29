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

const ai = GEMINI_API_KEY
? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
: null;

# /*

# MODELS

*/

const GEMINI_MODELS = [
"gemini-3.5-flash-lite",
"gemini-3.8-flash",
"gemini-2.5-flash-lite"
];

# /*

# HOME

*/

app.get("/", (req, res) => {
res.send(` <!DOCTYPE html> <html> <head> <title>Sealdah Train Service AI Bot</title> <meta name="viewport" content="width=device-width, initial-scale=1"> <style>
body {
font-family: Arial, sans-serif;
background: #f5f7fa;
padding: 30px;
text-align: center;
}
.box {
max-width: 600px;
margin: auto;
background: white;
padding: 30px;
border-radius: 15px;
box-shadow: 0 4px 20px rgba(0,0,0,.08);
}
h1 {
color: #222;
}
.ok {
color: green;
font-weight: bold;
} </style> </head> <body> <div class="box"> <h1>🚆 Sealdah Train Service AI Bot</h1>

```
    <p class="ok">Bot is running successfully.</p>

    <p>📱 WhatsApp: Connected</p>
    <p>🤖 AI: Gemini</p>
    <p>🚉 Railway Data: RailRadar</p>
    <p>🌐 Status: Online</p>
  </div>
</body>
</html>
```

`);
});

# /*

# API HEALTH CHECK

*/

app.get("/api", (req, res) => {
res.json({
status: "online",
service: "Sealdah Train Service AI Bot",
whatsapp: WHATSAPP_TOKEN ? "configured" : "missing",
phoneNumberId: PHONE_NUMBER_ID ? "configured" : "missing",
gemini: GEMINI_API_KEY ? "configured" : "missing"
});
});

# /*

# PRIVACY

*/

app.get("/privacy", (req, res) => {
res.send(`     <html>       <head>         <title>Privacy Policy</title>       </head>       <body>         <h1>Privacy Policy</h1>         <p>
          Sealdah Train Service AI Bot processes WhatsApp
          messages to provide automated railway assistance.         </p>         <p>
          Messages are processed for providing the requested service.         </p>       </body>     </html>
  `);
});

# /*

# WHATSAPP WEBHOOK VERIFICATION

*/

app.get("/webhook", (req, res) => {

const mode = req.query["hub.mode"];
const token = req.query["hub.verify_token"];
const challenge = req.query["hub.challenge"];

if (
mode === "subscribe" &&
token === VERIFY_TOKEN
) {

```
console.log("WhatsApp Webhook Verified");

return res
  .status(200)
  .send(challenge);
```

}

return res.sendStatus(403);
});

# /*

# SEND WHATSAPP MESSAGE

*/

async function sendWhatsAppMessage(to, text) {

try {

```
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
```

} catch (error) {

```
console.error(
  "WhatsApp Send Error:",
  error.response?.data || error.message
);
```

}
}

# /*

# DETECT TRAIN INFORMATION

*/

function detectTrainNumber(text) {

const match = text.match(/\b\d{4,6}\b/);

return match ? match[0] : null;
}

# /*

# DETECT TIME

*/

function detectAfterHour(text) {

const patterns = [
/(\d{1,2})\s*টার\s*পর/i,
/(\d{1,2})\s*টা\s*বাজে\s*র\s*পর/i,
/after\s*(\d{1,2})/i
];

for (const pattern of patterns) {

```
const match = text.match(pattern);

if (match) {
  return Number(match[1]);
}
```

}

return null;
}

# /*

# DETECT STATIONS

*/

function detectStations(text) {

const normalized = text
.replace(/→/g, " থেকে ")
.replace(/-+/g, " থেকে ");

let from = null;
let to = null;

const match1 = normalized.match(
/(.+?)\s+থেকে\s+(.+?)(?:\s+যাওয়ার|\s+যাওয়ার|\s+যেতে|\s+ট্রেন|\s*$)/i
);

if (match1) {

```
from = match1[1].trim();
to = match1[2].trim();
```

}

const knownStations = [
"শান্তিপুর",
"শিয়ালদা",
"শিয়ালদহ",
"সিয়ালদহ",
"কল্যাণী",
"রানাঘাট",
"নৈহাটি",
"কৃষ্ণনগর",
"বনগাঁ",
"বারাসাত",
"দমদম",
"নবদ্বীপ",
"কাটোয়া",
"কলকাতা"
];

const found = [];

for (const station of knownStations) {

```
if (text.includes(station)) {
  found.push(station);
}
```

}

if (!from && found.length >= 2) {
from = found[0];
to = found[1];
}

return {
from,
to
};
}

# /*

# DETECT DATE

*/

function detectDate(text) {

const now = new Date();

const lower = text.toLowerCase();

if (
lower.includes("আজ") ||
lower.includes("today")
) {

```
return now.toISOString().slice(0, 10);
```

}

if (
lower.includes("কাল") ||
lower.includes("tomorrow")
) {

```
const tomorrow =
  new Date(now.getTime() + 86400000);

return tomorrow
  .toISOString()
  .slice(0, 10);
```

}

const match = text.match(
/(?:তারিখ\s*)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?/
);

if (match) {

```
const day = match[1];
const month = match[2];
const year = match[3] || now.getFullYear();

return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
```

}

const dayMatch =
text.match(/(\d{1,2})\s*(?:তারিখ|তারিখে)/);

if (dayMatch) {

```
const day = Number(dayMatch[1]);

return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
```

}

return now.toISOString().slice(0, 10);
}

# /*

# TRAIN QUERY DETECTION

*/

function isTrainQuestion(text) {

const keywords = [

```
"ট্রেন",
"ট্রেনের",
"ট্রেনটা",
"ট্রেন কখন",
"কখন আছে",
"কখন যাবে",
"কখন আসবে",
"টাইম",
"সময়",
"সময়",
"সময়সূচি",
"সময়সূচি",
"লাইভ",
"কোথায়",
"কোথায়",
"স্টেশন",
"train",
"railway",
"live",
"schedule",
"time"
```

];

const lower = text.toLowerCase();

return keywords.some(
keyword => lower.includes(keyword.toLowerCase())
);
}

# /*

# GEMINI AI

*/

async function generateGeminiReply(userMessage, railwayData = null) {

if (!ai) {

```
return `
```

দুঃখিত, AI service বর্তমানে configured নেই।

অনুগ্রহ করে কিছুক্ষণ পরে আবার চেষ্টা করুন।
`.trim();
}

const railwayText = railwayData
? JSON.stringify(railwayData, null, 2)
: "No railway API data available.";

const prompt = `
তুমি "Sealdah Train Service" WhatsApp AI Assistant।

ব্যবহারকারী:
${userMessage}

Railway data:
${railwayText}

নিয়ম:

1. সহজ বাংলা ভাষায় উত্তর দাও।
2. ব্যবহারকারী ইংরেজিতে প্রশ্ন করলে ইংরেজিতে উত্তর দাও।
3. WhatsApp-এর জন্য ছোট এবং পরিষ্কার উত্তর দাও।
4. Railway data দেওয়া থাকলে শুধু সেই data-এর ভিত্তিতে উত্তর দাও।
5. Railway data না থাকলে live train timing বানিয়ে বলবে না।
6. কোনো train number, timing বা live location অনুমান করবে না।
7. Source, destination, date এবং time filter থাকলে সেগুলো পরিষ্কারভাবে উল্লেখ করো।
8. সাধারণ greeting হলে স্বাভাবিকভাবে উত্তর দাও।
9. উত্তর যেন সরাসরি ব্যবহারকারীর প্রশ্নের উত্তর হয়।
10. "আমি live railway database access করছি" এমন দাবি করবে না যদি data দেওয়া না থাকে।

শুধু final WhatsApp reply দাও।
`;

# /*

# MODEL FALLBACK

*/

for (const model of GEMINI_MODELS) {

```
try {

  console.log(
    "Trying Gemini model:",
    model
  );

  const response =
    await ai.models.generateContent({

      model: model,

      contents: prompt,

      config: {

        temperature: 0.2,

        maxOutputTokens: 700,

        systemInstruction:
          "You are a helpful railway WhatsApp assistant. Never invent live railway information."

      }

    });

  const text =
    response?.text?.trim();

  if (text) {

    console.log(
      "Gemini success:",
      model
    );

    return text;
  }

} catch (error) {

  console.error(
    `Gemini model failed: ${model}`,
    error?.message || error
  );

}
```

}

# /*

# FINAL FALLBACK

*/

if (railwayData) {

```
return `
```

🚆 ট্রেনের তথ্য পাওয়া গেছে।

তবে AI response service এই মুহূর্তে unavailable।

অনুগ্রহ করে কিছুক্ষণ পরে আবার চেষ্টা করুন।
`.trim();
}

return `
হ্যালো! 👋

আমি Sealdah Train Service AI Assistant।

আপনি ট্রেনের নাম/নম্বর, কোথা থেকে কোথায় যাবেন এবং প্রয়োজনে তারিখ বা সময় লিখে প্রশ্ন করতে পারেন।

উদাহরণ:
"শান্তিপুর থেকে শিয়ালদা আজ দুপুর ১২টার পর কোন ট্রেন আছে?"
`.trim();
}

# /*

# RAILRADAR PLACEHOLDER

IMPORTANT:
এখানে আমরা কোনো fake API URL ব্যবহার করছি না।

RailRadar-এর আসল API endpoint এবং authentication
পেলে এই function-এর ভিতরে সেটি বসানো হবে।

==================================================
*/

async function getRailwayData({
from,
to,
date,
afterHour,
trainNumber,
userMessage
}) {

/*
এখনো Railway API endpoint configured না থাকলে
null return করবে।

ফলে AI কখনো fake train timing বানাবে না।
*/

console.log("Railway query:", {
from,
to,
date,
afterHour,
trainNumber
});

return null;
}

# /*

# PROCESS MESSAGE

*/

async function processUserMessage(userMessage) {

const stations =
detectStations(userMessage);

const date =
detectDate(userMessage);

const afterHour =
detectAfterHour(userMessage);

const trainNumber =
detectTrainNumber(userMessage);

console.log(
"Detected stations:",
stations
);

console.log(
"Detected date:",
date
);

console.log(
"Detected after hour:",
afterHour
);

console.log(
"Detected train number:",
trainNumber
);

/*
Railway query
*/

let railwayData = null;

if (
isTrainQuestion(userMessage) ||
trainNumber ||
stations.from ||
stations.to
) {

```
railwayData =
  await getRailwayData({

    from: stations.from,

    to: stations.to,

    date,

    afterHour,

    trainNumber,

    userMessage

  });
```

}

/*
Gemini response
*/

const reply =
await generateGeminiReply(
userMessage,
railwayData
);

return reply;
}

# /*

# WHATSAPP WEBHOOK

*/

app.post("/webhook", async (req, res) => {

/*
WhatsApp expects quick response.
*/

res.sendStatus(200);

try {

```
console.log(
  "========== NEW WHATSAPP WEBHOOK =========="
);

const entry =
  req.body?.entry?.[0];

const change =
  entry?.changes?.[0];

const value =
  change?.value;

const messages =
  value?.messages;

/*
Status webhook
*/

if (
  !messages ||
  messages.length === 0
) {

  console.log(
    "Webhook received but no incoming message."
  );

  return;
}

const message =
  messages[0];

/*
==========================================
ACTUAL SENDER
==========================================
*/

const from =
  message.from;

console.log(
  "ACTUAL SENDER NUMBER:",
  from
);

console.log(
  "BUSINESS PHONE NUMBER ID:",
  value?.metadata?.phone_number_id
);

/*
==========================================
ONLY TEXT
==========================================
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
  return;
}

console.log(
  "USER MESSAGE:",
  userMessage
);

/*
==========================================
PROCESS
==========================================
*/

const reply =
  await processUserMessage(
    userMessage
  );

console.log(
  "FINAL REPLY:",
  reply
);

/*
==========================================
SAME NUMBER REPLY
==========================================
*/

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
```

} catch (error) {

```
console.error(
  "Webhook processing error:",
  error?.response?.data ||
  error?.message ||
  error
);
```

}
});

# /*

# START SERVER

*/

app.listen(PORT, () => {

console.log(
"=========================================="
);

console.log(
"🚆 SEALDAH TRAIN SERVICE AI BOT"
);

console.log(
"=========================================="
);

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
GEMINI_API_KEY
? "OK"
: "MISSING"
);

console.log(
"WhatsApp Token:",
WHATSAPP_TOKEN
? "OK"
: "MISSING"
);

console.log(
"Phone Number ID:",
PHONE_NUMBER_ID
? "OK"
: "MISSING"
);

console.log(
"=========================================="
);

});
