// ============================================================
// CIVICAI — FINAL FAST + COMPATIBLE SERVER.JS
// ============================================================
//
// AI
// ------------------------------------------------------------
// Normal Chat          -> Groq
// AI Life Helper       -> Groq
// Product Chat         -> Groq
// Image Chat           -> Groq Vision
// Authority Assistant  -> Groq
// Civic Analysis       -> Gemini
// Product Scanner      -> Gemini
//
// SERVICES
// ------------------------------------------------------------
// Email OTP            -> Gmail / Nodemailer
// Phone OTP            -> Twilio
// Reports              -> JSON
// Complaint Email      -> Gmail
//
// ============================================================

"use strict";

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import nodemailer from "nodemailer";
import twilio from "twilio";
import { fileURLToPath } from "url";

dotenv.config();

// ============================================================
// PATH
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// APP
// ============================================================

const app = express();

app.disable("x-powered-by");

const PORT = Number(process.env.PORT) || 3000;

// ============================================================
// BODY LIMIT
// ============================================================

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
// CORS
// ============================================================

app.use(
    cors({
        origin: true,
        credentials: true
    })
);

// ============================================================
// BASIC HELPERS
// ============================================================

function cleanText(value) {
    if (value === undefined || value === null) {
        return "";
    }

    return String(value).trim();
}

function generateSecureId(prefix = "") {
    return (
        prefix +
        crypto.randomBytes(16).toString("hex")
    );
}

// ============================================================
// DATA
// ============================================================

const DATA_DIR = path.join(__dirname, "data");
const REPORTS_FILE = path.join(DATA_DIR, "reports.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {
        recursive: true
    });
}

if (!fs.existsSync(REPORTS_FILE)) {
    fs.writeFileSync(
        REPORTS_FILE,
        "[]",
        "utf8"
    );
}

// ============================================================
// IMAGE
// ============================================================

function isImageDataUrl(image) {
    return (
        typeof image === "string" &&
        /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(image)
    );
}

function validateImage(image) {

    if (!image) {
        return {
            valid: false,
            error: "Image is required."
        };
    }

    if (!isImageDataUrl(image)) {
        return {
            valid: false,
            error: "Invalid image format."
        };
    }

    if (image.length > 7_000_000) {
        return {
            valid: false,
            error: "Image is too large. Please use a smaller image."
        };
    }

    return {
        valid: true
    };
}

function imageToGeminiPart(image) {

    const match = image.match(
        /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i
    );

    if (!match) {
        throw new Error("Invalid image data.");
    }

    return {
        inline_data: {
            mime_type: match[1],
            data: match[2]
        }
    };
}

// ============================================================
// GEMINI CONFIG
// ============================================================

const GEMINI_API_KEY =
    cleanText(process.env.GEMINI_API_KEY);

/*
 IMPORTANT:

 Keep this in .env if you already have a working model.

 Example:

 GEMINI_MODEL=gemini-2.5-flash

 If GEMINI_MODEL is missing, this fast model is used.
*/

const GEMINI_MODEL =
    cleanText(process.env.GEMINI_MODEL) ||
    "gemini-2.5-flash";

const GEMINI_API_URL =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ============================================================
// GROQ CONFIG
// ============================================================

const GROQ_API_KEY =
    cleanText(process.env.GROQ_API_KEY);

const GROQ_TEXT_MODEL =
    cleanText(process.env.GROQ_TEXT_MODEL) ||
    "llama-3.3-70b-versatile";

const GROQ_VISION_MODEL =
    cleanText(process.env.GROQ_VISION_MODEL) ||
    "meta-llama/llama-4-scout-17b-16e-instruct";

const GROQ_API_URL =
    "https://api.groq.com/openai/v1/chat/completions";

// ============================================================
// GMAIL
// ============================================================

const EMAIL_USER =
    cleanText(process.env.EMAIL_USER);

const EMAIL_PASSWORD =
    cleanText(process.env.EMAIL_PASSWORD);

const EMAIL_FROM =
    cleanText(process.env.EMAIL_FROM) ||
    EMAIL_USER;

let emailTransporter = null;

if (EMAIL_USER && EMAIL_PASSWORD) {

    try {

        emailTransporter =
            nodemailer.createTransport({
                service: "gmail",

                auth: {
                    user: EMAIL_USER,
                    pass: EMAIL_PASSWORD
                },

                connectionTimeout: 15000,
                greetingTimeout: 15000,
                socketTimeout: 20000
            });

    } catch (error) {

        console.error(
            "GMAIL INIT ERROR:",
            error.message
        );
    }
}

// ============================================================
// TWILIO
// ============================================================

const TWILIO_ACCOUNT_SID =
    cleanText(process.env.TWILIO_ACCOUNT_SID);

const TWILIO_AUTH_TOKEN =
    cleanText(process.env.TWILIO_AUTH_TOKEN);

const TWILIO_PHONE_NUMBER =
    cleanText(process.env.TWILIO_PHONE_NUMBER);

let twilioClient = null;

if (
    TWILIO_ACCOUNT_SID &&
    TWILIO_AUTH_TOKEN &&
    TWILIO_PHONE_NUMBER
) {

    try {

        twilioClient = twilio(
            TWILIO_ACCOUNT_SID,
            TWILIO_AUTH_TOKEN
        );

    } catch (error) {

        console.error(
            "TWILIO INIT ERROR:",
            error.message
        );
    }
}

// ============================================================
// CONFIG CHECK
// ============================================================

function hasGeminiKey() {
    return Boolean(
        GEMINI_API_KEY &&
        GEMINI_API_KEY.length > 10
    );
}

function hasGroqKey() {
    return Boolean(
        GROQ_API_KEY &&
        GROQ_API_KEY.length > 10
    );
}

function hasEmailConfig() {
    return Boolean(emailTransporter);
}

function hasTwilioConfig() {
    return Boolean(twilioClient);
}

// ============================================================
// CHAT HISTORY
// ============================================================

const chatSessions = new Map();

