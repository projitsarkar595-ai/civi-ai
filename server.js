// =========================================================
// CIVICAI — COMPLETE BACKEND SERVER
// Express + Google Gemini
// Civic AI Analysis
// Gmail OTP Verification
// Phone OTP Verification
// Authority Routing
// Automatic Complaint Letter
// Gmail Complaint Sending
// =========================================================

"use strict";

// =========================================================
// IMPORTS
// =========================================================

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


// =========================================================
// ENVIRONMENT
// =========================================================

dotenv.config();


// =========================================================
// APP
// =========================================================

const app = express();

const PORT =
    Number(process.env.PORT) || 3000;


// =========================================================
// ES MODULE PATH
// =========================================================

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);


// =========================================================
// DIRECTORIES
// =========================================================

const FRONTEND_DIR =
    __dirname;

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


// =========================================================
// GEMINI CONFIGURATION
// =========================================================

const GEMINI_API_KEY =
    process.env.GEMINI_API_KEY || "";

const GEMINI_MODEL =
    process.env.GEMINI_MODEL ||
    "gemini-3.1-flash-lite";

const GEMINI_API_URL =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;


// =========================================================
// EMAIL CONFIGURATION
// =========================================================

const EMAIL_USER =
    process.env.EMAIL_USER || "";

const EMAIL_PASSWORD =
    process.env.EMAIL_PASSWORD || "";

const EMAIL_FROM =
    process.env.EMAIL_FROM ||
    EMAIL_USER;


// =========================================================
// TWILIO CONFIGURATION
// =========================================================

const TWILIO_ACCOUNT_SID =
    process.env.TWILIO_ACCOUNT_SID || "";

const TWILIO_AUTH_TOKEN =
    process.env.TWILIO_AUTH_TOKEN || "";

const TWILIO_PHONE_NUMBER =
    process.env.TWILIO_PHONE_NUMBER || "";


// =========================================================
// OTP CONFIGURATION
// =========================================================

const OTP_EXPIRY_MS =
    5 * 60 * 1000;

const MAX_OTP_ATTEMPTS =
    5;


// =========================================================
// IN-MEMORY OTP STORE
// =========================================================
//
// Production-এ Redis/database ব্যবহার করা ভালো.
// বর্তমানে সহজ implementation হিসেবে memory ব্যবহার করা হচ্ছে.
//

const otpStore =
    new Map();


// =========================================================
// VERIFIED USERS
// =========================================================

const verifiedUsers =
    new Map();


// =========================================================
// MIDDLEWARE
// =========================================================

app.use(
    cors({
        origin: true,
        credentials: false
    })
);

app.use(
    express.json({
        limit: "12mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "12mb"
    })
);


// =========================================================
// DATA DIRECTORY
// =========================================================

if (
    !fs.existsSync(
        DATA_DIR
    )
) {

    fs.mkdirSync(
        DATA_DIR,
        {
            recursive: true
        }
    );

}


// =========================================================
// REPORT FILE
// =========================================================

if (
    !fs.existsSync(
        REPORTS_FILE
    )
) {

    fs.writeFileSync(
        REPORTS_FILE,
        "[]",
        "utf8"
    );

}


// =========================================================
// UTILITY
// =========================================================

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


// =========================================================
// GEMINI KEY CHECK
// =========================================================

function hasGeminiKey() {

    return Boolean(
        GEMINI_API_KEY &&
        String(
            GEMINI_API_KEY
        ).trim()
    );

}


// =========================================================
// EMAIL CHECK
// =========================================================

function hasEmailConfig() {

    return Boolean(
        EMAIL_USER &&
        EMAIL_PASSWORD
    );

}


// =========================================================
// TWILIO CHECK
// =========================================================

function hasTwilioConfig() {

    return Boolean(
        TWILIO_ACCOUNT_SID &&
        TWILIO_AUTH_TOKEN &&
        TWILIO_PHONE_NUMBER
    );

}


// =========================================================
// EMAIL TRANSPORTER
// =========================================================

let emailTransporter = null;

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


// =========================================================
// TWILIO CLIENT
// =========================================================

let twilioClient = null;

if (
    hasTwilioConfig()
) {

    twilioClient =
        twilio(
            TWILIO_ACCOUNT_SID,
            TWILIO_AUTH_TOKEN
        );

}


// =========================================================
// HEALTH
// =========================================================

