require("dotenv").config();

const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

/*
==================================================
ENVIRONMENT VARIABLES
==================================================
*/

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const RAILRADAR_API_KEY = process.env.RAILRADAR_API_KEY;

/*
==================================================
CONFIG
==================================================
*/

const GEMINI_MODEL = "gemini-3.8-flash";

const RAILRADAR_BASE =
  "https://api.railradar.in/v1";

/*
==================================================
STATION ALIASES
==================================================
*/

const STATION_ALIASES = {

  "শান্তিপুর": "STB",
  "শান্তিপুর জংশন": "STB",
  "shantipur": "STB",
  "shantipur junction": "STB",
  "STB": "STB",

  "শিয়ালদহ": "SDAH",
  "শিয়ালদহ": "SDAH",
  "sealdah": "SDAH",
  "SDAH": "SDAH",

  "রানাঘাট": "RHA",
  "ranaghat": "RHA",
  "RHA": "RHA",

  "কৃষ্ণনগর": "KNJ",
  "krishnanagar": "KNJ",
  "KNJ": "KNJ",

  "কল্যাণী": "KYI",
  "kalyani": "KYI",
  "KYI": "KYI",

  "চাকদহ": "CDH",
  "chakdaha": "CDH",
  "CDH": "CDH",

  "নৈহাটি": "NH",
  "naihati": "NH",
  "NH": "NH",

  "দমদম": "DDJ",
  "dum dum": "DDJ",
  "dumdum": "DDJ",
  "DDJ": "DDJ"
};

/*
==================================================
HEALTH CHECK
==================================================
*/

app.get("/", (req, res) => {

  res.send(`
    <html>
      <head>
        <title>Sealdah Train Service AI Bot</title>
      </head>

      <body style="
        font-family: Arial;
        background:#f5f5f5;
        padding:40px;
      ">

        <h1>🚆 Sealdah Train Service AI Bot</h1>

        <p>Bot is running successfully.</p>

        <p>
          <b>WhatsApp:</b> Connected
        </p>

        <p>
          <b>AI:</b> Gemini
        </p>

        <p>
          <b>Railway Data:</b> RailRadar
        </p>

        <p>
          <b>Status:</b> Online
        </p>

      </body>
    </html>
  `);

});


app.get("/api", (req, res) => {

  res.json({

    status: "online",

    service:
      "Sealdah Train Service AI Bot",

    ai:
      GEMINI_API_KEY
        ? "Gemini configured"
        : "Gemini API key missing",

    railway:
      RAILRADAR_API_KEY
        ? "RailRadar configured"
        : "RailRadar API key missing",

    whatsapp:
      WHATSAPP_TOKEN
        ? "WhatsApp configured"
        : "WhatsApp token missing",

    phoneNumberId:
      PHONE_NUMBER_ID
        ? "Configured"
        : "Missing"

  });

});


/*
==================================================
PRIVACY PAGE
==================================================
*/

