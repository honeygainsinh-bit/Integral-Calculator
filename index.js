/**
=================================================================================================
| __ )|  _ \    / \  |_ | \ | |   _| ____/ __|   _|
|  _ | |_) |  / _ \  | ||  | | | | |  | __ \ | |
| |) |  _ <  / ___ \ | || |\  | | | | |__ ___) || |
|/|| _//   ____|| _| || |_____|___/ ||
=================================================================================================
PROJECT:           BRAINTEST - TITAN ENTERPRISE BACKEND
EDITION:           V12.1 PLATINUM (SECURE ADMIN LOGIN ADDED)
ARCHITECTURE:      MONOLITHIC NODE.JS WITH HYBRID DATABASE (PG + MONGO)
AUTHOR:            BRAINTEST ENGINEERING TEAM
DATE:              DECEMBER 2025
STATUS:            PRODUCTION READY
SECURE ACCESS:     ENABLED (User: Boysinh | Pass: Loveyou9999@@)
=================================================================================================
*/

// =================================================================================================
// SECTION 1: LIBRARY IMPORTS & ENVIRONMENT SETUP
// =================================================================================================

require('dotenv').config();

const express = require('express');
const session = require('express-session'); // 🔥 ADDED FOR LOGIN
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

// =================================================================================================
// SECTION 2: MASTER CONFIGURATION & MATRIX DEFINITIONS
// =================================================================================================

// -------------------------------------------------------------------------
// 🧬 THE GRANULAR MATRIX: DETAILED FORMS FOR EVERY TOPIC (10 TOPICS)
// -------------------------------------------------------------------------
const ALL_FORMS = {
// --- 1. LIMITS ---
"Limits": [
"0/0: Factoring Polynomials (Diff of Squares/Cubes)",
"0/0: Involving Square Roots (Conjugate 2nd Order)",
"0/0: Involving Cube Roots (Conjugate 3rd Order)",
"0/0: Nested Roots (Sqrt inside Sqrt)",
"0/0: Trigonometry Standard (sin x/x, tan x/x)",
"0/0: Trigonometry with Cosine (1-cos x)",
"0/0: Trigonometry Mixed (sin, tan, cos combined)",
"Inf/Inf: Rational Functions (Highest Degree Rule)",
"Inf/Inf: Irrational Functions (Sqrt(x^2) terms)",
"Inf - Inf: Radical Conjugate (sqrt(A) - sqrt(B))",
"Exponential Limits (e^x / x at infinity)",
"Logarithmic Limits (ln x / x at infinity)",
"1^Inf: Euler Form (1 + u)^v",
"Continuity: Finding 'k' for continuity at a point",
"L'Hopital's Rule Application"
],

// --- 2. DERIVATIVES ---
"Derivatives": [
    "Power Rule: Polynomials with negative/fractional powers",
    "Product Rule: (uv)' = u'v + uv'",
    "Quotient Rule: (u/v)'",
    "Chain Rule: Power of a Function u^n",
    "Chain Rule: Involving Radicals sqrt(u)",
    "Chain Rule: Trigonometric Functions (sin u, cos u)",
    "Derivatives of Inverse Trig (arcsin u, arctan u)",
    "Derivatives of Exponential Functions (e^u, a^u)",
    "Derivatives of Logarithmic Functions (ln u, log_a u)",
    "Logarithmic Differentiation (Functions y = x^x)",
    "Implicit Differentiation (First order y')",
    "Implicit Differentiation (Second order y'')",
    "Parametric Differentiation (dy/dt / dx/dt)",
    "Higher Order Derivatives: y'', y''' calculation",
    "Tangent Line Equation at a point",
    "Normal Line Equation at a point"
],

// --- 3. INTEGRALS ---
"Integrals": [
    "Indefinite: Basic Power Rule & Polynomials",
    "Indefinite: Basic Trig (sin, cos, sec^2)",
    "Indefinite: Exponential (e^kx)",
    "U-Substitution: Linear argument (ax+b)",
    "U-Substitution: Radicals (u = sqrt(...))",
    "U-Substitution: Logarithmic (ln x / x)",
    "U-Substitution: Exponential (e^x / (1+e^x))",
    "Integration by Parts: Polynomial * Exponential (x e^x)",
    "Integration by Parts: Polynomial * Trig (x sin x)",
    "Integration by Parts: Logarithmic (ln x)",
    "Integration by Parts: Cyclic (e^x sin x)",
    "Trig Powers: Odd/Even powers of sin/cos",
    "Partial Fractions: Distinct Linear Denominators",
    "Partial Fractions: Repeated Linear Denominators",
    "Definite Integral: Calculation with bounds",
    "Area: Between Curve and X-axis",
    "Area: Between Two Curves f(x) and g(x)",
    "Volume: Solid of Revolution (Disk Method)"
],

// --- 4. DIFFERENTIAL EQUATIONS ---
"DiffEq": [
    "Verification: Checking if y is a solution",
    "Separable: Basic variables separation",
    "Separable: Involving Trigonometry or Exponentials",
    "Linear First Order: Integrating Factor Method",
    "Homogeneous First Order: Substitution y = vx",
    "Second Order Homogeneous: Real Distinct Roots",
    "Second Order Homogeneous: Real Double Root",
    "Second Order Homogeneous: Complex Roots (Alpha +/- Beta i)",
    "Initial Value Problem (IVP): Finding Particular Solution"
],

// --- 5. COMPLEX NUMBERS ---
"Complex": [
    "Algebraic: Addition, Subtraction, Multiplication",
    "Algebraic: Division (Conjugate Method)",
    "Modulus: Calculating |z|",
    "Argument: Finding arg(z) / theta",
    "Forms: Converting Algebraic to Polar/Trig",
    "Forms: Converting Polar to Algebraic",
    "Square Roots: Finding sqrt(a+bi)",
    "Quadratics: Solving az^2+bz+c=0 with Delta < 0",
    "De Moivre's Theorem: Powers z^n",
    "Roots of Unity: Finding n-th roots of a number",
    "Geometry: Locus of points (Circle / Line)"
],

// --- 6. VECTORS ---
"Vectors": [
    "Basics: Magnitude and Unit Vector",
    "Operations: Addition and Scalar Multiplication",
    "Dot Product: Calculating u.v & Angle",
    "Dot Product: Orthogonality Check",
    "Cross Product: Calculating u x v & Area",
    "Lines: Parametric/Symmetric Equations",
    "Planes: Equation given Point and Normal",
    "Distance: Point to Plane",
    "Distance: Point to Line",
    "Intersection: Line and Plane"
],

// --- 7. FUNCTION ANALYSIS ---
"FuncAnalysis": [
    "Domain: Rational Functions",
    "Domain: Radical Functions (Sqrt)",
    "Domain: Logarithmic Functions",
    "Asymptotes: Vertical & Horizontal",
    "Asymptotes: Oblique (Slant) Asymptote",
    "Symmetry: Parity (Even/Odd Functions)",
    "Derivatives: Finding Critical Points",
    "Extrema: Local Maximum and Minimum",
    "Concavity: Inflection Points",
    "Graphs: Matching Function to Graph"
],

// --- 8. CONICS ---
"Conics": [
    "Circle: General Form to Standard Form",
    "Circle: Finding Center and Radius",
    "Parabola: Vertex at Origin",
    "Parabola: Shifted Vertex (h,k)",
    "Ellipse: Finding Vertices and Foci",
    "Ellipse: Eccentricity calculation",
    "Hyperbola: Finding Vertices, Foci, Asymptotes",
    "Tangent: Equation of tangent line to a Conic"
],

// --- 9. PROBABILITY ---
"Probability": [
    "Counting: Permutations (Arrangements)",
    "Counting: Combinations (Selections)",
    "Basic Prob: Coin Tosses / Dice Rolls / Cards",
    "Compound Prob: Independent vs Mutually Exclusive",
    "Conditional Prob: P(A|B) Calculation",
    "Distribution: Binomial Distribution Formula",
    "Stats: Expected Value (Mean)"
],

// --- 10. CONTINUITY ---
"Continuity": [
    "Definition: Checking lim(x->a) = f(a)",
    "One-Sided: Left Limit vs Right Limit",
    "Unknowns: Finding 'k' to make f(x) continuous",
    "Discontinuity: Identifying Jump/Hole/Infinite",
    "IVT: Intermediate Value Theorem Applications"
]

};

