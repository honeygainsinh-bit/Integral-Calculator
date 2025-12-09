/**
=================================================================================================
| __ )|  _ \    / \  |_ | \ | |   _| ____/ __|   _|
|  _ | |_) |  / _ \  | ||  | | | | |  | __ \ | |
| |) |  _ <  / ___ \ | || |\  | | | | |__ ___) || |
|/|| _//   ____|| _| || |_____|___/ ||
=================================================================================================
PROJECT:           BRAINTEST - TITAN ENTERPRISE BACKEND
EDITION:           V11.8 (FILESYSTEM SAFETY PATCH)
ARCHITECTURE:      MONOLITHIC NODE.JS WITH HYBRID DATABASE (PG + MONGO)
AUTHOR:            BRAINTEST ENGINEERING TEAM
DATE:              DECEMBER 2025
ENGINE:            GEMINI 2.5 FLASH INTEGRATION
STATUS:            PRODUCTION READY
=================================================================================================

█ CRITICAL FIX LOG (V11.8):
1. [FIXED] SERVE-STATIC CRASH (RENDER ERROR):
   - Added `fs.existsSync` check.
   - If 'public' folder is missing, the system now AUTO-CREATES it.
   - Prevents `SendStream.error` when deploying to fresh servers.

2. [MAINTAINED] ALL PREVIOUS FIXES:
   - Infinite Retry Generator.
   - JSON Auto-Repair.
   - Smart Database Merging.

=================================================================================================
*/