const CHAT_SESSION_TTL =
    30 * 60 * 1000;

const MAX_CHAT_SESSIONS = 500;

function cleanupChatSessions() {

    const now = Date.now();

    for (
        const [id, session]
        of chatSessions
    ) {

        if (
            !session ||
            now - session.updatedAt >
            CHAT_SESSION_TTL
        ) {

            chatSessions.delete(id);
        }
    }

    while (
        chatSessions.size >
        MAX_CHAT_SESSIONS
    ) {

        const first =
            chatSessions.keys().next().value;

        if (!first) break;

        chatSessions.delete(first);
    }
}

// ============================================================
// NORMALIZE HISTORY
// ============================================================

function normalizeHistory(history) {

    if (!Array.isArray(history)) {
        return [];
    }

    return history
        .slice(-12)
        .map(item => {

            const role =
                item?.role === "assistant" ||
                item?.role === "model"
                    ? "assistant"
                    : "user";

            const content =
                cleanText(
                    item?.content ??
                    item?.text ??
                    item?.message
                );

            if (!content) {
                return null;
            }

            return {
                role,
                content
            };
        })
        .filter(Boolean);
}

// ============================================================
// SESSION
// ============================================================

function getChatSessionId(body) {

    const supplied =
        cleanText(
            body?.conversationId ||
            body?.sessionId
        );

    const id =
        supplied ||
        generateSecureId("CHAT-");

    if (!chatSessions.has(id)) {

        chatSessions.set(
            id,
            {
                history: [],
                updatedAt: Date.now()
            }
        );
    }

    return id;
}

// ============================================================
// GROQ ERROR
// ============================================================

function getGroqErrorMessage(text) {

    try {

        const data = JSON.parse(text);

        return (
            data?.error?.message ||
            data?.error?.type ||
            "Groq API error."
        );

    } catch {

        return text || "Groq API error.";
    }
}

// ============================================================
// GROQ
// ============================================================

async function callGroq({

    systemPrompt,
    userText,
    history = [],
    image = null,
    temperature = 0.5,
    maxTokens = 1200

}) {

    if (!hasGroqKey()) {

        throw new Error(
            "GROQ_API_KEY is missing. Check your .env file."
        );
    }

    const messages = [];

    // SYSTEM

    messages.push({
        role: "system",
        content:
            systemPrompt ||
            "You are a helpful AI assistant."
    });

    // HISTORY

    const normalizedHistory =
        normalizeHistory(history);

    for (
        const item
        of normalizedHistory
    ) {

        messages.push({
            role: item.role,
            content: item.content
        });
    }

    // USER

    if (image) {

        const validation =
            validateImage(image);

        if (!validation.valid) {
            throw new Error(
                validation.error
            );
        }

        messages.push({
            role: "user",
            content: [
                {
                    type: "text",
                    text:
                        userText ||
                        "Please analyze this image."
                },
                {
                    type: "image_url",
                    image_url: {
                        url: image
                    }
                }
            ]
        });

    } else {

        messages.push({
            role: "user",
            content: userText || ""
        });
    }

    const model =
        image
            ? GROQ_VISION_MODEL
            : GROQ_TEXT_MODEL;

    const controller =
        new AbortController();

    const timeout =
        setTimeout(
            () => controller.abort(),
            45000
        );

    try {

        console.log(
            `[GROQ] ${model}`
        );

        const response =
            await fetch(
                GROQ_API_URL,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        Authorization:
                            `Bearer ${GROQ_API_KEY}`
                    },

                    body:
                        JSON.stringify({
                            model,

                            messages,

                            temperature,

                            max_completion_tokens:
                                maxTokens,

                            top_p: 1,

                            stream: false
                        }),

                    signal: controller.signal
                }
            );

        const responseText =
            await response.text();

        if (!response.ok) {

            throw new Error(
                `Groq API ${response.status}: ${getGroqErrorMessage(responseText)}`
            );
        }

        let data;

        try {

            data =
                JSON.parse(responseText);

        } catch {

            throw new Error(
                "Groq returned invalid JSON."
            );
        }

        const answer =
            data?.choices?.[0]?.message?.content;

        if (!answer) {

            throw new Error(
                "Groq returned an empty response."
            );
        }

        return {
            answer: String(answer).trim(),
            model,
            usage: data?.usage || null
        };

    } catch (error) {

        if (
            error?.name === "AbortError"
        ) {

            throw new Error(
                "Groq request timed out."
            );
        }

        throw error;

    } finally {

        clearTimeout(timeout);
    }
}

// ============================================================
// NORMAL CHAT PROMPT
// ============================================================

const NORMAL_CHAT_PROMPT = `
You are CivicAI AI Life Helper.

Have a natural conversation.

Answer the user's actual question.

Do not automatically create civic reports.

Do not automatically create complaints.

Do not claim that a report was submitted.

You can help with:
education, science, mathematics,
technology, programming, HTML, CSS,
JavaScript, Node.js, AI, civic issues,
government services and general questions.

If a user describes a civic problem,
you may explain what department normally handles it.

Never invent:
phone numbers,
emails,
websites,
complaint IDs,
tracking IDs,
or submission confirmations.

Use the user's language.

Bengali -> Bengali.
English -> English.
Banglish -> Banglish.
Mixed -> natural mixed language.

Be friendly, concise and natural.

Do not return JSON.
Do not mention internal API implementation.
Do not mention API keys.
Do not mention model switching.
`;

// ============================================================
// PRODUCT CHAT PROMPT
// ============================================================

const PRODUCT_CHAT_PROMPT = `
You are CivicAI Product Live Helper.

Answer questions about the scanned product.

Use the supplied product analysis as context.

Never invent:
price,
ingredients,
expiry date,
manufacturer,
batch number,
specifications.

If information is unavailable,
say that it is not available.

For medicine:

Do not diagnose.
Do not prescribe.
Do not give personalized dosage.
Do not tell the user to change medication.

Only explain visible label information
and general safety information.

Use the user's language.

Bengali -> Bengali.
English -> English.
Banglish -> Banglish.
Mixed -> natural mixed language.

Be natural and helpful.

Do not return JSON.
Do not mention Gemini.
Do not mention API implementation.
`;