// -------------------------------------------------------------------------
// 🔴 DIFFICULTY STANDARDS (CAMBODIAN CONTEXT)
// -------------------------------------------------------------------------
const DIFFICULTY_INSTRUCTIONS = {
"Easy": "- CONTEXT: CAMBODIAN GRADE 12 NATIONAL EXAM (BACII). - LEVEL: Standard High School. - STYLE: Direct application of formulas. No tricks. - GOAL: Test basic understanding. Keep numbers simple (integers).",
"Medium": "- CONTEXT: PRE-UNIVERSITY / SCHOLARSHIP EXAM. - LEVEL: Harder than BacII but easier than Olympiad. - STYLE: Requires 2-3 steps of logic. Mixing 2 concepts. - GOAL: Filter out average students. Requires algebraic manipulation.",
"Hard": "- CONTEXT: NATIONAL OUTSTANDING STUDENT (SISHYA PUKE). - LEVEL: National Competition Level. - STYLE: Theoretical proof calculations, Complex Integrals, Advanced Geometry. - GOAL: For the top 5% of students. Heavy calculation or deep insight required.",
"Very Hard": "- CONTEXT: IMO (INTERNATIONAL MATH OLYMPIAD). - LEVEL: World Class Competition. - STYLE: Abstract, requires auxiliary functions, creative inequalities, hidden tricks. - GOAL: Extremely difficult. Only for geniuses."
};

const CONFIG = {
PORT: process.env.PORT || 3000,
POSTGRES_URL: process.env.DATABASE_URL,
MONGO_URI: process.env.MONGODB_URI,
GEMINI_KEY: process.env.GEMINI_API_KEY,
AI_MODEL: "gemini-2.5-flash",
IMG_API: process.env.EXTERNAL_IMAGE_API || "https://fakeimg.pl/800x600/?text=",
OWNER_IP: process.env.OWNER_IP,
CACHE_RATE: 0.25,
TARGETS: {
"Easy": 100,
"Medium": 100,
"Hard": 100,
"Very Hard": 100,
},
TOPICS: [
{ key: "Limits", label: "លីមីត (Limits)", prompt: "Calculus Limits" },
{ key: "Derivatives", label: "ដេរីវេ (Derivatives)", prompt: "Calculus Derivatives" },
{ key: "Integrals", label: "អាំងតេក្រាល (Integrals)", prompt: "Calculus Integrals" },
{ key: "DiffEq", label: "សមីការឌីផេរ៉ង់ស្យែល", prompt: "Differential Equations" },
{ key: "Complex", label: "ចំនួនកុំផ្លិច (Complex)", prompt: "Complex Numbers" },
{ key: "Vectors", label: "វ៉ិចទ័រ (Vectors)", prompt: "Vector Algebra" },
{ key: "FuncAnalysis", label: "សិក្សាអនុគមន៍", prompt: "Function Analysis" },
{ key: "Conics", label: "កោនិក (Conics)", prompt: "Conic Sections" },
{ key: "Probability", label: "ប្រូបាប (Probability)", prompt: "Probability Theory" },
{ key: "Continuity", label: "ភាពជាប់ (Continuity)", prompt: "Calculus Continuity" }
],
ALLOWED_SCORES: { "Easy": 5, "Medium": 10, "Hard": 15, "Very Hard": 20 }
};

// =================================================================================================
// SECTION 3: SYSTEM STATE MANAGEMENT
// =================================================================================================

const SYSTEM_STATE = {
startTime: Date.now(),
postgresConnected: false,
mongoConnected: false,
isGenerating: false,
currentGenTask: "Idle",
totalRequests: 0,
totalGamesGenerated: 0,
cacheHits: 0,
aiCalls: 0,
uniqueVisitors: new Set(),
logs: []
};

function logSystem(type, message, details = '') {
const now = new Date();
const timeString = now.toLocaleTimeString('en-US', { hour12: false });
let icon = 'ℹ️';
switch(type) {
case 'DB':   icon = '🗄️'; break;
case 'AI':   icon = '🤖'; break;
case 'ERR':  icon = '❌'; break;
case 'OK':   icon = '✅'; break;
case 'NET':  icon = '📡'; break;
case 'WARN': icon = '⚠️'; break;
case 'SEC':  icon = '🛡️'; break;
case 'GEN':  icon = '⚙️'; break;
}
console.log(`[${timeString}] ${icon} [${type}] ${message} ${details ? '| ' + details : ''}`);
SYSTEM_STATE.logs.unshift({ time: timeString, type: type, msg: message, det: details });
if (SYSTEM_STATE.logs.length > 300) SYSTEM_STATE.logs.pop();
}

// =================================================================================================
// SECTION 4 & 5: DATABASE LAYERS (POSTGRES + MONGO)
// =================================================================================================

// --- POSTGRESQL ---
const pgPool = new Pool({
connectionString: CONFIG.POSTGRES_URL,
ssl: { rejectUnauthorized: false },
connectionTimeoutMillis: 5000,
max: 20
});

pgPool.on('error', (err) => {
SYSTEM_STATE.postgresConnected = false;
logSystem('ERR', 'PostgreSQL Connection Error', err.message);
});