app.get(
    "/api/health",
    (req, res) => {

        return res.json({

            success: true,

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


// =========================================================
// API INFO
// =========================================================

app.get(
    "/api",
    (req, res) => {

        return res.json({

            success: true,

            message:
                "CivicAI backend API is running.",

            endpoints: {

                health:
                    "GET /api/health",

                analyze:
                    "POST /api/analyze",

                analyzeProduct:
                    "POST /api/analyze-product",

                productQuestion:
                    "POST /api/product-question",

                requestOtp:
                    "POST /api/request-otp",

                verifyOtp:
                    "POST /api/verify-otp",

                sendReport:
                    "POST /api/send-report",

                createReport:
                    "POST /api/reports",

                reports:
                    "GET /api/reports",

                singleReport:
                    "GET /api/reports/:reportId"

            }

        });

    }
);


// =========================================================
// IMAGE VALIDATION
// =========================================================

function validateImage(image) {

    if (
        !image ||
        typeof image !== "string"
    ) {

        return {

            valid: false,

            error:
                "Image is required."

        };

    }


    if (
        !image.startsWith(
            "data:image/"
        )
    ) {

        return {

            valid: false,

            error:
                "Invalid image format."

        };

    }


    if (
        image.length >
        7_000_000
    ) {

        return {

            valid: false,

            error:
                "Image is too large."

        };

    }


    return {

        valid: true

    };

}


// =========================================================
// IMAGE → GEMINI PART
// =========================================================

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


// =========================================================
// GEMINI REQUEST
// =========================================================

async function callGemini({

    systemPrompt,

    userText,

    image = null,

    temperature = 0.4,

    maxOutputTokens = 1200,

    jsonMode = true

}) {

    if (
        !hasGeminiKey()
    ) {

        throw new Error(
            "GEMINI_API_KEY is missing."
        );

    }


    const parts = [];


    parts.push({

        text:
            userText

    });


    if (
        image
    ) {

        parts.push(
            imageToGeminiPart(
                image
            )
        );

    }


    const generationConfig = {

        temperature,

        maxOutputTokens

    };


    if (
        jsonMode
    ) {

        generationConfig.responseMimeType =
            "application/json";

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

                role:
                    "user",

                parts

            }

        ],

        generationConfig

    };


    const controller =
        new AbortController();


    const timeout =
        setTimeout(
            () => {

                controller.abort();

            },
            60_000
        );


    try {

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

            let errorMessage =
                responseText;


            try {

                const errorData =
                    JSON.parse(
                        responseText
                    );

                errorMessage =
                    errorData
                        ?.error
                        ?.message ||
                    responseText;

            }
            catch {

                // ignore

            }


            throw new Error(
                `Gemini API ${response.status}: ${errorMessage}`
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
                "Gemini returned invalid JSON."
            );

        }


        const content =
            data
                ?.candidates
                ?.[0]
                ?.content
                ?.parts
                ?.map(
                    part =>
                        part.text || ""
                )
                .join("")
                .trim();


        if (
            !content
        ) {

            throw new Error(
                "Gemini returned empty response."
            );

        }


        return content;

    }
    catch (error) {

        if (
            error?.name ===
            "AbortError"
        ) {

            throw new Error(
                "Gemini request timed out."
            );

        }

        throw error;

    }
    finally {

        clearTimeout(
            timeout
        );

    }

}


// =========================================================
// PARSE AI JSON
// =========================================================

function parseAIJson(
    content
) {

    if (
        !content
    ) {

        throw new Error(
            "AI returned empty response."
        );

    }


    let cleaned =
        String(
            content
        )
        .trim();


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
            )
            .trim();


    try {

        return JSON.parse(
            cleaned
        );

    }
    catch {

        // continue

    }


    const start =
        cleaned.indexOf(
            "{"
        );

    const end =
        cleaned.lastIndexOf(
            "}"
        );


    if (
        start !== -1 &&
        end !== -1 &&
        end > start
    ) {

        try {

            return JSON.parse(
                cleaned.slice(
                    start,
                    end + 1
                )
            );

        }
        catch {

            // continue

        }

    }


    throw new Error(
        "AI returned invalid JSON."
    );

}


// =========================================================
// CIVIC AI SYSTEM PROMPT
// =========================================================

