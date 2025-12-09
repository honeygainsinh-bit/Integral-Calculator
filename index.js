/**
 * =================================================================================================
 *  ____  ____      _    ___ _   _ _____ _____ ____ _____ 
 * | __ )|  _ \    / \  |_ _| \ | |_   _| ____/ ___|_   _|
 * |  _ \| |_) |  / _ \  | ||  \| | | | |  _| \___ \ | |  
 * | |_) |  _ <  / ___ \ | || |\  | | | | |___ ___) || |  
 * |____/|_| \_\/_/   \_\___|_| \_| |_| |_____|____/ |_|  
 * 
 * =================================================================================================
 * PROJECT:           BRAINTEST - TITAN ENTERPRISE BACKEND
 * EDITION:           V11.4 ULTIMATE (STABILITY & IMO PATCH)
 * ARCHITECTURE:      MONOLITHIC NODE.JS WITH HYBRID DATABASE (PG + MONGO)
 * AUTHOR:            BRAINTEST ENGINEERING TEAM
 * DATE:              DECEMBER 2025
 * ENGINE:            GEMINI 2.5 FLASH INTEGRATION
 * STATUS:            PRODUCTION READY
 * =================================================================================================
 * 
 * █ CRITICAL FIX LOG (V11.4):
 *    1. [FIXED] VALIDATION GEN FAILED LOOP:
 *       - Added `Smart JSON Cleaner`: Extracts only `{...}` ignoring AI chatter.
 *       - Added `Fuzzy Answer Matching`: Auto-corrects answer if it slightly differs from options (e.g., spaces).
 * 
 *    2. [UPGRADE] DIFFICULTY MATRIX RE-CALIBRATED:
 *       - Easy: BacII Standard (Strict).
 *       - Medium: Scholarship Exam (Harder).
 *       - Hard: National Outstanding Student (Complex).
 *       - Very Hard: IMO / Putnam (Proof-based MCQs).
 * 
 *    3. [FIXED] LANGUAGE & LOGIC SEPARATION:
 *       - "Think in English, Speak in Khmer" protocol active.
 * 
 *    4. [FIXED] LEADERBOARD MERGE:
 *       - Auto-merges scores and deletes duplicate user IDs.
 * 
 * =================================================================================================
 */

// =================================================================================================
// SECTION 1: LIBRARY IMPORTS & ENVIRONMENT SETUP
// =================================================================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');

// =================================================================================================
// SECTION 2: MASTER CONFIGURATION & MATRIX DEFINITIONS
// =================================================================================================

// -------------------------------------------------------------------------
// 🧬 THE GRANULAR MATRIX: DETAILED FORMS FOR EVERY TOPIC (10 TOPICS)
// This list ensures high variety and coverage of all math sub-disciplines.
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

