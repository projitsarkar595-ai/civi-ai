// ============================================================
// CIVICAI — COMPLETE BACKEND SERVER
// ============================================================
//
// Frontend compatible with:
//   /api/chat
//   /api/analyze
//   /api/transcribe
//
// Also supports:
//   Gmail OTP
//   Phone OTP / Twilio
//
// IMPORTANT:
// Create a .env file beside this server.js
//
// Required AI:
// GEMINI_API_KEY=YOUR_GEMINI_API_KEY
//
// Optional Gmail OTP:
// GMAIL_USER=yourgmail@gmail.com
// GMAIL_APP_PASSWORD=your-gmail-app-password
//
// Optional Twilio OTP:
// TWILIO_ACCOUNT_SID=xxxx
// TWILIO_AUTH_TOKEN=xxxx
// TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
//
// ============================================================

"use strict";

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import twilio from "twilio";

// Gemini
import { GoogleGenerativeAI } from "@google/generative-ai";

// ============================================================
// BASIC SETUP
// ============================================================

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = Number(process.env.PORT || 3000);

// ============================================================
// ENVIRONMENT
// ============================================================

const GEMINI_API_KEY =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    "";

const GMAIL_USER =
    process.env.GMAIL_USER ||
    process.env.EMAIL_USER ||
    "";

const GMAIL_APP_PASSWORD =
    process.env.GMAIL_APP_PASSWORD ||
    process.env.EMAIL_PASS ||
    "";

const TWILIO_ACCOUNT_SID =
    process.env.TWILIO_ACCOUNT_SID ||
    "";

const TWILIO_AUTH_TOKEN =
    process.env.TWILIO_AUTH_TOKEN ||
    "";

const TWILIO_PHONE_NUMBER =
    process.env.TWILIO_PHONE_NUMBER ||
    "";

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(
    cors({
        origin: true,
        credentials: true
    })
);

app.use(
    express.json({
        limit: "25mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "25mb"
    })
);

// ============================================================
// FRONTEND DIRECTORY
// ============================================================
//
// This server assumes your HTML is in the same folder as
// server.js.
//
// Example:
//
// CivicAI/
// ├── server.js
// ├── index.html
// ├── login.html
// ├── register.html
// └── ...
//
// If your HTML files are inside a client folder, change:
// FRONTEND_DIR = path.join(__dirname, "client");
//
// ============================================================

const FRONTEND_DIR = __dirname;

app.use(
    express.static(FRONTEND_DIR, {
        extensions: ["html"],
        index: false
    })
);

// ============================================================
// GEMINI SETUP
// ============================================================

let gemini = null;

if (GEMINI_API_KEY) {
    gemini = new GoogleGenerativeAI(GEMINI_API_KEY);
    console.log("✓ Gemini API configured");
} else {
    console.warn(
        "⚠ GEMINI_API_KEY is missing. AI endpoints will not work until it is added."
    );
}

// ============================================================
// GEMINI MODEL
// ============================================================

function getGeminiModel() {
    if (!gemini) {
        throw new Error(
            "Gemini API key is not configured. Add GEMINI_API_KEY to .env"
        );
    }

    return gemini.getGenerativeModel({
        model: "gemini-2.5-flash"
    });
}

// ============================================================
// SAFE STRING
// ============================================================

function safeString(value, fallback = "") {
    if (value === undefined || value === null) {
        return fallback;
    }

    return String(value);
}

// ============================================================
// REMOVE MARKDOWN CODE FENCES
// ============================================================

function cleanAIText(text) {
    return safeString(text)
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/i, "")
        .trim();
}

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        service: "CivicAI",
        status: "online",
        port: PORT,
        ai: Boolean(GEMINI_API_KEY),
        gmailOTP: Boolean(
            GMAIL_USER && GMAIL_APP_PASSWORD
        ),
        phoneOTP: Boolean(
            TWILIO_ACCOUNT_SID &&
            TWILIO_AUTH_TOKEN &&
            TWILIO_PHONE_NUMBER
        ),
        endpoints: [
            "POST /api/chat",
            "POST /api/analyze",
            "POST /api/transcribe"
        ]
    });
});