async function initPostgres() {
try {
const client = await pgPool.connect();
SYSTEM_STATE.postgresConnected = true;

    await client.query(`
        CREATE TABLE IF NOT EXISTS leaderboard (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) NOT NULL,
            score INTEGER NOT NULL,
            difficulty VARCHAR(20) NOT NULL,
            ip_address VARCHAR(45),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    
    await client.query(`
        CREATE TABLE IF NOT EXISTS certificate_requests (
            id SERIAL PRIMARY KEY,
            username VARCHAR(100) NOT NULL,
            score INTEGER NOT NULL,
            status VARCHAR(20) DEFAULT 'Pending',
            request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    
    client.release();
    logSystem('OK', 'PostgreSQL Ready', 'Tables verified.');
} catch (err) { 
    logSystem('ERR', 'PostgreSQL Init Failed', err.message); 
}

}

// --- MONGODB ---
function cleanMongoURI(uri) {
if (!uri) return null;
let clean = uri.trim();
if (!clean.startsWith('mongodb://') && !clean.startsWith('mongodb+srv://')) return `mongodb+srv://${clean}`;
return clean;
}

async function initMongo() {
const uri = cleanMongoURI(CONFIG.MONGO_URI);
if (!uri) { logSystem('WARN', 'MongoDB URI Missing', 'Caching disabled.'); return; }
try {
await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, family: 4 });
SYSTEM_STATE.mongoConnected = true;
logSystem('OK', 'MongoDB Connected', 'Hybrid caching active.');
} catch (err) { SYSTEM_STATE.mongoConnected = false; logSystem('ERR', 'MongoDB Failed', err.message); }
}

const problemSchema = new mongoose.Schema({
topic: { type: String, required: true, index: true },
difficulty: { type: String, required: true, index: true },
raw_text: { type: String, required: true },
content_hash: { type: String, unique: true, index: true },
source_ip: String,
createdAt: { type: Date, default: Date.now }
});
problemSchema.index({ topic: 1, difficulty: 1 });
const MathCache = mongoose.model('MathProblemCache', problemSchema);

// 🛡️ SYSTEM: VALIDATION GUARD
function validateProblemIntegrity(jsonString) {
try {
const data = JSON.parse(jsonString);

    if (!data.question || !data.options || !data.answer) return null;
    if (!Array.isArray(data.options) || data.options.length !== 4) return null;

    const cleanAnswer = String(data.answer).trim();
    const cleanOptions = data.options.map(o => String(o).trim());
    if (!cleanOptions.includes(cleanAnswer)) return null;

    const uniqueOptions = new Set(cleanOptions);
    if (uniqueOptions.size !== 4) return null;

    const hash = crypto.createHash('md5').update(data.question + JSON.stringify(cleanOptions)).digest('hex');

    return { validData: data, hash: hash };
} catch (e) {
    return null; 
}

}

// 🔥 FIX #3: SHUFFLE OPTIONS (Randomize Answer Position)
function shuffleOptions(jsonString) {
try {
const data = JSON.parse(jsonString);
// Fisher-Yates Shuffle Algorithm
for (let i = data.options.length - 1; i > 0; i--) {
const j = Math.floor(Math.random() * (i + 1));
[data.options[i], data.options[j]] = [data.options[j], data.options[i]];
}
return JSON.stringify(data);
} catch (e) {
return jsonString; // Fail-safe: return original if error
}
}

// =================================================================================================
// SECTION 6: GENERATOR ENGINE (UPDATED KHMER + LATEX RULES)
// =================================================================================================

async function startBackgroundGeneration() {
if (SYSTEM_STATE.isGenerating) return;
if (!SYSTEM_STATE.mongoConnected) {
logSystem('ERR', 'Generator Aborted', 'MongoDB not connected.');
return;
}

SYSTEM_STATE.isGenerating = true;
logSystem('GEN', '🚀 ENGINE STARTUP', 'Initialized with KHMER + LATEX FIXES.');

const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
const model = genAI.getGenerativeModel({ model: CONFIG.AI_MODEL });

for (const topicObj of CONFIG.TOPICS) {
    for (const [diffLevel, targetCount] of Object.entries(CONFIG.TARGETS)) {
        
        if (!SYSTEM_STATE.isGenerating) {
            logSystem('GEN', 'Engine Stopped Manually');
            return;
        }

        try {
            const currentCount = await MathCache.countDocuments({ topic: topicObj.key, difficulty: diffLevel });
            if (currentCount >= targetCount) continue;

            const needed = targetCount - currentCount;
            SYSTEM_STATE.currentGenTask = `${topicObj.label} (${diffLevel}): ${currentCount}/${targetCount}`;
            logSystem('GEN', `Task Started`, `${topicObj.key} [${diffLevel}] - Need: ${needed}`);

            for (let i = 0; i < needed; i++) {
                if (!SYSTEM_STATE.isGenerating) break;

                const forms = ALL_FORMS[topicObj.key] || ["General Math Problem"];
                const randomForm = forms[Math.floor(Math.random() * forms.length)];

                // 🔥 FIX #1 & #2: KHMER LANGUAGE & MATH LATEX DELIMITERS ($)
                const prompt = `
                Generate 1 unique multiple-choice math problem in KHMER LANGUAGE.
                TOPIC: "${topicObj.prompt}"
                SUB-TYPE: "${randomForm}"
                DIFFICULTY: "${diffLevel}" (${DIFFICULTY_INSTRUCTIONS[diffLevel]})
                
                CRITICAL RULES:
                1. LANGUAGE: The question text and explanation MUST be in KHMER (Cambodian).
                   - Example: "គណនា...", "រកតម្លៃនៃ...", "គេឱ្យអនុគមន៍...".
                2. MATH FORMATTING: 
                   - YOU MUST WRAP ALL MATH EXPRESSIONS IN DOLLAR SIGNS ($).
                   - Example: Do NOT write "y = x^2". WRITE "$y = x^2$".
                   - Example: Do NOT write "\\frac{dy}{dx}". WRITE "$\\frac{dy}{dx}$".
                   - Applies to Question, Options, and Explanation.
                3. Use RANDOM constants/numbers every time.
                4. STRICTLY JSON output. No Markdown.
                5. Options must be numerically distinct.
                
                JSON STRUCTURE:
                {
                    "question": "Question string in Khmer with LaTeX wrapped in $",
                    "options": ["$Option A$", "$Option B$", "$Option C$", "$Option D$"],
                    "answer": "Exact string copy of correct option",
                    "explanation": "Explanation in Khmer with math in $"
                }
                `;

                try {
                    const result = await model.generateContent(prompt);
                    const response = await result.response;
                    let text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
                    
                    const validated = validateProblemIntegrity(text);
                    if (!validated) {
                        logSystem('GEN', '⚠️ Invalid Data', 'Bad JSON/Logic discarded.');
                        continue; 
                    }

                    try {
                        await MathCache.create({
                            topic: topicObj.key,
                            difficulty: diffLevel,
                            raw_text: JSON.stringify(validated.validData),
                            content_hash: validated.hash,
                            source_ip: 'TITAN-MATRIX'
                        });
                        logSystem('GEN', `✅ Saved`, `[${diffLevel}] Hash: ${validated.hash.substring(0,6)}...`);
                    } catch (dbErr) {
                        if (dbErr.code === 11000) {
                            logSystem('GEN', '♻️ Duplicate', 'Skipping.');
                        }
                    }
                    
                    // Delay to avoid rate limits
                    await new Promise(r => setTimeout(r, 60000));

                } catch (err) {
                    if (err.message.includes('429') || err.message.includes('quota')) {
                        logSystem('WARN', '⏳ QUOTA HIT', 'Pausing for 60 seconds...');
                        await new Promise(r => setTimeout(r, 60000));
                        i--; 
                    } else {
                        logSystem('ERR', 'Gen Logic Error', err.message);
                        await new Promise(r => setTimeout(r, 2000));
                    }
                }
            }

        } catch (err) {
            logSystem('ERR', 'Loop Error', err.message);
        }
    }
}

SYSTEM_STATE.isGenerating = false;
SYSTEM_STATE.currentGenTask = "All Targets Met";
logSystem('GEN', '🏁 SEQUENCE COMPLETED', 'Database populated.');

}