app.get("/privacy", (req, res) => {

  res.send(`
    <html>

      <head>
        <title>Privacy Policy</title>
      </head>

      <body style="
        font-family:Arial;
        max-width:800px;
        margin:40px auto;
        line-height:1.6;
      ">

        <h1>Privacy Policy</h1>

        <p>
          Sealdah Train Service AI Bot processes
          WhatsApp messages to provide railway
          information and automated assistance.
        </p>

        <p>
          Messages are processed only for providing
          the requested service.
        </p>

        <p>
          Railway information is retrieved from
          third-party railway data services.
        </p>

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


/*
==================================================
SEND WHATSAPP MESSAGE
==================================================
*/

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

          to: to,

          type:
            "text",

          text: {

            preview_url:
              false,

            body:
              text

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
      response.data?.messages?.[0]?.id || "OK"
    );

    return true;

  }

  catch (error) {

    console.error(
      "WhatsApp Send Error:",
      error.response?.data ||
      error.message
    );

    return false;

  }

}


/*
==================================================
GEMINI AI
==================================================
*/

async function askGemini(
  userMessage
) {

  if (!GEMINI_API_KEY) {

    console.error(
      "GEMINI_API_KEY is missing"
    );

    return null;

  }

  try {

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const response =
      await axios.post(

        url,

        {

          systemInstruction: {

            parts: [

              {

                text: `
তুমি "Sealdah Train Service" WhatsApp Assistant।

তোমার কাজ:

1. ব্যবহারকারীর প্রশ্ন বুঝতে সাহায্য করা।
2. বাংলা প্রশ্নের উত্তর বাংলায় দেওয়া।
3. ইংরেজি প্রশ্নের উত্তর ইংরেজিতে দেওয়া।
4. Railway related প্রশ্নে পরিষ্কার এবং ছোট উত্তর দেওয়া।
5. কোনো train timing, live status বা railway তথ্য নিজে থেকে বানানো যাবে না।
6. Railway data পাওয়া গেলে শুধুমাত্র সেই data ব্যবহার করবে।
7. ব্যবহারকারী "আজ", "কাল", "২৯ তারিখ", "বারোটার পর" ইত্যাদি বললে context বুঝতে চেষ্টা করবে।
8. Live status-এর ক্ষেত্রে API data ছাড়া কোনো দাবি করবে না।
9. WhatsApp-friendly উত্তর দেবে।
10. অপ্রয়োজনীয় বড় উত্তর দেবে না।

খুব গুরুত্বপূর্ণ:

তুমি নিজে কোনো live railway database নও।
Railway API থেকে data না পাওয়া গেলে সেটা পরিষ্কারভাবে বলবে।
কখনো অনুমান করে train number বা timing তৈরি করবে না।
                `

              }

            ]

          },

          contents: [

            {

              role:
                "user",

              parts: [

                {

                  text:
                    userMessage

                }

              ]

            }

          ],

          generationConfig: {

            temperature:
              0.2,

            maxOutputTokens:
              500

          }

        },

        {

          headers: {

            "Content-Type":
              "application/json"

          },

          timeout:
            30000

        }

      );


    const text =
      response
        .data
        ?.candidates?.[0]
        ?.content
        ?.parts
        ?.map(
          part => part.text || ""
        )
        .join("")
        .trim();


    if (!text) {

      return null;

    }

    return text;

  }

  catch (error) {

    console.error(
      "Gemini Error:",
      error.response?.data ||
      error.message
    );

    return null;

  }

}


/*
==================================================
NORMALIZE STATION
==================================================
*/

function normalizeStation(
  value
) {

  if (!value) {
    return null;
  }

  const clean =
    value
      .trim()
      .toLowerCase();

  if (
    STATION_ALIASES[clean]
  ) {

    return STATION_ALIASES[clean];

  }

  return null;

}


/*
==================================================
EXTRACT STATIONS
==================================================
*/

function detectStations(
  message
) {

  const lower =
    message.toLowerCase();

  let from = null;
  let to = null;

  /*
  বাংলা / English "থেকে / থেকে"
  */

  for (
    const name in STATION_ALIASES
  ) {

    const code =
      STATION_ALIASES[name];

    const escaped =
      name.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

    const fromRegex =
      new RegExp(
        escaped +
        "\\s*(থেকে|theke|from)"
      );

    const toRegex =
      new RegExp(
        "(যাওয়ার|যাওয়ার|যেতে|to|towards|দিকে)?\\s*" +
        escaped
      );

    if (
      !from &&
      fromRegex.test(lower)
    ) {

      from = code;

    }

  }

  /*
  বিশেষভাবে station pair detect
  */

  const stationMatches = [];

  for (
    const name in STATION_ALIASES
  ) {

    if (
      lower.includes(
        name.toLowerCase()
      )
    ) {

      if (
        !stationMatches.includes(
          STATION_ALIASES[name]
        )
      ) {

        stationMatches.push(
          STATION_ALIASES[name]
        );

      }

    }

  }

  if (
    stationMatches.length >= 2
  ) {

    if (!from) {

      from =
        stationMatches[0];

    }

    if (!to) {

      to =
        stationMatches[1];

    }

  }

  /*
  যদি "X থেকে Y" থাকে,
  প্রথম station = from,
  দ্বিতীয় station = to
  */

  const fromIndex =
    lower.indexOf("থেকে");

  if (
    fromIndex >= 0 &&
    stationMatches.length >= 2
  ) {

    const before =
      lower.substring(
        0,
        fromIndex
      );

    const after =
      lower.substring(
        fromIndex + 5
      );

    for (
      const code of stationMatches
    ) {

      const foundName =
        Object.keys(
          STATION_ALIASES
        ).find(
          key =>
            STATION_ALIASES[key] ===
            code &&
            before.includes(
              key.toLowerCase()
            )
        );

      if (foundName) {

        from =
          code;

        break;

      }

    }

    for (
      const code of stationMatches
    ) {

      if (
        code !== from
      ) {

        to =
          code;

        break;

      }

    }

  }

  return {
    from,
    to
  };

}


/*
==================================================
DATE HELPERS
==================================================
*/

function getTodayIST() {

  const now =
    new Date();

  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Asia/Kolkata",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit"
      }
    ).formatToParts(now);

  const map = {};

  for (
    const part of parts
  ) {

    map[part.type] =
      part.value;

  }

  return `${map.year}-${map.month}-${map.day}`;

}


function parseDate(
  message
) {

  const today =
    getTodayIST();

  /*
  আজ / today
  */

  if (
    /আজ|today/i.test(
      message
    )
  ) {

    return today;

  }

  /*
  কাল / tomorrow
  */

  if (
    /কাল|tomorrow/i.test(
      message
    )
  ) {

    const d =
      new Date(
        today + "T00:00:00+05:30"
      );

    d.setDate(
      d.getDate() + 1
    );

    return d
      .toISOString()
      .slice(0, 10);

  }

  /*
  DD/MM/YYYY
  */

  const full =
    message.match(
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})/
    );

  if (full) {

    const day =
      String(
        full[1]
      ).padStart(2, "0");

    const month =
      String(
        full[2]
      ).padStart(2, "0");

    return `${full[3]}-${month}-${day}`;

  }

  /*
  শুধু ২৯ তারিখ
  */

  const dayOnly =
    message.match(
      /(?:তারিখ|date)?\s*(\d{1,2})\s*(?:তারিখ)?/i
    );

  if (dayOnly) {

    const requestedDay =
      parseInt(
        dayOnly[1],
        10
      );

    if (
      requestedDay >= 1 &&
      requestedDay <= 31
    ) {

      const yearMonth =
        today.substring(
          0,
          8
        );

      return (
        yearMonth +
        String(
          requestedDay
        ).padStart(2, "0")
      );

    }

  }

  return today;

}


/*
==================================================
TIME EXTRACTION
==================================================
*/

function parseAfterTime(
  message
) {

  /*
  ১২টার পর
  12টার পর
  12 এর পর
  */

  const bengali =
    message.match(
      /([০-৯]{1,2})\s*(টা|টায়|টায়)?\s*(?:এর\s*)?(পর|পরে)/i
    );

  if (bengali) {

    const bn =
      bengali[1];

    const english =
      bn.replace(
        /[০-৯]/g,
        d =>
          "০১২৩৪৫৬৭৮৯".indexOf(d)
      );

    const hour =
      parseInt(
        english,
        10
      );

    return hour;

  }

  const english =
    message.match(
      /(\d{1,2})\s*(?:টা|টায়|টায়|টার)?\s*(?:এর\s*)?(পর|পরে|after)/i
    );

  if (english) {

    return parseInt(
      english[1],
      10
    );

  }

  /*
  12 PM / 12 AM
  */

  const ampm =
    message.match(
      /(\d{1,2})\s*(am|pm)/i
    );

  if (ampm) {

    let hour =
      parseInt(
        ampm[1],
        10
      );

    const period =
      ampm[2].toLowerCase();

    if (
      period === "pm" &&
      hour < 12
    ) {

      hour += 12;

    }

    if (
      period === "am" &&
      hour === 12
    ) {

      hour = 0;

    }

    return hour;

  }

  return null;

}


/*
==================================================
FORMAT TIME
==================================================
*/

function timeToMinutes(
  time
) {

  if (!time) {
    return null;
  }

  const match =
    String(time).match(
      /(\d{1,2}):(\d{2})/
    );

  if (!match) {
    return null;
  }

  return (
    parseInt(match[1], 10) *
      60 +
    parseInt(match[2], 10)
  );

}


function formatTrain(
  train,
  index
) {

  const number =
    train?.train?.number ||
    train?.number ||
    "N/A";

  const name =
    train?.train?.name ||
    train?.name ||
    "Unknown Train";

  const stop =
    train?.stop ||
    {};

  const departure =
    stop.departure ||
    train?.departure ||
    "--";

  const arrival =
    stop.arrival ||
    train?.arrival ||
    "--";

  const live =
    train?.live ||
    {};

  const delay =
    live.delayMinutes;

  const platform =
    live.platform ||
    stop.platform ||
    "";

  let line =
    `${index}. 🚆 ${number} - ${name}\n`;

  line +=
    `   ছাড়ে: ${departure}`;

  if (
    arrival &&
    arrival !== "--"
  ) {

    line +=
      ` | পৌঁছায়: ${arrival}`;

  }

  if (
    platform
  ) {

    line +=
      ` | PF: ${platform}`;

  }

  if (
    typeof delay === "number"
  ) {

    if (delay > 0) {

      line +=
        ` | Delay: ${delay} min`;

    }
    else {

      line +=
        ` | On Time`;

    }

  }

  return line;

}


/*
==================================================
RAILRADAR REQUEST
==================================================
*/

async function railRadarGet(
  endpoint,
  params = {}
) {

  if (!RAILRADAR_API_KEY) {

    throw new Error(
      "RAILRADAR_API_KEY_MISSING"
    );

  }

  const response =
    await axios.get(

      `${RAILRADAR_BASE}${endpoint}`,

      {

        params,

        headers: {

          Authorization:
            `Bearer ${RAILRADAR_API_KEY}`

        },

        timeout:
          20000

      }

    );

  return response.data;

}


/*
==================================================
TRAINS BETWEEN STATIONS
==================================================
*/

async function getTrainsBetween(
  from,
  to,
  date,
  live = false
) {

  const data =
    await railRadarGet(

      `/trains/between/${from}/${to}`,

      {

        date,

        live:

          live
            ? "true"
            : "false"

      }

    );

  return (
    data?.data?.trains ||
    []
  );

}


/*
==================================================
LIVE TRAIN STATUS
==================================================
*/

async function getLiveTrain(
  trainNumber,
  date
) {

  const data =
    await railRadarGet(

      `/trains/${trainNumber}/live`,

      {

        date,

        authoritative:
          "true"

      }

    );

  return data?.data;

}


/*
==================================================
TRAIN NUMBER DETECTION
==================================================
*/

function detectTrainNumber(
  message
) {

  const match =
    message.match(
      /\b(\d{5})\b/
    );

  return match
    ? match[1]
    : null;

}


/*
==================================================
TRAIN QUERY HANDLER
==================================================
*/

async function handleRailwayQuestion(
  userMessage
) {

  const stations =
    detectStations(
      userMessage
    );

  const date =
    parseDate(
      userMessage
    );

  const afterHour =
    parseAfterTime(
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


  /*
  ==============================================
  LIVE TRAIN STATUS
  ==============================================
  */

  if (
    trainNumber &&
    /লাইভ|live|status|স্ট্যাটাস|কোথায়|কোথায়|running|চলছে/i.test(
      userMessage
    )
  ) {

    try {

      const train =
        await getLiveTrain(
          trainNumber,
          date
        );

      if (!train) {

        return null;

      }

      let reply =
        `🚆 ${train.train?.number || trainNumber} ${train.train?.name || ""}\n\n`;

      if (
        train.status
      ) {

        reply +=
          `Status: ${train.status}\n`;

      }

      if (
        typeof train.delayMinutes ===
        "number"
      ) {

        reply +=
          `Delay: ${train.delayMinutes} মিনিট\n`;

      }

      if (
        train.currentLocation?.stationName
      ) {

        reply +=
          `বর্তমান অবস্থান: ${train.currentLocation.stationName}\n`;

      }

      if (
        train.nextHalt?.stationName
      ) {

        reply +=
          `পরবর্তী স্টেশন: ${train.nextHalt.stationName}\n`;

      }

      if (
        train.nextHalt?.distance != null
      ) {

        reply +=
          `দূরত্ব: ${train.nextHalt.distance} km\n`;

      }

      reply +=
        `\nতারিখ: ${date}`;

      return reply;

    }

    catch (error) {

      console.error(
        "Live Train API Error:",
        error.response?.data ||
        error.message
      );

      return (
        `দুঃখিত, ${trainNumber} নম্বর ট্রেনের live status এখন পাওয়া যাচ্ছে না।`
      );

    }

  }


  /*
  ==============================================
  TRAINS BETWEEN STATIONS
  ==============================================
  */

  if (
    stations.from &&
    stations.to
  ) {

    try {

      const trains =
        await getTrainsBetween(

          stations.from,

          stations.to,

          date,

          false

        );


      if (
        !trains ||
        trains.length === 0
      ) {

        return (
          `🚆 ${stations.from} থেকে ${stations.to} যাওয়ার জন্য ${date} তারিখে কোনো train data পাওয়া যায়নি।`
        );

      }


      let filtered =
        [...trains];


      /*
      after time filtering
      */

      if (
        afterHour !== null
      ) {

        const afterMinutes =
          afterHour * 60;


        filtered =
          filtered.filter(
            item => {

              const dep =
                item?.stop?.departure ||
                item?.departure;

              const mins =
                timeToMinutes(
                  dep
                );

              if (
                mins === null
              ) {

                return true;

              }

              return (
                mins >= afterMinutes
              );

            }
          );

      }


      /*
      Sort by departure
      */

      filtered.sort(
        (a, b) => {

          const ta =
            timeToMinutes(
              a?.stop?.departure ||
              a?.departure
            );

          const tb =
            timeToMinutes(
              b?.stop?.departure ||
              b?.departure
            );

          if (
            ta === null
          ) return 1;

          if (
            tb === null
          ) return -1;

          return ta - tb;

        }
      );


      /*
      Limit WhatsApp message
      */

      const limited =
        filtered.slice(
          0,
          15
        );


      let reply =
        `🚆 ট্রেন তথ্য\n\n`;

      reply +=
        `যাত্রা: ${stations.from} → ${stations.to}\n`;

      reply +=
        `তারিখ: ${date}\n`;

      if (
        afterHour !== null
      ) {

        reply +=
          `সময়: ${afterHour}:00-এর পর\n`;

      }

      reply +=
        `\n`;


      limited.forEach(
        (train, index) => {

          reply +=
            formatTrain(
              train,
              index + 1
            ) +
            "\n\n";

        }
      );


      if (
        filtered.length >
        limited.length
      ) {

        reply +=
          `আরও ${filtered.length - limited.length}টি train আছে।`;

      }


      return reply;

    }

    catch (error) {

      console.error(
        "RailRadar Between Error:",
        error.response?.data ||
        error.message
      );


      if (
        error.response?.status ===
        401
      ) {

        return (
          "⚠️ Railway API key সঠিক নয় অথবা expired হয়েছে।"
        );

      }


      if (
        error.response?.status ===
        429
      ) {

        return (
          "⚠️ Railway API-এর monthly free limit শেষ হয়ে গেছে।"
        );

      }


      return (
        "দুঃখিত, এই মুহূর্তে railway data পাওয়া যাচ্ছে না। কিছুক্ষণ পরে আবার চেষ্টা করুন।"
      );

    }

  }


  /*
  ==============================================
  NO DIRECT RAILWAY QUERY
  ==============================================
  */

  return null;

}


/*
==================================================
GENERAL AI QUESTION
==================================================
*/

async function generateFinalReply(
  userMessage
) {

  const railwayReply =
    await handleRailwayQuestion(
      userMessage
    );


  /*
  যদি Railway API answer দেয়,
  সেটাই final answer.
  */

  if (
    railwayReply
  ) {

    return railwayReply;

  }


  /*
  অন্য প্রশ্ন Gemini-তে যাবে
  */

  const aiReply =
    await askGemini(
      userMessage
    );


  if (
    aiReply
  ) {

    return aiReply;

  }


  /*
  Gemini fail হলেও fallback
  */

  return (
    "দুঃখিত, এই মুহূর্তে উত্তর তৈরি করা যাচ্ছে না। অনুগ্রহ করে কিছুক্ষণ পরে আবার চেষ্টা করুন।"
  );

}


/*
==================================================
WHATSAPP WEBHOOK
==================================================
*/

app.post(
  "/webhook",
  async (req, res) => {

    /*
    WhatsApp-কে সঙ্গে সঙ্গে 200 দিতে হবে
    */

    res.sendStatus(200);


    try {

      console.log(
        "========== NEW WHATSAPP WEBHOOK =========="
      );


      console.log(
        "Webhook body:",
        JSON.stringify(
          req.body
        )
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
      Status webhook হলে ignore
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
      শুধু text message
      */

      if (
        message.type !==
        "text"
      ) {

        await sendWhatsAppMessage(

          from,

          "দুঃখিত, আপাতত আমি শুধুমাত্র text message গ্রহণ করতে পারি।"

        );

        return;

      }


      const userMessage =
        message.text?.body?.trim();


      if (
        !userMessage
      ) {

        return;

      }


      console.log(
        "USER MESSAGE:",
        userMessage
      );


      /*
      AI / Railway
      */

      const reply =
        await generateFinalReply(
          userMessage
        );


      console.log(
        "FINAL REPLY:",
        reply
      );


      /*
      একই sender number-এ reply
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

    }

    catch (error) {

      console.error(
        "Webhook Error:",
        error.response?.data ||
        error.message ||
        error
      );

    }

  }
);


/*
==================================================
START SERVER
==================================================
*/

app.listen(
  PORT,
  () => {

    console.log(
      "=========================================="
    );

    console.log(
      "Sealdah Train Service AI Bot"
    );

    console.log(
      "=========================================="
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
      "Home: /"
    );

    console.log(
      "Gemini API:",
      GEMINI_API_KEY
        ? "OK"
        : "MISSING"
    );

    console.log(
      "RailRadar API:",
      RAILRADAR_API_KEY
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

  }
);
