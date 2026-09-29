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

const RAILRADAR_BASE = "https://api.railradar.in";

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : null;

/* =========================================================
   BASIC HELPERS
========================================================= */

function getISTDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function bengaliToEnglishDigits(text) {
  if (!text) return text;

  const map = {
    "০": "0",
    "১": "1",
    "২": "2",
    "৩": "3",
    "৪": "4",
    "৫": "5",
    "৬": "6",
    "৭": "7",
    "৮": "8",
    "৯": "9"
  };

  return String(text).replace(/[০-৯]/g, d => map[d]);
}

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map(item => cleanText(item))
      .filter(Boolean)
      .join(", ");
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, val]) => {
        const cleaned = cleanText(val);
        return cleaned ? `${key}: ${cleaned}` : "";
      })
      .filter(Boolean)
      .join(", ");
  }

  return String(value);
}

function firstValue(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return value;
    }
  }

  return null;
}

/* =========================================================
   RAILRADAR REQUEST
========================================================= */

async function railRadarRequest(path, params = {}) {
  if (!RAILRADAR_API_KEY) {
    throw new Error("RAILRADAR_API_KEY is missing");
  }

  const url = `${RAILRADAR_BASE}${path}`;

  console.log("RailRadar Request:", url);
  console.log("RailRadar Params:", params);

  const response = await axios.get(url, {
    params,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${RAILRADAR_API_KEY}`,
      "x-api-key": RAILRADAR_API_KEY
    },
    timeout: 15000
  });

  return response.data;
}

/* =========================================================
   TRAIN NUMBER EXTRACTION
========================================================= */

function extractTrainNumber(text) {
  const normalized = bengaliToEnglishDigits(text || "");

  const patterns = [
    /(?:train|ট্রেন)\s*(?:no|number|নং|নম্বর)?\s*[:\-]?\s*(\d{4,6})/i,
    /\b(\d{4,6})\b/
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);

    if (match) {
      return match[1];
    }
  }

  return null;
}

/* =========================================================
   PNR EXTRACTION
========================================================= */

function extractPNR(text) {
  const normalized = bengaliToEnglishDigits(text || "");

  const match = normalized.match(/\b\d{10}\b/);

  return match ? match[0] : null;
}

/* =========================================================
   STATION NORMALIZATION
========================================================= */

const STATION_ALIASES = {
  "শান্তিপুর": "Santipur",
  "সান্তিপুর": "Santipur",
  "santipur": "Santipur",

  "শিয়ালদা": "Sealdah",
  "শিয়ালদা": "Sealdah",
  "sealdah": "Sealdah",

  "কলকাতা": "Kolkata",
  "কলকাতা স্টেশন": "Kolkata",
  "kolkata": "Kolkata",

  "নৈহাটি": "Naihati",
  "naihati": "Naihati",

  "রানাঘাট": "Ranaghat",
  "ranaghat": "Ranaghat",

  "কৃষ্ণনগর": "Krishnanagar",
  "কৃষ্ণনগর সিটি": "Krishnanagar",
  "krishnanagar": "Krishnanagar",

  "কল্যাণী": "Kalyani",
  "kalyani": "Kalyani",

  "ব্যারাকপুর": "Barrackpore",
  "barrackpore": "Barrackpore",

  "বিধাননগর": "Bidhan Nagar",
  "bidhan nagar": "Bidhan Nagar",

  "দমদম": "Dum Dum",
  "dum dum": "Dum Dum"
};

function normalizeStationName(name) {
  if (!name) return null;

  const cleaned = String(name)
    .trim()
    .toLowerCase();

  return STATION_ALIASES[cleaned] || name.trim();
}

/* =========================================================
   STATION EXTRACTION
========================================================= */

function extractStations(text) {
  const original = text || "";
  const normalized = original.toLowerCase();

  let from = null;
  let to = null;

  const stationNames = Object.keys(STATION_ALIASES)
    .sort((a, b) => b.length - a.length);

  for (const alias of stationNames) {
    if (!normalized.includes(alias.toLowerCase())) {
      continue;
    }

    const canonical = STATION_ALIASES[alias];

    const fromPatterns = [
      `${alias} থেকে`,
      `from ${alias}`,
      `${alias} theke`
    ];

    const toPatterns = [
      `থেকে ${alias}`,
      `to ${alias}`,
      `গামী ${alias}`,
      `গামী${alias}`
    ];

    for (const pattern of fromPatterns) {
      if (normalized.includes(pattern.toLowerCase())) {
        from = canonical;
      }
    }

    for (const pattern of toPatterns) {
      if (normalized.includes(pattern.toLowerCase())) {
        to = canonical;
      }
    }
  }

  return {
    from,
    to
  };
}

/* =========================================================
   DATE EXTRACTION
========================================================= */

function extractDate(text) {
  const normalized = bengaliToEnglishDigits(text || "");
  const today = getISTDate();

  if (
    normalized.includes("আজ") ||
    normalized.toLowerCase().includes("today")
  ) {
    return today;
  }

  const now = new Date();

  if (
    normalized.includes("কাল") ||
    normalized.toLowerCase().includes("tomorrow")
  ) {
    now.setDate(now.getDate() + 1);

    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(now);
  }

  const match = normalized.match(
    /\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/
  );

  if (match) {
    let day = Number(match[1]);
    let month = Number(match[2]);
    let year = match[3]
      ? Number(match[3])
      : Number(
          new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Kolkata",
            year: "numeric"
          }).format(new Date())
        );

    if (year < 100) {
      year += 2000;
    }

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return today;
}

/* =========================================================
   TIME EXTRACTION
========================================================= */

function extractAfterHour(text) {
  const normalized = bengaliToEnglishDigits(text || "").toLowerCase();

  const patterns = [
    /(\d{1,2})\s*(?:টা|ঘণ্টা|ঘন্টা)\s*(?:র|এর)?\s*পর/,
    /(\d{1,2})\s*(?:am|pm)\s*(?:after|later)/i,
    /after\s*(\d{1,2})/i
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);

    if (match) {
      let hour = Number(match[1]);

      if (hour >= 0 && hour <= 23) {
        return hour;
      }
    }
  }

  return null;
}

/* =========================================================
   RAILRADAR LIVE STATUS
========================================================= */

async function getLiveTrainStatus(trainNumber) {
  try {
    const data = await railRadarRequest(
      `/api/v1/trains/${trainNumber}/live`
    );

    return data;
  } catch (error) {
    console.error(
      "Live Train Status Error:",
      error.response?.data || error.message
    );

    return null;
  }
}

/* =========================================================
   PNR STATUS
========================================================= */

async function getPNRStatus(pnr) {
  try {
    const possiblePaths = [
      `/api/v1/pnr/${pnr}`,
      `/api/v1/pnr/status/${pnr}`,
      `/api/pnr/${pnr}`
    ];

    for (const path of possiblePaths) {
      try {
        const data = await railRadarRequest(path);

        if (data) {
          return data;
        }
      } catch (error) {
        console.log(
          "PNR endpoint failed:",
          path,
          error.response?.status || error.message
        );
      }
    }

    return null;
  } catch (error) {
    console.error(
      "PNR Status Error:",
      error.response?.data || error.message
    );

    return null;
  }
}

/* =========================================================
   SAFE PNR FORMATTER
========================================================= */

function formatPNRResponse(data, pnr) {
  if (!data) {
    return `PNR ${pnr} এর জন্য বর্তমানে কোনো তথ্য পাওয়া যায়নি।`;
  }

  const root =
    data.data ||
    data.result ||
    data.response ||
    data;

  const trainNumber = firstValue(
    root.trainNumber,
    root.trainNo,
    root.train_number,
    root.train
  );

  const trainName = firstValue(
    root.trainName,
    root.train_name
  );

  const chartStatus = firstValue(
    root.chartStatus,
    root.chart_status,
    root.chartPrepared
  );

  const bookingStatus = firstValue(
    root.bookingStatus,
    root.booking_status
  );

  const currentStatus = firstValue(
    root.currentStatus,
    root.current_status
  );

  const passengerList = firstValue(
    root.passengers,
    root.passengerDetails,
    root.passenger_details
  );

  const lines = [];

  lines.push(`🎫 *PNR Status*`);
  lines.push(`PNR: ${pnr}`);

  if (trainNumber) {
    lines.push(`🚆 Train: ${cleanText(trainNumber)}`);
  }

  if (trainName) {
    lines.push(`📍 Train Name: ${cleanText(trainName)}`);
  }

  if (chartStatus) {
    lines.push(`📋 Chart: ${cleanText(chartStatus)}`);
  }

  if (bookingStatus) {
    lines.push(
      `🎟️ Booking Status: ${cleanText(bookingStatus)}`
    );
  }

  if (currentStatus) {
    lines.push(
      `🪑 Current Status: ${cleanText(currentStatus)}`
    );
  }

  if (passengerList) {
    if (Array.isArray(passengerList)) {
      lines.push("");
      lines.push("👤 Passenger Details:");

      passengerList.forEach((passenger, index) => {
        if (typeof passenger === "object") {
          const booking = firstValue(
            passenger.bookingStatus,
            passenger.booking_status,
            passenger.booking
          );

          const current = firstValue(
            passenger.currentStatus,
            passenger.current_status,
            passenger.current
          );

          const coach = firstValue(
            passenger.coach,
            passenger.coachNumber,
            passenger.coach_number
          );

          const berth = firstValue(
            passenger.berth,
            passenger.berthNumber,
            passenger.berth_number
          );

          const parts = [];

          if (booking) {
            parts.push(`Booking: ${cleanText(booking)}`);
          }

          if (current) {
            parts.push(`Current: ${cleanText(current)}`);
          }

          if (coach) {
            parts.push(`Coach: ${cleanText(coach)}`);
          }

          if (berth) {
            parts.push(`Berth: ${cleanText(berth)}`);
          }

          lines.push(
            `${index + 1}. ${parts.join(" | ") || cleanText(passenger)}`
          );
        } else {
          lines.push(`${index + 1}. ${cleanText(passenger)}`);
        }
      });
    } else {
      lines.push(
        `👤 Passenger: ${cleanText(passengerList)}`
      );
    }
  }

  if (lines.length <= 2) {
    lines.push(
      "ℹ️ API থেকে তথ্য পাওয়া গেছে, কিন্তু বিস্তারিত status field পাওয়া যায়নি।"
    );
  }

  return lines.join("\n");
}

/* =========================================================
   BETWEEN STATIONS
========================================================= */

async function getBetweenStations(from, to, date) {
  try {
    const paths = [
      "/api/v1/between",
      "/api/v1/trains/between",
      "/api/between"
    ];

    const paramsList = [
      {
        from,
        to,
        date
      },
      {
        source: from,
        destination: to,
        date
      },
      {
        fromStation: from,
        toStation: to,
        date
      }
    ];

    for (const path of paths) {
      for (const params of paramsList) {
        try {
          const data = await railRadarRequest(
            path,
            params
          );

          if (data) {
            return data;
          }
        } catch (error) {
          console.log(
            "Between endpoint failed:",
            path,
            error.response?.status || error.message
          );
        }
      }
    }

    return null;
  } catch (error) {
    console.error(
      "Between Stations Error:",
      error.response?.data || error.message
    );

    return null;
  }
}