// =================================================================================================
// SECTION 7: MIDDLEWARE & SECURITY (🔥 UPDATED WITH LOGIN SESSION)
// =================================================================================================

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 🔥 1. SESSION MIDDLEWARE (NEW)
app.use(session({
secret: 'BOYSINH_LOVEYOU_TITAN_SECRET_KEY_2025',
resave: false,
saveUninitialized: true,
cookie: { 
    secure: false, // Set to true if using HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 Hours
}
}));

// 🔥 2. AUTH GUARD MIDDLEWARE (NEW)
const requireAuth = (req, res, next) => {
if (req.session && req.session.isAdmin) {
    return next();
}
res.redirect('/admin/login');
};

app.use((req, res, next) => {
SYSTEM_STATE.totalRequests++;
const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
SYSTEM_STATE.uniqueVisitors.add(ip);
if (req.path.startsWith('/api') || req.path.startsWith('/admin')) {
logSystem('NET', `${req.method} ${req.path}`, `IP: ${ip}`);
}
next();
});

       


// =================================================================================================
// SECTION 8: PRIMARY API ENDPOINTS (PUBLIC) - [SIMPLIFIED V12.3: NO TOKEN]
// =================================================================================================

// -------------------------------------------------------------------------
// HELPER CONFIGURATIONS
// -------------------------------------------------------------------------

// 1. កំណត់ពិន្ទុអតិបរមាដែលអាចទទួលក្នុង ១ ហ្គេម (នៅរក្សាទុកដើម្បីការពារការ Hack ពិន្ទុលើស)
const SCORE_RULES = {
    "Easy": 5, "Medium": 10, "Hard": 15, "Very Hard": 20
};

// Helper: Map Topic Name
const mapTopicToKey = (frontendName) => {
    if (!frontendName) return "Limits";
    const name = String(frontendName).trim().toLowerCase();
    if (name.includes("limit")) return "Limits";
    if (name.includes("deriv")) return "Derivatives"; 
    if (name.includes("integ")) return "Integrals";
    if (name.includes("study") || name.includes("func")) return "FuncAnalysis";
    if (name.includes("diff") && name.includes("eq")) return "DiffEq";
    if (name.includes("complex")) return "Complex";
    if (name.includes("vector")) return "Vectors";
    if (name.includes("prob")) return "Probability";
    if (name.includes("conic")) return "Conics";
    if (name.includes("contin")) return "Continuity";
    return "Limits";
};

// Helper: Standardize Difficulty
const standardizeDifficulty = (input) => {
    if (!input) return "Medium";
    const s = String(input).toLowerCase().trim();
    if (s === 'easy' || s === 'ez') return "Easy";
    if (s.includes('very') || s.includes('hard')) return s.includes('very') ? "Very Hard" : "Hard";
    return "Medium";
};

// -------------------------------------------------------------------------
// 🚀 API ROUTE DEFINITIONS
// -------------------------------------------------------------------------

// 🤖 1. GENERATE PROBLEM API (SIMPLE MODE)
app.post('/api/generate-problem', async (req, res) => {
    const { topic, difficulty } = req.body;
    const finalTopic = mapTopicToKey(topic); 
    const finalDifficulty = standardizeDifficulty(difficulty);
    SYSTEM_STATE.totalGamesGenerated++;

    // 🛡️ NO TOKEN GENERATION HERE ANYMORE

    // A. CHECK CACHE FIRST
    if (SYSTEM_STATE.mongoConnected) {
        try {
            const cached = await MathCache.aggregate([
                { $match: { topic: finalTopic, difficulty: finalDifficulty } }, 
                { $sample: { size: 1 } }
            ]);
            
            if (cached.length > 0) {
                SYSTEM_STATE.cacheHits++;
                logSystem('DB', 'Cache Hit', `${finalTopic} (${finalDifficulty})`);
                
                const shuffledText = shuffleOptions(cached[0].raw_text);
                return res.json({ 
                    text: shuffledText, 
                    source: "cache",
                    // gameToken removed
                    metadata: { topic: finalTopic, difficulty: finalDifficulty }
                });
            }
        } catch (e) { logSystem('ERR', 'Cache Read Error', e.message); }
    }

    // B. LIVE AI GENERATION (Fallback)
    try {
        const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
        const model = genAI.getGenerativeModel({ model: CONFIG.AI_MODEL });
        
        const forms = ALL_FORMS[finalTopic] || ["General Math"];
        const randomForm = forms[Math.floor(Math.random() * forms.length)];

        const aiPrompt = `
        Create 1 unique multiple-choice math problem in KHMER LANGUAGE.
        TOPIC: "${finalTopic}"
        SUB-TYPE: "${randomForm}"
        LEVEL: "${finalDifficulty}"
        CRITICAL RULES:
        1. Language: KHMER. 
        2. Format: JSON Only. { "question": "...", "options": ["..."], "answer": "...", "explanation": "..." }
        3. Math: Wrap in $.
        `;
        
        const result = await model.generateContent(aiPrompt);
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        
        const validated = validateProblemIntegrity(text);
        if(!validated) throw new Error("AI generated invalid JSON");

        if (SYSTEM_STATE.mongoConnected) {
            MathCache.create({
                topic: finalTopic, difficulty: finalDifficulty, 
                raw_text: text, content_hash: validated.hash, source_ip: req.ip
            }).catch(e => {});
        }

        const shuffledLive = shuffleOptions(text);
        res.json({ 
            text: shuffledLive, 
            source: "ai", 
            // gameToken removed
            metadata: { topic: finalTopic, difficulty: finalDifficulty } 
        });

    } catch (err) {
        logSystem('ERR', 'AI Service Error', err.message);
        res.status(500).json({ error: "AI Service Unavailable" });
    }
});


