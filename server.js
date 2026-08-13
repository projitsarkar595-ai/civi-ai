// ============================================================
// CIVICAI — COMPLETE SERVER.JS
// ============================================================
//
// FEATURES
// ------------------------------------------------------------
// 1. Civic Problem AI
//    POST /api/analyze
//
// 2. AI Help / Civic Chat
//    POST /api/chat
//
// 3. Product Scanner AI
//    POST /api/analyze-product
//
// 4. Product AI Questions
//    POST /api/product-question
//
// 5. Gmail OTP
//    POST /api/request-otp
//    POST /api/verify-otp
//
// 6. Phone OTP / Twilio
//    POST /api/request-phone-otp
//    POST /api/verify-phone-otp
//
// 7. Civic Reports
//    POST /api/reports
//    GET  /api/reports
//    GET  /api/reports/:reportId
//
// 8. Gmail Complaint Sending
//    POST /api/send-report
//
// 9. Health / Status
//    GET /api/health
//    GET /api/ai-status
//    GET /api/product-status
//
// IMPORTANT
// ------------------------------------------------------------
// Only ONE app.listen() exists at the bottom.
// ============================================================

"use strict";


// ============================================================
// IMPORTS
// ============================================================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import nodemailer from "nodemailer";
import twilio from "twilio";

import {
    fileURLToPath
} from "url";


// ============================================================
// ENVIRONMENT
// ============================================================

dotenv.config();


// ============================================================
// ES MODULE PATH
// ============================================================

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);


// ============================================================
// EXPRESS
// ============================================================

const app =
    express();


// ============================================================
// PORT
// ============================================================

const PORT =
    Number(process.env.PORT) || 3000;


// ============================================================
// SERVER SETTINGS
// ============================================================

app.disable("x-powered-by");


// ============================================================
// DIRECTORIES
// ============================================================

const DATA_DIR =
    path.join(
        __dirname,
        "data"
    );

const REPORTS_FILE =
    path.join(
        DATA_DIR,
        "reports.json"
    );


// ============================================================
// CREATE DATA DIRECTORY
// ============================================================

if (
    !fs.existsSync(DATA_DIR)
) {

    fs.mkdirSync(
        DATA_DIR,
        {
            recursive: true
        }
    );

}


// ============================================================
// CREATE REPORT FILE
// ============================================================

if (
    !fs.existsSync(REPORTS_FILE)
) {

    fs.writeFileSync(
        REPORTS_FILE,
        "[]",
        "utf8"
    );

}


// ============================================================
// GEMINI CONFIGURATION
// ============================================================

const GEMINI_API_KEY =
    String(
        process.env.GEMINI_API_KEY || ""
    ).trim();


// Recommended stable model
const GEMINI_MODEL =
    String(
        process.env.GEMINI_MODEL ||
        "gemini-2.5-flash"
    ).trim();


const GEMINI_API_URL =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;


// ============================================================
// EMAIL CONFIGURATION
// ============================================================

const EMAIL_USER =
    String(
        process.env.EMAIL_USER || ""
    ).trim();

const EMAIL_PASSWORD =
    String(
        process.env.EMAIL_PASSWORD || ""
    ).trim();

const EMAIL_FROM =
    String(
        process.env.EMAIL_FROM ||
        EMAIL_USER
    ).trim();


// ============================================================
// TWILIO CONFIGURATION
// ============================================================

const TWILIO_ACCOUNT_SID =
    String(
        process.env.TWILIO_ACCOUNT_SID || ""
    ).trim();

const TWILIO_AUTH_TOKEN =
    String(
        process.env.TWILIO_AUTH_TOKEN || ""
    ).trim();

const TWILIO_PHONE_NUMBER =
    String(
        process.env.TWILIO_PHONE_NUMBER || ""
    ).trim();


// ============================================================
// OTP SETTINGS
// ============================================================

const OTP_EXPIRY_MS =
    5 * 60 * 1000;

const MAX_OTP_ATTEMPTS =
    5;


// ============================================================
// OTP MEMORY STORAGE
// ============================================================

const otpStore =
    new Map();


// ============================================================
// VERIFIED USERS
// ============================================================

const verifiedUsers =
    new Map();


// ============================================================
// MIDDLEWARE
// ============================================================

app.use(
    cors({
        origin: true,
        credentials: false
    })
);


app.use(
    express.json({
        limit: "15mb"
    })
);


app.use(
    express.urlencoded({
        extended: true,
        limit: "15mb"
    })
);


// ============================================================
// SECURITY
// Prevent direct access to /data
// ============================================================

app.use(
    "/data",
    (req, res) => {

        return res
            .status(403)
            .json({
                success: false,
                error: "Forbidden."
            });

    }
);


// ============================================================
// UTILITY — CLEAN TEXT
// ============================================================

function cleanText(value) {

    if (
        value === undefined ||
        value === null
    ) {

        return "";

    }

    return String(value)
        .trim();

}


// ============================================================
// UTILITY — SECURE ID
// ============================================================

function generateSecureId(
    prefix = ""
) {

    return (
        prefix +
        crypto
            .randomBytes(16)
            .toString("hex")
    );

}


