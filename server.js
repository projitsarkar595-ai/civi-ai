// =========================================================
// CIVICAI — FULL BACKEND SERVER
// Express + Google Gemini AI
// Product Vision + Product Questions
// Civic Reports + AI Analysis
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
import { fileURLToPath } from "url";


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
// GEMINI CONFIG
// =========================================================

const GEMINI_API_KEY =
    process.env.GEMINI_API_KEY || "";

const GEMINI_MODEL =
    process.env.GEMINI_MODEL ||
    "gemini-3.1-flash-lite";


// Gemini REST API
const GEMINI_API_URL =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;


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
        limit: "8mb"
    })
);


app.use(
    express.urlencoded({
        extended: true,
        limit: "8mb"
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
// CHECK GEMINI KEY
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
// HEALTH CHECK
// =========================================================

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

            timestamp:
                new Date().toISOString()

        });

    }
);


// =========================================================
// API INFORMATION
// =========================================================

app.get(
    "/api",
    (req, res) => {

        return res.json({

            success:
                true,

            message:
                "CivicAI Gemini backend API is running.",

            aiProvider:
                "Google Gemini",

            aiConfigured:
                hasGeminiKey(),

            model:
                GEMINI_MODEL,

            endpoints: {

                health:
                    "GET /api/health",

                analyzeProduct:
                    "POST /api/analyze-product",

                productQuestion:
                    "POST /api/product-question",

                analyze:
                    "POST /api/analyze",

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

            valid:
                false,

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

            valid:
                false,

            error:
                "Invalid image format. Please send a base64 image data URL."

        };

    }


    if (
        image.length >
        7_000_000
    ) {

        return {

            valid:
                false,

            error:
                "Image is too large. Please upload a smaller image."

        };

    }


    return {

        valid:
            true

    };

}


// =========================================================
// DATA URL → GEMINI INLINE DATA
// =========================================================

function imageToGeminiPart(imageDataUrl) {

    const match =
        imageDataUrl.match(
            /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
        );


    if (!match) {

        throw new Error(
            "Invalid base64 image data URL."
        );

    }


    const mimeType =
        match[1];

    const base64Data =
        match[2];


    return {

        inline_data: {

            mime_type:
                mimeType,

            data:
                base64Data

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

    temperature = 0.2,

    maxOutputTokens = 1200

}) {

    // -------------------------------------------------------
    // API KEY
    // -------------------------------------------------------

    if (!hasGeminiKey()) {

        throw new Error(
            "GEMINI_API_KEY is missing. Add it to your .env file."
        );

    }


    // -------------------------------------------------------
    // CONTENT PARTS
    // -------------------------------------------------------

    const parts = [];


    // Text
    parts.push({

        text:
            userText

    });


    // Image
    if (
        image
    ) {

        parts.push(
            imageToGeminiPart(
                image
            )
        );

    }


    // -------------------------------------------------------
    // REQUEST BODY
    // -------------------------------------------------------

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

        generationConfig: {

            temperature,

            maxOutputTokens,

            responseMimeType:
                "application/json"

        }

    };


    // -------------------------------------------------------
    // REQUEST
    // -------------------------------------------------------

    console.log("");
    console.log(
        "========================================"
    );

    console.log(
        "GEMINI AI REQUEST"
    );

    console.log(
        "Model:",
        GEMINI_MODEL
    );


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


        // ---------------------------------------------------
        // ERROR
        // ---------------------------------------------------

        if (
            !response.ok
        ) {

            console.error("");
            console.error(
                "========================================"
            );

            console.error(
                "GEMINI API ERROR"
            );

            console.error(
                "STATUS:",
                response.status
            );

            console.error(
                "RESPONSE:",
                responseText
            );

            console.error(
                "========================================"
            );


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

                // Keep raw response

            }


            throw new Error(
                `Gemini API returned ${response.status}: ${errorMessage}`
            );

        }


        // ---------------------------------------------------
        // PARSE HTTP RESPONSE
        // ---------------------------------------------------

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


        // ---------------------------------------------------
        // GEMINI CONTENT
        // ---------------------------------------------------

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

            console.error(
                "EMPTY GEMINI RESPONSE:"
            );

            console.error(
                JSON.stringify(
                    data,
                    null,
                    2
                )
            );


            throw new Error(
                "Gemini returned an empty AI response."
            );

        }


        console.log(
            "Gemini response received successfully."
        );

        console.log(
            "========================================"
        );


        return content;

    }
    catch (error) {

        if (
            error?.name ===
            "AbortError"
        ) {

            throw new Error(
                "Gemini AI request timed out after 60 seconds."
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

function parseAIJson(content) {

    if (
        !content
    ) {

        throw new Error(
            "AI returned an empty response."
        );

    }


    let cleaned =
        String(
            content
        )
        .trim();


    // Remove markdown code fences
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


    // Direct JSON
    try {

        return JSON.parse(
            cleaned
        );

    }
    catch {

        // Continue

    }


    // Try extracting JSON object
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

        const possibleJSON =
            cleaned.slice(
                start,
                end + 1
            );


        try {

            return JSON.parse(
                possibleJSON
            );

        }
        catch {

            // Continue

        }

    }


    console.error(
        "INVALID AI JSON:"
    );

    console.error(
        cleaned
    );


    throw new Error(
        "AI returned invalid JSON."
    );

}


// =========================================================
// NORMALIZE PRODUCT ANALYSIS
// =========================================================

function normalizeProductAnalysis(
    analysis
) {

    if (
        !analysis ||
        typeof analysis !== "object"
    ) {

        throw new Error(
            "Invalid product AI response."
        );

    }


    let confidence =
        analysis.confidence;


    if (
        typeof confidence ===
        "number"
    ) {

        confidence =
            `${Math.round(
                confidence
            )}%`;

    }
    else {

        confidence =
            cleanText(
                confidence
            );

    }


    return {

        productName:
            cleanText(
                analysis.productName
            ) ||
            "Product not clearly identified",


        description:
            cleanText(
                analysis.description
            ) ||
            "The AI could not generate a detailed product description.",


        category:
            cleanText(
                analysis.category
            ) ||
            "Unknown",


        estimatedPrice:
            cleanText(
                analysis.estimatedPrice
            ) ||
            "Not available",


        condition:
            cleanText(
                analysis.condition
            ) ||
            "Not determined",


        expiry:
            cleanText(
                analysis.expiry
            ) ||
            "Not detected",


        warning:
            cleanText(
                analysis.warning
            ) ||
            "No obvious safety information could be determined from the image.",


        confidence:
            confidence ||
            "Medium",


        visibleInformation:
            cleanText(
                analysis.visibleInformation
            ) ||
            "",


        authenticity:
            cleanText(
                analysis.authenticity
            ) ||
            "Cannot be verified from image alone.",


        recommendation:
            cleanText(
                analysis.recommendation
            ) ||
            "Verify official product information before purchase or use."

    };

}


// =========================================================
// PRODUCT SYSTEM PROMPT
// =========================================================

const PRODUCT_SYSTEM_PROMPT = `

You are CivicAI Vision AI, a careful product analysis assistant.

Analyze the product image supplied by the user.

The image may contain:

- product packaging
- labels
- bottles
- food
- electronics
- medicine packaging
- household products
- clothing
- tools
- documents
- barcodes

IMPORTANT RULES:

1. Carefully inspect the image.
2. Do not invent information.
3. Only use text that is reasonably visible.
4. If the product cannot be confidently identified, say so.
5. Never claim authenticity with certainty from an image alone.
6. Never invent an expiry date.
7. Never invent an exact market price.
8. Price should be an estimate or range when possible.
9. If expiry is not visible, return "Not detected".
10. If condition cannot be determined, return "Not determined".
11. Safety information must be based on visible evidence and reasonable general knowledge.
12. If the image is blurry, reduce confidence.
13. Do not pretend to have scanned a barcode if it is unreadable.
14. Do not provide dangerous medical instructions.
15. Return ONLY valid JSON.
16. Do not use Markdown.
17. Do not use code fences.
18. Do not add any text outside JSON.

Return exactly:

{
    "productName": "",
    "description": "",
    "category": "",
    "estimatedPrice": "",
    "condition": "",
    "expiry": "",
    "warning": "",
    "confidence": "",
    "visibleInformation": "",
    "authenticity": "",
    "recommendation": ""
}

confidence must be:

High
Medium
Low

`;


// =========================================================
// POST /api/analyze-product
// =========================================================

app.post(
    "/api/analyze-product",
    async (req, res) => {

        try {

            console.log("");
            console.log(
                "========================================"
            );

            console.log(
                "NEW PRODUCT AI REQUEST"
            );

            console.log(
                new Date().toISOString()
            );


            const {
                image,
                productQuestion
            } =
                req.body || {};


            // -------------------------------------------------
            // IMAGE
            // -------------------------------------------------

            const imageCheck =
                validateImage(
                    image
                );


            if (
                !imageCheck.valid
            ) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        error:
                            imageCheck.error

                    });

            }


            // -------------------------------------------------
            // USER TEXT
            // -------------------------------------------------

            const userText = `

Analyze this product image.

Additional user information:

${
    productQuestion
        ? cleanText(
            productQuestion
        )
        : "No additional information was provided."
}

Return exactly the JSON structure requested.

`;


            // -------------------------------------------------
            // GEMINI
            // -------------------------------------------------

            const aiContent =
                await callGemini({

                    systemPrompt:
                        PRODUCT_SYSTEM_PROMPT,

                    userText,

                    image,

                    temperature:
                        0.2,

                    maxOutputTokens:
                        1200

                });


            // -------------------------------------------------
            // PARSE
            // -------------------------------------------------

            const rawAnalysis =
                parseAIJson(
                    aiContent
                );


            const analysis =
                normalizeProductAnalysis(
                    rawAnalysis
                );


            console.log(
                "Product:",
                analysis.productName
            );


            return res.json({

                success:
                    true,

                source:
                    "google-gemini",

                model:
                    GEMINI_MODEL,

                analysis

            });

        }
        catch (error) {

            console.error("");
            console.error(
                "========================================"
            );

            console.error(
                "PRODUCT AI ERROR"
            );

            console.error(
                error
            );

            console.error(
                "========================================"
            );


            return res
                .status(500)
                .json({

                    success:
                        false,

                    source:
                        "google-gemini",

                    error:
                        error?.message ||
                        "Product AI analysis failed."

                });

        }

    }
);