// 🏆 2. LEADERBOARD SUBMIT API (SMART MERGE + SCORE CHECK ONLY)
app.post('/api/leaderboard/save', async (req, res) => {
    // ⚠️ No gameToken required anymore
    const { username, score, difficulty } = req.body;
    const finalDiff = standardizeDifficulty(difficulty);
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // 🛑 SCORE CHECK ONLY (ការពារកុំអោយដាក់ពិន្ទុលើស)
    const maxAllowed = SCORE_RULES[finalDiff] || 50; 
    if (score > maxAllowed) {
        logSystem('SEC', '⚠️ SCORE REJECTED', `${username} sent ${score} (Max: ${maxAllowed})`);
        return res.status(400).json({ success: false, message: "Invalid Score: Too High" });
    }
    if (score < 0) return res.status(400).json({ success: false });

    let client;
    try {
        client = await pgPool.connect(); 
        await client.query('BEGIN');     // Transaction Start

        // 🔒 Lock Rows (ការពារការជាន់គ្នា)
        const check = await client.query(
            'SELECT id, score FROM leaderboard WHERE username = $1 AND difficulty = $2 ORDER BY id ASC FOR UPDATE',
            [username, finalDiff]
        );

        if (check.rows.length > 0) {
            // 🔄 SMART MERGE logic
            const totalPrevious = check.rows.reduce((sum, row) => sum + row.score, 0);
            const grandTotal = totalPrevious + score;

            // Update ID ទីមួយ
            await client.query(
                'UPDATE leaderboard SET score = $1, updated_at = NOW(), ip_address = $3 WHERE id = $2',
                [grandTotal, check.rows[0].id, ip]
            );

            // លុប ID ស្ទួនចោល
            if (check.rows.length > 1) {
                const idsToDelete = check.rows.slice(1).map(r => r.id);
                await client.query('DELETE FROM leaderboard WHERE id = ANY($1::int[])', [idsToDelete]);
            }
            logSystem('DB', 'Smart Merge', `${username}: Total ${grandTotal}`);
        } else {
            // ➕ NEW ENTRY
            await client.query(
                'INSERT INTO leaderboard(username, score, difficulty, ip_address) VALUES($1, $2, $3, $4)',
                [username, score, finalDiff, ip]
            );
            logSystem('DB', 'New Player', `${username} [+${score}]`);
        }

        await client.query('COMMIT'); 
        res.status(201).json({ success: true, verifiedScore: score });

    } catch (err) {
        if (client) await client.query('ROLLBACK'); 
        logSystem('ERR', 'Leaderboard Error', err.message);
        res.status(500).json({ success: false });
    } finally {
        if (client) client.release(); // ✅ SAFE RELEASE
    }
});


// 📊 3. LEADERBOARD TOP API (LIMIT 500)
app.get('/api/leaderboard/top', async (req, res) => {
    let client;
    try {
        client = await pgPool.connect();
        
        const result = await client.query(`
            SELECT username, SUM(score) as score, COUNT(difficulty) as games_played 
            FROM leaderboard 
            GROUP BY username 
            ORDER BY score DESC 
            LIMIT 500
        `);
        
        res.json(result.rows);
    } catch (err) { 
        logSystem('ERR', 'Fetch Error', err.message);
        res.status(500).json([]); 
    } finally {
        if (client) client.release(); 
    }
});


// 📜 4. CERTIFICATE REQUEST API
app.post('/api/submit-request', async (req, res) => {
    let client;
    try {
        client = await pgPool.connect();
        await client.query('INSERT INTO certificate_requests (username, score) VALUES ($1, $2)', [req.body.username, req.body.score]);
        res.json({ success: true });
    } catch (e) { 
        res.status(500).json({ success: false }); 
    } finally {
        if (client) client.release(); 
    }
});

    

        

// =================================================================================================
// SECTION 9: ADMINISTRATIVE API & AUTH ROUTES (🔥 UPDATED)
// =================================================================================================

// 🔐 9.1 LOGIN PAGE UI
app.get('/admin/login', (req, res) => {
const errorMsg = req.query.err ? '<p style="color:#ef4444; background: rgba(239,68,68,0.1); padding:10px; border-radius:8px; margin-bottom:15px;">❌ ឈ្មោះគណនី ឬ ពាក្យសម្ងាត់មិនត្រឹមត្រូវ!</p>' : '';

res.send(`
<!DOCTYPE html>
<html lang="km">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TITAN SECURITY GATE</title>
    <link href="https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@300;400;700&display=swap" rel="stylesheet">
    <style>
        body { background: #050b14; color: #f8fafc; font-family: 'Kantumruy Pro', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .login-card { background: rgba(30, 41, 59, 0.6); backdrop-filter: blur(12px); padding: 40px; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.1); width: 100%; max-width: 400px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
        input { width: 100%; padding: 15px; margin: 10px 0; background: #0f172a; border: 1px solid #334155; color: white; border-radius: 10px; font-family: inherit; box-sizing: border-box; outline: none; transition: 0.3s; }
        input:focus { border-color: #3b82f6; box-shadow: 0 0 10px rgba(59, 130, 246, 0.2); }
        button { width: 100%; padding: 15px; margin-top: 20px; background: linear-gradient(135deg, #3b82f6, #2563eb); border: none; color: white; border-radius: 10px; font-weight: bold; cursor: pointer; transition: 0.3s; font-family: inherit; }
        button:hover { transform: scale(1.02); box-shadow: 0 0 20px rgba(59, 130, 246, 0.5); }
    </style>
</head>
<body>
    <div class="login-card">
        <h1 style="color:#3b82f6; margin-bottom:5px;">TITAN ADMIN</h1>
        <p style="color:#94a3b8; font-size:0.9rem; margin-bottom:30px;">SECURE ACCESS V12.1</p>
        ${errorMsg}
        <form action="/admin/login" method="POST">
            <input type="text" name="username" placeholder="ឈ្មោះគណនី (Username)" required autocomplete="off">
            <input type="password" name="password" placeholder="ពាក្យសម្ងាត់ (Password)" required>
            <button type="submit">🔒 ចូលប្រព័ន្ធ (LOGIN)</button>
        </form>
        <div style="margin-top:20px; font-size:0.75rem; color:#475569;">BrainTest Engineering Team</div>
    </div>
</body>
</html>
`);
});

// 🔐 9.2 LOGIN LOGIC
app.post('/admin/login', (req, res) => {
const { username, password } = req.body;

// 🔥 CREDENTIALS CONFIGURATION
if (username === 'Boysinh' && password === 'Loveyou9999@@') {
    req.session.isAdmin = true;
    logSystem('SEC', 'Admin Login Success', `User: ${username} | IP: ${req.ip}`);
    res.redirect('/admin');
} else {
    logSystem('WARN', 'Failed Login Attempt', `IP: ${req.ip}`);
    res.redirect('/admin/login?err=1');
}
});

// 🚪 9.3 LOGOUT
app.get('/admin/logout', (req, res) => {
req.session.destroy();
res.redirect('/admin/login');
});