const CIVIC_SYSTEM_PROMPT = `

You are CivicAI, an advanced civic complaint analysis AI.

Your job is to analyze a citizen's description and/or uploaded photograph.

Carefully inspect EVERYTHING provided.

Determine:

1. Whether there is a genuine civic/public problem.
2. What the actual problem is.
3. Category.
4. Severity.
5. Risk.
6. Urgency.
7. Appropriate government department.
8. Appropriate authority level.
9. Whether escalation to a higher authority is necessary.
10. What evidence is visible.
11. What information is missing.
12. Recommended action.

Do NOT invent facts.

Do NOT invent a location.

Do NOT invent evidence.

Do NOT claim certainty when the image is unclear.

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

Authority levels:

Local
Municipal
District
State
Emergency

Examples:

Pothole -> Roads / Municipal Engineering

Garbage -> Municipal Sanitation

Drainage -> Drainage / Municipal Engineering

Street light -> Electricity / Municipal Authority

Water leakage -> Water Supply

Sewage overflow -> Sanitation / Sewerage

Dangerous exposed wire -> Electricity / Emergency

Major road collapse -> Roads / Municipal Engineering / Higher Authority

Flooding -> Disaster Management / Municipal Authority

If there is immediate danger to life, classify the issue as Critical and Emergency.

Return ONLY JSON.

Use:

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
"summary": "",
"recommendation": "",
"message": ""
}

responseType:

greeting
general_question
civic_issue
unclear

confidence:

High
Medium
Low

`;


// =========================================================
// ANALYZE CIVIC PROBLEM
// =========================================================

app.post(
    "/api/analyze",
    async (req, res) => {

        try {

            const {
                description,
                location,
                reporterName,
                image
            } =
                req.body || {};


            const cleanDescription =
                cleanText(
                    description
                );

            const cleanLocation =
                cleanText(
                    location
                );

            const cleanReporterName =
                cleanText(
                    reporterName
                );


            const cleanImage =
                typeof image === "string" &&
                image.startsWith(
                    "data:image/"
                )
                    ? image
                    : null;


            if (
                !cleanDescription &&
                !cleanImage
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        error:
                            "Please provide description or image."

                    });

            }


            const userText = `

Citizen name:
${cleanReporterName || "Anonymous"}

Citizen description:
${cleanDescription || "No description provided."}

Citizen location:
${cleanLocation || "Location not provided."}

Analyze the attached evidence carefully.

`;



            const aiContent =
                await callGemini({

                    systemPrompt:
                        CIVIC_SYSTEM_PROMPT,

                    userText,

                    image:
                        cleanImage,

                    temperature:
                        0.25,

                    maxOutputTokens:
                        1400,

                    jsonMode:
                        true

                });


            const analysis =
                parseAIJson(
                    aiContent
                );


            const result = {

                isCivicIssue:
                    analysis.isCivicIssue === true,

                responseType:
                    cleanText(
                        analysis.responseType
                    ) || "unclear",

                problem:
                    cleanText(
                        analysis.problem
                    ),

                category:
                    cleanText(
                        analysis.category
                    ),

                severity:
                    cleanText(
                        analysis.severity
                    ) || "Low",

                risk:
                    cleanText(
                        analysis.risk
                    ) || "Low",

                urgency:
                    cleanText(
                        analysis.urgency
                    ) || "Routine",

                department:
                    cleanText(
                        analysis.department
                    ),

                authorityLevel:
                    cleanText(
                        analysis.authorityLevel
                    ) || "Local",

                escalationRequired:
                    analysis.escalationRequired === true,

                location:
                    cleanText(
                        analysis.location
                    ) ||
                    cleanLocation,

                confidence:
                    cleanText(
                        analysis.confidence
                    ) || "Medium",

                visibleEvidence:
                    cleanText(
                        analysis.visibleEvidence
                    ),

                summary:
                    cleanText(
                        analysis.summary
                    ),

                recommendation:
                    cleanText(
                        analysis.recommendation
                    ),

                message:
                    cleanText(
                        analysis.message
                    )

            };


            return res.json({

                success: true,

                source:
                    "google-gemini",

                model:
                    GEMINI_MODEL,

                analysis:
                    result

            });

        }
        catch (error) {

            console.error(
                "CIVIC AI ERROR:",
                error
            );


            return res
                .status(500)
                .json({

                    success: false,

                    error:
                        error?.message ||
                        "AI analysis failed."

                });

        }

    }
);


// =========================================================
// AUTHORITY DATABASE
// =========================================================
//
// এগুলো example.
// তোমার actual authority Gmail/phone এখানে বসাবে.
//

const AUTHORITIES = {

    roads: {

        department:
            "Roads / Municipal Engineering",

        email:
            process.env.ROAD_AUTHORITY_EMAIL || "",

        phone:
            process.env.ROAD_AUTHORITY_PHONE || ""

    },

    sanitation: {

        department:
            "Municipal Sanitation",

        email:
            process.env.SANITATION_AUTHORITY_EMAIL || "",

        phone:
            process.env.SANITATION_AUTHORITY_PHONE || ""

    },

    drainage: {

        department:
            "Drainage / Sewerage",

        email:
            process.env.DRAINAGE_AUTHORITY_EMAIL || "",

        phone:
            process.env.DRAINAGE_AUTHORITY_PHONE || ""

    },

    electricity: {

        department:
            "Electricity Department",

        email:
            process.env.ELECTRICITY_AUTHORITY_EMAIL || "",

        phone:
            process.env.ELECTRICITY_AUTHORITY_PHONE || ""

    },

    water: {

        department:
            "Water Supply Department",

        email:
            process.env.WATER_AUTHORITY_EMAIL || "",

        phone:
            process.env.WATER_AUTHORITY_PHONE || ""

    },

    general: {

        department:
            "Municipal Authority",

        email:
            process.env.GENERAL_AUTHORITY_EMAIL || "",

        phone:
            process.env.GENERAL_AUTHORITY_PHONE || ""

    }

};