// =========================================================
// POST /api/product-question
// =========================================================

app.post(
    "/api/product-question",
    async (req, res) => {

        try {

            const {
                image,
                question,
                product
            } =
                req.body || {};


            const cleanQuestion =
                cleanText(
                    question
                );


            if (
                !cleanQuestion
            ) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        error:
                            "Please enter a question."

                    });

            }


            const imageCheck =
                validateImage(
                    image
                );


            if (
                !imageCheck.valid
            ) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        error:
                            imageCheck.error

                    });

            }


            const systemPrompt = `

You are CivicAI Product Assistant.

The user has scanned a product image.

Use:

1. Product image
2. Supplied product information
3. Reasonable general knowledge

IMPORTANT:

- Do not invent facts.
- If something cannot be determined, say so.
- Do not claim authenticity with certainty.
- Do not invent prices.
- Do not invent expiry dates.
- For medical products, avoid diagnosis and dangerous instructions.
- Answer the exact question.
- Be concise and useful.
- Return ONLY valid JSON.

Return exactly:

{
    "answer": "",
    "confidence": "High"
}

confidence must be:

High
Medium
Low

`;


            const userText = `

Scanned product information:

${JSON.stringify(
    product || {},
    null,
    2
)}

User question:

${cleanQuestion}

Answer the question based on the product image.

`;


            const aiContent =
                await callGemini({

                    systemPrompt,

                    userText,

                    image,

                    temperature:
                        0.3,

                    maxOutputTokens:
                        800

                });


            const answer =
                parseAIJson(
                    aiContent
                );


            return res.json({

                success:
                    true,

                source:
                    "google-gemini",

                model:
                    GEMINI_MODEL,

                answer:
                    cleanText(
                        answer.answer
                    ) ||
                    "The AI could not determine an answer.",

                confidence:
                    cleanText(
                        answer.confidence
                    ) ||
                    "Medium"

            });

        }
        catch (error) {

            console.error(
                "PRODUCT QUESTION ERROR:",
                error
            );


            return res
                .status(500)
                .json({

                    success:
                        false,

                    source:
                        "google-gemini",

                    error:
                        error?.message ||
                        "Unable to answer the product question."

                });

        }

    }
);