// 🛡️ 9.4 PROTECTED ADMIN APIS
// All Admin APIs below are now protected by `requireAuth`

app.get('/admin/generate-cert/:id', requireAuth, async (req, res) => {
try {
const client = await pgPool.connect();
const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [req.params.id]);
client.release();
if (result.rows.length === 0) return res.status(404).send("Request not found");
const { username, score } = result.rows[0];
const finalUrl = `https://api.canvasrender.com/v1/cert?name=${encodeURIComponent(username)}&mark-txt=Score:${score}`;
res.redirect(finalUrl);
} catch (e) { res.status(500).send("Error"); }
});

app.delete('/admin/delete-request/:id', requireAuth, async (req, res) => {
try {
const client = await pgPool.connect();
await client.query('DELETE FROM certificate_requests WHERE id = $1', [req.params.id]);
client.release();
res.json({ success: true });
} catch (e) { res.status(500).json({ success: false }); }
});

app.delete('/admin/api/problem/:id', requireAuth, async (req, res) => {
if (!SYSTEM_STATE.mongoConnected) return res.status(500).json({ error: "No DB" });
try {
    const result = await MathCache.findByIdAndDelete(req.params.id);
    if (result) {
        logSystem('SEC', 'Problem Deleted', `ID: ${req.params.id}`);
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, message: "Not found" });
    }
} catch (e) {
    res.status(500).json({ error: e.message });
}
});

app.get('/admin/api/stats', requireAuth, async (req, res) => {
if (!SYSTEM_STATE.mongoConnected) return res.json({ stats: [] });
const stats = await MathCache.aggregate([{ $group: { _id: { topic: "$topic", difficulty: "$difficulty" }, count: { $sum: 1 } } }]);
const client = await pgPool.connect();
const certs = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
client.release();
res.json({
stats, certRequests: certs.rows, isGenerating: SYSTEM_STATE.isGenerating,
currentTask: SYSTEM_STATE.currentGenTask, targets: CONFIG.TARGETS, topics: CONFIG.TOPICS
});
});

app.post('/admin/api/toggle-gen', requireAuth, (req, res) => {
if (req.body.action === 'start') startBackgroundGeneration();
else SYSTEM_STATE.isGenerating = false;
res.json({ status: SYSTEM_STATE.isGenerating });
});

app.delete('/admin/api/flush-topic/:topic/:diff', requireAuth, async (req, res) => {
const { topic, diff } = req.params;
if (!SYSTEM_STATE.mongoConnected) return res.status(500).json({ error: "No DB" });
try {
    let query = {};
    if (topic !== 'all') query.topic = topic;
    if (diff !== 'all') query.difficulty = diff;
    const result = await MathCache.deleteMany(query);
    logSystem('SEC', '🗑️ FLUSH DATA', `Deleted ${result.deletedCount} items from ${topic}/${diff}`);
    res.json({ success: true, deleted: result.deletedCount });
} catch (e) {
    res.status(500).json({ error: e.message });
}
});

// =================================================================================================
// SECTION 10: PREMIUM ADMINISTRATIVE DASHBOARD (FULL HTML/CSS/JS)
// =================================================================================================