// ============================================================
// CONFIG CHECKS
// ============================================================

function hasGeminiKey() {

    return Boolean(
        GEMINI_API_KEY
    );

}


function hasEmailConfig() {

    return Boolean(
        EMAIL_USER &&
        EMAIL_PASSWORD
    );

}


function hasTwilioConfig() {

    return Boolean(
        TWILIO_ACCOUNT_SID &&
        TWILIO_AUTH_TOKEN &&
        TWILIO_PHONE_NUMBER
    );

}


// ============================================================
// EMAIL TRANSPORTER
// ============================================================

let emailTransporter =
    null;


if (
    hasEmailConfig()
) {

    emailTransporter =
        nodemailer.createTransport({

            service: "gmail",

            auth: {

                user:
                    EMAIL_USER,

                pass:
                    EMAIL_PASSWORD

            }

        });

}


// ============================================================
// TWILIO CLIENT
// ============================================================

let twilioClient =
    null;


if (
    hasTwilioConfig()
) {

    twilioClient =
        twilio(
            TWILIO_ACCOUNT_SID,
            TWILIO_AUTH_TOKEN
        );

}


// ============================================================
// GEMINI IMAGE VALIDATION
// ============================================================

function validateImage(
    image
) {

    if (
        !image ||
        typeof image !== "string"
    ) {

        return {
            valid: false,
            error: "Image is required."
        };

    }


    if (
        !image.startsWith(
            "data:image/"
        )
    ) {

        return {
            valid: false,
            error: "Invalid image format."
        };

    }


    // Approximately 7 MB
    if (
        image.length >
        7_000_000
    ) {

        return {
            valid: false,
            error:
                "Image is too large. Maximum size is approximately 7 MB."
        };

    }


    return {
        valid: true
    };

}


// ============================================================
// DATA URL → GEMINI IMAGE
// ============================================================

function imageToGeminiPart(
    imageDataUrl
) {

    const match =
        imageDataUrl.match(
            /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
        );


    if (!match) {

        throw new Error(
            "Invalid image data."
        );

    }


    return {

        inline_data: {

            mime_type:
                match[1],

            data:
                match[2]

        }

    };

}


// ============================================================
// EXTRACT GEMINI TEXT
// ============================================================

function extractGeminiText(
    data
) {

    const parts =
        data
            ?.candidates
            ?.[0]
            ?.content
            ?.parts;


    if (
        !Array.isArray(parts)
    ) {

        return "";

    }


    return parts
        .map(
            part =>
                cleanText(
                    part?.text
                )
        )
        .filter(Boolean)
        .join("\n")
        .trim();

}


// ============================================================
// GEMINI ERROR
// ============================================================

function getGeminiErrorMessage(
    responseText
) {

    if (!responseText) {

        return "Unknown Gemini API error.";

    }


    try {

        const data =
            JSON.parse(
                responseText
            );


        return (
            data
                ?.error
                ?.message
            ||
            data
                ?.error
                ?.status
            ||
            responseText
        );

    }
    catch {

        return responseText;

    }

}


// ============================================================
// GEMINI REQUEST
// ============================================================

async function requestGemini(
    requestBody,
    options = {}
) {

    const timeoutMs =
        Number(
            options.timeoutMs ||
            25000
        );

    const retryCount =
        Number(
            options.retryCount ??
            1
        );


    if (
        !hasGeminiKey()
    ) {

        throw new Error(
            "GEMINI_API_KEY is missing. Please check your .env file."
        );

    }


    let lastError =
        null;


    for (
        let attempt = 0;
        attempt <= retryCount;
        attempt++
    ) {

        const controller =
            new AbortController();


        const timeout =
            setTimeout(
                () =>
                    controller.abort(),
                timeoutMs
            );


        try {

            console.log(
                `Gemini request ${attempt + 1}/${retryCount + 1}`
            );


            const response =
                await fetch(
                    GEMINI_API_URL,
                    {

                        method:
                            "POST",

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


            if (
                !response.ok
            ) {

                const message =
                    getGeminiErrorMessage(
                        responseText
                    );


                if (
                    (
                        response.status === 429 ||
                        response.status >= 500
                    ) &&
                    attempt < retryCount
                ) {

                    console.log(
                        "Temporary Gemini error. Retrying..."
                    );


                    await new Promise(
                        resolve =>
                            setTimeout(
                                resolve,
                                1000
                            )
                    );


                    continue;

                }


                throw new Error(
                    `Gemini API ${response.status}: ${message}`
                );

            }


            let data;


            try {

                data =
                    JSON.parse(
                        responseText
                    );

            }
            catch {

                throw new Error(
                    "Gemini returned invalid JSON response."
                );

            }


            const text =
                extractGeminiText(
                    data
                );


            if (!text) {

                const reason =
                    data
                        ?.candidates
                        ?.[0]
                        ?.finishReason;


                throw new Error(
                    `Gemini returned an empty response${
                        reason
                            ? ` (${reason})`
                            : ""
                    }`
                );

            }


            return {

                text,

                raw:
                    data

            };

        }
        catch (error) {

            lastError =
                error;


            if (
                error?.name ===
                "AbortError"
            ) {

                if (
                    attempt < retryCount
                ) {

                    console.log(
                        "Gemini timeout. Retrying..."
                    );

                    continue;

                }


                throw new Error(
                    `Gemini request timed out after ${Math.round(timeoutMs / 1000)} seconds.`
                );

            }


            if (
                attempt >= retryCount
            ) {

                throw error;

            }

        }
        finally {

            clearTimeout(
                timeout
            );

        }

    }


    throw (
        lastError ||
        new Error(
            "Gemini request failed."
        )
    );

}


// ============================================================
// BUILD GEMINI PARTS
// ============================================================

function buildGeminiParts({
    userText,
    image = null
}) {

    const parts =
        [];


    if (
        cleanText(userText)
    ) {

        parts.push({

            text:
                userText

        });

    }


    if (
        image
    ) {

        const validation =
            validateImage(
                image
            );


        if (
            !validation.valid
        ) {

            throw new Error(
                validation.error
            );

        }


        parts.push(
            imageToGeminiPart(
                image
            )
        );

    }


    if (
        parts.length === 0
    ) {

        throw new Error(
            "No input provided to Gemini."
        );

    }


    return parts;

}


// ============================================================
// GEMINI TEXT MODE
// ============================================================

async function callGeminiText({

    systemPrompt,

    userText,

    image = null,

    temperature = 0.4,

    maxOutputTokens = 500,

    timeoutMs = 20000

}) {

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

                role:
                    "user",

                parts:
                    buildGeminiParts({

                        userText,

                        image

                    })

            }

        ],

        generationConfig: {

            temperature,

            maxOutputTokens

        }

    };


    const result =
        await requestGemini(
            requestBody,
            {

                timeoutMs,

                retryCount:
                    1

            }
        );


    return result.text;

}


