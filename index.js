require("dotenv").config();

const express = require("express");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

const WHATSAPP_TOKEN =
  process.env.WHATSAPP_TOKEN;

const PHONE_NUMBER_ID =
  process.env.PHONE_NUMBER_ID;

const VERIFY_TOKEN =
  process.env.VERIFY_TOKEN;

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY;

const RAILRADAR_API_KEY =
  process.env.RAILRADAR_API_KEY;


/*
==================================================
GEMINI
==================================================
*/

const genAI =
  new GoogleGenerativeAI(
    GEMINI_API_KEY
  );

const geminiModel =
  genAI.getGenerativeModel({
    model: "gemini-2.5-flash"
  });


/*
==================================================
STATION DATABASE
==================================================
*/

const STATIONS = {

  "শান্তিপুর": "STB",
  "শান্তিপুর জংশন": "STB",
  "শান্তিপুর স্টেশন": "STB",
  "santipur": "STB",
  "santipur junction": "STB",

  "শিয়ালদহ": "SDAH",
  "শিয়ালদা": "SDAH",
  "শিয়ালদহ": "SDAH",
  "শিয়ালদা": "SDAH",
  "sealdah": "SDAH",

  "রানাঘাট": "RHA",
  "রানাঘাট জংশন": "RHA",
  "ranaghat": "RHA",

  "কৃষ্ণনগর": "KNJ",
  "কৃষ্ণনগর সিটি": "KNJ",
  "krishnanagar": "KNJ",

  "নৈহাটি": "NH",
  "naihati": "NH",

  "কল্যাণী": "KYI",
  "kalyani": "KYI",

  "বারাসাত": "BT",
  "barasat": "BT",

  "দমদম": "DDJ",
  "dum dum": "DDJ",

  "কলকাতা": "KOAA",
  "কলকাতা স্টেশন": "KOAA",
  "kolkata": "KOAA"
};


/*
==================================================
HOME
==================================================
*/

app.get("/", (req, res) => {

  res.status(200).send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Sealdah Train Service AI Bot</title>
      </head>

      <body>

        <h1>🚆 Sealdah Train Service AI Bot</h1>

        <p>Bot is running successfully.</p>

        <p>
          WhatsApp Webhook:
          /webhook
        </p>

        <p>
          Health:
          /api
        </p>

      </body>
    </html>
  `);

});


/*
==================================================
HEALTH
==================================================
*/

app.get("/api", (req, res) => {

  res.json({

    status: "online",

    service:
      "Sealdah Train Service AI Bot",

    whatsapp:
      WHATSAPP_TOKEN &&
      PHONE_NUMBER_ID
        ? "OK"
        : "MISSING",

    gemini:
      GEMINI_API_KEY
        ? "OK"
        : "MISSING",

    railway:
      RAILRADAR_API_KEY
        ? "OK"
        : "MISSING"

  });

});


/*
==================================================
PRIVACY
==================================================
*/

app.get("/privacy", (req, res) => {

  res.send(`
    <html>

      <head>
        <title>Privacy Policy</title>
      </head>

      <body>

        <h1>
          Sealdah Train Service AI Bot
        </h1>

        <p>
          This service processes WhatsApp
          messages to provide railway
          information and automated
          assistance.
        </p>

        <p>
          Messages may be processed by
          configured AI and railway
          information services.
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
      to
    );


    return response.data;


  } catch (error) {

    console.error(
      "WhatsApp Send Error:",
      error.response?.data ||
      error.message
    );

  }

}


/*
==================================================
FIND STATION CODE
==================================================
*/

function findStationCode(text) {

  if (!text) {
    return null;
  }

  const lower =
    text.toLowerCase();

  for (
    const stationName
    of Object.keys(STATIONS)
  ) {

    if (
      lower.includes(
        stationName.toLowerCase()
      )
    ) {

      return STATIONS[
        stationName
      ];

    }

  }

  return null;

}


/*
==================================================
DETECT ROUTE
==================================================
*/