// ============================================================
// NORMAL CIVICAI CHAT
// ============================================================

app.post("/api/chat", async (req, res) => {

    try {

        const message = safeString(req.body?.message).trim();

        const conversation = Array.isArray(
            req.body?.conversation
        )
            ? req.body.conversation
            : [];

        if (!message) {
            return res.status(400).json({
                success: false,
                error: "Message is required."
            });
        }

        const model = getGeminiModel();

        // ----------------------------------------------------
        // Build previous conversation
        // ----------------------------------------------------

        let historyText = "";

        const recentConversation =
            conversation.slice(-20);

        if (recentConversation.length) {

            historyText =
                recentConversation
                    .map(item => {

                        const role =
                            item.role === "assistant"
                                ? "CivicAI"
                                : "User";

                        return `${role}: ${safeString(
                            item.content
                        )}`;

                    })
                    .join("\n\n");
        }

        // ----------------------------------------------------
        // CivicAI normal assistant personality
        // ----------------------------------------------------

        const systemInstruction = `
You are CivicAI, a helpful AI life assistant.

Your job is to have a natural, friendly, intelligent conversation.

IMPORTANT:

1. Behave like a normal modern AI assistant.
2. Do NOT automatically turn every conversation into a civic complaint.
3. Do NOT generate "Problem", "Category", "Severity", "Department",
   "Authority", "Recommendation" etc. unless the user actually asks
   about a civic problem, report, complaint or authority.
4. If the user asks a normal question, answer normally.
5. If the user asks about programming, explain programming normally.
6. If the user asks about products, explain products naturally.
7. If the user asks about a civic issue, you may explain the issue,
   suggest the correct authority and help prepare a complaint.
8. Never pretend that you contacted an authority unless the backend
   actually did so.
9. Do not invent phone numbers, email addresses or official websites.
10. If information is uncertain, clearly say that it should be verified.
11. Answer in the language used by the user whenever possible.
12. If the user writes Bengali, answer naturally in Bengali.
13. If the user writes English, answer in English.
14. If the user mixes Bengali and English, you may naturally mix them.
15. Keep answers clear and useful.
16. Do not unnecessarily repeat the user's question.

Previous conversation:

${historyText}

Current user message:

${message}
`;

        const result =
            await model.generateContent(
                systemInstruction
            );

        const response =
            result?.response;

        const answer =
            response?.text?.() ||
            "I couldn't generate a response.";

        return res.json({
            success: true,
            answer: answer.trim()
        });

    } catch (error) {

        console.error(
            "CHAT ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                "CivicAI chat failed."
        });
    }
});

// ============================================================
// IMAGE / PRODUCT ANALYSIS
// ============================================================