// =================================================================================================
// SECTION 1: LIBRARY IMPORTS & ENVIRONMENT SETUP
// =================================================================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs'); // ADDED FOR FILE SYSTEM SAFETY
const { Pool } = require('pg');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// =================================================================================================
// SECTION 2: MASTER CONFIGURATION & MATRIX DEFINITIONS
// =================================================================================================

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
        "0/0: Inverse Trigonometric Functions",
        "Inf/Inf: Rational Functions (Highest Degree Rule)",
        "Inf/Inf: Irrational Functions (Sqrt(x^2) terms)",
        "Inf - Inf: Radical Conjugate (sqrt(A) - sqrt(B))",
        "Inf - Inf: Logarithmic Differences",
        "Exponential Limits (e^x / x at infinity)",
        "Logarithmic Limits (ln x / x at infinity)",
        "1^Inf: Euler Form (1 + u)^v Standard",
        "1^Inf: Euler Form with Trigonometry",
        "Continuity: Finding 'k' for continuity at a point",
        "Continuity: Piecewise Functions classification",
        "L'Hopital's Rule: First Application",
        "L'Hopital's Rule: Repeated Application",
        "Squeeze Theorem / Sandwich Theorem Application"
    ],

    // --- 2. DERIVATIVES ---
    "Derivatives": [
        "Power Rule: Polynomials with negative/fractional powers",
        "Product Rule: (uv)' = u'v + uv'",
        "Quotient Rule: (u/v)' logic",
        "Chain Rule: Power of a Function u^n",
        "Chain Rule: Involving Radicals sqrt(u)",
        "Chain Rule: Trigonometric Functions (sin u, cos u)",
        "Chain Rule: Nested Trigonometry (sin(cos x))",
        "Derivatives of Inverse Trig (arcsin u, arctan u)",
        "Derivatives of Exponential Functions (e^u, a^u)",
        "Derivatives of Logarithmic Functions (ln u, log_a u)",
        "Logarithmic Differentiation (Functions y = x^x)",
        "Implicit Differentiation (First order y')",
        "Implicit Differentiation (Second order y'')",
        "Parametric Differentiation (dy/dt / dx/dt)",
        "Higher Order Derivatives: y'', y''' calculation",
        "Tangent Line Equation at a point",
        "Normal Line Equation at a point",
        "Linear Approximation (Differentials)",
        "Mean Value Theorem (MVT) Application",
        "Rolle's Theorem Verification"
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
        "U-Substitution: Inverse Trig Forms",
        "Integration by Parts: Polynomial * Exponential (x e^x)",
        "Integration by Parts: Polynomial * Trig (x sin x)",
        "Integration by Parts: Logarithmic (ln x)",
        "Integration by Parts: Cyclic (e^x sin x)",
        "Trig Powers: Odd/Even powers of sin/cos",
        "Trig Substitution: sqrt(a^2 - x^2)",
        "Partial Fractions: Distinct Linear Denominators",
        "Partial Fractions: Repeated Linear Denominators",
        "Partial Fractions: Irreducible Quadratic",
        "Definite Integral: Calculation with bounds",
        "Definite Integral: Absolute Value Functions",
        "Area: Between Curve and X-axis",
        "Area: Between Two Curves f(x) and g(x)",
        "Volume: Solid of Revolution (Disk Method)",
        "Volume: Solid of Revolution (Washer Method)"
    ],

    // --- 4. DIFFERENTIAL EQUATIONS ---
    "DiffEq": [
        "Verification: Checking if y is a solution",
        "Separable: Basic variables separation",
        "Separable: Involving Trigonometry or Exponentials",
        "Linear First Order: Integrating Factor Method",
        "Linear First Order: Bernoulli Equations",
        "Homogeneous First Order: Substitution y = vx",
        "Exact Differential Equations",
        "Second Order Homogeneous: Real Distinct Roots",
        "Second Order Homogeneous: Real Double Root",
        "Second Order Homogeneous: Complex Roots (Alpha +/- Beta i)",
        "Initial Value Problem (IVP): Finding Particular Solution",
        "Applications: Growth and Decay Models",
        "Applications: Newton's Law of Cooling"
    ],

    // --- 5. COMPLEX NUMBERS ---
    "Complex": [
        "Algebraic: Addition, Subtraction, Multiplication",
        "Algebraic: Division (Conjugate Method)",
        "Modulus: Calculating |z|",
        "Argument: Finding arg(z) / theta",
        "Forms: Converting Algebraic to Polar/Trig",
        "Forms: Converting Polar to Algebraic",
        "Forms: Exponential Form (re^it)",
        "Square Roots: Finding sqrt(a+bi)",
        "Quadratics: Solving az^2+bz+c=0 with Delta < 0",
        "De Moivre's Theorem: Powers z^n",
        "Roots of Unity: Finding n-th roots of a number",
        "Geometry: Locus of points (Circle / Line)",
        "Geometry: Min/Max Modulus Problems"
    ],

    // --- 6. VECTORS ---
    "Vectors": [
        "Basics: Magnitude and Unit Vector",
        "Operations: Addition and Scalar Multiplication",
        "Dot Product: Calculating u.v & Angle",
        "Dot Product: Orthogonality Check",
        "Cross Product: Calculating u x v & Area",
        "Scalar Triple Product (Volume of Parallelepiped)",
        "Lines: Parametric Equations",
        "Lines: Symmetric Equations",
        "Planes: Equation given Point and Normal",
        "Planes: Equation given 3 Points",
        "Distance: Point to Plane",
        "Distance: Point to Line",
        "Distance: Parallel Planes",
        "Intersection: Line and Plane",
        "Intersection: Two Planes (Line of Intersection)"
    ],

    // --- 7. FUNCTION ANALYSIS ---
    "FuncAnalysis": [
        "Domain: Rational Functions",
        "Domain: Radical Functions (Sqrt)",
        "Domain: Logarithmic Functions",
        "Range: Finding Range of Functions",
        "Inverse Functions: Finding f^-1(x)",
        "Asymptotes: Vertical & Horizontal",
        "Asymptotes: Oblique (Slant) Asymptote",
        "Symmetry: Parity (Even/Odd Functions)",
        "Derivatives: Finding Critical Points",
        "Extrema: Local Maximum and Minimum",
        "Concavity: Inflection Points",
        "Graphs: Matching Function to Graph",
        "Optimization: Maximizing Area/Volume"
    ],

    // --- 8. CONICS ---
    "Conics": [
        "Circle: General Form to Standard Form",
        "Circle: Finding Center and Radius",
        "Parabola: Vertex at Origin",
        "Parabola: Shifted Vertex (h,k)",
        "Parabola: Finding Focus and Directrix",
        "Ellipse: Finding Vertices and Foci",
        "Ellipse: Eccentricity calculation",
        "Ellipse: Length of Major/Minor Axes",
        "Hyperbola: Finding Vertices, Foci, Asymptotes",
        "Hyperbola: Standard Equations",
        "Tangent: Equation of tangent line to a Conic"
    ],

    // --- 9. PROBABILITY ---
    "Probability": [
        "Counting: Permutations (Arrangements)",
        "Counting: Combinations (Selections)",
        "Counting: Circular Permutations",
        "Basic Prob: Coin Tosses / Dice Rolls / Cards",
        "Compound Prob: Independent vs Mutually Exclusive",
        "Conditional Prob: P(A|B) Calculation",
        "Bayes' Theorem Application",
        "Distribution: Binomial Distribution Formula",
        "Stats: Expected Value (Mean)",
        "Stats: Variance and Standard Deviation"
    ],

    // --- 10. CONTINUITY ---
    "Continuity": [
        "Definition: Checking lim(x->a) = f(a)",
        "One-Sided: Left Limit vs Right Limit",
        "Unknowns: Finding 'k' to make f(x) continuous",
        "Unknowns: Finding 'a' and 'b' (System of Eq)",
        "Discontinuity: Identifying Jump/Hole/Infinite",
        "IVT: Intermediate Value Theorem Applications"
    ]
};