function detectRoute(text) {

  let source = null;
  let destination = null;


  /*
  Bengali direct routes
  */

  if (
    text.includes("শান্তিপুর") &&
    (
      text.includes("শিয়ালদহ") ||
      text.includes("শিয়ালদা") ||
      text.includes("শিয়ালদহ") ||
      text.includes("শিয়ালদা")
    )
  ) {

    source = "STB";
    destination = "SDAH";

  }


  if (
    text.includes("রানাঘাট") &&
    (
      text.includes("শিয়ালদহ") ||
      text.includes("শিয়ালদা") ||
      text.includes("শিয়ালদহ") ||
      text.includes("শিয়ালদা")
    )
  ) {

    source = "RHA";
    destination = "SDAH";

  }


  /*
  English
  */

  const lower =
    text.toLowerCase();

  if (
    lower.includes("santipur") &&
    lower.includes("sealdah")
  ) {

    source = "STB";
    destination = "SDAH";

  }


  if (
    lower.includes("ranaghat") &&
    lower.includes("sealdah")
  ) {

    source = "RHA";
    destination = "SDAH";

  }


  /*
  Generic "থেকে"
  */

  const fromMatch =
    text.match(
      /(.+?)\s+থেকে\s+(.+?)(?:\s+যাওয়া|\s+যাওয়ার|\s+যাওয়ার|\s+যাব|\s*$)/i
    );


  if (
    fromMatch &&
    !source &&
    !destination
  ) {

    source =
      findStationCode(
        fromMatch[1]
      );

    destination =
      findStationCode(
        fromMatch[2]
      );

  }


  return {
    source,
    destination
  };

}


/*
==================================================
GET TODAY IST
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


  const year =
    parts.find(
      x => x.type === "year"
    ).value;

  const month =
    parts.find(
      x => x.type === "month"
    ).value;

  const day =
    parts.find(
      x => x.type === "day"
    ).value;


  return `${year}-${month}-${day}`;

}


/*
==================================================
CURRENT IST TIME
==================================================
*/

function getCurrentISTMinutes() {

  const time =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone:
          "Asia/Kolkata",

        hour:
          "2-digit",

        minute:
          "2-digit",

        hour12:
          false
      }
    ).format(
      new Date()
    );


  const [hour, minute] =
    time.split(":")
      .map(Number);


  return (
    hour * 60 +
    minute
  );

}


/*
==================================================
EXTRACT "AFTER TIME"
==================================================
*/

function extractAfterTime(text) {

  /*
  ১২টার পর
  ১২টা পর
  12টার পর
  12:00 এর পর
  12 PM
  */

  const bengaliNumbers = {

    "০":"0",
    "১":"1",
    "২":"2",
    "৩":"3",
    "৪":"4",
    "৫":"5",
    "৬":"6",
    "৭":"7",
    "৮":"8",
    "৯":"9"

  };


  let converted =
    text.replace(
      /[০-৯]/g,
      digit =>
        bengaliNumbers[digit]
    );


  const match =
    converted.match(
      /(\d{1,2})(?::(\d{2}))?\s*(?:টা|টার|টায়|টার পর|টা পর|এর পর|পর|pm|am)?/i
    );


  if (!match) {

    /*
    If user simply says
    "আজ ১২টার পর"
    */

    const simple =
      converted.match(
        /(\d{1,2})\s*(?:টার পর|টা পর|এর পর|পর)/i
      );

    if (simple) {

      return (
        Number(simple[1]) *
        60
      );

    }

    return null;

  }


  let hour =
    Number(match[1]);

  const minute =
    match[2]
      ? Number(match[2])
      : 0;


  if (
    /pm/i.test(match[0]) &&
    hour < 12
  ) {

    hour += 12;

  }


  return (
    hour * 60 +
    minute
  );

}


/*
==================================================
RAILRADAR REQUEST
==================================================
*/