app.post("/api/analyze", async (req, res) => {

    try {

        const description =
            safeString(
                req.body?.description
            ).trim();

        const location =
            safeString(
                req.body?.location
            ).trim();

        const reporterName =
            safeString(
                req.body?.reporterName,
                "CivicAI User"
            );

        const image =
            safeString(
                req.body?.image
            ).trim();

        if (!image) {
            return res.status(400).json({
                success: false,
                error: "Image is required."
            });
        }

        // ----------------------------------------------------
        // Validate data URL
        // ----------------------------------------------------

        if (
            !image.startsWith(
                "data:image/"
            )
        ) {

            return res.status(400).json({
                success: false,
                error:
                    "Invalid image format. Please upload a valid image."
            });
        }

        // ----------------------------------------------------
        // Extract MIME and Base64
        // ----------------------------------------------------

        const match =
            image.match(
                /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
            );

        if (!match) {

            return res.status(400).json({
                success: false,
                error:
                    "Invalid image data."
            });
        }

        const mimeType = match[1];
        const base64Data = match[2];

        // ----------------------------------------------------
        // Gemini
        // ----------------------------------------------------

        const model =
            getGeminiModel();

        const prompt = `
You are CivicAI's visual AI assistant.

Analyze the uploaded image naturally and intelligently.

IMPORTANT:

- Do NOT assume this is a civic complaint.
- First determine what the image appears to contain.
- If it is a product, explain the product naturally.
- If it is medicine, identify only what can reasonably be identified
  from the image and clearly mention uncertainty.
- If it is a civic problem such as road damage, garbage, water leakage,
  drainage, streetlight, pollution, broken infrastructure etc.,
  explain that naturally.
- If the user provided a description, use it as additional context.
- If the image is unclear, say so.
- Never invent text that cannot be read.
- Never claim a product is safe or unsafe with certainty from an image alone.
- Never provide a medical diagnosis.

User description:
${description || "No additional description provided."}

Location:
${location || "Not provided."}

Reporter:
${reporterName}

Return a helpful natural-language answer suitable for a normal AI chat.
Do not force a report template unless the image clearly represents
a civic problem or the user asks for a report.
`;

        const result =
            await model.generateContent([
                {
                    text: prompt
                },
                {
                    inlineData: {
                        mimeType,
                        data: base64Data
                    }
                }
            ]);

        const answer =
            result?.response?.text?.() ||
            "I couldn't analyze this image.";

        return res.json({
            success: true,
            answer: answer.trim()
        });

    } catch (error) {

        console.error(
            "IMAGE ANALYSIS ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                "Image analysis failed."
        });
    }
});

// ============================================================
// VOICE TRANSCRIPTION
// ============================================================
//
// Frontend sends:
//
// {
//   audio: base64,
//   mimeType: "audio/webm",
//   languageHint: "en-IN"
// }
//
// Gemini multimodal audio is used to detect/transcribe the
// spoken language.
//
// ============================================================

app.post("/api/transcribe", async (req, res) => {

    try {

        const audio =
            safeString(
                req.body?.audio
            ).trim();

        const mimeType =
            safeString(
                req.body?.mimeType,
                "audio/webm"
            );

        const languageHint =
            safeString(
                req.body?.languageHint,
                "en-IN"
            );

        if (!audio) {

            return res.status(400).json({
                success: false,
                error:
                    "Audio data is required."
            });
        }

        const model =
            getGeminiModel();

        // ----------------------------------------------------
        // Ask Gemini to detect language and transcribe
        // ----------------------------------------------------

        const prompt = `
You are CivicAI's voice transcription engine.

Listen carefully to this audio.

Your task:

1. Detect the spoken language.
2. Transcribe the user's actual spoken words.
3. Preserve the original language/script whenever possible.
4. Bengali speech should be returned in Bengali script.
5. Hindi speech should be returned in Devanagari.
6. English speech should be returned in English.
7. Do not translate the sentence.
8. Do not summarize.
9. Do not add explanations.
10. Do not add words that were not spoken.
11. If the audio contains mixed Bengali and English, preserve
    the natural mixed language.
12. Return JSON only.

The user's browser language hint is:
${languageHint}

Return exactly:

{
  "language": "detected language",
  "text": "exact transcription"
}
`;

        const result =
            await model.generateContent([
                {
                    text: prompt
                },
                {
                    inlineData: {
                        mimeType,
                        data: audio
                    }
                }
            ]);

        let raw =
            result?.response?.text?.() ||
            "";

        raw = cleanAIText(raw);

        let parsed;

        try {

            parsed =
                JSON.parse(raw);

        } catch {

            // -----------------------------------------------
            // Gemini sometimes returns extra text.
            // Try extracting JSON object.
            // -----------------------------------------------

            const jsonMatch =
                raw.match(
                    /\{[\s\S]*\}/
                );

            if (jsonMatch) {

                try {
                    parsed =
                        JSON.parse(
                            jsonMatch[0]
                        );
                } catch {
                    parsed = null;
                }

            } else {
                parsed = null;
            }
        }

        if (!parsed) {

            return res.json({
                success: true,
                language: "",
                text: raw.trim()
            });
        }

        return res.json({
            success: true,
            language:
                safeString(
                    parsed.language
                ),
            text:
                safeString(
                    parsed.text
                ).trim()
        });

    } catch (error) {

        console.error(
            "TRANSCRIPTION ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                "Voice transcription failed."
        });
    }
});