// ============================================================
// AUTHORITY PROMPT
// ============================================================

const AUTHORITY_PROMPT = `
You are CivicAI Authority Assistant.

Help identify the likely responsible authority
for the civic problem.

Do not invent:
phone numbers,
emails,
government websites,
complaint links.

If contact information is not supplied,
say "Not verified."

Use the user's language.

Answer naturally.
Do not return JSON.
`;

// ============================================================
// /api/chat
// ============================================================

app.post(
    "/api/chat",
    async (req, res) => {

        try {

            cleanupChatSessions();

            const body =
                req.body || {};

            const message =
                cleanText(
                    body.message ||
                    body.question ||
                    body.prompt ||
                    body.text
                );

            const image =
                isImageDataUrl(body.image)
                    ? body.image
                    : null;

            if (!message && !image) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Message or image is required."
                });
            }

            const conversationId =
                getChatSessionId(body);

            const session =
                chatSessions.get(
                    conversationId
                );

            const clientHistory =
                normalizeHistory(
                    body.history
                );

            const history =
                clientHistory.length
                    ? clientHistory
                    : session?.history || [];

            const result =
                await callGroq({

                    systemPrompt:
                        NORMAL_CHAT_PROMPT,

                    userText:
                        message ||
                        "Please analyze this image.",

                    history,

                    image,

                    temperature: 0.55,

                    maxTokens: 1200
                });

            const updatedHistory =
                [
                    ...history,

                    {
                        role: "user",
                        content:
                            message ||
                            "[Image]"
                    },

                    {
                        role: "assistant",
                        content:
                            result.answer
                    }

                ].slice(-12);

            chatSessions.set(
                conversationId,
                {
                    history:
                        updatedHistory,

                    updatedAt:
                        Date.now()
                }
            );

            return res.json({

                success: true,

                provider: "Groq",

                model:
                    result.model,

                answer:
                    result.answer,

                message:
                    result.answer,

                reply:
                    result.answer,

                response:
                    result.answer,

                conversationId,

                usage:
                    result.usage
            });

        } catch (error) {

            console.error(
                "CHAT ERROR:",
                error?.message || error
            );

            return res.status(500).json({

                success: false,

                provider: "Groq",

                error:
                    error?.message ||
                    "AI chat failed.",

                code:
                    "GROQ_CHAT_ERROR"
            });
        }
    }
);

// ============================================================
// COMPATIBILITY CHAT ENDPOINTS
// ============================================================
//
// This is important for your existing frontend.
// If frontend calls another common endpoint,
// it will still reach Groq.
//

app.post(
    "/api/ai-chat",
    (req, res, next) => {

        req.url = "/api/chat";

        next();
    }
);

// ============================================================
// GEMINI HELPERS
// ============================================================

function extractGeminiText(data) {

    const parts =
        data?.candidates?.[0]?.content?.parts;

    if (!Array.isArray(parts)) {
        return "";
    }

    return parts
        .map(
            part =>
                cleanText(part?.text)
        )
        .filter(Boolean)
        .join("\n")
        .trim();
}

function getGeminiError(text) {

    try {

        const data =
            JSON.parse(text);

        return (
            data?.error?.message ||
            data?.error?.status ||
            "Gemini API error."
        );

    } catch {

        return text || "Gemini API error.";
    }
}

// ============================================================
// GEMINI
// ============================================================

async function callGemini({

    systemPrompt,
    userText,
    image = null,
    jsonMode = false,
    responseSchema = null,
    maxOutputTokens = 1200

}) {

    if (!hasGeminiKey()) {

        throw new Error(
            "GEMINI_API_KEY is missing. Check your .env file."
        );
    }

    const parts = [];

    if (userText) {

        parts.push({
            text: userText
        });
    }

    if (image) {

        const validation =
            validateImage(image);

        if (!validation.valid) {

            throw new Error(
                validation.error
            );
        }

        parts.push(
            imageToGeminiPart(image)
        );
    }

    const requestBody = {

        system_instruction: {
            parts: [
                {
                    text:
                        systemPrompt
                }
            ]
        },

        contents: [
            {
                role: "user",
                parts
            }
        ],

        generationConfig: {

            temperature: 0.2,

            maxOutputTokens
        }
    };

    if (jsonMode) {

        requestBody.generationConfig
            .responseMimeType =
            "application/json";

        if (responseSchema) {

            requestBody.generationConfig
                .responseSchema =
                responseSchema;
        }
    }

    const controller =
        new AbortController();

    const timeout =
        setTimeout(
            () => controller.abort(),
            30000
        );

    try {

        console.log(
            `[GEMINI] ${GEMINI_MODEL}`
        );

        const response =
            await fetch(
                GEMINI_API_URL,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "x-goog-api-key":
                            GEMINI_API_KEY
                    },

                    body:
                        JSON.stringify(
                            requestBody
                        ),

                    signal:
                        controller.signal
                }
            );

        const responseText =
            await response.text();

        if (!response.ok) {

            throw new Error(
                `Gemini API ${response.status}: ${getGeminiError(responseText)}`
            );
        }

        let data;

        try {

            data =
                JSON.parse(responseText);

        } catch {

            throw new Error(
                "Gemini returned invalid JSON."
            );
        }

        const answer =
            extractGeminiText(data);

        if (!answer) {

            throw new Error(
                "Gemini returned an empty response."
            );
        }

        return answer;

    } catch (error) {

        if (
            error?.name === "AbortError"
        ) {

            throw new Error(
                "Gemini request timed out."
            );
        }

        throw error;

    } finally {

        clearTimeout(timeout);
    }
}

// ============================================================
// JSON PARSER
// ============================================================