app.get('/admin', requireAuth, (req, res) => {
res.send(`
<!DOCTYPE html>
<html lang="km">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BRAINTEST TITAN COMMAND CENTER V12.1</title>
<link href="https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@300;400;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
    /* --- CSS VARIABLES & THEME --- */
    :root {
        --bg-dark: #050b14;
        --glass-bg: rgba(30, 41, 59, 0.6);
        --glass-border: rgba(255, 255, 255, 0.1);
        --primary: #3b82f6;
        --primary-glow: rgba(59, 130, 246, 0.5);
        --success: #10b981;
        --success-glow: rgba(16, 185, 129, 0.5);
        --danger: #ef4444;
        --text-main: #f8fafc;
        --text-mute: #94a3b8;
    }

    * { box-sizing: border-box; }

    body {
        margin: 0; padding: 0;
        background-color: var(--bg-dark);
        background-image: radial-gradient(at 0% 0%, rgba(56, 189, 248, 0.1) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.1) 0px, transparent 50%);
        color: var(--text-main);
        font-family: 'Kantumruy Pro', sans-serif;
        min-height: 100vh;
    }

    .layout {
        max-width: 1400px; margin: 0 auto; padding: 30px;
        display: grid; grid-template-columns: 280px 1fr; gap: 30px;
    }

    .sidebar {
        position: sticky; top: 30px; height: calc(100vh - 60px);
        background: var(--glass-bg); backdrop-filter: blur(12px);
        border: 1px solid var(--glass-border); border-radius: 20px;
        padding: 30px; display: flex; flex-direction: column;
    }

    .brand { margin-bottom: 40px; padding-bottom: 20px; border-bottom: 1px solid var(--glass-border); }
    .brand h1 { margin: 0; font-size: 1.4rem; letter-spacing: 1px; color: var(--primary); text-shadow: 0 0 10px var(--primary-glow); }
    .brand span { font-size: 0.75rem; color: var(--text-mute); font-family: 'JetBrains Mono'; }

    .nav-btn {
        background: transparent; border: none; color: var(--text-mute);
        padding: 15px; text-align: left; font-family: 'Kantumruy Pro';
        font-size: 1rem; cursor: pointer; border-radius: 12px;
        transition: all 0.3s; margin-bottom: 10px; display: flex; align-items: center; gap: 12px;
    }
    .nav-btn:hover { background: rgba(255,255,255,0.05); color: white; }
    .nav-btn.active { background: rgba(59, 130, 246, 0.15); color: var(--primary); border: 1px solid rgba(59, 130, 246, 0.3); box-shadow: 0 0 15px rgba(59, 130, 246, 0.1); }

    .main-content { display: flex; flex-direction: column; gap: 25px; }
    .glass-card { background: var(--glass-bg); backdrop-filter: blur(12px); border: 1px solid var(--glass-border); border-radius: 20px; padding: 25px; box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5); }

    .status-header { display: flex; justify-content: space-between; align-items: center; }
    .status-badge { padding: 8px 16px; border-radius: 50px; font-size: 0.85rem; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .status-badge.idle { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .status-badge.running { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    
    .pulse-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0% { opacity: 1; box-shadow: 0 0 0 0px currentColor; } 100% { opacity: 0; box-shadow: 0 0 0 10px transparent; } }

    .ctrl-btn { width: 100%; padding: 20px; border: none; border-radius: 16px; font-family: 'Kantumruy Pro'; font-size: 1.2rem; font-weight: 700; cursor: pointer; transition: all 0.3s; text-transform: uppercase; letter-spacing: 1px; }
    .btn-start { background: linear-gradient(135deg, #059669, #10b981); color: white; box-shadow: 0 4px 20px var(--success-glow); }
    .btn-start:hover { transform: translateY(-2px); box-shadow: 0 8px 25px var(--success-glow); }
    .btn-stop { background: linear-gradient(135deg, #991b1b, #ef4444); color: white; box-shadow: 0 4px 20px rgba(239, 68, 68, 0.5); }

    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; }
    .topic-header { font-size: 1.1rem; color: var(--primary); border-bottom: 1px solid var(--glass-border); padding-bottom: 10px; margin-bottom: 15px; margin-top: 0; }

    .prog-container { width: 100%; background: rgba(0,0,0,0.3); height: 8px; border-radius: 4px; overflow: hidden; margin-top: 5px; }
    .prog-bar { height: 100%; background: var(--primary); border-radius: 4px; transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 10px var(--primary-glow); }
    .prog-bar.full { background: var(--success); box-shadow: 0 0 10px var(--success-glow); }

    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    td { padding: 12px 5px; border-bottom: 1px solid rgba(255,255,255,0.05); }
    tr:last-child td { border-bottom: none; }
    .diff-badge { font-family: 'JetBrains Mono'; font-size: 0.75rem; color: var(--text-mute); }

    .terminal { background: #09090b; border: 1px solid #27272a; border-radius: 12px; height: 400px; overflow-y: auto; padding: 15px; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; box-shadow: inset 0 0 20px rgba(0,0,0,0.5); }
    .log-row { margin-bottom: 5px; display: flex; gap: 10px; }
    .log-time { color: #52525b; } .log-type { font-weight: bold; }

    ::-webkit-scrollbar { width: 8px; } ::-webkit-scrollbar-track { background: var(--bg-dark); } ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }

    .section { display: none; animation: slideUp 0.4s ease-out; } .section.active { display: block; }
    @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

    .trash-btn { background: none; border: none; cursor: pointer; font-size: 1.1rem; opacity: 0.6; transition: 0.3s; }
    .trash-btn:hover { opacity: 1; transform: scale(1.1); }
</style>
</head>
<body>
    <div class="layout">
        
        <!-- LEFT SIDEBAR -->
        <div class="sidebar">
            <div class="brand">
                <h1>TITAN ENGINE</h1>
                <span>v12.1 DIAMOND</span>
            </div>
            
            <button class="nav-btn active" onclick="switchTab('gen', this)">
                ⚙️ ម៉ាស៊ីនផលិត (Generator)
            </button>
            <button class="nav-btn" onclick="switchTab('cert', this)">
                🎓 វិញ្ញាបនបត្រ (Certs)
            </button>
            <button class="nav-btn" onclick="switchTab('logs', this)">
                📡 ប្រព័ន្ធតាមដាន (Logs)
            </button>

            <!-- 🔥 LOGOUT BUTTON ADDED HERE -->
            <a href="/admin/logout" class="nav-btn" style="margin-top: auto; text-decoration: none; border: 1px solid rgba(239, 68, 68, 0.4); color: #ef4444; justify-content: center;">
                🚪 ចាកចេញ (Logout)
            </a>

            <div style="padding-top: 20px; text-align:center; opacity:0.5; font-size:0.7rem;">
                SECURE SESSION ACTIVE<br>User: Boysinh
            </div>
        </div>

        <!-- RIGHT CONTENT -->
        <div class="main-content">
            
            <!-- GENERATOR SECTION -->
            <div id="gen" class="section active">
                <div class="glass-card status-header">
                    <div>
                        <h2 style="margin:0">Control Center</h2>
                        <small style="color: var(--text-mute)" id="taskDisplay">System Idle</small>
                    </div>
                    <div id="statusBadge" class="status-badge idle">
                        <div class="pulse-dot"></div> <span id="statusText">STANDBY</span>
                    </div>
                </div>

                <div style="margin-top: 20px;">
                    <button id="mainBtn" class="ctrl-btn btn-start" onclick="toggleGen()">
                        ⚡ ចាប់ផ្តើមដំណើរការ (START ENGINE)
                    </button>
                </div>

                <div class="stats-grid" id="statsGrid" style="margin-top: 30px;">
                    <div class="glass-card" style="text-align:center; color: var(--text-mute)">
                        Connecting to Secure Core...
                    </div>
                </div>
            </div>

            <!-- CERTIFICATES SECTION -->
            <div id="cert" class="section">
                <div class="glass-card">
                    <h3 class="topic-header">បញ្ជីសំណើរសុំវិញ្ញាបនបត្រ (Certificate Requests)</h3>
                    <table>
                        <thead>
                            <tr style="color:var(--text-mute); text-align:left;">
                                <th>ID</th>
                                <th>ឈ្មោះសិស្ស</th>
                                <th>ពិន្ទុ</th>
                                <th>កាលបរិច្ឆេទ</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="certBody"></tbody>
                    </table>
                </div>
            </div>

            <!-- LOGS SECTION -->
            <div id="logs" class="section">
                <div class="glass-card">
                    <h3 class="topic-header">Live Server Terminal</h3>
                    <div class="terminal" id="logTerm"></div>
                </div>
            </div>

        </div>
    </div>

    <script>
        function switchTab(id, btn) {
            document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
            document.getElementById(id).classList.add('active');
            if(btn) btn.classList.add('active');
        }

        let isRunning = false;
        async function refreshData() {
            try {
                const res = await fetch('/admin/api/stats');
                const data = await res.json();

                // 1. UPDATE GENERATOR STATUS UI
                isRunning = data.isGenerating;
                const btn = document.getElementById('mainBtn');
                const badge = document.getElementById('statusBadge');
                const statusText = document.getElementById('statusText');
                const taskDisplay = document.getElementById('taskDisplay');

                if (isRunning) {
                    btn.innerHTML = "🛑 បញ្ឈប់ដំណើរការ (EMERGENCY STOP)";
                    btn.className = "ctrl-btn btn-stop";
                    badge.className = "status-badge running";
                    statusText.innerText = "RUNNING";
                    taskDisplay.innerText = "Current Task: " + data.currentTask;
                    taskDisplay.style.color = "var(--success)";
                } else {
                    btn.innerHTML = "⚡ ចាប់ផ្តើមដំណើរការ (START ENGINE)";
                    btn.className = "ctrl-btn btn-start";
                    badge.className = "status-badge idle";
                    statusText.innerText = "STANDBY";
                    taskDisplay.innerText = "System Idle - Ready to Deploy";
                    taskDisplay.style.color = "var(--text-mute)";
                }

                // 2. RENDER TOPIC STATISTICS CARDS
                const grid = document.getElementById('statsGrid');
                let htmlBuffer = '';
                
                data.topics.forEach(topic => {
                    let rows = '';
                    ['Easy', 'Medium', 'Hard', 'Very Hard'].forEach(diff => {
                        const found = data.stats.find(s => s._id.topic === topic.key && s._id.difficulty === diff);
                        const count = found ? found.count : 0;
                        const target = data.targets[diff];
                        const pct = Math.min((count/target)*100, 100);
                        const barClass = pct >= 100 ? 'prog-bar full' : 'prog-bar';
                        
                        rows += \`
                            <tr>
                                <td class="diff-badge" width="30%">\${diff}</td>
                                <td width="20%" style="font-weight:bold; color:white">\${count}</td>
                                <td width="40%">
                                    <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:var(--text-mute); margin-bottom:2px;">
                                        <span>Target: \${target}</span>
                                        <span>\${Math.round(pct)}%</span>
                                    </div>
                                    <div class="prog-container">
                                        <div class="\${barClass}" style="width:\${pct}%"></div>
                                    </div>
                                </td>
                                <td width="10%" style="text-align:right;">
                                    <button onclick="flushTopic('\${topic.key}', '\${diff}')" class="trash-btn" title="Delete All Data">🗑️</button>
                                </td>
                            </tr>
                        \`;
                    });
                    
                    htmlBuffer += \`
                        <div class="glass-card">
                            <h3 class="topic-header">\${topic.label}</h3>
                            <table>\${rows}</table>
                        </div>
                    \`;
                });
                grid.innerHTML = htmlBuffer;

                // 3. RENDER CERTIFICATE TABLE
                const tbody = document.getElementById('certBody');
                if(data.certRequests.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-mute)">No pending requests</td></tr>';
                } else {
                    tbody.innerHTML = data.certRequests.map(r => \`
                        <tr>
                            <td style="font-family:'JetBrains Mono'; color:var(--primary)">#\${r.id}</td>
                            <td style="font-weight:600">\${r.username}</td>
                            <td><span style="background:rgba(59, 130, 246, 0.2); color:#60a5fa; padding:2px 8px; border-radius:4px; font-size:0.8rem">\${r.score}</span></td>
                            <td style="color:var(--text-mute)">\${new Date(r.request_date).toLocaleDateString()}</td>
                            <td>
                                <a href="/admin/generate-cert/\${r.id}" target="_blank" style="text-decoration:none; margin-right:10px;" title="Print">🖨️</a>
                                <span onclick="delCert(\${r.id})" style="cursor:pointer; color:var(--danger);" title="Delete">🗑️</span>
                            </td>
                        </tr>
                    \`).join('');
                }

            } catch (e) { console.error("Update Error:", e); }
        }

        const logTerm = document.getElementById('logTerm');
        const initialLogs = ${JSON.stringify(SYSTEM_STATE.logs)};
        
        function renderLogs(logs) {
            logTerm.innerHTML = logs.map(l => \`
                <div class="log-row">
                    <span class="log-time">[\${l.time}]</span>
                    <span class="log-type" style="color: \${getColor(l.type)}">\${l.type}</span>
                    <span style="color: #e4e4e7">\${l.msg}</span>
                </div>
            \`).join('');
        }
        
        function getColor(type) {
            if(type==='ERR') return '#ef4444';
            if(type==='GEN') return '#a855f7'; 
            if(type==='DB') return '#f59e0b';
            if(type==='AI') return '#ec4899';
            if(type==='SEC') return '#10b981';
            return '#3b82f6';
        }
        renderLogs(initialLogs);

        async function toggleGen() {
            const action = isRunning ? 'stop' : 'start';
            await fetch('/admin/api/toggle-gen', { 
                method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action}) 
            });
            refreshData();
        }

        async function delCert(id) {
            if(confirm('Are you sure you want to delete this request?')) {
                await fetch('/admin/delete-request/'+id, {method:'DELETE'});
                refreshData();
            }
        }

        async function flushTopic(topic, diff) {
            if(confirm(\`Are you sure you want to DELETE ALL questions for \${topic} - \${diff}?\`)) {
                await fetch(\`/admin/api/flush-topic/\${topic}/\${diff}\`, { method: 'DELETE' });
                refreshData();
            }
        }

        setInterval(refreshData, 2000);
        refreshData(); 

    </script>
</body>
</html>
`);

});