// -------------------------------------------------------------------------
// 📏 REVISED DIFFICULTY STANDARDS (V11.3 - AGGRESSIVE MODE)
// -------------------------------------------------------------------------
const DIFFICULTY_INSTRUCTIONS = {
    "Easy": `
        - CONTEXT: CAMBODIAN NATIONAL EXAM (BACII - Grade 12).
        - LEVEL: High School Final Exam. NOT Simple.
        - REQUIREMENT: Must involve at least 2 steps (e.g., Chain Rule + Trig, or Limit with Indeterminate Form).
        - BAN: Do not ask basic arithmetic (e.g., 2+2). Do not ask simple definitions.
        - EXAMPLE: "Find the limit of (sqrt(x+3)-2)/(x-1) as x->1".
    `,
    "Medium": `
        - CONTEXT: UNIVERSITY ENTRANCE EXAM / SCHOLARSHIP EXAM.
        - LEVEL: Above Grade 12. Requires deep understanding of formulas.
        - COMPLEXITY: Combine 2-3 mathematical concepts (e.g., Logarithms inside Integrals, Complex Numbers with Geometry).
        - TRAP: Options must be very close to each other.
        - EXAMPLE: "Calculate the integral of ln(x)/(1+x^2) from 0 to 1".
    `,
    "Hard": `
        - CONTEXT: CAMBODIAN NATIONAL OUTSTANDING STUDENT (Sishya Puke).
        - LEVEL: Elite Student. Pure theoretical or heavy calculation.
        - REQUIREMENT: Requires auxiliary variables, substitutions, or clever manipulation.
        - FORM: Non-standard functions. Use constants like pi, e, or parameters (a, b).
        - BAN: Standard textbook problems.
        - VIBE: "This looks impossible at first glance".
    `,
    "Very Hard": `
        - CONTEXT: IMO (INTERNATIONAL MATH OLYMPIAD) / PUTNAM.
        - LEVEL: World Class.
        - STYLE: Proof-based logic converted to Multiple Choice.
        - COMPLEXITY: Abstract Algebra, Number Theory tricks, or Functional Equations.
        - REQUIREMENT: The solution must require a specific "AHA!" moment or a theorem (e.g., Cauchy-Schwarz, Mean Value Theorem for Integrals).
        - OPTIONS: Abstract answers (e.g., "e^pi", "1/2", "0", "Does not exist").
    `
};