function parseAIJSON(text) {

    let cleaned =
        cleanText(text);

    cleaned =
        cleaned
            .replace(
                /^```json\s*/i,
                ""
            )
            .replace(
                /^```\s*/i,
                ""
            )
            .replace(
                /\s*```$/i,
                ""
            );

    try {

        return JSON.parse(cleaned);

    } catch {}

    const start =
        cleaned.indexOf("{");

    const end =
        cleaned.lastIndexOf("}");

    if (
        start !== -1 &&
        end > start
    ) {

        return JSON.parse(
            cleaned.slice(
                start,
                end + 1
            )
        );
    }

    throw new Error(
        "AI returned invalid JSON."
    );
}

// ============================================================
// CIVIC ANALYSIS
// ============================================================

const CIVIC_SYSTEM_PROMPT = `
You are CivicAI Civic Report AI.

Analyze the citizen's civic problem using
the text, image and location.

Determine:

problem
category
severity
risk
urgency
department
responsibleAuthority
location
confidence
summary
recommendation
authorityReason
officialComplaint
problemDescription
requestedAction

Severity:
Low, Medium, High or Critical.

Do not invent facts.

If something is unknown use:
"Not available"

Do not invent:
phone numbers,
emails,
websites,
complaint IDs.

Return ONLY JSON.
`;

const CIVIC_SCHEMA = {

    type: "object",

    properties: {

        problem: {
            type: "string"
        },

        category: {
            type: "string"
        },

        severity: {
            type: "string"
        },

        risk: {
            type: "string"
        },

        urgency: {
            type: "string"
        },

        department: {
            type: "string"
        },

        responsibleAuthority: {
            type: "string"
        },

        location: {
            type: "string"
        },

        confidence: {
            type: "string"
        },

        summary: {
            type: "string"
        },

        recommendation: {
            type: "string"
        },

        authorityReason: {
            type: "string"
        },

        officialComplaint: {
            type: "string"
        },

        problemDescription: {
            type: "string"
        },

        requestedAction: {
            type: "string"
        }
    },

    required: [
        "problem",
        "category",
        "severity",
        "risk",
        "urgency",
        "department",
        "responsibleAuthority",
        "location",
        "confidence",
        "summary",
        "recommendation",
        "authorityReason",
        "officialComplaint",
        "problemDescription",
        "requestedAction"
    ]
};

// ============================================================
// /api/analyze
// ============================================================

app.post(
    "/api/analyze",
    async (req, res) => {

        try {

            const body =
                req.body || {};

            const description =
                cleanText(
                    body.description
                );

            const location =
                cleanText(
                    body.location
                );

            const reporterName =
                cleanText(
                    body.reporterName
                );

            const image =
                isImageDataUrl(body.image)
                    ? body.image
                    : null;

            if (!description && !image) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Description or image is required."
                });
            }

            const userText = `
Citizen:
${reporterName || "Citizen"}

Description:
${description || "No description provided."}

Location:
${location || "Not provided."}

Analyze this civic problem.
`;

            const raw =
                await callGemini({

                    systemPrompt:
                        CIVIC_SYSTEM_PROMPT,

                    userText,

                    image,

                    jsonMode: true,

                    responseSchema:
                        CIVIC_SCHEMA,

                    // Faster for presentation
                    maxOutputTokens:
                        1200
                });

            const analysis =
                parseAIJSON(raw);

            return res.json({

                success: true,

                provider:
                    "Google Gemini",

                model:
                    GEMINI_MODEL,

                analysis
            });

        } catch (error) {

            console.error(
                "CIVIC ANALYSIS ERROR:",
                error?.message || error
            );

            const message =
                error?.message || "";

            const status =
                message.includes("429")
                    ? 429
                    : message.includes("timed out")
                        ? 504
                        : 500;

            return res.status(status).json({

                success: false,

                provider:
                    "Google Gemini",

                error:
                    message ||
                    "Civic analysis failed.",

                code:
                    message.includes("429")
                        ? "GEMINI_QUOTA"
                        : "GEMINI_ANALYSIS_ERROR"
            });
        }
    }
);

// ============================================================
// PRODUCT SCANNER
// ============================================================

const PRODUCT_SYSTEM_PROMPT = `
You are CivicAI Product Scanner AI.

Analyze the product image, name and description.

Return:

productName
brand
category
manufacturer
price
currency
quantity
ingredients
manufacturingDate
expiryDate
batchNumber
purpose
benefits
warnings
consumerConcern
visibleCondition
missingInformation
confidence
summary
recommendation
message

Never invent unreadable information.

Use "Not available" when information
cannot be determined.

For medicine:

Do not diagnose.
Do not prescribe.
Do not provide personalized dosage.

Return ONLY JSON.
`;

const PRODUCT_SCHEMA = {

    type: "object",

    properties: {

        productName: {
            type: "string"
        },

        brand: {
            type: "string"
        },

        category: {
            type: "string"
        },

        manufacturer: {
            type: "string"
        },

        price: {
            type: "string"
        },

        currency: {
            type: "string"
        },

        quantity: {
            type: "string"
        },

        ingredients: {
            type: "string"
        },

        manufacturingDate: {
            type: "string"
        },

        expiryDate: {
            type: "string"
        },

        batchNumber: {
            type: "string"
        },

        purpose: {
            type: "string"
        },

        benefits: {
            type: "string"
        },

        warnings: {
            type: "string"
        },

        consumerConcern: {
            type: "string"
        },

        visibleCondition: {
            type: "string"
        },

        missingInformation: {
            type: "string"
        },

        confidence: {
            type: "string"
        },

        summary: {
            type: "string"
        },

        recommendation: {
            type: "string"
        },

        message: {
            type: "string"
        }
    },

    required: [
        "productName",
        "brand",
        "category",
        "manufacturer",
        "price",
        "currency",
        "quantity",
        "ingredients",
        "manufacturingDate",
        "expiryDate",
        "batchNumber",
        "purpose",
        "benefits",
        "warnings",
        "consumerConcern",
        "visibleCondition",
        "missingInformation",
        "confidence",
        "summary",
        "recommendation",
        "message"
    ]
};

// ============================================================
// /api/analyze-product
// ============================================================

app.post(
    "/api/analyze-product",
    async (req, res) => {

        try {

            const body =
                req.body || {};

            const productName =
                cleanText(
                    body.productName
                );

            const description =
                cleanText(
                    body.description
                );

            const image =
                isImageDataUrl(body.image)
                    ? body.image
                    : null;

            if (
                !image &&
                !productName &&
                !description
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Product image, name or description is required."
                });
            }

            const userText = `
Product name:
${productName || "Not provided"}

Description:
${description || "Not provided"}

Analyze this product.
`;

            const raw =
                await callGemini({

                    systemPrompt:
                        PRODUCT_SYSTEM_PROMPT,

                    userText,

                    image,

                    jsonMode: true,

                    responseSchema:
                        PRODUCT_SCHEMA,

                    maxOutputTokens:
                        1100
                });

            const result =
                parseAIJSON(raw);

            return res.json({

                success: true,

                provider:
                    "Google Gemini",

                model:
                    GEMINI_MODEL,

                result,

                product:
                    result,

                analysis:
                    result,

                answer:
                    result.message ||
                    result.summary ||
                    ""
            });

        } catch (error) {

            console.error(
                "PRODUCT SCANNER ERROR:",
                error?.message || error
            );

            return res.status(500).json({

                success: false,

                provider:
                    "Google Gemini",

                error:
                    error?.message ||
                    "Product analysis failed.",

                code:
                    "GEMINI_PRODUCT_ERROR"
            });
        }
    }
);

// ============================================================
// PRODUCT CHAT
// ============================================================

async function productChatHandler(req, res) {

    try {

        const body =
            req.body || {};

        const question =
            cleanText(
                body.question ||
                body.message ||
                body.prompt ||
                body.text
            );

        if (!question) {

            return res.status(400).json({
                success: false,
                error:
                    "Product question is required."
            });
        }

        const productName =
            cleanText(
                body.productName
            );

        let productContext =
            "No product analysis available.";

        if (
            body.product &&
            typeof body.product === "object"
        ) {

            productContext =
                JSON.stringify(
                    body.product
                );
        }

        /*
         Support ALL common frontend names:
         image
         productImage
         imageData
        */

        const image =
            isImageDataUrl(body.image)
                ? body.image
                : isImageDataUrl(body.productImage)
                    ? body.productImage
                    : isImageDataUrl(body.imageData)
                        ? body.imageData
                        : null;

        const history =
            normalizeHistory(
                body.history
            );

        const userText = `
Product:
${productName || "Unknown product"}

Product analysis:
${productContext}

User question:
${question}

Answer the question naturally.
`;

        const result =
            await callGroq({

                systemPrompt:
                    PRODUCT_CHAT_PROMPT,

                userText,

                history,

                image,

                temperature:
                    0.4,

                maxTokens:
                    1000
            });

        return res.json({

            success: true,

            provider:
                "Groq",

            model:
                result.model,

            answer:
                result.answer,

            message:
                result.answer,

            reply:
                result.answer,

            response:
                result.answer,

            usage:
                result.usage
        });

    } catch (error) {

        console.error(
            "PRODUCT CHAT ERROR:",
            error?.message || error
        );

        return res.status(500).json({

            success: false,

            provider:
                "Groq",

            error:
                error?.message ||
                "Product chat failed.",

            code:
                "GROQ_PRODUCT_CHAT_ERROR"
        });
    }
}

// ============================================================
// PRODUCT CHAT ENDPOINTS
// ============================================================
//
// These aliases are intentionally kept.
// This solves frontend endpoint mismatch.
//

app.post(
    "/api/product-question",
    productChatHandler
);

app.post(
    "/api/product-chat",
    productChatHandler
);

app.post(
    "/api/product/ask",
    productChatHandler
);

// ============================================================
// AUTHORITY
// ============================================================

app.post(
    "/api/authority",
    async (req, res) => {

        try {

            const body =
                req.body || {};

            const problem =
                cleanText(
                    body.problem ||
                    body.description
                );

            const category =
                cleanText(
                    body.category
                );

            const location =
                cleanText(
                    body.location
                );

            if (!problem && !category) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Problem or category is required."
                });
            }

            const result =
                await callGroq({

                    systemPrompt:
                        AUTHORITY_PROMPT,

                    userText: `
Problem:
${problem || "Not provided"}

Category:
${category || "Not provided"}

Location:
${location || "Not provided"}

Suggest the responsible authority.
`,

                    temperature:
                        0.2,

                    maxTokens:
                        700
                });

            return res.json({

                success: true,

                provider:
                    "Groq",

                model:
                    result.model,

                authority:
                    result.answer,

                answer:
                    result.answer
            });

        } catch (error) {

            console.error(
                "AUTHORITY ERROR:",
                error?.message || error
            );

            return res.status(500).json({

                success: false,

                provider:
                    "Groq",

                error:
                    error?.message ||
                    "Authority lookup failed."
            });
        }
    }
);

// ============================================================
// OTP
// ============================================================

const OTP_EXPIRY_MS =
    5 * 60 * 1000;

const MAX_OTP_ATTEMPTS = 5;

const otpStore = new Map();

const verifiedUsers = new Map();

function generateOTP() {

    return String(
        crypto.randomInt(
            100000,
            1000000
        )
    );
}

function saveOTP(identifier, otp) {

    otpStore.set(
        identifier,
        {
            otp,
            createdAt:
                Date.now(),
            attempts: 0
        }
    );
}

function verifyStoredOTP(
    identifier,
    otp
) {

    const record =
        otpStore.get(identifier);

    if (!record) {

        return {
            success: false,
            error:
                "OTP not found or expired."
        };
    }

    if (
        Date.now() -
        record.createdAt >
        OTP_EXPIRY_MS
    ) {

        otpStore.delete(
            identifier
        );

        return {
            success: false,
            error: "OTP expired."
        };
    }

    if (
        record.attempts >=
        MAX_OTP_ATTEMPTS
    ) {

        otpStore.delete(
            identifier
        );

        return {
            success: false,
            error:
                "Too many OTP attempts."
        };
    }

    if (
        record.otp !==
        String(otp)
    ) {

        record.attempts++;

        return {
            success: false,
            error: "Invalid OTP."
        };
    }

    otpStore.delete(
        identifier
    );

    verifiedUsers.set(
        identifier,
        Date.now()
    );

    return {
        success: true
    };
}

// ============================================================
// EMAIL OTP
// ============================================================

app.post(
    "/api/request-otp",
    async (req, res) => {

        try {

            const email =
                cleanText(
                    req.body?.email
                ).toLowerCase();

            if (
                !email ||
                !email.includes("@")
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Valid email is required."
                });
            }

            if (!emailTransporter) {

                return res.status(503).json({
                    success: false,
                    error:
                        "Gmail OTP is not configured."
                });
            }

            const otp =
                generateOTP();

            saveOTP(
                email,
                otp
            );

            await emailTransporter.sendMail({

                from:
                    EMAIL_FROM,

                to:
                    email,

                subject:
                    "CivicAI Verification OTP",

                text:
                    `Your CivicAI verification OTP is ${otp}. It expires in 5 minutes.`,

                html: `
                    <div style="
                        font-family:Arial;
                        max-width:500px;
                        margin:auto;
                        padding:30px;
                        background:#f5f7fb;
                    ">
                        <div style="
                            background:white;
                            padding:30px;
                            border-radius:15px;
                        ">
                            <h2>CivicAI Verification</h2>

                            <p>
                                Your verification OTP is:
                            </p>

                            <h1 style="
                                letter-spacing:8px;
                            ">
                                ${otp}
                            </h1>

                            <p>
                                This OTP expires in 5 minutes.
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
                error?.message || error
            );

            return res.status(500).json({

                success: false,

                error:
                    error?.message ||
                    "Failed to send OTP."
            });
        }
    }
);