const DIFFICULTY_INSTRUCTIONS = {
    "Easy": "CONTEXT: Grade 12 Basic. REQUIREMENT: 2-3 steps. BAN: Basic arithmetic. EXAMPLE: Limit of (sqrt(x+3)-2)/(x-1).",
    "Medium": "CONTEXT: Scholarship Exam. COMPLEXITY: Combine 2 concepts (e.g. Log + Integral). TRAP: Options must be close.",
    "Hard": "CONTEXT: Outstanding Student. REQUIREMENT: Auxiliary variables, substitutions. FORM: Use constants (pi, e).",
    "Very Hard": "CONTEXT: IMO / Putnam. STYLE: Proof-based logic. COMPLEXITY: Abstract Algebra/Number Theory tricks. OPTIONS: Abstract (e^pi, 0, DNE)."
};

const CONFIG = {
    PORT: process.env.PORT || 3000,
    POSTGRES_URL: process.env.DATABASE_URL,
    MONGO_URI: process.env.MONGODB_URI,
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    AI_MODEL: "gemini-2.5-flash",
    OWNER_IP: process.env.OWNER_IP,
    TARGETS: {
        "Easy": 100,
        "Medium": 50,
        "Hard": 40,
        "Very Hard": 40
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
    logs: []
};

// Centralized Logging System
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
// SECTION 4 & 5: DATABASE LAYERS
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
    source_ip: String,
    createdAt: { type: Date, default: Date.now }
});
problemSchema.index({ topic: 1, difficulty: 1 });
const MathCache = mongoose.model('MathProblemCache', problemSchema);

// =================================================================================================
// SECTION 6: GENERATOR ENGINE
// =================================================================================================