// ============================================================
// GMAIL OTP
// ============================================================

const otpStore = new Map();

// OTP expiry = 5 minutes
const OTP_EXPIRY = 5 * 60 * 1000;

// Generate OTP
function generateOTP() {
    return String(
        Math.floor(
            100000 +
            Math.random() * 900000
        )
    );
}

// Create Gmail transporter
let mailTransporter = null;

if (
    GMAIL_USER &&
    GMAIL_APP_PASSWORD
) {

    mailTransporter =
        nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: GMAIL_USER,
                pass: GMAIL_APP_PASSWORD
            }
        });

    console.log(
        "✓ Gmail OTP configured"
    );

} else {

    console.warn(
        "⚠ Gmail OTP is not configured."
    );
}

// ============================================================
// SEND EMAIL OTP
// ============================================================

app.post(
    "/api/send-email-otp",
    async (req, res) => {

        try {

            const email =
                safeString(
                    req.body?.email
                )
                    .trim()
                    .toLowerCase();

            if (!email) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Email address is required."
                });
            }

            if (!mailTransporter) {

                return res.status(500).json({
                    success: false,
                    error:
                        "Gmail OTP is not configured on the server."
                });
            }

            const otp =
                generateOTP();

            otpStore.set(
                `email:${email}`,
                {
                    otp,
                    expires:
                        Date.now() +
                        OTP_EXPIRY,
                    attempts: 0
                }
            );

            await mailTransporter.sendMail({
                from:
                    `"CivicAI" <${GMAIL_USER}>`,
                to: email,
                subject:
                    "Your CivicAI verification OTP",
                text:
                    `Your CivicAI verification code is ${otp}. This code will expire in 5 minutes.`,
                html: `
                    <div style="
                        font-family:Arial,sans-serif;
                        background:#f5f7fb;
                        padding:30px;
                    ">
                        <div style="
                            max-width:520px;
                            margin:auto;
                            background:white;
                            border-radius:16px;
                            padding:30px;
                            box-shadow:0 10px 30px rgba(0,0,0,.08);
                        ">
                            <h2 style="margin:0 0 10px;">
                                CivicAI
                            </h2>

                            <p>
                                Your verification code is:
                            </p>

                            <div style="
                                font-size:34px;
                                font-weight:bold;
                                letter-spacing:8px;
                                margin:25px 0;
                            ">
                                ${otp}
                            </div>

                            <p style="color:#666;">
                                This OTP will expire in 5 minutes.
                            </p>
                        </div>
                    </div>
                `
            });

            return res.json({
                success: true,
                message:
                    "OTP sent successfully."
            });

        } catch (error) {

            console.error(
                "EMAIL OTP ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error?.message ||
                    "Failed to send email OTP."
            });
        }
    }
);

// ============================================================
// VERIFY EMAIL OTP
// ============================================================

app.post(
    "/api/verify-email-otp",
    (req, res) => {

        try {

            const email =
                safeString(
                    req.body?.email
                )
                    .trim()
                    .toLowerCase();

            const otp =
                safeString(
                    req.body?.otp
                ).trim();

            if (!email || !otp) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Email and OTP are required."
                });
            }

            const key =
                `email:${email}`;

            const record =
                otpStore.get(key);

            if (!record) {

                return res.status(400).json({
                    success: false,
                    error:
                        "OTP not found or expired."
                });
            }

            if (
                Date.now() >
                record.expires
            ) {

                otpStore.delete(key);

                return res.status(400).json({
                    success: false,
                    error:
                        "OTP expired. Please request a new OTP."
                });
            }

            record.attempts++;

            if (
                record.attempts > 5
            ) {

                otpStore.delete(key);

                return res.status(429).json({
                    success: false,
                    error:
                        "Too many incorrect attempts."
                });
            }

            if (
                record.otp !== otp
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Incorrect OTP."
                });
            }

            otpStore.delete(key);

            return res.json({
                success: true,
                verified: true,
                message:
                    "Email verified successfully."
            });

        } catch (error) {

            console.error(
                "EMAIL VERIFY ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    "Email OTP verification failed."
            });
        }
    }
);

