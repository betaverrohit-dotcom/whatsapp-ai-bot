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
const RAILRADAR_API_KEY = process.env.RAILRADAR_API_KEY;

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : null;

/* =========================================================
   BASIC HELPERS
========================================================= */

function todayIST() {
  const now = new Date();

  const ist = new Date(
    now.toLocaleString("en-US", {
      timeZone: "Asia/Kolkata"
    })
  );

  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, "0");
  const d = String(ist.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function formatDateForUser(dateString) {
  const parts = dateString.split("-");

  if (parts.length !== 3) return dateString;

  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

/* =========================================================
   STATION ALIASES
========================================================= */

const STATIONS = {
  "শান্তিপুর": "STB",
  "শান্তিপুর জংশন": "STB",
  "santipur": "STB",
  "santipur junction": "STB",
  "STB": "STB",

  "শিয়ালদা": "SDAH",
  "শিয়ালদা": "SDAH",
  "sealdah": "SDAH",
  "SDAH": "SDAH",

  "কলকাতা": "KOAA",
  "কলকাতা স্টেশন": "KOAA",
  "kolkata": "KOAA",

  "বারাসাত": "BT",
  "barasat": "BT",
  "BT": "BT",

  "রানাঘাট": "RHA",
  "ranaghat": "RHA",
  "RHA": "RHA"
};

/* =========================================================
   DETECT STATIONS
========================================================= */

function detectStations(text) {
  const lower = text.toLowerCase();

  let from = null;
  let to = null;

  const patterns = [
    {
      regex: /(শান্তিপুর|santipur).*?(শিয়ালদা|শিয়ালদা|sealdah)/i,
      from: "STB",
      to: "SDAH"
    },
    {
      regex: /(শিয়ালদা|শিয়ালদা|sealdah).*?(শান্তিপুর|santipur)/i,
      from: "SDAH",
      to: "STB"
    }
  ];

  for (const p of patterns) {
    if (p.regex.test(text)) {
      from = p.from;
      to = p.to;
      break;
    }
  }

  if (!from) {
    for (const [name, code] of Object.entries(STATIONS)) {
      if (lower.includes(name.toLowerCase())) {
        from = code;
        break;
      }
    }
  }

  if (!to) {
    const names = Object.keys(STATIONS);

    for (const name of names) {
      if (
        lower.includes(name.toLowerCase()) &&
        STATIONS[name] !== from
      ) {
        to = STATIONS[name];
        break;
      }
    }
  }

  return { from, to };
}

/* =========================================================
   DETECT DATE
========================================================= */

function detectDate(text) {
  const today = todayIST();

  if (/আজ|আজকে|today/i.test(text)) {
    return today;
  }

  if (/কাল|আগামীকাল|tomorrow/i.test(text)) {
    const d = new Date(`${today}T00:00:00+05:30`);
    d.setDate(d.getDate() + 1);

    return d.toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata"
    });
  }

  const match = text.match(
    /(?:^|\D)(\d{1,2})(?:\s*(?:তারিখ|তম))?(?:\D|$)/
  );

  if (match) {
    const day = Number(match[1]);

    if (day >= 1 && day <= 31) {
      const year = Number(today.slice(0, 4));
      const month = Number(today.slice(5, 7));

      const candidate = new Date(
        year,
        month - 1,
        day
      );

      return `${candidate.getFullYear()}-${String(
        candidate.getMonth() + 1
      ).padStart(2, "0")}-${String(
        candidate.getDate()
      ).padStart(2, "0")}`;
    }
  }

  return today;
}

/* =========================================================
   DETECT AFTER HOUR
========================================================= */

function detectAfterHour(text) {
  const match = text.match(
    /(?:বারোটার|বারোটা|১২টা|১২টার|12টা|12টার)\s*(?:পর|পরে|after)?/i
  );

  if (match) {
    return 12;
  }

  const numberMatch = text.match(
    /(\d{1,2})\s*(?:টা|টার)\s*(?:পর|পরে)/i
  );

  if (numberMatch) {
    return Number(numberMatch[1]);
  }

  const englishMatch = text.match(
    /after\s+(\d{1,2})/i
  );

  if (englishMatch) {
    return Number(englishMatch[1]);
  }

  return null;
}