// ============================================================
// VERIFY EMAIL OTP
// ============================================================

app.post(
    "/api/verify-otp",
    (req, res) => {

        const email =
            cleanText(
                req.body?.email
            ).toLowerCase();

        const otp =
            cleanText(
                req.body?.otp
            );

        if (!email || !otp) {

            return res.status(400).json({
                success: false,
                error:
                    "Email and OTP are required."
            });
        }

        const result =
            verifyStoredOTP(
                email,
                otp
            );

        if (!result.success) {

            return res.status(400).json(
                result
            );
        }

        return res.json({

            success: true,

            verified: true,

            message:
                "Email verified successfully."
        });
    }
);

// ============================================================
// PHONE OTP
// ============================================================

app.post(
    "/api/request-phone-otp",
    async (req, res) => {

        try {

            const phone =
                cleanText(
                    req.body?.phone
                );

            if (!phone) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Phone number is required."
                });
            }

            if (!twilioClient) {

                return res.status(503).json({
                    success: false,
                    error:
                        "Twilio is not configured."
                });
            }

            const otp =
                generateOTP();

            saveOTP(
                phone,
                otp
            );

            await twilioClient.messages.create({

                body:
                    `CivicAI verification OTP: ${otp}. Valid for 5 minutes.`,

                from:
                    TWILIO_PHONE_NUMBER,

                to:
                    phone
            });

            return res.json({

                success: true,

                message:
                    "Phone OTP sent successfully."
            });

        } catch (error) {

            console.error(
                "PHONE OTP ERROR:",
                error?.message || error
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

        const phone =
            cleanText(
                req.body?.phone
            );

        const otp =
            cleanText(
                req.body?.otp
            );

        if (!phone || !otp) {

            return res.status(400).json({
                success: false,
                error:
                    "Phone and OTP are required."
            });
        }

        const result =
            verifyStoredOTP(
                phone,
                otp
            );

        if (!result.success) {

            return res.status(400).json(
                result
            );
        }

        return res.json({

            success: true,

            verified: true,

            message:
                "Phone verified successfully."
        });
    }
);