// ============================================================
// REMOVE MARKDOWN
// ============================================================

function removeMarkdownCodeBlock(
    text
) {

    let cleaned =
        cleanText(
            text
        );


    cleaned =
        cleaned.replace(
            /^```json\s*/i,
            ""
        );


    cleaned =
        cleaned.replace(
            /^```\s*/i,
            ""
        );


    cleaned =
        cleaned.replace(
            /\s*```$/i,
            ""
        );


    return cleaned.trim();

}


// ============================================================
// SAFE AI JSON PARSER
// ============================================================

function parseAIJSON(
    content
) {

    if (!content) {

        throw new Error(
            "AI returned an empty response."
        );

    }


    const cleaned =
        removeMarkdownCodeBlock(
            content
        );


    // Direct JSON
    try {

        return JSON.parse(
            cleaned
        );

    }
    catch {}



    // Object
    const objectStart =
        cleaned.indexOf("{");

    const objectEnd =
        cleaned.lastIndexOf("}");


    if (
        objectStart !== -1 &&
        objectEnd > objectStart
    ) {

        try {

            return JSON.parse(
                cleaned.slice(
                    objectStart,
                    objectEnd + 1
                )
            );

        }
        catch {}

    }


    // Array
    const arrayStart =
        cleaned.indexOf("[");

    const arrayEnd =
        cleaned.lastIndexOf("]");


    if (
        arrayStart !== -1 &&
        arrayEnd > arrayStart
    ) {

        try {

            return JSON.parse(
                cleaned.slice(
                    arrayStart,
                    arrayEnd + 1
                )
            );

        }
        catch {}

    }


    console.error(
        "AI JSON PARSE FAILED:"
    );

    console.error(
        content
    );


    throw new Error(
        "AI returned invalid JSON."
    );

}


// ============================================================
// GEMINI JSON MODE
// ============================================================

async function callGeminiJSON({

    systemPrompt,

    userText,

    image = null,

    temperature = 0.2,

    maxOutputTokens = 800,

    timeoutMs = 25000

}) {

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

                role:
                    "user",

                parts:
                    buildGeminiParts({

                        userText,

                        image

                    })

            }

        ],

        generationConfig: {

            temperature,

            maxOutputTokens,

            responseMimeType:
                "application/json"

        }

    };


    const result =
        await requestGemini(
            requestBody,
            {

                timeoutMs,

                retryCount:
                    1

            }
        );


    return parseAIJSON(
        result.text
    );

}


// ============================================================
// NORMALIZE TEXT
// ============================================================

function normalizeAIText(
    value,
    fallback = ""
) {

    const text =
        cleanText(
            value
        );


    return (
        text ||
        fallback
    );

}


// ============================================================
// ============================================================
// CIVIC AI
// ============================================================
// ============================================================

const CIVIC_SYSTEM_PROMPT = `

You are CivicAI, an advanced civic problem analysis assistant.

Analyze the citizen's description, image and location.

Do not invent facts.
Do not invent location.
Do not invent evidence.
If something is unclear, say so.

If the user is greeting or asking a normal question,
do not classify it as a civic complaint.

Possible civic categories:

Pothole
Road Damage
Garbage
Waste Dumping
Blocked Drain
Sewage
Water Leakage
Water Supply
Street Light
Electric Pole
Exposed Electrical Wire
Traffic Signal
Flooding
Public Toilet
Noise Issue
Public Safety
Public Infrastructure
Other

Severity:
Low
Medium
High
Critical

Risk:
Low
Medium
High
Critical

Urgency:
Routine
Soon
Urgent
Emergency

Authority:
Local
Municipal
District
State
Emergency

Return ONLY JSON.

Structure:

{
  "isCivicIssue": true,
  "responseType": "civic_issue",
  "problem": "",
  "category": "",
  "severity": "Low",
  "risk": "Low",
  "urgency": "Routine",
  "department": "",
  "authorityLevel": "Local",
  "escalationRequired": false,
  "location": "",
  "confidence": "Medium",
  "visibleEvidence": "",
  "missingInformation": "",
  "summary": "",
  "recommendation": "",
  "message": ""
}

Allowed responseType:
greeting
general_question
civic_issue
unclear

Allowed confidence:
High
Medium
Low

`;


function normalizeCivicAnalysis(
    analysis,
    location
) {

    return {

        isCivicIssue:
            analysis?.isCivicIssue === true,

        responseType:
            normalizeAIText(
                analysis?.responseType,
                "unclear"
            ),

        problem:
            normalizeAIText(
                analysis?.problem
            ),

        category:
            normalizeAIText(
                analysis?.category
            ),

        severity:
            normalizeAIText(
                analysis?.severity,
                "Low"
            ),

        risk:
            normalizeAIText(
                analysis?.risk,
                "Low"
            ),

        urgency:
            normalizeAIText(
                analysis?.urgency,
                "Routine"
            ),

        department:
            normalizeAIText(
                analysis?.department,
                "Municipal Authority"
            ),

        authorityLevel:
            normalizeAIText(
                analysis?.authorityLevel,
                "Local"
            ),

        escalationRequired:
            analysis?.escalationRequired === true,

        location:
            normalizeAIText(
                analysis?.location,
                location
            ),

        confidence:
            normalizeAIText(
                analysis?.confidence,
                "Medium"
            ),

        visibleEvidence:
            normalizeAIText(
                analysis?.visibleEvidence
            ),

        missingInformation:
            normalizeAIText(
                analysis?.missingInformation
            ),

        summary:
            normalizeAIText(
                analysis?.summary
            ),

        recommendation:
            normalizeAIText(
                analysis?.recommendation
            ),

        message:
            normalizeAIText(
                analysis?.message
            )

    };

}


// ============================================================
// /api/analyze
// ============================================================

app.post(
    "/api/analyze",
    async (req, res) => {

        const startedAt =
            Date.now();


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


            let image =
                null;


            if (
                typeof body.image === "string" &&
                body.image.startsWith(
                    "data:image/"
                )
            ) {

                const validation =
                    validateImage(
                        body.image
                    );


                if (
                    !validation.valid
                ) {

                    return res
                        .status(400)
                        .json({

                            success:
                                false,

                            error:
                                validation.error

                        });

                }


                image =
                    body.image;

            }


            if (
                !description &&
                !image
            ) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        error:
                            "Please provide a civic problem description or image."

                    });

            }


            const userText = `

Citizen:
${reporterName || "Anonymous"}

Description:
${description || "No description provided."}

Location:
${location || "Not provided."}

Analyze this input.

If an image is attached, inspect it carefully.

`;


            const analysis =
                await callGeminiJSON({

                    systemPrompt:
                        CIVIC_SYSTEM_PROMPT,

                    userText,

                    image,

                    temperature:
                        0.15,

                    maxOutputTokens:
                        900,

                    timeoutMs:
                        25000

                });


            const normalized =
                normalizeCivicAnalysis(
                    analysis,
                    location
                );


            return res.json({

                success:
                    true,

                source:
                    "google-gemini",

                model:
                    GEMINI_MODEL,

                responseTimeMs:
                    Date.now() -
                    startedAt,

                analysis:
                    normalized

            });

        }
        catch (error) {

            console.error(
                "CIVIC AI ERROR:",
                error?.message ||
                error
            );


            const message =
                String(
                    error?.message ||
                    ""
                );


            if (
                message
                    .toLowerCase()
                    .includes(
                        "timed out"
                    )
            ) {

                return res
                    .status(504)
                    .json({

                        success:
                            false,

                        error:
                            "CivicAI timed out. Please try again.",

                        code:
                            "AI_TIMEOUT"

                    });

            }


            return res
                .status(500)
                .json({

                    success:
                        false,

                    error:
                        message ||
                        "Civic AI analysis failed.",

                    code:
                        "AI_ANALYSIS_ERROR"

                });

        }

    }
);


// ============================================================
// ============================================================
// AI HELP / CIVIC CHAT
// ============================================================
// ============================================================

const CIVIC_CHAT_SYSTEM_PROMPT = `

You are CivicAI, a helpful civic AI assistant.

Help citizens with:

Roads
Garbage
Drainage
Water
Electricity
Street lights
Sanitation
Municipal services
Public infrastructure
Civic safety
Government complaint procedures

Answer naturally.

Do not pretend to be a government officer.

Do not invent official phone numbers.

Do not invent official email addresses.

Do not claim a complaint was submitted unless the backend
actually submitted it.

If information is uncertain, say so.

Return normal conversational text.

Do NOT return JSON.

`;


app.post(
    "/api/chat",
    async (req, res) => {

        const startedAt =
            Date.now();


        try {

            const message =
                cleanText(
                    req.body?.message
                );


            if (!message) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        error:
                            "Message is required."

                    });

            }


            const reply =
                await callGeminiText({

                    systemPrompt:
                        CIVIC_CHAT_SYSTEM_PROMPT,

                    userText:
                        message,

                    temperature:
                        0.45,

                    maxOutputTokens:
                        500,

                    timeoutMs:
                        18000

                });


            return res.json({

                success:
                    true,

                reply,

                response:
                    reply,

                source:
                    "google-gemini",

                model:
                    GEMINI_MODEL,

                responseTimeMs:
                    Date.now() -
                    startedAt

            });

        }
        catch (error) {

            console.error(
                "CHAT ERROR:",
                error?.message ||
                error
            );


            return res
                .status(500)
                .json({

                    success:
                        false,

                    error:
                        error?.message ||
                        "AI chat failed.",

                    code:
                        "CHAT_ERROR"

                });

        }

    }
);


// ============================================================
// ============================================================
// PRODUCT AI
// ============================================================
// ============================================================

const PRODUCT_SYSTEM_PROMPT = `

You are CivicAI Product Scanner.

Analyze a consumer product from image, product name
and user description.

Do not invent:

price
ingredients
expiry
manufacturer
batch number
medical benefits

If information is unclear, say Not available.

Possible categories:

Food
Beverage
Medicine
Cosmetic
Personal Care
Electronic
Household
Clothing
Consumer Product
Other
Unknown

For medicine:
Do not diagnose.
Do not prescribe.
Do not provide personalized dosage.

Return ONLY valid JSON.

Structure:

{
  "success": true,
  "productName": "",
  "brand": "",
  "category": "",
  "manufacturer": "",
  "price": "",
  "currency": "",
  "quantity": "",
  "ingredients": "",
  "manufacturingDate": "",
  "expiryDate": "",
  "batchNumber": "",
  "purpose": "",
  "benefits": "",
  "warnings": "",
  "consumerConcern": "",
  "visibleCondition": "",
  "missingInformation": "",
  "confidence": "Medium",
  "summary": "",
  "recommendation": "",
  "message": ""
}

Confidence:
High
Medium
Low

`;


function normalizeProductAnalysis(
    analysis
) {

    return {

        success:
            true,

        productName:
            normalizeAIText(
                analysis?.productName,
                "Unknown product"
            ),

        brand:
            normalizeAIText(
                analysis?.brand,
                "Not available"
            ),

        category:
            normalizeAIText(
                analysis?.category,
                "Unknown"
            ),

        manufacturer:
            normalizeAIText(
                analysis?.manufacturer,
                "Not available"
            ),

        price:
            normalizeAIText(
                analysis?.price,
                "Not visible"
            ),

        currency:
            normalizeAIText(
                analysis?.currency
            ),

        quantity:
            normalizeAIText(
                analysis?.quantity,
                "Not available"
            ),

        ingredients:
            normalizeAIText(
                analysis?.ingredients,
                "Not available"
            ),

        manufacturingDate:
            normalizeAIText(
                analysis?.manufacturingDate,
                "Not available"
            ),

        expiryDate:
            normalizeAIText(
                analysis?.expiryDate,
                "Not available"
            ),

        batchNumber:
            normalizeAIText(
                analysis?.batchNumber,
                "Not available"
            ),

        purpose:
            normalizeAIText(
                analysis?.purpose
            ),

        benefits:
            normalizeAIText(
                analysis?.benefits
            ),

        warnings:
            normalizeAIText(
                analysis?.warnings,
                "No clear warning visible."
            ),

        consumerConcern:
            normalizeAIText(
                analysis?.consumerConcern
            ),

        visibleCondition:
            normalizeAIText(
                analysis?.visibleCondition,
                "Condition could not be fully verified."
            ),

        missingInformation:
            normalizeAIText(
                analysis?.missingInformation
            ),

        confidence:
            normalizeAIText(
                analysis?.confidence,
                "Medium"
            ),

        summary:
            normalizeAIText(
                analysis?.summary
            ),

        recommendation:
            normalizeAIText(
                analysis?.recommendation
            ),

        message:
            normalizeAIText(
                analysis?.message
            )

    };

}


// ============================================================
// /api/analyze-product
// ============================================================

app.post(
    "/api/analyze-product",
    async (req, res) => {

        const startedAt =
            Date.now();


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


            let image =
                null;


            if (
                typeof body.image === "string" &&
                body.image.startsWith(
                    "data:image/"
                )
            ) {

                const validation =
                    validateImage(
                        body.image
                    );


                if (
                    !validation.valid
                ) {

                    return res
                        .status(400)
                        .json({

                            success:
                                false,

                            error:
                                validation.error

                        });

                }


                image =
                    body.image;

            }


            if (
                !image &&
                !productName &&
                !description
            ) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        error:
                            "Please provide a product image, name or description."

                    });

            }


            const userText = `

Product name:
${productName || "Not provided"}

Description:
${description || "Not provided"}

Analyze the product.

If an image is attached, inspect:
- label
- brand
- price
- ingredients
- dates
- warnings
- packaging
- visible condition

Do not invent information.

`;


            const analysis =
                await callGeminiJSON({

                    systemPrompt:
                        PRODUCT_SYSTEM_PROMPT,

                    userText,

                    image,

                    temperature:
                        0.15,

                    maxOutputTokens:
                        1000,

                    timeoutMs:
                        25000

                });


            const normalized =
                normalizeProductAnalysis(
                    analysis
                );


            return res.json({

                success:
                    true,

                source:
                    "google-gemini",

                model:
                    GEMINI_MODEL,

                responseTimeMs:
                    Date.now() -
                    startedAt,

                product:
                    normalized,

                analysis:
                    normalized

            });

        }
        catch (error) {

            console.error(
                "PRODUCT AI ERROR:",
                error?.message ||
                error
            );


            return res
                .status(500)
                .json({

                    success:
                        false,

                    error:
                        error?.message ||
                        "Product analysis failed.",

                    code:
                        "PRODUCT_AI_ERROR"

                });

        }

    }
);


// ============================================================
// PRODUCT QUESTION
// ============================================================

const PRODUCT_CHAT_SYSTEM_PROMPT = `

You are CivicAI Product Assistant.

Answer questions about a consumer product.

Use only the supplied product information and image.

Do not invent:
price
ingredients
expiry
manufacturer
medical information

For medicine:
Do not diagnose.
Do not prescribe.
Do not provide personalized dosage.

If information is missing, say it is unavailable.

Return normal conversational text.

Do NOT return JSON.

`;


app.post(
    "/api/product-question",
    async (req, res) => {

        try {

            const body =
                req.body || {};


            const question =
                cleanText(
                    body.question ||
                    body.message
                );


            if (!question) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        error:
                            "Product question is required."

                    });

            }


            const productName =
                cleanText(
                    body.productName
                );


            let productContext =
                "No previous product analysis available.";


            if (
                body.product &&
                typeof body.product === "object"
            ) {

                productContext =
                    JSON.stringify(
                        body.product,
                        null,
                        2
                    );

            }


            let image =
                null;


            if (
                typeof body.image === "string" &&
                body.image.startsWith(
                    "data:image/"
                )
            ) {

                const validation =
                    validateImage(
                        body.image
                    );


                if (
                    !validation.valid
                ) {

                    return res
                        .status(400)
                        .json({

                            success:
                                false,

                            error:
                                validation.error

                        });

                }


                image =
                    body.image;

            }


            const userText = `

Product:
${productName || "Unknown"}

Product analysis:
${productContext}

User question:
${question}

Answer using the available information.

`;


            const reply =
                await callGeminiText({

                    systemPrompt:
                        PRODUCT_CHAT_SYSTEM_PROMPT,

                    userText,

                    image,

                    temperature:
                        0.35,

                    maxOutputTokens:
                        500,

                    timeoutMs:
                        18000

                });


            return res.json({

                success:
                    true,

                reply,

                response:
                    reply,

                source:
                    "google-gemini",

                model:
                    GEMINI_MODEL

            });

        }
        catch (error) {

            console.error(
                "PRODUCT QUESTION ERROR:",
                error?.message ||
                error
            );


            return res
                .status(500)
                .json({

                    success:
                        false,

                    error:
                        error?.message ||
                        "Product AI question failed.",

                    code:
                        "PRODUCT_CHAT_ERROR"

                });

        }

    }
);


// ============================================================
// ============================================================
// OTP SYSTEM
// ============================================================
// ============================================================

function generateOTP() {

    return String(
        crypto
            .randomInt(
                100000,
                1000000
            )
    );

}


function saveOTP(
    identifier,
    otp
) {

    otpStore.set(
        identifier,
        {

            otp,

            createdAt:
                Date.now(),

            attempts:
                0

        }
    );

}


function verifyStoredOTP(
    identifier,
    otp
) {

    const record =
        otpStore.get(
            identifier
        );


    if (!record) {

        return {
            success: false,
            error: "OTP not found or expired."
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
            error: "Too many OTP attempts."
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
                )
                .toLowerCase();


            if (
                !email ||
                !email.includes("@")
            ) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        error:
                            "Valid email is required."

                    });

            }


            if (
                !emailTransporter
            ) {

                return res
                    .status(503)
                    .json({

                        success:
                            false,

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

                    <div style="font-family:Arial">

                        <h2>CivicAI Verification</h2>

                        <p>Your verification OTP is:</p>

                        <h1>${otp}</h1>

                        <p>This OTP expires in 5 minutes.</p>

                    </div>

                `

            });


            return res.json({

                success:
                    true,

                message:
                    "OTP sent successfully."

            });

        }
        catch (error) {

            console.error(
                "EMAIL OTP ERROR:",
                error
            );


            return res
                .status(500)
                .json({

                    success:
                        false,

                    error:
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
            )
            .toLowerCase();


        const otp =
            cleanText(
                req.body?.otp
            );


        if (
            !email ||
            !otp
        ) {

            return res
                .status(400)
                .json({

                    success:
                        false,

                    error:
                        "Email and OTP are required."

                });

        }


        const result =
            verifyStoredOTP(
                email,
                otp
            );


        if (
            !result.success
        ) {

            return res
                .status(400)
                .json(
                    result
                );

        }


        return res.json({

            success:
                true,

            verified:
                true,

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

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        error:
                            "Phone number is required."

                    });

            }


            if (
                !twilioClient
            ) {

                return res
                    .status(503)
                    .json({

                        success:
                            false,

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

                success:
                    true,

                message:
                    "Phone OTP sent successfully."

            });

        }
        catch (error) {

            console.error(
                "PHONE OTP ERROR:",
                error
            );


            return res
                .status(500)
                .json({

                    success:
                        false,

                    error:
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


        if (
            !phone ||
            !otp
        ) {

            return res
                .status(400)
                .json({

                    success:
                        false,

                    error:
                        "Phone and OTP are required."

                });

        }


        const result =
            verifyStoredOTP(
                phone,
                otp
            );


        if (
            !result.success
        ) {

            return res
                .status(400)
                .json(
                    result
                );

        }


        return res.json({

            success:
                true,

            verified:
                true,

            message:
                "Phone verified successfully."

        });

    }
);


// ============================================================
// ============================================================
// REPORT STORAGE
// ============================================================
// ============================================================

function readReports() {

    try {

        const raw =
            fs.readFileSync(
                REPORTS_FILE,
                "utf8"
            );


        const data =
            JSON.parse(
                raw
            );


        return Array.isArray(
            data
        )
            ? data
            : [];

    }
    catch {

        return [];

    }

}


function writeReports(
    reports
) {

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
                    typeof body.image === "string"
                        ? body.image
                        : null,

                analysis:
                    body.analysis &&
                    typeof body.analysis === "object"
                        ? body.analysis
                        : null,

                status:
                    "Submitted",

                createdAt:
                    new Date()
                        .toISOString()

            };


            if (
                !report.description &&
                !report.image &&
                !report.analysis
            ) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        error:
                            "Report information is required."

                    });

            }


            const reports =
                readReports();


            reports.push(
                report
            );


            writeReports(
                reports
            );


            return res.json({

                success:
                    true,

                message:
                    "Civic report created successfully.",

                report

            });

        }
        catch (error) {

            console.error(
                "CREATE REPORT ERROR:",
                error
            );


            return res
                .status(500)
                .json({

                    success:
                        false,

                    error:
                        "Failed to create report."

                });

        }

    }
);