// =========================================================
// AUTHORITY ROUTING
// =========================================================

function getAuthority(
    analysis
) {

    const department =
        cleanText(
            analysis?.department
        ).toLowerCase();


    if (
        department.includes("road")
    ) {

        return AUTHORITIES.roads;

    }


    if (
        department.includes("garbage") ||
        department.includes("sanitation") ||
        department.includes("waste")
    ) {

        return AUTHORITIES.sanitation;

    }


    if (
        department.includes("drain") ||
        department.includes("sewer")
    ) {

        return AUTHORITIES.drainage;

    }


    if (
        department.includes("electric")
    ) {

        return AUTHORITIES.electricity;

    }


    if (
        department.includes("water")
    ) {

        return AUTHORITIES.water;

    }


    return AUTHORITIES.general;

}


// =========================================================
// OTP GENERATOR
// =========================================================

function generateOTP() {

    return crypto
        .randomInt(
            100000,
            1000000
        )
        .toString();

}


// =========================================================
// OTP HASH
// =========================================================

function hashOTP(
    otp
) {

    return crypto
        .createHash(
            "sha256"
        )
        .update(
            otp
        )
        .digest(
            "hex"
        );

}


// =========================================================
// OTP REQUEST ID
// =========================================================

function generateOtpId() {

    return crypto
        .randomBytes(
            24
        )
        .toString(
            "hex"
        );

}


// =========================================================
// SEND EMAIL OTP
// =========================================================

async function sendEmailOTP(
    email,
    otp
) {

    if (
        !emailTransporter
    ) {

        throw new Error(
            "Gmail SMTP is not configured."
        );

    }


    await emailTransporter.sendMail({

        from:
            EMAIL_FROM,

        to:
            email,

        subject:
            "CivicAI Verification Code",

        text:
            `Your CivicAI verification code is ${otp}. This code expires in 5 minutes. Do not share this code with anyone.`,

        html: `

<!DOCTYPE html>

<html>

<body style="
font-family:Arial,sans-serif;
background:#f4f7fb;
padding:30px;
">

<div style="
max-width:600px;
margin:auto;
background:white;
padding:30px;
border-radius:16px;
">

<h2 style="
color:#003566;
">
CivicAI Verification
</h2>

<p>
Your verification code is:
</p>

<div style="
font-size:36px;
font-weight:bold;
letter-spacing:8px;
color:#003566;
padding:20px;
background:#f1f5f9;
text-align:center;
border-radius:12px;
">

${otp}

</div>

<p>
This code will expire in <b>5 minutes</b>.
</p>

<p>
If you did not request this verification, you can safely ignore this email.
</p>

<hr>

<p style="color:#777;">
CivicAI
</p>

</div>

</body>

</html>

`

    });

}


// =========================================================
// SEND PHONE OTP
// =========================================================

async function sendPhoneOTP(
    phone,
    otp
) {

    if (
        !twilioClient
    ) {

        throw new Error(
            "Twilio is not configured."
        );

    }


    await twilioClient.messages.create({

        body:
            `CivicAI verification code: ${otp}. This code expires in 5 minutes. Do not share it.`,

        from:
            TWILIO_PHONE_NUMBER,

        to:
            phone

    });

}


// =========================================================
// REQUEST OTP
// =========================================================