async function railRadarRequest(
  path,
  params = {}
) {

  if (
    !RAILRADAR_API_KEY
  ) {

    throw new Error(
      "RAILRADAR_API_KEY missing"
    );

  }


  const url =
    `https://api.railradar.in${path}`;


  const response =
    await axios.get(

      url,

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
  source,
  destination,
  date
) {

  try {

    const data =
      await railRadarRequest(

        `/v1/trains/between/${source}/${destination}`,

        {
          date: date,
          live: "true"
        }

      );


    return data;

  } catch (error) {

    console.error(
      "RailRadar Between Error:",
      error.response?.data ||
      error.message
    );


    return null;

  }

}


/*
==================================================
LIVE TRAIN STATUS
==================================================
*/

async function getLiveTrain(
  trainNumber
) {

  try {

    const data =
      await railRadarRequest(

        `/v1/trains/${trainNumber}/live`,

        {
          authoritative:
            "true"
        }

      );


    return data;

  } catch (error) {

    console.error(
      "RailRadar Live Error:",
      error.response?.data ||
      error.message
    );


    return null;

  }

}


/*
==================================================
TRAIN NUMBER DETECTION
==================================================
*/

function findTrainNumber(text) {

  const match =
    text.match(
      /\b\d{5}\b/
    );

  if (match) {

    return match[0];

  }

  return null;

}


/*
==================================================
FORMAT TRAIN RESULTS
==================================================
*/

function formatTrains(
  apiData,
  afterMinutes = null
) {

  if (
    !apiData ||
    !apiData.success
  ) {

    return null;

  }


  const trains =
    apiData.data?.trains || [];


  if (
    trains.length === 0
  ) {

    return null;

  }


  let filtered =
    trains;


  if (
    afterMinutes !== null
  ) {

    filtered =
      trains.filter(
        item => {

          const departure =
            item.from?.departure;

          if (!departure) {
            return false;
          }


          const [
            h,
            m
          ] =
            departure
              .split(":")
              .map(Number);


          const trainMinutes =
            h * 60 + m;


          return (
            trainMinutes >
            afterMinutes
          );

        }
      );

  }


  if (
    filtered.length === 0
  ) {

    return (
      "🚆 ওই সময়ের পরে এই route-এ কোনো train পাওয়া যায়নি।"
    );

  }


  let message =
    "🚆 ট্রেনের তথ্য\n\n";


  filtered
    .slice(0, 15)
    .forEach(
      (item, index) => {

        const train =
          item.train || {};

        const from =
          item.from || {};

        const to =
          item.to || {};

        const live =
          item.live || {};


        message +=
          `${index + 1}. ${train.number || ""} ${train.name || ""}\n`;

        message +=
          `   ছাড়বে: ${from.departure || "--"}\n`;

        message +=
          `   পৌঁছাবে: ${to.arrival || "--"}\n`;


        if (
          live.delayMinutes !==
          undefined &&
          live.delayMinutes !==
          null
        ) {

          message +=
            `   বিলম্ব: ${live.delayMinutes} মিনিট\n`;

        }


        if (
          live.platform
        ) {

          message +=
            `   প্ল্যাটফর্ম: ${live.platform}\n`;

        }


        message +=
          "\n";

      }
    );


  return message.trim();

}


/*
==================================================
FORMAT LIVE STATUS
==================================================
*/

function formatLiveStatus(
  data
) {

  if (
    !data ||
    !data.success
  ) {

    return null;

  }


  const d =
    data.data;


  if (!d) {

    return null;

  }


  const train =
    d.train || {};


  const current =
    d.currentLocation || {};


  const next =
    d.nextHalt || {};


  let message =
    `🚆 ${d.trainNumber || train.number || ""} ${d.trainName || train.name || ""}\n\n`;


  message +=
    `স্ট্যাটাস: ${d.status || "N/A"}\n`;


  if (
    d.delayMinutes !==
    undefined &&
    d.delayMinutes !==
    null
  ) {

    message +=
      `বিলম্ব: ${d.delayMinutes} মিনিট\n`;

  }


  if (
    current.stationName
  ) {

    message +=
      `বর্তমান অবস্থান: ${current.stationName}\n`;

  }

  else if (
    current.stationCode
  ) {

    message +=
      `বর্তমান স্টেশন: ${current.stationCode}\n`;

  }


  if (
    current.speedKmh
  ) {

    message +=
      `গতি: ${current.speedKmh} km/h\n`;

  }


  if (
    next.stationName
  ) {

    message +=
      `পরবর্তী স্টেশন: ${next.stationName}\n`;

  }

  else if (
    next.stationCode
  ) {

    message +=
      `পরবর্তী স্টেশন: ${next.stationCode}\n`;

  }


  if (
    current.platform
  ) {

    message +=
      `প্ল্যাটফর্ম: ${current.platform}\n`;

  }


  if (
    d.isLive
  ) {

    message +=
      "\n🟢 Live data পাওয়া গেছে।";

  }


  return message.trim();

}


/*
==================================================
GEMINI RESPONSE
==================================================
*/

async function askGemini(
  userMessage,
  railwayContext
) {

  try {

    const prompt = `

তুমি "Sealdah Train Service" WhatsApp Assistant।

তোমার কাজ হলো Indian Railways সম্পর্কিত
প্রশ্নের উত্তর দেওয়া।

নিয়ম:

1. ব্যবহারকারীর ভাষা অনুসরণ করবে।
2. বাংলা প্রশ্ন হলে বাংলা উত্তর দেবে।
3. ইংরেজি প্রশ্ন হলে ইংরেজি উত্তর দেবে।
4. Railway data দেওয়া থাকলে সেই data-ই ব্যবহার করবে।
5. Train number, departure time, arrival time বা live status কখনো নিজের থেকে বানাবে না।
6. Railway data না থাকলে স্পষ্টভাবে বলবে যে live railway data পাওয়া যায়নি।
7. খুব সহজ এবং ছোট WhatsApp-friendly উত্তর দেবে।
8. অপ্রয়োজনীয় explanation দেবে না।
9. "আমি live railway data ব্যবহার করছি" বলবে শুধুমাত্র সত্যিই API data পাওয়া গেলে।
10. API data-এর বাইরে কোনো train timing তৈরি করবে না।

ব্যবহারকারীর প্রশ্ন:

${userMessage}


Railway API data:

${railwayContext || "NO RAILWAY DATA AVAILABLE"}

এখন ব্যবহারকারীকে উত্তর দাও।
`;


    const result =
      await geminiModel.generateContent(
        prompt
      );


    const response =
      result.response;


    return response
      .text()
      .trim();


  } catch (error) {

    console.error(
      "Gemini Error:",
      error.message
    );


    return null;

  }

}


/*
==================================================
INCOMING WHATSAPP MESSAGE
==================================================
*/

app.post(
  "/webhook",
  async (req, res) => {

    /*
    WhatsApp-কে সঙ্গে সঙ্গে 200
    */

    res.sendStatus(200);


    try {

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
      Ignore status webhook
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
      VERY IMPORTANT:
      Actual sender number
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
      Text only
      */

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
      CHECK TRAIN NUMBER
      ==========================================
      */

      const trainNumber =
        findTrainNumber(
          userMessage
        );


      if (trainNumber) {

        console.log(
          "TRAIN NUMBER DETECTED:",
          trainNumber
        );


        const liveData =
          await getLiveTrain(
            trainNumber
          );


        if (liveData) {

          const liveMessage =
            formatLiveStatus(
              liveData
            );


          if (liveMessage) {

            await sendWhatsAppMessage(
              from,
              liveMessage
            );


            console.log(
              "LIVE TRAIN RESPONSE SENT"
            );


            return;

          }

        }

      }


      /*
      ==========================================
      ROUTE DETECTION
      ==========================================
      */

      const route =
        detectRoute(
          userMessage
        );


      console.log(
        "SOURCE:",
        route.source
      );


      console.log(
        "DESTINATION:",
        route.destination
      );


      /*
      ==========================================
      TRAIN BETWEEN STATIONS
      ==========================================
      */

      let railwayData =
        null;


      let formattedTrainData =
        null;


      if (
        route.source &&
        route.destination
      ) {

        const date =
          getTodayIST();


        const afterTime =
          extractAfterTime(
            userMessage
          );


        console.log(
          "JOURNEY DATE:",
          date
        );


        console.log(
          "AFTER TIME:",
          afterTime
        );


        railwayData =
          await getTrainsBetween(

            route.source,

            route.destination,

            date

          );


        formattedTrainData =
          formatTrains(

            railwayData,

            afterTime

          );


        if (
          formattedTrainData
        ) {

          await sendWhatsAppMessage(

            from,

            formattedTrainData

          );


          console.log(
            "TRAIN LIST RESPONSE SENT"
          );


          return;

        }

      }


      /*
      ==========================================
      GEMINI FALLBACK
      ==========================================
      */

      const aiReply =
        await askGemini(

          userMessage,

          formattedTrainData ||
          (
            railwayData
              ? JSON.stringify(
                  railwayData
                )
              : null
          )

        );


      const finalReply =
        aiReply ||

        "দুঃখিত, এই মুহূর্তে তথ্য পাওয়া যাচ্ছে না। অনুগ্রহ করে কিছুক্ষণ পরে আবার চেষ্টা করুন।";


      console.log(
        "AI REPLY:",
        finalReply
      );


      await sendWhatsAppMessage(

        from,

        finalReply

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
        "WEBHOOK ERROR:",
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
      "Gemini API:",
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
      "RailRadar API:",
      RAILRADAR_API_KEY
        ? "OK"
        : "MISSING"
    );

    console.log(
      "================================"
    );

  }
);