/* =========================================================
   DETECT TRAIN NUMBER
========================================================= */

function detectTrainNumber(text) {
  const match = text.match(/\b\d{5}\b/);

  return match ? match[0] : null;
}

/* =========================================================
   RAILRADAR REQUEST
========================================================= */

async function getRailRadarTrains(
  from,
  to,
  date,
  live = false
) {
  if (!RAILRADAR_API_KEY) {
    throw new Error(
      "RAILRADAR_API_KEY is missing"
    );
  }

  const url =
    `https://api.railradar.in/v1/trains/between/${encodeURIComponent(
      from
    )}/${encodeURIComponent(to)}`;

  console.log(
    "RailRadar request:",
    url
  );

  const response = await axios.get(url, {
    params: {
      date,
      live: live ? "true" : "false"
    },
    headers: {
      Authorization:
        `Bearer ${RAILRADAR_API_KEY}`
    },
    timeout: 15000
  });

  return response.data;
}

/* =========================================================
   NORMALIZE TRAIN DATA
========================================================= */

function normalizeTrainData(apiResponse) {
  const trains =
    apiResponse?.data?.trains ||
    apiResponse?.data ||
    [];

  if (!Array.isArray(trains)) {
    return [];
  }

  return trains.map((item) => {
    const train =
      item.train || item;

    const fromStop =
      item.from ||
      item.source ||
      item.origin ||
      item.stop ||
      {};

    const live =
      item.live ||
      {};

    return {
      number:
        train.number ||
        train.trainNumber ||
        "Unknown",

      name:
        train.name ||
        "Train",

      type:
        train.type ||
        train.category ||
        "",

      departure:
        fromStop.departure ||
        train.departure ||
        item.departure ||
        null,

      arrival:
        fromStop.arrival ||
        train.arrival ||
        item.arrival ||
        null,

      liveDeparture:
        live.expectedDepartureTime ||
        live.actualDepartureTime ||
        null,

      delayMinutes:
        live.delayMinutes ??
        item.delayMinutes ??
        null,

      liveStatus:
        live.type ||
        live.status ||
        null,

      platform:
        live.platform ||
        item.platform ||
        null
    };
  });
}

/* =========================================================
   FILTER TRAINS AFTER SPECIFIC HOUR
========================================================= */

function timeToMinutes(time) {
  if (!time) return null;

  const match = String(time).match(
    /^(\d{1,2}):(\d{2})/
  );

  if (!match) return null;

  return (
    Number(match[1]) * 60 +
    Number(match[2])
  );
}

function filterAfterHour(trains, hour) {
  if (hour === null) {
    return trains;
  }

  const minimum =
    hour * 60;

  return trains.filter((train) => {
    const time =
      timeToMinutes(
        train.departure
      );

    if (time === null) {
      return true;
    }

    return time >= minimum;
  });
}

/* =========================================================
   FORMAT RAILWAY DATA
========================================================= */

function formatRailData(
  trains,
  from,
  to,
  date,
  afterHour
) {
  if (!trains.length) {
    return `
কোনও ট্রেনের তথ্য পাওয়া যায়নি।

From: ${from}
To: ${to}
Date: ${date}
`;
  }

  const limited =
    trains.slice(0, 30);

  let result = `
SOURCE: RailRadar
FROM: ${from}
TO: ${to}
DATE: ${date}
`;

  if (afterHour !== null) {
    result +=
      `AFTER: ${afterHour}:00\n`;
  }

  result += "\nTRAIN DATA:\n";

  for (const train of limited) {
    result += `
Train Number: ${train.number}
Train Name: ${train.name}
Type: ${train.type}
Scheduled Departure: ${train.departure || "N/A"}
Scheduled Arrival: ${train.arrival || "N/A"}
Live Departure: ${train.liveDeparture || "N/A"}
Delay Minutes: ${
      train.delayMinutes !== null
        ? train.delayMinutes
        : "N/A"
    }
Live Status: ${
      train.liveStatus || "N/A"
    }
Platform: ${
      train.platform || "N/A"
    }
`;
  }

  return result;
}