app.post(
    "/api/request-otp",
    async (req, res) => {

        try {

            const {
                email,
                phone
            } =
                req.body || {};


            const cleanEmail =
                cleanText(
                    email
                ).toLowerCase();


            const cleanPhone =
                cleanText(
                    phone
                );


            if (
                !cleanEmail &&
                !cleanPhone
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        error:
                            "Email or phone number is required."

                    });

            }


            if (
                cleanEmail &&
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
                    .test(
                        cleanEmail
                    )
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        error:
                            "Invalid email address."

                    });

            }


            const otp =
                generateOTP();


            const otpId =
                generateOtpId();


            const record = {

                otpHash:
                    hashOTP(
                        otp
                    ),

                email:
                    cleanEmail,

                phone:
                    cleanPhone,

                expiresAt:
                    Date.now() +
                    OTP_EXPIRY_MS,

                attempts:
                    0,

                verified:
                    false

            };


            otpStore.set(
                otpId,
                record
            );


            let emailSent =
                false;

            let phoneSent =
                false;


            if (
                cleanEmail
            ) {

                await sendEmailOTP(
                    cleanEmail,
                    otp
                );

                emailSent =
                    true;

            }


            if (
                cleanPhone
            ) {

                await sendPhoneOTP(
                    cleanPhone,
                    otp
                );

                phoneSent =
                    true;

            }


            return res.json({

                success: true,

                otpId,

                emailSent,

                phoneSent,

                expiresInSeconds:
                    300

            });

        }
        catch (error) {

            console.error(
                "OTP REQUEST ERROR:",
                error
            );


            return res
                .status(500)
                .json({

                    success: false,

                    error:
                        error?.message ||
                        "Unable to send OTP."

                });

        }

    }
);


// =========================================================
// VERIFY OTP
// =========================================================

app.post(
    "/api/verify-otp",
    (req, res) => {

        try {

            const {
                otpId,
                otp
            } =
                req.body || {};


            const cleanOtpId =
                cleanText(
                    otpId
                );

            const cleanOtp =
                cleanText(
                    otp
                );


            if (
                !cleanOtpId ||
                !cleanOtp
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        error:
                            "OTP ID and OTP are required."

                    });

            }


            const record =
                otpStore.get(
                    cleanOtpId
                );


            if (
                !record
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        error:
                            "OTP session expired or invalid."

                    });

            }


            if (
                Date.now() >
                record.expiresAt
            ) {

                otpStore.delete(
                    cleanOtpId
                );

                return res
                    .status(400)
                    .json({

                        success: false,

                        error:
                            "OTP has expired."

                    });

            }


            record.attempts++;


            if (
                record.attempts >
                MAX_OTP_ATTEMPTS
            ) {

                otpStore.delete(
                    cleanOtpId
                );

                return res
                    .status(429)
                    .json({

                        success: false,

                        error:
                            "Too many OTP attempts."

                    });

            }


            if (
                hashOTP(
                    cleanOtp
                ) !==
                record.otpHash
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        error:
                            "Incorrect OTP."

                    });

            }


            const verificationToken =
                crypto
                    .randomBytes(
                        32
                    )
                    .toString(
                        "hex"
                    );


            verifiedUsers.set(
                verificationToken,
                {

                    email:
                        record.email,

                    phone:
                        record.phone,

                    verifiedAt:
                        Date.now(),

                    expiresAt:
                        Date.now() +
                        30 * 60 * 1000

                }
            );


            otpStore.delete(
                cleanOtpId
            );


            return res.json({

                success: true,

                verified: true,

                verificationToken,

                message:
                    "User verified successfully."

            });

        }
        catch (error) {

            console.error(
                "OTP VERIFY ERROR:",
                error
            );


            return res
                .status(500)
                .json({

                    success: false,

                    error:
                        "OTP verification failed."

                });

        }

    }
);


// =========================================================
// CHECK VERIFICATION
// =========================================================

function getVerifiedUser(
    token
) {

    if (
        !token
    ) {

        return null;

    }


    const user =
        verifiedUsers.get(
            token
        );


    if (
        !user
    ) {

        return null;

    }


    if (
        Date.now() >
        user.expiresAt
    ) {

        verifiedUsers.delete(
            token
        );

        return null;

    }


    return user;

}


// =========================================================
// GENERATE REPORT ID
// =========================================================

function generateReportId() {

    return (
        "CIVIC-" +
        Date.now().toString().slice(-8) +
        "-" +
        crypto
            .randomInt(
                1000,
                9999
            )
    );

}


// =========================================================
// GENERATE COMPLAINT LETTER
// =========================================================

async function generateComplaintLetter({

    reporterName,

    description,

    location,

    analysis,

    authority

}) {

    const systemPrompt = `

You are CivicAI Complaint Letter Generator.

Create a formal, professional civic complaint letter.

The letter must be based ONLY on the supplied facts and AI analysis.

Never invent facts.

Never invent dates.

Never invent evidence.

Never invent authority names.

The letter should include:

- Subject
- Respectful greeting
- Problem description
- Location
- Severity/risk
- Evidence summary
- Requested action
- Closing
- Citizen name

Write a clear professional complaint suitable for sending to a government authority.

Return ONLY JSON:

{
    "subject": "",
    "body": ""
}

`;


    const userText = `

Citizen name:
${reporterName || "Citizen"}

Description:
${description || "No written description provided."}

Location:
${location || "Not provided"}

AI analysis:
${JSON.stringify(
    analysis,
    null,
    2
)}

Target department:
${authority?.department || "Municipal Authority"}

Write the complete complaint letter.

`;


    const aiContent =
        await callGemini({

            systemPrompt,

            userText,

            temperature:
                0.25,

            maxOutputTokens:
                1600,

            jsonMode:
                true

        });


    const result =
        parseAIJson(
            aiContent
        );


    return {

        subject:
            cleanText(
                result.subject
            ) ||
            "Civic Complaint",

        body:
            cleanText(
                result.body
            ) ||
            "Please investigate and take appropriate action regarding the reported civic issue."

    };

}