// ============================================================
// REPORT STORAGE
// ============================================================

function readReports() {

    try {

        const data =
            JSON.parse(
                fs.readFileSync(
                    REPORTS_FILE,
                    "utf8"
                )
            );

        return Array.isArray(data)
            ? data
            : [];

    } catch {

        return [];
    }
}

function writeReports(reports) {

    fs.writeFileSync(
        REPORTS_FILE,
        JSON.stringify(
            reports,
            null,
            2
        ),
        "utf8"
    );
}

// ============================================================
// CREATE REPORT
// ============================================================

app.post(
    "/api/reports",
    (req, res) => {

        try {

            const body =
                req.body || {};

            const report = {

                reportId:
                    generateSecureId(
                        "CIVIC-"
                    ),

                reporterName:
                    cleanText(
                        body.reporterName
                    ) ||
                    "Anonymous",

                email:
                    cleanText(
                        body.email
                    ),

                phone:
                    cleanText(
                        body.phone
                    ),

                description:
                    cleanText(
                        body.description
                    ),

                location:
                    cleanText(
                        body.location
                    ),

                image:
                    typeof body.image ===
                    "string"
                        ? body.image
                        : null,

                analysis:
                    body.analysis &&
                    typeof body.analysis ===
                    "object"
                        ? body.analysis
                        : null,

                authority:
                    body.authority &&
                    typeof body.authority ===
                    "object"
                        ? body.authority
                        : null,

                status:
                    "Submitted",

                createdAt:
                    new Date().toISOString()
            };

            if (
                !report.description &&
                !report.image &&
                !report.analysis
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Report information is required."
                });
            }

            const reports =
                readReports();

            reports.push(report);

            writeReports(reports);

            return res.json({

                success: true,

                message:
                    "Civic report created successfully.",

                report
            });

        } catch (error) {

            console.error(
                "REPORT ERROR:",
                error?.message || error
            );

            return res.status(500).json({

                success: false,

                error:
                    "Failed to create report."
            });
        }
    }
);