/* =========================================================
   GEMINI RESPONSE
========================================================= */

async function generateAIReply(
  userMessage,
  railwayData = null
) {
  if (!ai) {
    return railwayData
      ? formatRailwayFallback(
          railwayData
        )
      : "নমস্কার! 🚆 Sealdah Train Service AI Bot-এ আপনাকে স্বাগতম।";
  }

  try {
    const systemInstruction = `
তুমি "Sealdah Train Service AI Bot"।

তুমি ভারতীয় রেলের বিশেষ করে Sealdah Division-এর
ট্রেন সংক্রান্ত প্রশ্নের উত্তর দেবে।

সবচেয়ে গুরুত্বপূর্ণ নিয়ম:

1. ব্যবহারকারী বাংলায় লিখলে বাংলায় উত্তর দেবে।
2. ইংরেজিতে লিখলে ইংরেজিতে উত্তর দেবে।
3. উত্তর WhatsApp-friendly এবং সহজ রাখবে।
4. Railway data দেওয়া থাকলে শুধুমাত্র সেই data ব্যবহার করবে।
5. নিজের থেকে train number, সময়, delay বা live status বানাবে না।
6. Railway data না থাকলে নিশ্চিত timetable দাবি করবে না।
7. "আজ", "কাল", "২৯ তারিখ", "বারোটার পর" ইত্যাদি বুঝবে।
8. User যদি greeting করে, railway API call করার দরকার নেই।
9. Source ও destination পরিষ্কার থাকলে অপ্রয়োজনীয় প্রশ্ন করবে না।
10. Train list থাকলে সুন্দর numbered list বানাবে।
11. Scheduled time এবং live time আলাদা করে দেখাবে।
12. Delay data না থাকলে delay অনুমান করবে না।
13. Live status না থাকলে "Live status unavailable" বলতে পারো।
14. সর্বোচ্চ প্রয়োজনীয় তথ্য দেবে, অপ্রয়োজনীয় দীর্ঘ উত্তর দেবে না।

যদি Railway DATA দেওয়া হয়, সেটিই authoritative data হিসেবে ব্যবহার করবে।
`;

    let prompt = `
USER MESSAGE:
${userMessage}
`;

    if (railwayData) {
      prompt += `

VERIFIED RAILWAY DATA:
${railwayData}

এই data-এর বাইরে কোনও train timing বা status তৈরি করবে না।
`;
    }

    const response =
      await ai.models.generateContent({
        model:
          "gemini-3.5-flash-lite",

        contents: prompt,

        config: {
          systemInstruction,
          temperature: 0.1,
          maxOutputTokens: 700
        }
      });

    const reply =
      response.text ||
      "দুঃখিত, উত্তর তৈরি করা যাচ্ছে না।";

    return reply.trim();

  } catch (error) {

    console.error(
      "Gemini Error:",
      error?.message ||
      error
    );

    if (railwayData) {
      return formatRailwayFallback(
        railwayData
      );
    }

    return "নমস্কার! 🚆 Sealdah Train Service AI Bot-এ আপনাকে স্বাগতম। ট্রেনের নাম, নম্বর বা রুট লিখে জানতে পারেন।";
  }
}

/* =========================================================
   FALLBACK WITHOUT AI
========================================================= */

function formatRailwayFallback(data) {
  if (!data) {
    return "দুঃখিত, এই মুহূর্তে railway data পাওয়া যাচ্ছে না।";
  }

  const trains =
    normalizeTrainData(data);

  if (!trains.length) {
    return "দুঃখিত, এই তারিখে নির্দিষ্ট রুটের ট্রেনের তথ্য পাওয়া যায়নি।";
  }

  let text =
    "🚆 ট্রেনের তথ্য\n\n";

  trains.slice(0, 20).forEach(
    (train, index) => {

      text +=
        `${index + 1}. ${train.number} - ${train.name}\n`;

      if (train.departure) {
        text +=
          `🕐 ছাড়বে: ${train.departure}\n`;
      }

      if (train.arrival) {
        text +=
          `🏁 পৌঁছাবে: ${train.arrival}\n`;
      }

      if (
        train.delayMinutes !== null
      ) {
        text +=
          `⏱️ Delay: ${train.delayMinutes} মিনিট\n`;
      }

      if (train.platform) {
        text +=
          `🚉 Platform: ${train.platform}\n`;
      }

      text += "\n";
    }
  );

  return text.trim();
}