// =========================================================
// SEND REPORT TO AUTHORITY
// =========================================================

app.post(
    "/api/send-report",
    async (req, res) => {

        try {

            const {
                verificationToken,
                reporterName,
                reporterEmail,
                reporterPhone,
                description,
                location,
                analysis
            } =
                req.body || {};


            // =================================================
            // USER VERIFICATION
            // =================================================

            const verifiedUser =
                getVerifiedUser(
                    cleanText(
                        verificationToken
                    )
                );


            if (
                !verifiedUser
            ) {

                return res
                    .status(403)
                    .json({

                        success: false,

                        error:
                            "User verification required before sending the complaint."

                    });

            }


            // =================================================
            // VALIDATION
            // =================================================

            if (
                !analysis ||
                analysis.isCivicIssue !== true
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        error:
                            "A valid civic issue analysis is required."

                    });

            }


            if (
                !cleanText(
                    location
                )
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        error:
                            "Location is required."

                    });

            }


            // =================================================
            // AUTHORITY
            // =================================================

            const authority =
                getAuthority(
                    analysis
                );


            if (
                !authority.email
            ) {

                return res
                    .status(500)
                    .json({

                        success: false,

                        error:
                            "No authority email has been configured for this issue."

                    });

            }


            // =================================================
            // COMPLAINT LETTER
            // =================================================

            const complaint =
                await generateComplaintLetter({

                    reporterName:
                        cleanText(
                            reporterName
                        ) ||
                        "Citizen",

                    description:
                        cleanText(
                            description
                        ),

                    location:
                        cleanText(
                            location
                        ),

                    analysis,

                    authority

                });


            // =================================================
            // EMAIL
            // =================================================

            if (
                !emailTransporter
            ) {

                return res
                    .status(500)
                    .json({

                        success: false,

                        error:
                            "Gmail is not configured on the server."

                    });

            }


            const reportId =
                generateReportId();


            const mailSubject =
                `[CivicAI ${analysis.severity || "Issue"}] ${complaint.subject} — ${reportId}`;


            await emailTransporter.sendMail({

                from:
                    EMAIL_FROM,

                to:
                    authority.email,

                replyTo:
                    cleanText(
                        reporterEmail
                    ) ||
                    verifiedUser.email ||
                    EMAIL_USER,

                subject:
                    mailSubject,

                text:
                    complaint.body,

                html: `

<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

</head>

<body style="
margin:0;
padding:30px;
background:#f4f7fb;
font-family:Arial,sans-serif;
color:#172033;
">

<div style="
max-width:720px;
margin:auto;
background:#ffffff;
border-radius:18px;
overflow:hidden;
box-shadow:0 10px 30px rgba(0,0,0,.08);
">

<div style="
background:linear-gradient(
135deg,
#000814,
#001d3d,
#003566
);
padding:28px;
color:white;
">

<h1 style="
margin:0;
font-size:25px;
">
CivicAI
</h1>

<p style="
margin:8px 0 0;
opacity:.85;
">
Official Civic Complaint
</p>

</div>

<div style="
padding:30px;
">

<div style="
background:#f4f7fb;
padding:18px;
border-radius:12px;
margin-bottom:22px;
">

<p>
<b>Report ID:</b>
${reportId}
</p>

<p>
<b>Department:</b>
${authority.department}
</p>

<p>
<b>Severity:</b>
${cleanText(analysis.severity)}
</p>

<p>
<b>Risk:</b>
${cleanText(analysis.risk)}
</p>

<p>
<b>Urgency:</b>
${cleanText(analysis.urgency)}
</p>

<p>
<b>Location:</b>
${cleanText(location)}
</p>

</div>

<h2>
${complaint.subject}
</h2>

<div style="
white-space:pre-line;
line-height:1.75;
font-size:15px;
">

${complaint.body
    .replace(
        /\n/g,
        "<br>"
    )}

</div>

<hr style="
margin:28px 0;
border:0;
border-top:1px solid #ddd;
">

<p style="
font-size:13px;
color:#777;
">

This complaint was analyzed and prepared by CivicAI based on information supplied by the citizen.

</p>

</div>

</div>

</body>

</html>

`

            });


            // =================================================
            // SAVE REPORT
            // =================================================

            const reports =
                readReports();


            const report = {

                reportId,

                reporterName:
                    cleanText(
                        reporterName
                    ) ||
                    "Anonymous",

                reporterEmail:
                    cleanText(
                        reporterEmail
                    ) ||
                    verifiedUser.email,

                reporterPhone:
                    cleanText(
                        reporterPhone
                    ) ||
                    verifiedUser.phone,

                description:
                    cleanText(
                        description
                    ),

                location:
                    cleanText(
                        location
                    ),

                analysis,

                authority: {

                    department:
                        authority.department,

                    email:
                        authority.email,

                    phone:
                        authority.phone

                },

                complaint: {

                    subject:
                        complaint.subject,

                    body:
                        complaint.body

                },

                status:
                    "Sent to Authority",

                verified:
                    true,

                submittedAt:
                    new Date()
                        .toISOString(),

                createdAt:
                    new Date()
                        .toISOString()

            };


            reports.push(
                report
            );


            saveReports(
                reports
            );


            // =================================================
            // CONSUME VERIFICATION TOKEN
            // =================================================

            verifiedUsers.delete(
                cleanText(
                    verificationToken
                )
            );


            return res.json({

                success: true,

                sent: true,

                reportId,

                authority: {

                    department:
                        authority.department,

                    email:
                        authority.email

                },

                complaint,

                message:
                    "Your complaint has been verified and successfully sent to the appropriate authority."

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

                    success: false,

                    error:
                        error?.message ||
                        "Unable to send complaint."

                });

        }

    }
);