// =========================================================
// CIVIC AI SYSTEM PROMPT
// =========================================================

const CIVIC_SYSTEM_PROMPT = `

You are CivicAI, an intelligent civic problem analysis assistant.

Analyze public and civic problems reported by citizens.

The input may contain:

1. Written description
2. Location
3. Uploaded image
4. Image + description

Examples:

- potholes
- garbage
- broken street lights
- damaged roads
- water leakage
- drainage problems
- illegal dumping
- traffic problems
- public infrastructure damage
- unsafe public areas
- pollution
- civic maintenance problems

Do not invent facts.

If the image does not clearly show something, say that confidence is limited.

Return ONLY valid JSON.

Return exactly:

{
    "problem": "",
    "category": "",
    "severity": "Low",
    "department": "",
    "location": "",
    "confidence": "Medium",
    "summary": "",
    "recommendation": ""
}

severity must be:

Low
Medium
High
Critical

confidence must be:

High
Medium
Low

`;


// =========================================================
// POST /api/analyze
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
                typeof image ===
                "string"
                    ? image
                    : null;


            if (
                !cleanDescription &&
                !cleanImage
            ) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        error:
                            "Please provide a description or image."

                    });

            }


            const userText = `

Analyze this civic problem.

Description:

${
    cleanDescription ||
    "No description provided"
}

Location:

${
    cleanLocation ||
    "No location provided"
}

Reporter:

${
    cleanReporterName ||
    "Anonymous"
}

Return the exact JSON structure requested.

`;


            const aiContent =
                await callGemini({

                    systemPrompt:
                        CIVIC_SYSTEM_PROMPT,

                    userText,

                    image:
                        cleanImage,

                    temperature:
                        0.2,

                    maxOutputTokens:
                        900

                });


            const analysis =
                parseAIJson(
                    aiContent
                );


            return res.json({

                success:
                    true,

                source:
                    "google-gemini",

                model:
                    GEMINI_MODEL,

                analysis: {

                    problem:
                        cleanText(
                            analysis.problem
                        ) ||
                        "Public civic issue",

                    category:
                        cleanText(
                            analysis.category
                        ) ||
                        "General Civic Issue",

                    severity:
                        cleanText(
                            analysis.severity
                        ) ||
                        "Medium",

                    department:
                        cleanText(
                            analysis.department
                        ) ||
                        "Municipal Authority",

                    location:
                        cleanText(
                            analysis.location
                        ) ||
                        cleanLocation ||
                        "Not provided",

                    confidence:
                        cleanText(
                            analysis.confidence
                        ) ||
                        "Medium",

                    summary:
                        cleanText(
                            analysis.summary
                        ) ||
                        "The reported civic issue was analyzed.",

                    recommendation:
                        cleanText(
                            analysis.recommendation
                        ) ||
                        "The responsible civic authority should review the issue."

                }

            });

        }
        catch (error) {

            console.error(
                "CIVIC ANALYZE ERROR:",
                error
            );


            return res
                .status(500)
                .json({

                    success:
                        false,

                    source:
                        "google-gemini",

                    error:
                        error?.message ||
                        "AI analysis failed."

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
    catch (error) {

        console.error(
            "Unable to read reports:",
            error
        );

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
// GENERATE REPORT ID
// =========================================================

function generateReportId() {

    const timestamp =
        Date.now()
            .toString()
            .slice(-8);


    const random =
        Math.floor(
            1000 +
            Math.random() *
            9000
        );


    return `CIVIC-${timestamp}-${random}`;

}


// =========================================================
// POST /api/reports
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

                        success:
                            false,

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

                        success:
                            false,

                        error:
                            "Report location is required."

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


            console.log(
                `New civic report submitted: ${reportId}`
            );


            return res
                .status(201)
                .json({

                    success:
                        true,

                    message:
                        "Civic report submitted successfully.",

                    reportId,

                    report

                });

        }
        catch (error) {

            console.error(
                "REPORT SUBMISSION ERROR:",
                error
            );


            return res
                .status(500)
                .json({

                    success:
                        false,

                    error:
                        "Unable to save civic report."

                });

        }

    }
);


// =========================================================
// GET /api/reports
// =========================================================

app.get(
    "/api/reports",
    (req, res) => {

        try {

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
        catch (error) {

            console.error(
                "GET REPORTS ERROR:",
                error
            );


            return res
                .status(500)
                .json({

                    success:
                        false,

                    error:
                        "Unable to load reports."

                });

        }

    }
);


// =========================================================
// GET SINGLE REPORT
// =========================================================

app.get(
    "/api/reports/:reportId",
    (req, res) => {

        try {

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
        catch (error) {

            console.error(
                "GET SINGLE REPORT ERROR:",
                error
            );


            return res
                .status(500)
                .json({

                    success:
                        false,

                    error:
                        "Unable to load report."

                });

        }

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

                success:
                    false,

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
            index:
                false,

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

                success:
                    false,

                error:
                    "CivicAI: Page not found."

            });

    }
);


// =========================================================
// GLOBAL ERROR HANDLER
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

                success:
                    false,

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
            `INDEX:    http://localhost:${PORT}/`
        );

        console.log(
            `LOGIN:    http://localhost:${PORT}/login.html`
        );

        console.log(
            `REGISTER: http://localhost:${PORT}/register.html`
        );

        console.log(
            `AI HELPER: http://localhost:${PORT}/life-helper.html`
        );

        console.log("");

        console.log(
            "AI API:"
        );

        console.log(
            `HEALTH:   http://localhost:${PORT}/api/health`
        );

        console.log(
            `API:      http://localhost:${PORT}/api`
        );

        console.log(
            "PRODUCT:  POST /api/analyze-product"
        );

        console.log(
            "QUESTION: POST /api/product-question"
        );

        console.log(
            "CIVIC:    POST /api/analyze"
        );

        console.log(
            `REPORTS:  http://localhost:${PORT}/api/reports`
        );

        console.log("");

        console.log(
            "AI CONFIGURATION:"
        );

        console.log(
            "AI Provider: Google Gemini"
        );

        console.log(
            `Gemini API Key: ${
                hasGeminiKey()
                    ? "YES"
                    : "NO"
            }`
        );

        console.log(
            `Gemini Model: ${GEMINI_MODEL}`
        );

        console.log("");

        console.log(
            "=========================================="
        );

        console.log("");

    }
);