/* =========================================================
   HOME
========================================================= */

app.get("/", (req, res) => {

  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Sealdah Train Service AI Bot</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>

<body style="font-family:Arial;text-align:center;padding:50px">

<h1>🚆 Sealdah Train Service AI Bot</h1>

<p>WhatsApp: Connected</p>
<p>AI: Gemini 3.5 Flash-Lite</p>
<p>Railway Data: RailRadar</p>
<p>Status: Online</p>

<hr>

<p>
<a href="/api">Health Check</a>
</p>

<p>
<a href="/privacy">Privacy Policy</a>
</p>

</body>
</html>
`);
});

/* =========================================================
   HEALTH
========================================================= */

app.get("/api", (req, res) => {

  res.json({
    status: "online",
    service:
      "Sealdah Train Service AI Bot",

    whatsapp:
      WHATSAPP_TOKEN &&
      PHONE_NUMBER_ID
        ? "configured"
        : "missing",

    gemini:
      GEMINI_API_KEY
        ? "configured"
        : "missing",

    railradar:
      RAILRADAR_API_KEY
        ? "configured"
        : "missing",

    timeZone:
      "Asia/Kolkata",

    endpoints: {
      home: "/",
      health: "/api",
      webhook: "/webhook",
      privacy: "/privacy"
    }
  });
});

/* =========================================================
   PRIVACY
========================================================= */

app.get("/privacy", (req, res) => {

  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Privacy Policy</title>
</head>

<body style="font-family:Arial;padding:30px">

<h1>Privacy Policy</h1>

<p>
Sealdah Train Service AI Bot processes WhatsApp
messages to provide railway information and
automated assistance.
</p>

<p>
Railway information may be obtained from
third-party railway data services.
</p>

<p>
Messages are processed only for providing
the requested service.
</p>

</body>
</html>
`);
});

/* =========================================================
   WEBHOOK VERIFY
========================================================= */

app.get("/webhook", (req, res) => {

  const mode =
    req.query["hub.mode"];

  const token =
    req.query["hub.verify_token"];

  const challenge =
    req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token === VERIFY_TOKEN
  ) {

    console.log(
      "WhatsApp Webhook Verified"
    );

    return res
      .status(200)
      .send(challenge);
  }

  return res.sendStatus(403);
});

/* =========================================================
   SEND WHATSAPP
========================================================= */

async function sendWhatsAppMessage(
  to,
  text
) {

  try {

    const url =
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

    const response =
      await axios.post(
        url,

        {
          messaging_product:
            "whatsapp",

          recipient_type:
            "individual",

          to,

          type: "text",

          text: {
            preview_url: false,
            body: text
          }
        },

        {
          headers: {
            Authorization:
              `Bearer ${WHATSAPP_TOKEN}`,

            "Content-Type":
              "application/json"
          }
        }
      );

    console.log(
      "WhatsApp message sent successfully:",
      response.data?.messages?.[0]?.id ||
        "OK"
    );

  } catch (error) {

    console.error(
      "WhatsApp Send Error:",
      error.response?.data ||
        error.message ||
        error
    );
  }
}

/* =========================================================
   WEBHOOK
========================================================= */