// =========================================================
// READ REPORTS
// =========================================================

function readReports() {

    try {

        const content =
            fs.readFileSync(
                REPORTS_FILE,
                "utf8"
            );


        const reports =
            JSON.parse(
                content
            );


        return Array.isArray(
            reports
        )
            ? reports
            : [];

    }
    catch {

        return [];

    }

}


// =========================================================
// SAVE REPORTS
// =========================================================

function saveReports(
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


// =========================================================
// CREATE REPORT MANUALLY
// =========================================================

app.post(
    "/api/reports",
    (req, res) => {

        try {

            const body =
                req.body || {};


            const {
                reporterName,
                description,
                location,
                analysis,
                submittedAt
            } =
                body;


            if (
                !analysis ||
                typeof analysis !==
                "object"
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        error:
                            "AI analysis is required."

                    });

            }


            if (
                !cleanText(
                    location
                )
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        error:
                            "Report location is required."

                    });

            }


            if (
                analysis.isCivicIssue ===
                false
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        error:
                            "This is not a civic issue."

                    });

            }


            const reports =
                readReports();


            const reportId =
                generateReportId();


            const report = {

                reportId,

                reporterName:
                    cleanText(
                        reporterName
                    ) ||
                    "Anonymous",

                description:
                    cleanText(
                        description
                    ),

                location:
                    cleanText(
                        location
                    ),

                analysis,

                status:
                    "Submitted",

                submittedAt:
                    submittedAt ||
                    new Date()
                        .toISOString(),

                createdAt:
                    new Date()
                        .toISOString()

            };


            reports.push(
                report
            );


            saveReports(
                reports
            );


            return res
                .status(201)
                .json({

                    success: true,

                    message:
                        "Civic report saved.",

                    reportId,

                    report

                });

        }
        catch (error) {

            console.error(
                "REPORT ERROR:",
                error
            );


            return res
                .status(500)
                .json({

                    success: false,

                    error:
                        "Unable to save report."

                });

        }

    }
);


// =========================================================
// GET ALL REPORTS
// =========================================================

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