const CONFIG = {
    PORT: process.env.PORT || 3000,
    POSTGRES_URL: process.env.DATABASE_URL,
    MONGO_URI: process.env.MONGODB_URI,
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    AI_MODEL: "gemini-2.5-flash", 
    IMG_API: process.env.EXTERNAL_IMAGE_API || "https://fakeimg.pl/800x600/?text=", 
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
        
        // Create Leaderboard Table
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
        
        // Create Certificate Requests Table
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
// SECTION 6: GENERATOR ENGINE (TITAN V11.4 - VALIDATION FIX)
// =================================================================================================

async function startBackgroundGeneration() {
    if (SYSTEM_STATE.isGenerating) return;
    if (!SYSTEM_STATE.mongoConnected) {
        logSystem('ERR', 'Generator Aborted', 'MongoDB not connected.');
        return;
    }

    SYSTEM_STATE.isGenerating = true;
    logSystem('GEN', '🚀 ENGINE STARTUP', 'Initializing Matrix V11.4 (IMO + Stability)...');

    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);

    // ⚡ KEY UPDATE: Use High Temperature for Hard/Very Hard to prevent duplicates
    const getModelConfig = (diff) => {
        let temp = 0.4; // Default safe
        if (diff === "Medium") temp = 0.7;
        if (diff === "Hard") temp = 0.9; 
        if (diff === "Very Hard") temp = 1.0; // Maximum Creativity (Chaos Mode)
        
        return genAI.getGenerativeModel({ 
            model: CONFIG.AI_MODEL,
            generationConfig: {
                temperature: temp,
                maxOutputTokens: 1000,
            }
        });
    };

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
                logSystem('GEN', `Analyzing Task`, `${topicObj.key} [${diffLevel}] - Need: ${needed}`);

                // Select Model Config based on Difficulty
                const model = getModelConfig(diffLevel);

                for (let i = 0; i < needed; i++) {
                    if (!SYSTEM_STATE.isGenerating) break;

                    const forms = ALL_FORMS[topicObj.key] || ["General Math Problem"];
                    const randomForm = forms[Math.floor(Math.random() * forms.length)];
                    
                    const variables = ["x", "t", "theta", "alpha", "u"];
                    const chosenVar = variables[Math.floor(Math.random() * variables.length)];
                    
                    const prompt = `
                    ACT AS: The Head Mathematician for the International Math Olympiad (IMO).
                    TASK: Create 1 EXTREMELY HIGH QUALITY multiple-choice math problem.
                    
                    TOPIC: "${topicObj.prompt}"
                    SUB-CATEGORY: "${randomForm}"
                    DIFFICULTY RATING: "${diffLevel}"
                    VARIABLE TO USE: "${chosenVar}"

                    🔴 STRICT DIFFICULTY GUIDELINES:
                    ${DIFFICULTY_INSTRUCTIONS[diffLevel]}

                    🔴 LANGUAGE OUTPUT RULES (CRITICAL):
                    1. The Logic/Math must be processed in English for maximum accuracy.
                    2. BUT the final JSON output MUST be in KHMER LANGUAGE (Cambodian).
                    3. "question": Must be in Khmer (e.g., "គណនាលីមីតនៃ...", "រកតម្លៃនៃ...").
                    4. "explanation": Must be in Khmer.
                    5. "options": Keep as Math/LaTeX (Universal).

                    🔴 ANTI-DUPLICATE INSTRUCTIONS:
                    - Do NOT use standard coefficients (2, 3, 4). Use weird numbers (e.g., 2024, 2025, 101) or constants (pi, e).
                    - For 'Hard'/'Very Hard', the answer MUST NOT be obvious.
                    - Make sure the distractor options (wrong answers) are common student mistakes.

                    🔴 JSON FORMAT ONLY:
                    {
                        "question": "Khmer text with LaTeX math inside",
                        "options": ["Option A", "Option B", "Option C", "Option D"],
                        "answer": "Exact String Match of Correct Option",
                        "explanation": "Detailed step-by-step solution in KHMER"
                    }
                    `;

                    try {
                        const result = await model.generateContent(prompt);
                        const response = await result.response;
                        let text = response.text();
                        
                        // 🛠️ FIX V11.4: SMART JSON CLEANER & PARSER
                        const firstBrace = text.indexOf('{');
                        const lastBrace = text.lastIndexOf('}');
                        
                        if (firstBrace === -1 || lastBrace === -1) {
                            throw new Error("AI did not return valid JSON structure");
                        }

                        // Extract only the JSON part
                        text = text.substring(firstBrace, lastBrace + 1);
                        
                        // Parse
                        let parsedData;
                        try {
                            parsedData = JSON.parse(text);
                        } catch (e) {
                            throw new Error("JSON Parse Failed - invalid syntax");
                        }

                        // 🛠️ FIX V11.4: DATA NORMALIZATION
                        // Trim spaces to ensure matching works
                        parsedData.options = parsedData.options.map(o => String(o).trim());
                        parsedData.answer = String(parsedData.answer).trim();

                        // Basic Validation
                        if (!parsedData.options || parsedData.options.length !== 4) throw new Error("Options count != 4");

                        // 🛠️ FIX V11.4: FUZZY ANSWER CHECK
                        // If exact match fails, check if the answer is contained within an option
                        if (!parsedData.options.includes(parsedData.answer)) {
                            const matchIndex = parsedData.options.findIndex(opt => opt === parsedData.answer || opt.includes(parsedData.answer) || parsedData.answer.includes(opt));
                            
                            if (matchIndex !== -1) {
                                parsedData.answer = parsedData.options[matchIndex]; // Auto-correct
                            } else {
                                throw new Error("Answer mismatch in options");
                            }
                        }

                        // 🛑 DUPLICATE CHECK
                        const snippet = parsedData.question.substring(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const duplicateExists = await MathCache.findOne({ 
                            topic: topicObj.key,
                            difficulty: diffLevel,
                            raw_text: { $regex: snippet }
                        });

                        if (duplicateExists) {
                            logSystem('GEN', '⚠️ Duplicate Skipped', 'Content too similar to DB');
                            i--; 
                            continue;
                        }

                        // ✅ SAVE VALID PROBLEM
                        await MathCache.create({
                            topic: topicObj.key,
                            difficulty: diffLevel,
                            raw_text: JSON.stringify(parsedData), // Store consistent JSON
                            source_ip: 'TITAN-MATRIX-V11.4'
                        });

                        logSystem('GEN', `✅ Created`, `[${diffLevel}] ${topicObj.key} (${randomForm.substring(0,10)}...)`);
                        
                        // Adaptive Delay
                        const delayTime = diffLevel === "Very Hard" ? 4000 : 2500;
                        await new Promise(r => setTimeout(r, delayTime));

                    } catch (err) {
                        logSystem('ERR', 'Validation Failed', err.message);
                        await new Promise(r => setTimeout(r, 2000));
                    }
                }

            } catch (err) {
                logSystem('ERR', 'Generator Logic Error', err.message);
            }
        }
    }

    SYSTEM_STATE.isGenerating = false;
    SYSTEM_STATE.currentGenTask = "All Targets Met";
    logSystem('GEN', '🏁 MATRIX SEQUENCE COMPLETED', 'Database populated with high-quality content.');
}