// ============================================================
// TWILIO SETUP
// ============================================================

let twilioClient = null;

if (
    TWILIO_ACCOUNT_SID &&
    TWILIO_AUTH_TOKEN &&
    TWILIO_PHONE_NUMBER
) {

    twilioClient =
        twilio(
            TWILIO_ACCOUNT_SID,
            TWILIO_AUTH_TOKEN
        );

    console.log(
        "✓ Twilio phone OTP configured"
    );

} else {

    console.warn(
        "⚠ Twilio phone OTP is not configured."
    );
}

// ============================================================
// SEND PHONE OTP
// ============================================================

app.post(
    "/api/send-phone-otp",
    async (req, res) => {

        try {

            const phone =
                safeString(
                    req.body?.phone
                ).trim();

            if (!phone) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Phone number is required."
                });
            }

            if (!twilioClient) {

                return res.status(500).json({
                    success: false,
                    error:
                        "Twilio OTP is not configured on the server."
                });
            }

            const otp =
                generateOTP();

            otpStore.set(
                `phone:${phone}`,
                {
                    otp,
                    expires:
                        Date.now() +
                        OTP_EXPIRY,
                    attempts: 0
                }
            );

            await twilioClient.messages.create({
                body:
                    `Your CivicAI verification code is ${otp}. It expires in 5 minutes.`,
                from:
                    TWILIO_PHONE_NUMBER,
                to: phone
            });

            return res.json({
                success: true,
                message:
                    "OTP sent successfully."
            });

        } catch (error) {

            console.error(
                "PHONE OTP ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error?.message ||
                    "Failed to send phone OTP."
            });
        }
    }
);

// ============================================================
// VERIFY PHONE OTP
// ============================================================

app.post(
    "/api/verify-phone-otp",
    (req, res) => {

        try {

            const phone =
                safeString(
                    req.body?.phone
                ).trim();

            const otp =
                safeString(
                    req.body?.otp
                ).trim();

            if (!phone || !otp) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Phone number and OTP are required."
                });
            }

            const key =
                `phone:${phone}`;

            const record =
                otpStore.get(key);

            if (!record) {

                return res.status(400).json({
                    success: false,
                    error:
                        "OTP not found or expired."
                });
            }

            if (
                Date.now() >
                record.expires
            ) {

                otpStore.delete(key);

                return res.status(400).json({
                    success: false,
                    error:
                        "OTP expired. Please request a new OTP."
                });
            }

            record.attempts++;

            if (
                record.attempts > 5
            ) {

                otpStore.delete(key);

                return res.status(429).json({
                    success: false,
                    error:
                        "Too many incorrect attempts."
                });
            }

            if (
                record.otp !== otp
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Incorrect OTP."
                });
            }

            otpStore.delete(key);

            return res.json({
                success: true,
                verified: true,
                message:
                    "Phone number verified successfully."
            });

        } catch (error) {

            console.error(
                "PHONE VERIFY ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    "Phone OTP verification failed."
            });
        }
    }
);

// ============================================================
// FRONTEND ROUTES
// ============================================================

function sendFrontendFile(
    filename,
    res
) {

    const filePath =
        path.join(
            FRONTEND_DIR,
            filename
        );

    if (
        fs.existsSync(filePath)
    ) {

        return res.sendFile(
            filePath
        );
    }

    return res.status(404).send(
        `${filename} not found`
    );
}

// ============================================================
// INDEX
// ============================================================