// ============================================================
// GET ALL REPORTS
// ============================================================

app.get(
    "/api/reports",
    (req, res) => {

        const reports =
            readReports();


        return res.json({

            success:
                true,

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

            return res
                .status(404)
                .json({

                    success:
                        false,

                    error:
                        "Report not found."

                });

        }


        return res.json({

            success:
                true,

            report

        });

    }
);


// ============================================================
// SEND REPORT BY EMAIL
// ============================================================

app.post(
    "/api/send-report",
    async (req, res) => {

        try {

            if (
                !emailTransporter
            ) {

                return res
                    .status(503)
                    .json({

                        success:
                            false,

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

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        error:
                            "Recipient email is required."

                    });

            }


            const reportId =
                cleanText(
                    body.reportId
                );


            const description =
                cleanText(
                    body.description
                );


            const location =
                cleanText(
                    body.location
                );


            const analysis =
                body.analysis &&
                typeof body.analysis === "object"
                    ? body.analysis
                    : {};


            const subject =
                reportId
                    ? `CivicAI Complaint - ${reportId}`
                    : "CivicAI Civic Complaint";


            const text = `

CIVICAI CIVIC COMPLAINT

Report ID:
${reportId || "Not available"}

Citizen:
${cleanText(body.reporterName) || "Anonymous"}

Location:
${location || "Not provided"}

Problem:
${description || analysis.problem || "Not provided"}

Category:
${analysis.category || "Not available"}

Severity:
${analysis.severity || "Not available"}

Risk:
${analysis.risk || "Not available"}

Urgency:
${analysis.urgency || "Not available"}

Department:
${analysis.department || "Not available"}

Authority:
${analysis.authorityLevel || "Not available"}

Summary:
${analysis.summary || "Not available"}

Recommendation:
${analysis.recommendation || "Not available"}

This complaint was generated through CivicAI.

`;


            await emailTransporter.sendMail({

                from:
                    EMAIL_FROM,

                to,

                subject,

                text

            });


            return res.json({

                success:
                    true,

                message:
                    "Civic report sent successfully by email."

            });

        }
        catch (error) {

            console.error(
                "SEND REPORT ERROR:",
                error
            );


            return res
                .status(500)
                .json({

                    success:
                        false,

                    error:
                        "Failed to send civic report."

                });

        }

    }
);


// ============================================================
// ============================================================
// AI STATUS
// ============================================================
// ============================================================

app.get(
    "/api/ai-status",
    (req, res) => {

        return res.json({

            success:
                true,

            ai: {

                provider:
                    "Google Gemini",

                model:
                    GEMINI_MODEL,

                configured:
                    hasGeminiKey(),

                civicAI:
                    true,

                chatAI:
                    true,

                productAI:
                    true,

                imageAI:
                    true

            },

            serverTime:
                new Date()
                    .toISOString()

        });

    }
);


// ============================================================
// PRODUCT STATUS
// ============================================================

app.get(
    "/api/product-status",
    (req, res) => {

        return res.json({

            success:
                true,

            productAI: {

                provider:
                    "Google Gemini",

                model:
                    GEMINI_MODEL,

                configured:
                    hasGeminiKey(),

                scanner:
                    true,

                productChat:
                    true,

                imageAnalysis:
                    true

            },

            serverTime:
                new Date()
                    .toISOString()

        });

    }
);


// ============================================================
// HEALTH CHECK
// ============================================================

app.get(
    "/api/health",
    (req, res) => {

        return res.json({

            success:
                true,

            status:
                "online",

            service:
                "CivicAI Backend",

            aiProvider:
                "Google Gemini",

            aiConfigured:
                hasGeminiKey(),

            geminiModel:
                GEMINI_MODEL,

            emailConfigured:
                hasEmailConfig(),

            phoneConfigured:
                hasTwilioConfig(),

            timestamp:
                new Date()
                    .toISOString()

        });

    }
);


// ============================================================
// API INFORMATION
// ============================================================

app.get(
    "/api",
    (req, res) => {

        return res.json({

            success:
                true,

            message:
                "CivicAI backend API is running.",

            endpoints: {

                health:
                    "GET /api/health",

                aiStatus:
                    "GET /api/ai-status",

                civicAI:
                    "POST /api/analyze",

                chat:
                    "POST /api/chat",

                productAI:
                    "POST /api/analyze-product",

                productQuestion:
                    "POST /api/product-question",

                productStatus:
                    "GET /api/product-status",

                emailOTP:
                    "POST /api/request-otp",

                verifyEmailOTP:
                    "POST /api/verify-otp",

                phoneOTP:
                    "POST /api/request-phone-otp",

                verifyPhoneOTP:
                    "POST /api/verify-phone-otp",

                createReport:
                    "POST /api/reports",

                reports:
                    "GET /api/reports",

                singleReport:
                    "GET /api/reports/:reportId",

                sendReport:
                    "POST /api/send-report"

            }

        });

    }
);


// ============================================================
// FRONTEND
// ============================================================

app.use(
    express.static(
        __dirname,
        {
            dotfiles:
                "deny"
        }
    )
);


// ============================================================
// API 404
// ============================================================

app.use(
    "/api",
    (req, res) => {

        return res
            .status(404)
            .json({

                success:
                    false,

                error:
                    "API endpoint not found.",

                path:
                    req.originalUrl

            });

    }
);


// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
            "GLOBAL SERVER ERROR:",
            error
        );


        if (
            res.headersSent
        ) {

            return next(
                error
            );

        }


        return res
            .status(500)
            .json({

                success:
                    false,

                error:
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
            "=================================================="
        );
        console.log(
            "             CIVICAI BACKEND"
        );
        console.log(
            "=================================================="
        );

        console.log(
            `Server running on port: ${PORT}`
        );

        console.log(
            `Local URL: http://localhost:${PORT}`
        );

        console.log("");

        console.log(
            "FRONTEND:"
        );

        console.log(
            `INDEX: http://localhost:${PORT}/`
        );

        console.log("");

        console.log(
            "AI SERVICES:"
        );

        console.log(
            "Civic AI:",
            hasGeminiKey()
                ? "CONFIGURED"
                : "NOT CONFIGURED"
        );

        console.log(
            "AI Model:",
            GEMINI_MODEL
        );

        console.log(
            "AI Help: ENABLED"
        );

        console.log(
            "Product Scanner: ENABLED"
        );

        console.log(
            "Image AI: ENABLED"
        );

        console.log("");

        console.log(
            "OTHER SERVICES:"
        );

        console.log(
            "Gmail:",
            hasEmailConfig()
                ? "CONFIGURED"
                : "NOT CONFIGURED"
        );

        console.log(
            "Twilio:",
            hasTwilioConfig()
                ? "CONFIGURED"
                : "NOT CONFIGURED"
        );

        console.log("");

        console.log(
            "API:"
        );

        console.log(
            `http://localhost:${PORT}/api`
        );

        console.log(
            `http://localhost:${PORT}/api/health`
        );

        console.log(
            `http://localhost:${PORT}/api/ai-status`
        );

        console.log(
            `http://localhost:${PORT}/api/product-status`
        );

        console.log(
            "=================================================="
        );

        console.log("");

    }
);