async function startBackgroundGeneration() {
    if (SYSTEM_STATE.isGenerating) return;
    if (!SYSTEM_STATE.mongoConnected) {
        logSystem('ERR', 'Generator Aborted', 'MongoDB not connected.');
        return;
    }

    SYSTEM_STATE.isGenerating = true;
    logSystem('GEN', '🚀 ENGINE STARTUP', 'V11.8 (Filesystem Safe)...');

    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);

    const getModelConfig = (diff) => {
        let temp = 0.4;
        if (diff === "Medium") temp = 0.7;
        if (diff === "Hard") temp = 0.9; 
        if (diff === "Very Hard") temp = 1.0; 
        
        return genAI.getGenerativeModel({ 
            model: CONFIG.AI_MODEL,
            generationConfig: {
                temperature: temp,
                maxOutputTokens: 1000
            }
        });
    };

    // OUTER LOOPS
    for (const topicObj of CONFIG.TOPICS) {
        for (const [diffLevel, targetCount] of Object.entries(CONFIG.TARGETS)) {
            
            if (!SYSTEM_STATE.isGenerating) {
                logSystem('GEN', 'Engine Stopped Manually');
                return;
            }

            try {
                // Check count
                const currentCount = await MathCache.countDocuments({ topic: topicObj.key, difficulty: diffLevel });
                if (currentCount >= targetCount) continue; // Skip if full

                const needed = targetCount - currentCount;
                SYSTEM_STATE.currentGenTask = `${topicObj.label} (${diffLevel}): ${currentCount}/${targetCount}`;
                logSystem('GEN', `Analyzing Task`, `${topicObj.key} [${diffLevel}] - Need: ${needed}`);

                const model = getModelConfig(diffLevel);

                // INNER LOOP
                for (let i = 0; i < needed; i++) {
                    if (!SYSTEM_STATE.isGenerating) break;

                    const forms = ALL_FORMS[topicObj.key] || ["Math Problem"];
                    const randomForm = forms[Math.floor(Math.random() * forms.length)];
                    
                    const prompt = `
                    ACT AS: IMO Head Mathematician.
                    TASK: Create 1 multiple-choice math problem.
                    TOPIC: "${topicObj.prompt}"
                    SUB-CATEGORY: "${randomForm}"
                    DIFFICULTY: "${diffLevel}"
                    
                    RULES:
                    ${DIFFICULTY_INSTRUCTIONS[diffLevel]}

                    CRITICAL JSON RULES:
                    - You MUST output raw JSON.
                    - For LaTeX, use DOUBLE BACKSLASHES: "\\\\frac{1}{2}" (Not "\\frac").
                    - This is vital for parsing.
                    
                    OUTPUT FORMAT:
                    {
                        "question": "Khmer text with LaTeX...",
                        "options": ["A", "B", "C", "D"],
                        "answer": "Exact Match",
                        "explanation": "Khmer solution..."
                    }
                    `;

                    try {
                        const result = await model.generateContent(prompt);
                        const response = await result.response;
                        let text = response.text();
                        
                        // CLEANER + AUTO REPAIR
                        try {
                            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
                            const first = text.indexOf('{');
                            const last = text.lastIndexOf('}');
                            if (first === -1) throw new Error("No JSON found");
                            text = text.substring(first, last + 1);

                            // AUTO-REPAIR LATEX
                            text = text.replace(/\\/g, '\\\\'); 

                        } catch (e) { throw new Error("Pre-process failed"); }

                        let parsedData;
                        try {
                            parsedData = JSON.parse(text);
                        } catch (parseErr) {
                            try {
                                const fixedText = text.replace(/\\\\\\\\/g, '\\\\');
                                parsedData = JSON.parse(fixedText);
                            } catch (e2) {
                                throw new Error("JSON Parse Failed");
                            }
                        }

                        // Validate Data
                        parsedData.options = parsedData.options.map(o => String(o).trim());
                        parsedData.answer = String(parsedData.answer).trim();

                        if (!parsedData.options || parsedData.options.length !== 4) throw new Error("Options count != 4");

                        // Fuzzy Match Answer
                        if (!parsedData.options.includes(parsedData.answer)) {
                            const match = parsedData.options.find(o => o.includes(parsedData.answer) || parsedData.answer.includes(o));
                            if (match) parsedData.answer = match;
                            else throw new Error("Answer mismatch");
                        }

                        // Check Duplicates
                        const snippet = parsedData.question.substring(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const duplicate = await MathCache.findOne({ 
                            topic: topicObj.key, difficulty: diffLevel, raw_text: { $regex: snippet }
                        });

                        if (duplicate) {
                            logSystem('GEN', '⚠️ Duplicate Skipped');
                            i--; // RETRY SAME SLOT
                            continue;
                        }

                        // SAVE
                        await MathCache.create({
                            topic: topicObj.key,
                            difficulty: diffLevel,
                            raw_text: JSON.stringify(parsedData), // Save consistent data
                            source_ip: 'TITAN-V11.8'
                        });

                        logSystem('GEN', `✅ Created`, `[${diffLevel}] ${topicObj.key}`);
                        await new Promise(r => setTimeout(r, 2000));

                    } catch (err) {
                        logSystem('ERR', 'Validation Failed', 'Retrying...');
                        i--; 
                        await new Promise(r => setTimeout(r, 2000));
                    }
                }

            } catch (err) {
                logSystem('ERR', 'Logic Error', err.message);
            }
        }
    }

    SYSTEM_STATE.isGenerating = false;
    SYSTEM_STATE.currentGenTask = "All Targets Met";
    logSystem('GEN', '🏁 SEQUENCE COMPLETED');
}