app.get(
    "/",
    (req, res) => {

        // If index.html exists
        if (
            fs.existsSync(
                path.join(
                    FRONTEND_DIR,
                    "index.html"
                )
            )
        ) {

            return sendFrontendFile(
                "index.html",
                res
            );
        }

        // If the provided Life Helper HTML
        // is saved as citizen.html
        if (
            fs.existsSync(
                path.join(
                    FRONTEND_DIR,
                    "citizen.html"
                )
            )
        ) {

            return sendFrontendFile(
                "citizen.html",
                res
            );
        }

        return res.status(404).send(
            "CivicAI frontend file not found."
        );
    }
);

// ============================================================
// COMMON HTML PAGES
// ============================================================

app.get(
    "/index.html",
    (req, res) =>
        sendFrontendFile(
            "index.html",
            res
        )
);

app.get(
    "/login",
    (req, res) =>
        sendFrontendFile(
            "login.html",
            res
        )
);

app.get(
    "/register",
    (req, res) =>
        sendFrontendFile(
            "register.html",
            res
        )
);

app.get(
    "/report",
    (req, res) =>
        sendFrontendFile(
            "report.html",
            res
        )
);

app.get(
    "/citizen",
    (req, res) =>
        sendFrontendFile(
            "citizen.html",
            res
        )
);

// ============================================================
// 404 API HANDLER
// ============================================================

app.use(
    "/api",
    (req, res) => {

        res.status(404).json({
            success: false,
            error:
                `API endpoint not found: ${req.method} ${req.originalUrl}`
        });
    }
);

// ============================================================
// GENERAL 404
// ============================================================

app.use(
    (req, res) => {

        if (
            req.accepts("html")
        ) {

            return res.status(404).send(
                "CivicAI page not found."
            );
        }

        return res.status(404).json({
            success: false,
            error:
                "Route not found."
        });
    }
);

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use(
    (error, req, res, next) => {

        console.error(
            "GLOBAL SERVER ERROR:",
            error
        );

        if (res.headersSent) {
            return next(error);
        }

        res.status(500).json({
            success: false,
            error:
                error?.message ||
                "Internal server error."
        });
    }
);

// ============================================================
// START SERVER
// ============================================================

app.listen(
    PORT,
    () => {

        console.log("");
        console.log(
            "============================================================"
        );
        console.log(
            "                 CIVICAI SERVER"
        );
        console.log(
            "============================================================"
        );

        console.log(
            `✓ Server running: http://localhost:${PORT}`
        );

        console.log("");
        console.log(
            "AI ENDPOINTS:"
        );

        console.log(
            `  POST http://localhost:${PORT}/api/chat`
        );

        console.log(
            `  POST http://localhost:${PORT}/api/analyze`
        );

        console.log(
            `  POST http://localhost:${PORT}/api/transcribe`
        );

        console.log("");
        console.log(
            "OTP ENDPOINTS:"
        );

        console.log(
            `  POST http://localhost:${PORT}/api/send-email-otp`
        );

        console.log(
            `  POST http://localhost:${PORT}/api/verify-email-otp`
        );

        console.log(
            `  POST http://localhost:${PORT}/api/send-phone-otp`
        );

        console.log(
            `  POST http://localhost:${PORT}/api/verify-phone-otp`
        );

        console.log("");
        console.log(
            `✓ Health: http://localhost:${PORT}/api/health`
        );

        console.log("");
        console.log(
            "CONFIGURATION:"
        );

        console.log(
            `  Gemini: ${
                GEMINI_API_KEY
                    ? "READY"
                    : "NOT CONFIGURED"
            }`
        );

        console.log(
            `  Gmail OTP: ${
                mailTransporter
                    ? "READY"
                    : "NOT CONFIGURED"
            }`
        );

        console.log(
            `  Phone OTP: ${
                twilioClient
                    ? "READY"
                    : "NOT CONFIGURED"
            }`
        );

        console.log(
            "============================================================"
        );

        console.log("");
    }
);