// =================================================================================================
// SECTION 7: MIDDLEWARE & SECURITY (FIXED)
// =================================================================================================

const app = express();
app.set('trust proxy', 1);
app.use(cors()); 
app.use(express.json({ limit: '2mb' })); 
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); 

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
// SECTION 8: PRIMARY API ENDPOINTS (FIXED LOGIC)
// =================================================================================================

const mapTopicToKey = (frontendName) => {
    if (!frontendName) return "Limits";
    const name = String(frontendName).trim().toLowerCase();
    
    // Exact & Partial Match Logic
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

// 🤖 GENERATE PROBLEM API
app.post('/api/generate-problem', async (req, res) => {
    // 🛑 CRITICAL FIX: PREVENT BROWSER CACHING
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Expires', '0');
    
    const { prompt, topic, difficulty } = req.body;
    
    // 1. Sanitize & Map Inputs
    const finalTopic = mapTopicToKey(topic); 
    const finalDifficulty = standardizeDifficulty(difficulty);
    
    SYSTEM_STATE.totalGamesGenerated++;

    // 2. CHECK DB CACHE (UNLIMITED SPEED - NO RATE LIMIT)
    if (SYSTEM_STATE.mongoConnected) {
        try {
            // Using $sample for random selection from ALL valid problems
            const cached = await MathCache.aggregate([
                { $match: { topic: finalTopic, difficulty: finalDifficulty } }, 
                { $sample: { size: 1 } }
            ]);
            
            if (cached.length > 0) {
                SYSTEM_STATE.cacheHits++;
                logSystem('DB', 'Cache Hit', `${finalTopic} (${finalDifficulty})`);
                return res.json({ 
                    text: cached[0].raw_text, 
                    source: "cache",
                    metadata: { topic: finalTopic, difficulty: finalDifficulty }
                });
            }
        } catch (e) { logSystem('ERR', 'Cache Read Error', e.message); }
    }

    // 3. AI FALLBACK (REALTIME GENERATION)
    logSystem('AI', 'Direct AI Generation', `${finalTopic} [${finalDifficulty}]`);
    SYSTEM_STATE.aiCalls++;
    
    try {
        const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
        // Use consistent High-Temp model for consistency
        let temp = finalDifficulty === "Very Hard" ? 1.0 : 0.7;
        const model = genAI.getGenerativeModel({ 
            model: CONFIG.AI_MODEL,
            generationConfig: { temperature: temp }
        });
        
        const forms = ALL_FORMS[finalTopic] || ["General Math"];
        const randomForm = forms[Math.floor(Math.random() * forms.length)];

        // Use same High-Quality prompt logic for Direct API
        const aiPrompt = `
        ACT AS: IMO Head Mathematician.
        TOPIC: "${finalTopic}"
        FORM: "${randomForm}"
        LEVEL: "${finalDifficulty}"
        
        RULES: 
        ${DIFFICULTY_INSTRUCTIONS[finalDifficulty]}

        OUTPUT RULES:
        1. Process logic in English.
        2. Output "question" and "explanation" in KHMER LANGUAGE.
        3. "options" are Math/LaTeX.
        
        FORMAT: JSON Only. { "question": "Khmer...", "options": ["A","B","C","D"], "answer": "Exact Match", "explanation": "Khmer..." }
        `;
        
        const result = await model.generateContent(aiPrompt);
        const response = await result.response;
        const textRaw = response.text();

        // 🛠️ FIX V11.4: CLEANER FOR DIRECT API
        const first = textRaw.indexOf('{');
        const last = textRaw.lastIndexOf('}');
        if(first === -1) throw new Error("Invalid JSON");
        
        const text = textRaw.substring(first, last+1);
        const parsed = JSON.parse(text);

        if(!parsed.options || parsed.options.length !== 4) throw new Error("Invalid Format");

        if (SYSTEM_STATE.mongoConnected) {
            MathCache.create({
                topic: finalTopic,
                difficulty: finalDifficulty, 
                raw_text: text,
                source_ip: req.ip 
            }).catch(e => logSystem('WARN', 'Cache Write Failed', e.message));
        }

        res.json({ text: text, source: "ai", metadata: { topic: finalTopic, difficulty: finalDifficulty } });

    } catch (err) {
        logSystem('ERR', 'AI Service Error', err.message);
        res.status(500).json({ error: "AI Service Unavailable" });
    }
});

// 🏆 LEADERBOARD API (MERGE LOGIC)
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
        
        // 🛠️ SMART MERGE LOGIC
        const check = await client.query('SELECT id, score FROM leaderboard WHERE username = $1 AND difficulty = $2 ORDER BY id ASC', [username, finalDiff]);
        
        if (check.rows.length > 0) {
            // Accumulate score
            const finalScore = check.rows.reduce((acc, row) => acc + row.score, 0) + score;
            
            // Update FIRST record
            await client.query('UPDATE leaderboard SET score = $1, updated_at = NOW() WHERE id = $2', [finalScore, check.rows[0].id]);
            
            // Delete DUPLICATE records if any
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
        const result = await client.query(`SELECT username, SUM(score) as score, COUNT(difficulty) as games_played FROM leaderboard GROUP BY username ORDER BY score DESC LIMIT 100`);
        client.release();
        res.json(result.rows);
    } catch (err) { res.status(500).json([]); }
});