// ============================================================
// GET REPORTS
// ============================================================

app.get(
    "/api/reports",
    (req, res) => {

        const reports =
            readReports();

        return res.json({

            success: true,

            count:
                reports.length,

            reports
        });
    }
);

// ============================================================
// GET SINGLE REPORT
// ============================================================

app.get(
    "/api/reports/:reportId",
    (req, res) => {

        const reports =
            readReports();

        const report =
            reports.find(
                item =>
                    item.reportId ===
                    req.params.reportId
            );

        if (!report) {

            return res.status(404).json({
                success: false,
                error:
                    "Report not found."
            });
        }

        return res.json({
            success: true,
            report
        });
    }
);

// ============================================================
// SEND REPORT EMAIL
// ============================================================

app.post(
    "/api/send-report",
    async (req, res) => {

        try {

            if (!emailTransporter) {

                return res.status(503).json({
                    success: false,
                    error:
                        "Gmail is not configured."
                });
            }

            const body =
                req.body || {};

            const to =
                cleanText(
                    body.to ||
                    body.email
                );

            if (!to) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Recipient email is required."
                });
            }

            const analysis =
                body.analysis &&
                typeof body.analysis ===
                "object"
                    ? body.analysis
                    : {};

            const authority =
                body.authority &&
                typeof body.authority ===
                "object"
                    ? body.authority
                    : {};

            const text = `

CIVICAI CIVIC COMPLAINT

========================================

Report ID:
${cleanText(body.reportId) || "Not available"}

Citizen:
${cleanText(body.reporterName) || "Anonymous"}

Email:
${cleanText(body.email) || "Not provided"}

Phone:
${cleanText(body.phone) || "Not provided"}

Location:
${cleanText(body.location) || "Not provided"}

========================================

PROBLEM

${cleanText(body.description) ||
    analysis.problem ||
    "Not provided"}

Category:
${analysis.category || "Not available"}

Severity:
${analysis.severity || "Not available"}

Risk:
${analysis.risk || "Not available"}

Urgency:
${analysis.urgency || "Not available"}

========================================

AUTHORITY

Department:
${analysis.department || "Not available"}

Responsible Authority:
${analysis.responsibleAuthority || "Not available"}

Authority:
${authority.authority || "Not available"}

========================================

SUMMARY

${analysis.summary || "Not available"}

RECOMMENDATION

${analysis.recommendation || "Not available"}

========================================

Generated through CivicAI.
`;

            await emailTransporter.sendMail({

                from:
                    EMAIL_FROM,

                to,

                subject:
                    body.reportId
                        ? `CivicAI Complaint - ${body.reportId}`
                        : "CivicAI Civic Complaint",

                text
            });

            return res.json({

                success: true,

                message:
                    "Civic report sent successfully by email."
            });

        } catch (error) {

            console.error(
                "SEND REPORT ERROR:",
                error?.message || error
            );

            return res.status(500).json({

                success: false,

                error:
                    error?.message ||
                    "Failed to send report."
            });
        }
    }
);

// ============================================================
// TEST EMAIL
// ============================================================

app.post(
    "/api/test-email",
    async (req, res) => {

        try {

            if (!emailTransporter) {

                return res.status(503).json({
                    success: false,
                    error:
                        "Gmail is not configured."
                });
            }

            const to =
                cleanText(
                    req.body?.email
                ) ||
                EMAIL_USER;

            await emailTransporter.sendMail({

                from:
                    EMAIL_FROM,

                to,

                subject:
                    "CivicAI Gmail Test",

                text:
                    "CivicAI Gmail integration is working."
            });

            return res.json({

                success: true,

                message:
                    "Test email sent successfully.",

                to
            });

        } catch (error) {

            console.error(
                "TEST EMAIL ERROR:",
                error?.message || error
            );

            return res.status(500).json({

                success: false,

                error:
                    error?.message ||
                    "Test email failed."
            });
        }
    }
);

// ============================================================
// AI STATUS
// ============================================================

app.get(
    "/api/ai-status",
    (req, res) => {

        return res.json({

            success: true,

            services: {

                aiLifeHelper: {
                    provider: "Groq",
                    model:
                        GROQ_TEXT_MODEL,
                    configured:
                        hasGroqKey()
                },

                normalChat: {
                    provider: "Groq",
                    model:
                        GROQ_TEXT_MODEL,
                    configured:
                        hasGroqKey()
                },

                productChat: {
                    provider: "Groq",
                    model:
                        GROQ_TEXT_MODEL,
                    configured:
                        hasGroqKey()
                },

                imageChat: {
                    provider: "Groq",
                    model:
                        GROQ_VISION_MODEL,
                    configured:
                        hasGroqKey()
                },

                civicAnalysis: {
                    provider:
                        "Google Gemini",
                    model:
                        GEMINI_MODEL,
                    configured:
                        hasGeminiKey()
                },

                productScanner: {
                    provider:
                        "Google Gemini",
                    model:
                        GEMINI_MODEL,
                    configured:
                        hasGeminiKey()
                },

                authorityLookup: {
                    provider: "Groq",
                    model:
                        GROQ_TEXT_MODEL,
                    configured:
                        hasGroqKey()
                }
            },

            otherServices: {

                gmail: {
                    configured:
                        hasEmailConfig()
                },

                twilio: {
                    configured:
                        hasTwilioConfig()
                }
            },

            serverTime:
                new Date().toISOString()
        });
    }
);

// ============================================================
// HEALTH
// ============================================================

app.get(
    "/api/health",
    (req, res) => {

        return res.json({

            success: true,

            status: "online",

            service:
                "CivicAI Backend",

            configured: {

                groq:
                    hasGroqKey(),

                gemini:
                    hasGeminiKey(),

                gmail:
                    hasEmailConfig(),

                twilio:
                    hasTwilioConfig()
            },

            models: {

                groqText:
                    GROQ_TEXT_MODEL,

                groqVision:
                    GROQ_VISION_MODEL,

                gemini:
                    GEMINI_MODEL
            },

            timestamp:
                new Date().toISOString()
        });
    }
);