app.post(
  "/webhook",
  async (req, res) => {

    // Respond immediately to Meta
    res.sendStatus(200);

    try {

      console.log(
        "========== NEW WHATSAPP WEBHOOK =========="
      );

      const value =
        req.body?.entry?.[0]
          ?.changes?.[0]
          ?.value;

      const messages =
        value?.messages;

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

      const from =
        message.from;

      console.log(
        "ACTUAL SENDER NUMBER:",
        from
      );

      console.log(
        "BUSINESS PHONE NUMBER ID:",
        value?.metadata
          ?.phone_number_id
      );

      if (
        message.type !== "text"
      ) {

        await sendWhatsAppMessage(
          from,
          "দুঃখিত, আপাতত আমি শুধুমাত্র text message গ্রহণ করতে পারি।"
        );

        return;
      }

      const userMessage =
        message.text
          ?.body
          ?.trim();

      if (!userMessage) {
        return;
      }

      console.log(
        "USER MESSAGE:",
        userMessage
      );

      /* -----------------------------------------
         GREETING
      ----------------------------------------- */

      if (
        /^(হ্যালো|হাই|hello|hi|hey|নমস্কার)$/i
          .test(userMessage)
      ) {

        const reply =
          "নমস্কার! 🚆\n\nআমি Sealdah Train Service AI Bot।\n\nআপনি যেমন লিখতে পারেন:\n• শান্তিপুর থেকে শিয়ালদা যাওয়ার ট্রেন\n• আজ শান্তিপুর থেকে শিয়ালদা\n• আজ ১২টার পর শান্তিপুর থেকে শিয়ালদা\n• ৩১৮১১ ট্রেন কোথায় আছে";

        await sendWhatsAppMessage(
          from,
          reply
        );

        return;
      }

      /* -----------------------------------------
         DETECT USER REQUEST
      ----------------------------------------- */

      const stations =
        detectStations(
          userMessage
        );

      const date =
        detectDate(
          userMessage
        );

      const afterHour =
        detectAfterHour(
          userMessage
        );

      const trainNumber =
        detectTrainNumber(
          userMessage
        );

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

      /* -----------------------------------------
         TRAIN NUMBER LIVE STATUS
      ----------------------------------------- */

      if (
        trainNumber &&
        RAILRADAR_API_KEY
      ) {

        try {

          const liveUrl =
            `https://api.railradar.in/v1/trains/${trainNumber}/live`;

          const liveResponse =
            await axios.get(
              liveUrl,
              {
                params: {
                  date
                },

                headers: {
                  Authorization:
                    `Bearer ${RAILRADAR_API_KEY}`
                },

                timeout: 15000
              }
            );

          const liveData =
            liveResponse.data;

          const railwayText =
            JSON.stringify(
              liveData,
              null,
              2
            );

          const reply =
            await generateAIReply(
              userMessage,
              railwayText
            );

          await sendWhatsAppMessage(
            from,
            reply
          );

          return;

        } catch (error) {

          console.error(
            "RailRadar Live Error:",
            error.response?.data ||
              error.message
          );
        }
      }

      /* -----------------------------------------
         BETWEEN STATIONS
      ----------------------------------------- */

      if (
        stations.from &&
        stations.to &&
        RAILRADAR_API_KEY
      ) {

        try {

          const railResponse =
            await getRailRadarTrains(
              stations.from,
              stations.to,
              date,
              true
            );

          let trains =
            normalizeTrainData(
              railResponse
            );

          trains =
            filterAfterHour(
              trains,
              afterHour
            );

          const railwayText =
            formatRailData(
              trains,
              stations.from,
              stations.to,
              date,
              afterHour
            );

          const reply =
            await generateAIReply(
              userMessage,
              railwayText
            );

          console.log(
            "FINAL REPLY:",
            reply
          );

          await sendWhatsAppMessage(
            from,
            reply
          );

          return;

        } catch (error) {

          console.error(
            "RailRadar Error:",
            error.response?.data ||
              error.message
          );

          const reply =
            "দুঃখিত, এই মুহূর্তে railway data service থেকে তথ্য পাওয়া যাচ্ছে না। কিছুক্ষণ পরে আবার চেষ্টা করুন।";

          await sendWhatsAppMessage(
            from,
            reply
          );

          return;
        }
      }

      /* -----------------------------------------
         GENERAL AI QUESTION
      ----------------------------------------- */

      const reply =
        await generateAIReply(
          userMessage
        );

      console.log(
        "FINAL REPLY:",
        reply
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
  }
);

/* =========================================================
   START SERVER
========================================================= */

app.listen(
  PORT,
  () => {

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
      "RailRadar API Key:",
      RAILRADAR_API_KEY
        ? "OK"
        : "MISSING"
    );

    console.log(
      "================================"
    );
  }
);