// =================================================================================================
// SECTION 9: ADMINISTRATIVE API (WITH FLUSH TOOL)
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
        if (result.rows.length === 0) return res.status(404).send("Not Found");
        const { username, score } = result.rows[0];
        const finalUrl = CONFIG.IMG_API + `&txt=${encodeURIComponent(username)}&mark-txt=Score:${score}`;
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

// 🗑️ NEW: FLUSH CACHE BY TOPIC & DIFFICULTY
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
    const stats = await MathCache.aggregate([{ $group: { _id: { topic: "$topic", difficulty: "$difficulty" }, count: { $sum: 1 } } }]);
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
// SECTION 10: PREMIUM ADMINISTRATIVE DASHBOARD (UNMINIFIED FULL VERSION)
// =================================================================================================

app.get('/admin', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="km">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BRAINTEST TITAN COMMAND CENTER</title>
        <!-- Import Fonts -->
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

            * {
                box-sizing: border-box;
            }

            body {
                margin: 0;
                padding: 0;
                background-color: var(--bg-dark);
                background-image: 
                    radial-gradient(at 0% 0%, rgba(56, 189, 248, 0.1) 0px, transparent 50%), 
                    radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.1) 0px, transparent 50%);
                color: var(--text-main);
                font-family: 'Kantumruy Pro', sans-serif;
                min-height: 100vh;
            }

            .layout {
                max-width: 1400px;
                margin: 0 auto;
                padding: 30px;
                display: grid;
                grid-template-columns: 280px 1fr;
                gap: 30px;
            }

            /* --- SIDEBAR NAVIGATION --- */
            .sidebar {
                position: sticky;
                top: 30px;
                height: calc(100vh - 60px);
                background: var(--glass-bg);
                backdrop-filter: blur(12px);
                border: 1px solid var(--glass-border);
                border-radius: 20px;
                padding: 30px;
                display: flex;
                flex-direction: column;
            }

            .brand {
                margin-bottom: 40px;
                padding-bottom: 20px;
                border-bottom: 1px solid var(--glass-border);
            }
            .brand h1 { 
                margin: 0; 
                font-size: 1.4rem; 
                letter-spacing: 1px; 
                color: var(--primary); 
                text-shadow: 0 0 10px var(--primary-glow); 
            }
            .brand span { 
                font-size: 0.75rem; 
                color: var(--text-mute); 
                font-family: 'JetBrains Mono'; 
            }

            .nav-btn {
                background: transparent;
                border: none;
                color: var(--text-mute);
                padding: 15px;
                text-align: left;
                font-family: 'Kantumruy Pro';
                font-size: 1rem;
                cursor: pointer;
                border-radius: 12px;
                transition: all 0.3s;
                margin-bottom: 10px;
                display: flex;
                align-items: center;
                gap: 12px;
            }
            .nav-btn:hover {
                background: rgba(255,255,255,0.05);
                color: white;
            }
            .nav-btn.active {
                background: rgba(59, 130, 246, 0.15);
                color: var(--primary);
                border: 1px solid rgba(59, 130, 246, 0.3);
                box-shadow: 0 0 15px rgba(59, 130, 246, 0.1);
            }

            /* --- MAIN CONTENT AREA --- */
            .main-content {
                display: flex;
                flex-direction: column;
                gap: 25px;
            }

            .glass-card {
                background: var(--glass-bg);
                backdrop-filter: blur(12px);
                border: 1px solid var(--glass-border);
                border-radius: 20px;
                padding: 25px;
                box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5);
            }

            /* --- HEADER & STATUS --- */
            .status-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .status-badge {
                padding: 8px 16px;
                border-radius: 50px;
                font-size: 0.85rem;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .status-badge.idle { 
                background: rgba(245, 158, 11, 0.15); 
                color: #fbbf24; 
                border: 1px solid rgba(245, 158, 11, 0.3); 
            }
            .status-badge.running { 
                background: rgba(16, 185, 129, 0.15); 
                color: #34d399; 
                border: 1px solid rgba(16, 185, 129, 0.3); 
            }
            
            .pulse-dot {
                width: 8px; height: 8px; border-radius: 50%;
                background: currentColor;
                animation: pulse 1.5s infinite;
            }
            @keyframes pulse { 
                0% { opacity: 1; box-shadow: 0 0 0 0px currentColor; } 
                100% { opacity: 0; box-shadow: 0 0 0 10px transparent; } 
            }

            /* --- CONTROL BUTTONS --- */
            .ctrl-btn {
                width: 100%;
                padding: 20px;
                border: none;
                border-radius: 16px;
                font-family: 'Kantumruy Pro';
                font-size: 1.2rem;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.3s;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .btn-start {
                background: linear-gradient(135deg, #059669, #10b981);
                color: white;
                box-shadow: 0 4px 20px var(--success-glow);
            }
            .btn-start:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 25px var(--success-glow);
            }
            
            .btn-stop {
                background: linear-gradient(135deg, #991b1b, #ef4444);
                color: white;
                box-shadow: 0 4px 20px rgba(239, 68, 68, 0.5);
            }

            /* --- STATISTICS GRID --- */
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 20px;
            }
            .topic-header {
                font-size: 1.1rem;
                color: var(--primary);
                border-bottom: 1px solid var(--glass-border);
                padding-bottom: 10px;
                margin-bottom: 15px;
                margin-top: 0;
            }

            /* --- PROGRESS BAR COMPONENT --- */
            .prog-container {
                width: 100%;
                background: rgba(0,0,0,0.3);
                height: 8px;
                border-radius: 4px;
                overflow: hidden;
                margin-top: 5px;
            }
            .prog-bar {
                height: 100%;
                background: var(--primary);
                border-radius: 4px;
                transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: 0 0 10px var(--primary-glow);
            }
            .prog-bar.full { 
                background: var(--success); 
                box-shadow: 0 0 10px var(--success-glow); 
            }

            .trash-btn {
                cursor: pointer;
                color: var(--danger);
                font-size: 1rem;
                margin-left: 10px;
                opacity: 0.7;
                transition: 0.2s;
            }
            .trash-btn:hover {
                opacity: 1;
                transform: scale(1.1);
            }

            /* --- TABLES --- */
            table {
                width: 100%;
                border-collapse: collapse;
                font-size: 0.9rem;
            }
            td {
                padding: 12px 5px;
                border-bottom: 1px solid rgba(255,255,255,0.05);
            }
            tr:last-child td {
                border-bottom: none;
            }
            .diff-badge {
                font-family: 'JetBrains Mono';
                font-size: 0.75rem;
                color: var(--text-mute);
            }

            /* --- TERMINAL / LOGS --- */
            .terminal {
                background: #09090b;
                border: 1px solid #27272a;
                border-radius: 12px;
                height: 400px;
                overflow-y: auto;
                padding: 15px;
                font-family: 'JetBrains Mono', monospace;
                font-size: 0.8rem;
                box-shadow: inset 0 0 20px rgba(0,0,0,0.5);
            }
            .log-row {
                margin-bottom: 5px;
                display: flex;
                gap: 10px;
            }
            .log-time { color: #52525b; }
            .log-type { font-weight: bold; }

            /* --- SCROLLBAR --- */
            ::-webkit-scrollbar { width: 8px; }
            ::-webkit-scrollbar-track { background: var(--bg-dark); }
            ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }

            /* --- TAB ANIMATIONS --- */
            .section { display: none; animation: slideUp 0.4s ease-out; }
            .section.active { display: block; }
            @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

        </style>
    </head>
    <body>
        <div class="layout">
            
            <!-- LEFT SIDEBAR -->
            <div class="sidebar">
                <div class="brand">
                    <h1>TITAN ENGINE</h1>
                    <span>v11.4 ULTIMATE</span>
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

                <div style="margin-top: auto; padding-top: 20px; border-top: 1px solid var(--glass-border);">
                    <div style="font-size: 0.8rem; color: #10b981;">
                        ✅ JSON Auto-Cleaner<br>
                        ✅ Fuzzy Answer Fix<br>
                        ✅ Anti-Duplicate V3
                    </div>
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
                        <!-- JS Injected Content -->
                        <div class="glass-card" style="text-align:center; color: var(--text-mute)">
                            Connecting to Core...
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
            // ==========================================
            // FRONTEND LOGIC (ADMIN PANEL)
            // ==========================================

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
                                    <td width="20%" style="font-weight:bold; color:white">
                                        \${count}
                                        <span class="trash-btn" onclick="flushCache('\${topic.key}', '\${diff}')" title="Delete ALL \${diff} problems">🗑️</span>
                                    </td>
                                    <td width="50%">
                                        <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:var(--text-mute); margin-bottom:2px;">
                                            <span>Target: \${target}</span>
                                            <span>\${Math.round(pct)}%</span>
                                        </div>
                                        <div class="prog-container">
                                            <div class="\${barClass}" style="width:\${pct}%"></div>
                                        </div>
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

            async function flushCache(topic, diff) {
                if(confirm('WARNING: Are you sure you want to delete ALL ' + topic + ' [' + diff + '] problems? This will force new unique generation.')) {
                    await fetch('/admin/api/flush/'+topic+'/'+diff, {method:'DELETE'});
                    alert('Cache Flushed. Click START ENGINE to regenerate unique content.');
                    refreshData();
                }
            }

            async function delCert(id) {
                if(confirm('Are you sure you want to delete this request?')) {
                    await fetch('/admin/delete-request/'+id, {method:'DELETE'});
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
            <h1>🚀 TITAN ENGINE V11.4</h1>
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
    logSystem('OK', 'Booting BrainTest Titan V11.4 (Final Fixes)...');
    
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