// ============================================================
// API INFO
// ============================================================

app.get(
    "/api",
    (req, res) => {

        return res.json({

            success: true,

            message:
                "CivicAI backend API is running.",

            endpoints: {

                chat:
                    "POST /api/chat",

                aiChat:
                    "POST /api/ai-chat",

                analyze:
                    "POST /api/analyze",

                analyzeProduct:
                    "POST /api/analyze-product",

                productQuestion:
                    "POST /api/product-question",

                productChat:
                    "POST /api/product-chat",

                productAsk:
                    "POST /api/product/ask",

                authority:
                    "POST /api/authority",

                requestOTP:
                    "POST /api/request-otp",

                verifyOTP:
                    "POST /api/verify-otp",

                requestPhoneOTP:
                    "POST /api/request-phone-otp",

                verifyPhoneOTP:
                    "POST /api/verify-phone-otp",

                reports:
                    "POST /api/reports",

                getReports:
                    "GET /api/reports",

                sendReport:
                    "POST /api/send-report",

                health:
                    "GET /api/health",

                aiStatus:
                    "GET /api/ai-status"
            }
        });
    }
);

// ============================================================
// STATIC SECURITY
// ============================================================

app.use(
    (req, res, next) => {

        const blocked =
            new Set([
                "/server.js",
                "/.env",
                "/package.json",
                "/package-lock.json"
            ]);

        if (blocked.has(req.path)) {

            return res.status(403).json({
                success: false,
                error: "Forbidden."
            });
        }

        if (
            req.path.startsWith("/data/")
        ) {

            return res.status(403).json({
                success: false,
                error: "Forbidden."
            });
        }

        next();
    }
);

// ============================================================
// STATIC FRONTEND
// ============================================================

app.use(
    express.static(
        __dirname,
        {
            dotfiles: "deny",
            index: "index.html"
        }
    )
);

// ============================================================
// API 404
// ============================================================

app.use(
    "/api",
    (req, res) => {

        return res.status(404).json({

            success: false,

            error:
                "API endpoint not found.",

            path:
                req.originalUrl
        });
    }
);

// ============================================================
// GLOBAL ERROR
// ============================================================

app.use(
    (error, req, res, next) => {

        console.error(
            "GLOBAL ERROR:",
            error
        );

        if (res.headersSent) {
            return next(error);
        }

        if (
            error instanceof SyntaxError &&
            error.status === 400 &&
            "body" in error
        ) {

            return res.status(400).json({
                success: false,
                error:
                    "Invalid JSON request body."
            });
        }

        return res.status(500).json({
            success: false,
            error:
                "Internal server error."
        });
    }
);

// ============================================================
// PROCESS ERRORS
// ============================================================

process.on(
    "unhandledRejection",
    error => {

        console.error(
            "UNHANDLED REJECTION:",
            error
        );
    }
);

process.on(
    "uncaughtException",
    error => {

        console.error(
            "UNCAUGHT EXCEPTION:",
            error
        );
    }
);

// ============================================================
// START
// ============================================================

app.listen(
    PORT,
    () => {

        console.log("");
        console.log(
            "=================================================="
        );
        console.log(
            "             CIVICAI BACKEND"
        );
        console.log(
            "=================================================="
        );

        console.log(
            `Server: http://localhost:${PORT}`
        );

        console.log("");

        console.log(
            "AI SERVICES"
        );

        console.log(
            "--------------------------------------------------"
        );

        console.log(
            `Normal Chat     : ${
                hasGroqKey()
                    ? "GROQ READY"
                    : "GROQ API KEY MISSING"
            }`
        );

        console.log(
            `Product Chat    : ${
                hasGroqKey()
                    ? "GROQ READY"
                    : "GROQ API KEY MISSING"
            }`
        );

        console.log(
            `Image Chat      : ${
                hasGroqKey()
                    ? "GROQ VISION READY"
                    : "GROQ API KEY MISSING"
            }`
        );

        console.log(
            `Civic Analysis  : ${
                hasGeminiKey()
                    ? `GEMINI READY (${GEMINI_MODEL})`
                    : "GEMINI API KEY MISSING"
            }`
        );

        console.log(
            `Product Scanner : ${
                hasGeminiKey()
                    ? `GEMINI READY (${GEMINI_MODEL})`
                    : "GEMINI API KEY MISSING"
            }`
        );

        console.log(
            `Authority       : ${
                hasGroqKey()
                    ? "GROQ READY"
                    : "GROQ API KEY MISSING"
            }`
        );

        console.log("");

        console.log(
            "OTHER SERVICES"
        );

        console.log(
            "--------------------------------------------------"
        );

        console.log(
            `Gmail OTP       : ${
                hasEmailConfig()
                    ? "READY"
                    : "NOT CONFIGURED"
            }`
        );

        console.log(
            `Twilio OTP      : ${
                hasTwilioConfig()
                    ? "READY"
                    : "NOT CONFIGURED"
            }`
        );

        console.log("");

        console.log(
            "IMPORTANT ENDPOINTS"
        );

        console.log(
            "--------------------------------------------------"
        );

        console.log(
            `Chat            : http://localhost:${PORT}/api/chat`
        );

        console.log(
            `Product Chat    : http://localhost:${PORT}/api/product-question`
        );

        console.log(
            `Product Alias   : http://localhost:${PORT}/api/product-chat`
        );

        console.log(
            `Civic Analysis  : http://localhost:${PORT}/api/analyze`
        );

        console.log(
            `Product Scanner : http://localhost:${PORT}/api/analyze-product`
        );

        console.log(
            `OTP             : http://localhost:${PORT}/api/request-otp`
        );

        console.log(
            `Health          : http://localhost:${PORT}/api/health`
        );

        console.log(
            `AI Status       : http://localhost:${PORT}/api/ai-status`
        );

        console.log("");

        console.log(
            "=================================================="
        );

        console.log("");
    }
);