// =================================================================================================
// SECTION 7: MIDDLEWARE & SECURITY
// =================================================================================================

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// 🔥 FILESYSTEM FIX (V11.8)
// Ensure 'public' folder exists to prevent crashes on fresh deploy
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    try {
        fs.mkdirSync(publicDir, { recursive: true });
        logSystem('OK', 'Created Missing Public Folder');
    } catch (e) {
        logSystem('ERR', 'Failed to create public folder', e.message);
    }
}
app.use(express.static(publicDir));

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
// SECTION 8: PRIMARY API ENDPOINTS
// =================================================================================================

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

const standardizeDifficulty = (input) => {
    if (!input) return "Medium";
    const s = String(input).toLowerCase().trim();
    if (s === 'easy' || s === 'ez') return "Easy";
    if (s.includes('very') || s.includes('hard')) return s.includes('very') ? "Very Hard" : "Hard";
    return "Medium";
};

// 🤖 GENERATE PROBLEM API - STRICT CACHE MODE
app.post('/api/generate-problem', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Expires', '0');

    const { topic, difficulty } = req.body;

    const finalTopic = mapTopicToKey(topic); 
    const finalDifficulty = standardizeDifficulty(difficulty);
    SYSTEM_STATE.totalGamesGenerated++;

    if (SYSTEM_STATE.mongoConnected) {
        let attempts = 0;
        const MAX_ATTEMPTS = 5; 

        while (attempts < MAX_ATTEMPTS) {
            try {
                // 2s Timeout
                const cached = await MathCache.aggregate([
                    { $match: { topic: finalTopic, difficulty: finalDifficulty } }, 
                    { $sample: { size: 1 } }
                ]).maxTimeMS(2000); 
                
                if (!cached || cached.length === 0) break; 

                // VALIDATE
                const record = cached[0];
                try {
                    const parsed = JSON.parse(record.raw_text);
                    if (!parsed.question || !parsed.options || parsed.options.length !== 4) {
                        throw new Error("Missing Fields");
                    }

                    // SUCCESS
                    SYSTEM_STATE.cacheHits++;
                    logSystem('DB', 'Cache Hit', `${finalTopic} (${finalDifficulty})`);
                    
                    return res.json({ 
                        text: record.raw_text, 
                        source: "cache",
                        metadata: { topic: finalTopic, difficulty: finalDifficulty }
                    });

                } catch (jsonErr) {
                    // AUTO-FLUSH CORRUPT
                    logSystem('WARN', '🗑️ Auto-Clean Corrupt Data', `ID: ${record._id}`);
                    await MathCache.deleteOne({ _id: record._id });
                    attempts++;
                }

            } catch (dbErr) {
                break; 
            }
        }
    }

    // STRICT NO-AI FALLBACK
    logSystem('WARN', 'Cache Miss (Strict Mode)', `${finalTopic} [${finalDifficulty}]`);
    return res.status(503).json({ 
        error: "System busy generating content.",
        message: "កំពុងផលិតលំហាត់... សូមព្យាយាមម្តងទៀតក្នុងពេលបន្តិចទៀត (សូមចុច Start Engine នៅ Admin Panel)។" 
    });
});