// =========================================================
// GET SINGLE REPORT
// =========================================================

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


        if (
            !report
        ) {

            return res
                .status(404)
                .json({

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


// =========================================================
// BLOCK PRIVATE FILES
// =========================================================

app.use(
    (req, res, next) => {

        const requestedPath =
            req.path.toLowerCase();


        const blocked =
            requestedPath ===
                "/server.js" ||

            requestedPath ===
                "/package.json" ||

            requestedPath ===
                "/package-lock.json" ||

            requestedPath ===
                "/.env" ||

            requestedPath.startsWith(
                "/data/"
            ) ||

            requestedPath.startsWith(
                "/node_modules/"
            );


        if (
            blocked
        ) {

            return res
                .status(404)
                .send(
                    "Not found"
                );

        }


        next();

    }
);


// =========================================================
// API 404
// =========================================================

app.use(
    "/api",
    (req, res) => {

        return res
            .status(404)
            .json({

                success: false,

                error:
                    "API endpoint not found.",

                path:
                    req.originalUrl,

                method:
                    req.method

            });

    }
);


// =========================================================
// STATIC FRONTEND
// =========================================================

app.use(
    express.static(
        FRONTEND_DIR,
        {

            index: false,

            dotfiles:
                "ignore",

            fallthrough:
                true

        }
    )
);


// =========================================================
// FRONTEND ROUTES
// =========================================================

const frontendPages = [

    "index.html",

    "login.html",

    "register.html",

    "report.html",

    "report-proble.html",

    "citizen.html",

    "life-helper.html",

    "track.html",

    "admin.html"

];


for (
    const page of
    frontendPages
) {

    app.get(
        `/${page}`,
        (req, res) => {

            const filePath =
                path.join(
                    FRONTEND_DIR,
                    page
                );


            if (
                !fs.existsSync(
                    filePath
                )
            ) {

                return res
                    .status(404)
                    .send(
                        `${page} not found`
                    );

            }


            return res.sendFile(
                filePath
            );

        }
    );

}


// =========================================================
// ROOT
// =========================================================

app.get(
    "/",
    (req, res) => {

        const indexPath =
            path.join(
                FRONTEND_DIR,
                "index.html"
            );


        if (
            !fs.existsSync(
                indexPath
            )
        ) {

            return res
                .status(404)
                .send(
                    "index.html not found"
                );

        }


        return res.sendFile(
            indexPath
        );

    }
);


// =========================================================
// FRONTEND FALLBACK
// =========================================================

app.use(
    (req, res, next) => {

        const extension =
            path.extname(
                req.path
            );


        if (
            extension
        ) {

            return next();

        }


        const indexPath =
            path.join(
                FRONTEND_DIR,
                "index.html"
            );


        if (
            fs.existsSync(
                indexPath
            )
        ) {

            return res.sendFile(
                indexPath
            );

        }


        next();

    }
);


// =========================================================
// FINAL 404
// =========================================================

app.use(
    (req, res) => {

        return res
            .status(404)
            .json({

                success: false,

                error:
                    "CivicAI: Page not found."

            });

    }
);


// =========================================================
// GLOBAL ERROR
// =========================================================

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


        return res
            .status(500)
            .json({

                success: false,

                error:
                    "Internal server error."

            });

    }
);


// =========================================================
// START SERVER
// =========================================================

app.listen(
    PORT,
    () => {

        console.log("");

        console.log(
            "=========================================="
        );

        console.log(
            "        CIVICAI BACKEND SERVER"
        );

        console.log(
            "=========================================="
        );

        console.log("");

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
            `INDEX:       http://localhost:${PORT}/`
        );

        console.log(
            `LOGIN:       http://localhost:${PORT}/login.html`
        );

        console.log(
            `REGISTER:    http://localhost:${PORT}/register.html`
        );

        console.log(
            `REPORT:      http://localhost:${PORT}/report-proble.html`
        );

        console.log("");

        console.log(
            "AI:"
        );

        console.log(
            "Provider: Google Gemini"
        );

        console.log(
            `Model: ${GEMINI_MODEL}`
        );

        console.log(
            `Gemini: ${
                hasGeminiKey()
                    ? "CONFIGURED"
                    : "NOT CONFIGURED"
            }`
        );

        console.log("");

        console.log(
            "VERIFICATION:"
        );

        console.log(
            `Gmail OTP: ${
                hasEmailConfig()
                    ? "CONFIGURED"
                    : "NOT CONFIGURED"
            }`
        );

        console.log(
            `Phone OTP: ${
                hasTwilioConfig()
                    ? "CONFIGURED"
                    : "NOT CONFIGURED"
            }`
        );

        console.log("");

        console.log(
            "AUTHORITY EMAIL:"
        );

        console.log(
            `Roads: ${
                AUTHORITIES.roads.email
                    ? "YES"
                    : "NO"
            }`
        );

        console.log(
            `Sanitation: ${
                AUTHORITIES.sanitation.email
                    ? "YES"
                    : "NO"
            }`
        );

        console.log(
            `Drainage: ${
                AUTHORITIES.drainage.email
                    ? "YES"
                    : "NO"
            }`
        );

        console.log(
            `Electricity: ${
                AUTHORITIES.electricity.email
                    ? "YES"
                    : "NO"
            }`
        );

        console.log(
            `Water: ${
                AUTHORITIES.water.email
                    ? "YES"
                    : "NO"
            }`
        );

        console.log(
            `General: ${
                AUTHORITIES.general.email
                    ? "YES"
                    : "NO"
            }`
        );

        console.log("");

        console.log(
            "=========================================="
        );

        console.log("");

    }
);