// =================================================================================================
// SECTION 11: PUBLIC DASHBOARD (SIMPLE STATUS PAGE)
// =================================================================================================

app.get('/', (req, res) => {
const uptime = process.uptime();
const d = Math.floor(uptime / 86400);
const h = Math.floor((uptime % 86400) / 3600);
const pg = SYSTEM_STATE.postgresConnected ? '<span style="color:#10b981">● ONLINE</span>' : '<span style="color:#ef4444">● OFFLINE</span>';
const mg = SYSTEM_STATE.mongoConnected ? '<span style="color:#10b981">● ONLINE</span>' : '<span style="color:#ef4444">● OFFLINE</span>';
const uniqueCount = SYSTEM_STATE.uniqueVisitors.size;    

res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <title>TITAN CLOUD</title>
    <style>
        body { background: #0b1121; color: #f1f5f9; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .card { background: #151e32; padding: 40px; border-radius: 16px; border: 1px solid #334155; text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3); }
        h1 { color: #3b82f6; margin: 0 0 10px 0; }
        .metric { background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; margin: 10px 0; border: 1px solid #334155; }
        .btn { display: block; background: #3b82f6; color: white; padding: 15px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 20px; transition: 0.3s; }
        .btn:hover { background: #2563eb; }
    </style>
</head>
<body>
    <div class="card">
        <h1>🚀 TITAN ENGINE V12.1</h1>
        <p>UPTIME: ${d}d ${h}h</p>
        <div class="metric">PG: ${pg} | MONGO: ${mg}</div>
        <div class="metric">
            REQ: ${SYSTEM_STATE.totalRequests} | 
            HITS: ${SYSTEM_STATE.cacheHits} | 
            AI: ${SYSTEM_STATE.aiCalls}
        </div>

        <div class="metric" style="background:rgba(59, 130, 246, 0.2); color:#93c5fd; border: 1px solid rgba(59, 130, 246, 0.5);">
        UNIQUE VISITORS: ${uniqueCount}
    </div>
        
        <a href="/admin" class="btn">🔐 ENTER ADMIN PANEL</a>
    </div>
</body>
</html>
`);

});

// =================================================================================================
// SECTION 12: SYSTEM BOOTSTRAP
// =================================================================================================

async function startSystem() {
console.clear();
logSystem('OK', 'Booting BrainTest Titan V12.1 (Secure Mode)...');

// Initialize DBs (Non-blocking)
initPostgres(); 
initMongo();    

// Start Listening
const server = app.listen(CONFIG.PORT, () => {
    logSystem('NET', `Server Active`, `Port ${CONFIG.PORT}`);
    logSystem('INFO', `Public URL: http://localhost:${CONFIG.PORT}`);
    logSystem('SEC', `Secure Admin: http://localhost:${CONFIG.PORT}/admin`);
});

// Graceful Shutdown
process.on('SIGTERM', () => {
    logSystem('WARN', 'SIGTERM Received', 'Shutting down...');
    server.close(() => process.exit(0));
});

}

// Execute
startSystem();