// 🏆 LEADERBOARD API
app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;
    const finalDiff = standardizeDifficulty(difficulty);
    try {
        const client = await pgPool.connect();
        const maxAllowed = CONFIG.ALLOWED_SCORES[finalDiff] || 50;
        if (score > maxAllowed) {
            client.release();
            logSystem('SEC', 'Score Rejected', `${username}: ${score}`);
            return res.status(403).json({ message: "Score rejected" });
        }

        // SMART MERGE
        const check = await client.query('SELECT id, score FROM leaderboard WHERE username = $1 AND difficulty = $2 ORDER BY id ASC', [username, finalDiff]);
        
        if (check.rows.length > 0) {
            const finalScore = check.rows.reduce((acc, row) => acc + row.score, 0) + score;
            await client.query('UPDATE leaderboard SET score = $1, updated_at = NOW() WHERE id = $2', [finalScore, check.rows[0].id]);
            if (check.rows.length > 1) {
                await client.query('DELETE FROM leaderboard WHERE id = ANY($1::int[])', [check.rows.slice(1).map(r => r.id)]);
            }
        } else {
            await client.query('INSERT INTO leaderboard(username, score, difficulty, ip_address) VALUES($1, $2, $3, $4)', [username, score, finalDiff, req.ip]);
        }
        client.release();
        res.status(201).json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/leaderboard/top', async (req, res) => {
    try {
        const client = await pgPool.connect();
        const result = await client.query('SELECT username, SUM(score) as score, COUNT(difficulty) as games_played FROM leaderboard GROUP BY username ORDER BY score DESC LIMIT 100');
        client.release();
        res.json(result.rows);
    } catch (err) { res.status(500).json([]); }
});

// =================================================================================================
// SECTION 9: ADMINISTRATIVE API
// =================================================================================================

app.post('/api/submit-request', async (req, res) => {
    try {
        const client = await pgPool.connect();
        await client.query('INSERT INTO certificate_requests (username, score) VALUES ($1, $2)', [req.body.username, req.body.score]);
        client.release();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const client = await pgPool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [req.params.id]);
        client.release();
        if(result.rows.length === 0) return res.send("Not Found");
        const { username, score } = result.rows[0];
        const finalUrl = `https://api.canvas.kro.kr/v1/image/certificate?name=${encodeURIComponent(username)}&mark-txt=Score:${score}`;
        res.redirect(finalUrl);
    } catch (e) { res.status(500).send("Error"); }
});

app.delete('/admin/delete-request/:id', async (req, res) => {
    try {
        const client = await pgPool.connect();
        await client.query('DELETE FROM certificate_requests WHERE id = $1', [req.params.id]);
        client.release();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.delete('/admin/api/flush/:topic/:diff', async (req, res) => {
    const { topic, diff } = req.params;
    try {
        if (!SYSTEM_STATE.mongoConnected) return res.status(500).json({ error: "No Mongo" });

        const mappedTopic = mapTopicToKey(topic);
        const result = await MathCache.deleteMany({ 
            topic: mappedTopic, 
            difficulty: diff 
        });

        logSystem('DB', 'FLUSH EXECUTED', `Deleted ${result.deletedCount} items from ${mappedTopic} [${diff}]`);
        res.json({ success: true, deleted: result.deletedCount });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/admin/api/stats', async (req, res) => {
    if (!SYSTEM_STATE.mongoConnected) return res.json({ stats: [] });
    const stats = await MathCache.aggregate([{ 
        $group: { _id: { topic: "$topic", difficulty: "$difficulty" }, count: { $sum: 1 } } 
    }]);
    const client = await pgPool.connect();
    const certs = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
    client.release();
    res.json({
        stats, certRequests: certs.rows, isGenerating: SYSTEM_STATE.isGenerating,
        currentTask: SYSTEM_STATE.currentGenTask, targets: CONFIG.TARGETS, topics: CONFIG.TOPICS
    });
});

app.post('/admin/api/toggle-gen', (req, res) => {
    if (req.body.action === 'start') startBackgroundGeneration();
    else SYSTEM_STATE.isGenerating = false;
    res.json({ status: SYSTEM_STATE.isGenerating });
});

// =================================================================================================
// SECTION 10: PREMIUM ADMINISTRATIVE DASHBOARD
// =================================================================================================

app.get('/admin', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="km">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BRAINTEST TITAN V11.8</title>
    <link href="https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@300;400;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
    <style>
        :root { --bg-dark: #050b14; --glass-bg: rgba(30, 41, 59, 0.6); --glass-border: rgba(255, 255, 255, 0.1); --primary: #3b82f6; --success: #10b981; --danger: #ef4444; --text-main: #f8fafc; --text-mute: #94a3b8; }
        * { box-sizing: border-box; }
        body { margin: 0; background-color: var(--bg-dark); color: var(--text-main); font-family: 'Kantumruy Pro', sans-serif; min-height: 100vh; }
        .layout { max-width: 1400px; margin: 0 auto; padding: 30px; display: grid; grid-template-columns: 280px 1fr; gap: 30px; }
        .sidebar { position: sticky; top: 30px; height: calc(100vh - 60px); background: var(--glass-bg); backdrop-filter: blur(12px); border: 1px solid var(--glass-border); border-radius: 20px; padding: 30px; display: flex; flex-direction: column; }
        .brand h1 { margin: 0; font-size: 1.4rem; color: var(--primary); }
        .nav-btn { background: transparent; border: none; color: var(--text-mute); padding: 15px; text-align: left; font-family: 'Kantumruy Pro'; font-size: 1rem; cursor: pointer; border-radius: 12px; margin-bottom: 10px; display: flex; align-items: center; gap: 12px; width: 100%; }
        .nav-btn.active { background: rgba(59, 130, 246, 0.15); color: var(--primary); border: 1px solid rgba(59, 130, 246, 0.3); }
        .glass-card { background: var(--glass-bg); backdrop-filter: blur(12px); border: 1px solid var(--glass-border); border-radius: 20px; padding: 25px; margin-bottom: 20px; }
        .ctrl-btn { width: 100%; padding: 20px; border: none; border-radius: 16px; font-family: 'Kantumruy Pro'; font-size: 1.2rem; font-weight: 700; cursor: pointer; color: white; }
        .btn-start { background: linear-gradient(135deg, #059669, #10b981); }
        .btn-stop { background: linear-gradient(135deg, #991b1b, #ef4444); }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .prog-container { width: 100%; background: rgba(0,0,0,0.3); height: 8px; border-radius: 4px; overflow: hidden; margin-top: 5px; }
        .prog-bar { height: 100%; background: var(--primary); transition: width 0.6s; }
        .trash-btn { cursor: pointer; color: var(--danger); margin-left: 10px; }
        table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        td { padding: 12px 5px; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .terminal { background: #09090b; border: 1px solid #27272a; border-radius: 12px; height: 400px; overflow-y: auto; padding: 15px; font-family: 'JetBrains Mono'; font-size: 0.8rem; }
        .section { display: none; } .section.active { display: block; }
    </style>
</head>
<body>
    <div class="layout">
        <div class="sidebar">
            <div class="brand"><h1>TITAN ENGINE</h1><span>v11.8</span></div>
            <br>
            <button class="nav-btn active" onclick="switchTab('gen', this)">⚙️ Generator</button>
            <button class="nav-btn" onclick="switchTab('cert', this)">🎓 Certificates</button>
            <button class="nav-btn" onclick="switchTab('logs', this)">📡 Logs</button>
        </div>
        <div class="main-content">
            <div id="gen" class="section active">
                <div class="glass-card">
                    <h2 style="margin:0">Control Center</h2>
                    <small style="color:var(--text-mute)" id="taskDisplay">Idle</small>
                    <br><br>
                    <button id="mainBtn" class="ctrl-btn btn-start" onclick="toggleGen()">⚡ START ENGINE</button>
                </div>
                <div class="stats-grid" id="statsGrid">Loading...</div>
            </div>
            <div id="cert" class="section">
                <div class="glass-card"><h3>Certificate Requests</h3><table><tbody id="certBody"></tbody></table></div>
            </div>
            <div id="logs" class="section">
                <div class="glass-card"><h3>Live Terminal</h3><div class="terminal" id="logTerm"></div></div>
            </div>
        </div>
    </div>
    <script>
        function switchTab(id, btn) {
            document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
            document.getElementById(id).classList.add('active');
            btn.classList.add('active');
        }
        let isRunning = false;
        async function refreshData() {
            try {
                const res = await fetch('/admin/api/stats');
                const data = await res.json();
                isRunning = data.isGenerating;
                const btn = document.getElementById('mainBtn');
                if (isRunning) { btn.innerHTML = "🛑 STOP ENGINE"; btn.className = "ctrl-btn btn-stop"; }
                else { btn.innerHTML = "⚡ START ENGINE"; btn.className = "ctrl-btn btn-start"; }
                document.getElementById('taskDisplay').innerText = isRunning ? "Running: " + data.currentTask : "Standby";

                const grid = document.getElementById('statsGrid');
                grid.innerHTML = data.topics.map(topic => {
                    let rows = ['Easy', 'Medium', 'Hard', 'Very Hard'].map(diff => {
                        const found = data.stats.find(s => s._id.topic === topic.key && s._id.difficulty === diff);
                        const count = found ? found.count : 0;
                        const pct = Math.min((count/data.targets[diff])*100, 100);
                        return \`<tr><td>\${diff}</td><td>\${count}<span class="trash-btn" onclick="flushCache('\${topic.key}','\${diff}')">🗑️</span></td><td><div class="prog-container"><div class="prog-bar" style="width:\${pct}%"></div></div></td></tr>\`;
                    }).join('');
                    return \`<div class="glass-card"><h3 style="margin:0">\${topic.label}</h3><table>\${rows}</table></div>\`;
                }).join('');

                const logs = ${JSON.stringify(SYSTEM_STATE.logs)}; // Initial load only
                // Real implementation would poll logs separately or use sockets
            } catch (e) {}
        }
        async function toggleGen() {
            await fetch('/admin/api/toggle-gen', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action: isRunning?'stop':'start'}) });
            refreshData();
        }
        async function flushCache(t, d) { if(confirm('Delete all?')) await fetch('/admin/api/flush/'+t+'/'+d, {method:'DELETE'}); refreshData(); }
        setInterval(refreshData, 2000); refreshData();
    </script>
</body>
</html>
    `);
});

// =================================================================================================
// SECTION 11: PUBLIC DASHBOARD (ROOT ROUTE - FILESYSTEM SAFE)
// =================================================================================================

app.get('/', (req, res) => {
    // If we reach here, it means 'index.html' wasn't found in public folder
    const uptime = process.uptime();
    const d = Math.floor(uptime / 86400);
    const h = Math.floor((uptime % 86400) / 3600);
    const pg = SYSTEM_STATE.postgresConnected ? '<span style="color:#10b981">● ONLINE</span>' : '<span style="color:#ef4444">● OFFLINE</span>';
    const mg = SYSTEM_STATE.mongoConnected ? '<span style="color:#10b981">● ONLINE</span>' : '<span style="color:#ef4444">● OFFLINE</span>';

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
            <h1>🚀 TITAN ENGINE V11.8</h1>
            <p>UPTIME: ${d}d ${h}h</p>
            <div class="metric">PG: ${pg} | MONGO: ${mg}</div>
            <div class="metric">
                REQ: ${SYSTEM_STATE.totalRequests} | 
                HITS: ${SYSTEM_STATE.cacheHits} | 
                AI: ${SYSTEM_STATE.aiCalls}
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
    logSystem('OK', 'Booting BrainTest Titan V11.8 (Filesystem Safe)...');

    // Initialize DBs (Non-blocking)
    initPostgres(); 
    initMongo();    

    // Start Listening
    const server = app.listen(CONFIG.PORT, () => {
        logSystem('NET', `Server Active`, `Port ${CONFIG.PORT}`);
        logSystem('INFO', `Public URL: http://localhost:${CONFIG.PORT}`);
        logSystem('INFO', `Admin  URL: http://localhost:${CONFIG.PORT}/admin`);
    });

    // Graceful Shutdown
    process.on('SIGTERM', () => {
        logSystem('WARN', 'SIGTERM Received', 'Shutting down...');
        server.close(() => process.exit(0));
    });
}

// Execute
startSystem();
