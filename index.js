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
 * EDITION:           ULTIMATE PRO (V9.6 - FULL SOURCE + FIX)
 * ARCHITECTURE:      MONOLITHIC NODE.JS WITH HYBRID DATABASE
 * AUTHOR:            BRAINTEST ENGINEERING TEAM
 * DATE:              DECEMBER 2025
 * ENGINE:            GEMINI 2.5 FLASH INTEGRATION
 * =================================================================================================
 * 
 * █ UPDATE LOG (V9.6):
 *    1. FIXED: "Easy" input defaulting to "Medium" (Added standardizeDifficulty).
 *    2. FIXED: Case sensitivity issues (e.g., "very hard" vs "Very Hard").
 *    3. ADDED: Input logging to see exactly what the App sends.
 *    4. RESTORED: Full Admin Dashboard HTML/CSS (No minification).
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
// SECTION 2: MASTER CONFIGURATION & CONSTANTS
// =================================================================================================

const CONFIG = {
    // -------------------------------------------------------------------------
    // SERVER SETTINGS
    // -------------------------------------------------------------------------
    PORT: process.env.PORT || 3000,
    ENV: process.env.NODE_ENV || 'development',
    
    // -------------------------------------------------------------------------
    // DATABASE CONNECTIONS
    // -------------------------------------------------------------------------
    POSTGRES_URL: process.env.DATABASE_URL,
    MONGO_URI: process.env.MONGODB_URI,
    
    // -------------------------------------------------------------------------
    // AI ENGINE CREDENTIALS
    // -------------------------------------------------------------------------
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    AI_MODEL: "gemini-2.5-flash", 
    
    // -------------------------------------------------------------------------
    // EXTERNAL INTEGRATIONS
    // -------------------------------------------------------------------------
    IMG_API: process.env.EXTERNAL_IMAGE_API, 
    OWNER_IP: process.env.OWNER_IP, 
    
    // -------------------------------------------------------------------------
    // 🎲 CACHE PROBABILITY
    // -------------------------------------------------------------------------
    CACHE_RATE: 0.25, 
    
    // -------------------------------------------------------------------------
    // 🎯 GENERATOR TARGETS
    // -------------------------------------------------------------------------
    TARGETS: {
        "Easy": 100,      // Need 100 Easy problems
        "Medium": 30,     // Need 30 Medium problems
        "Hard": 30,       // Need 30 Hard problems
        "Very Hard": 30   // Need 30 Very Hard problems
    },

    // -------------------------------------------------------------------------
    // 📚 TOPIC DEFINITIONS
    // -------------------------------------------------------------------------
    TOPICS: [
        { 
            key: "Limits", 
            label: "លីមីត (Limits)", 
            prompt: "Calculus Limits problems involving infinity and zero" 
        },
        { 
            key: "Derivatives", 
            label: "ដេរីវេ (Derivatives)", 
            prompt: "Calculus Derivatives differentiation rules chain rule" 
        },
        { 
            key: "Integrals", 
            label: "អាំងតេក្រាល (Integrals)", 
            prompt: "Calculus Integrals definite and indefinite integration" 
        },
        { 
            key: "DiffEq", 
            label: "សមីការឌីផេរ៉ង់ស្យែល", 
            prompt: "First and second order Differential Equations" 
        },
        { 
            key: "Complex", 
            label: "ចំនួនកុំផ្លិច (Complex)", 
            prompt: "Complex Numbers arithmetic and polar form" 
        },
        { 
            key: "Vectors", 
            label: "វ៉ិចទ័រ (Vectors)", 
            prompt: "Vector Algebra dot product cross product" 
        },
        { 
            key: "FuncAnalysis", 
            label: "សិក្សាអនុគមន៍ (Func Analysis)", 
            prompt: "Calculus Function Analysis domain range asymptotes graphs variations" 
        },
        { 
            key: "Conics", 
            label: "កោនិក (Conics)", 
            prompt: "Conic Sections parabolas ellipses hyperbolas circles standard forms" 
        },
        { 
            key: "Probability", 
            label: "ប្រូបាប (Probability)", 
            prompt: "Probability theory permutations combinations conditional probability" 
        },
        { 
            key: "Continuity", 
            label: "ភាពជាប់ (Continuity)", 
            prompt: "Calculus Continuity limits at a point continuous functions intermediate value theorem" 
        }
    ],
    
    // -------------------------------------------------------------------------
    // 🛡️ ANTI-CHEAT RULES
    // -------------------------------------------------------------------------
    ALLOWED_SCORES: {
        "Easy": 5,
        "Medium": 10,
        "Hard": 15,
        "Very Hard": 20
    }
};

// =================================================================================================
// SECTION 3: SYSTEM STATE MANAGEMENT & LOGGING
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

    SYSTEM_STATE.logs.unshift({ 
        time: timeString, 
        type: type, 
        msg: message, 
        det: details 
    });
    
    if (SYSTEM_STATE.logs.length > 300) {
        SYSTEM_STATE.logs.pop();
    }
}

function cleanMongoURI(uri) {
    if (!uri) return null;
    let clean = uri.trim();
    if (!clean.startsWith('mongodb://') && !clean.startsWith('mongodb+srv://')) {
        return `mongodb+srv://${clean}`;
    }
    return clean;
}

// =================================================================================================
// SECTION 4: POSTGRESQL DATABASE LAYER
// =================================================================================================

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
        logSystem('DB', 'Initializing PostgreSQL connection...');
        const client = await pgPool.connect();
        SYSTEM_STATE.postgresConnected = true;
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS leaderboard (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                score INTEGER NOT NULL,
                difficulty VARCHAR(20) NOT NULL,
                ip_address VARCHAR(45),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
            
        await client.query(`
            CREATE TABLE IF NOT EXISTS certificate_requests (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) NOT NULL,
                score INTEGER NOT NULL,
                status VARCHAR(20) DEFAULT 'Pending',
                request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        logSystem('OK', 'PostgreSQL Ready', 'Tables verified successfully.');
        client.release();
    } catch (err) {
        logSystem('ERR', 'PostgreSQL Initialization Failed', err.message);
    }
}

// =================================================================================================
// SECTION 5: MONGODB DATABASE LAYER
// =================================================================================================

async function initMongo() {
    const uri = cleanMongoURI(CONFIG.MONGO_URI);
    
    if (!uri) {
        logSystem('WARN', 'MongoDB URI Missing', 'Caching features disabled.');
        return;
    }

    try {
        logSystem('DB', 'Initializing MongoDB connection...');
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            family: 4 
        });
        
        SYSTEM_STATE.mongoConnected = true;
        logSystem('OK', 'MongoDB Connected', 'Hybrid caching active.');
    } catch (err) {
        SYSTEM_STATE.mongoConnected = false;
        logSystem('ERR', 'MongoDB Connection Failed', err.message);
    }
}

mongoose.connection.on('connected', () => SYSTEM_STATE.mongoConnected = true);
mongoose.connection.on('disconnected', () => SYSTEM_STATE.mongoConnected = false);

const problemSchema = new mongoose.Schema({
    topic: { 
        type: String, 
        required: true, 
        index: true 
    },
    difficulty: { 
        type: String, 
        required: true, 
        index: true 
    },
    raw_text: { 
        type: String, 
        required: true 
    },
    source_ip: String,
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

problemSchema.index({ topic: 1, difficulty: 1 });
const MathCache = mongoose.model('MathProblemCache', problemSchema);

// =================================================================================================
// SECTION 6: BACKGROUND GENERATOR ENGINE
// =================================================================================================

async function startBackgroundGeneration() {
    if (SYSTEM_STATE.isGenerating) return;
    
    if (!SYSTEM_STATE.mongoConnected) {
        logSystem('ERR', 'Generator Aborted', 'MongoDB not connected.');
        return;
    }

    SYSTEM_STATE.isGenerating = true;
    logSystem('GEN', '🚀 ENGINE STARTUP', 'Initializing generation sequence...');

    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: CONFIG.AI_MODEL });

    for (const topicObj of CONFIG.TOPICS) {
        for (const [diffLevel, targetCount] of Object.entries(CONFIG.TARGETS)) {
            
            if (!SYSTEM_STATE.isGenerating) {
                logSystem('GEN', 'Engine Stopped Manually');
                return;
            }

            try {
                const currentCount = await MathCache.countDocuments({ 
                    topic: topicObj.key, 
                    difficulty: diffLevel 
                });

                if (currentCount >= targetCount) {
                    continue; 
                }

                const needed = targetCount - currentCount;
                
                SYSTEM_STATE.currentGenTask = `${topicObj.label} (${diffLevel}): ${currentCount}/${targetCount}`;
                logSystem('GEN', `Analyzing Task`, `${topicObj.key} [${diffLevel}] - Need: ${needed}`);

                for (let i = 0; i < needed; i++) {
                    if (!SYSTEM_STATE.isGenerating) break;

                    const prompt = `Create 1 unique multiple-choice math problem for topic "${topicObj.prompt}" with difficulty "${diffLevel}".
                    Return ONLY a JSON object. Format: { "question": "LaTeX supported string", "options": ["A", "B", "C", "D"], "answer": "Option Value", "explanation": "Brief explanation" }.
                    Make sure options are distinct. Do not include markdown code blocks.`;

                    try {
                        const result = await model.generateContent(prompt);
                        const response = await result.response;
                        let text = response.text();
                        
                        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
                        JSON.parse(text); 

                        await MathCache.create({
                            topic: topicObj.key,
                            difficulty: diffLevel,
                            raw_text: text,
                            source_ip: 'AUTO-GEN'
                        });

                        logSystem('GEN', `✅ Generated Item`, `${topicObj.key} (${i+1}/${needed})`);
                        await new Promise(r => setTimeout(r, 4000));

                    } catch (err) {
                        logSystem('ERR', 'Generation Failed', err.message);
                        logSystem('GEN', '⚠️ API Error Detected', 'Cooling Down for 60 Seconds...');
                        await new Promise(r => setTimeout(r, 60000));
                        logSystem('GEN', 'Resuming...', 'Retry Initiated');
                    }
                }

            } catch (err) {
                logSystem('ERR', 'Generator Logic Error', err.message);
            }
        }
    }

    SYSTEM_STATE.isGenerating = false;
    SYSTEM_STATE.currentGenTask = "All Targets Met";
    logSystem('GEN', '🏁 SEQUENCE COMPLETED', 'Database is fully populated.');
}

// =================================================================================================
// SECTION 7: SERVER MIDDLEWARE & SECURITY
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

const aiLimiterQuota = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, 
    max: 10, 
    delayAfter: 1, 
    delayMs: 60 * 1000, 
    message: { 
        error: "Quota Exceeded", 
        message: "⚠️ You have reached the limit (10/8hrs). Please wait." 
    },
    keyGenerator: (req) => req.headers['x-forwarded-for'] || req.ip,
    skip: (req) => CONFIG.OWNER_IP && req.ip.includes(CONFIG.OWNER_IP)
});

const aiSpeedLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, 
    max: 5, 
    message: { 
        error: "Speed Limit", 
        message: "⚠️ You are going too fast (5/1hr). Please wait." 
    },
    keyGenerator: (req) => req.headers['x-forwarded-for'] || req.ip,
    skip: (req) => CONFIG.OWNER_IP && req.ip.includes(CONFIG.OWNER_IP)
});

// =================================================================================================
// SECTION 8: PRIMARY API ENDPOINTS (FIXED LOGIC)
// =================================================================================================

/**
 * 🔥 HELPER: STANDARDIZE DIFFICULTY (FIX V9.6) 🔥
 * This function fixes "eady", "Easy", "easy" -> "Easy"
 */
const standardizeDifficulty = (input) => {
    // 1. Check if input is missing
    if (!input) {
        // Warning log for debugging
        return "Medium";
    }
    
    // 2. Normalize string
    const s = String(input).toLowerCase().trim();

    // 3. Match Logic
    if (s === 'easy' || s === 'eady' || s === 'ez') return "Easy";
    
    // Check 'very hard' before 'hard' to avoid partial matching issues
    if (s === 'very hard' || s === 'veryhard' || s === 'very-hard') return "Very Hard";
    
    if (s === 'hard') return "Hard";
    
    if (s === 'medium' || s === 'med') return "Medium";
    
    // Default Fallback
    return "Medium";
};


/**
 * 🤖 GENERATE PROBLEM API
 */
app.post('/api/generate-problem', aiLimiterQuota, aiSpeedLimiter, async (req, res) => {
    
    // 🔍 DEBUG LOG: Check what the frontend actually sends
    console.log("------------------------------------------------");
    console.log("📥 [API REQUEST] Body:", req.body);
    
    const { prompt, topic, difficulty } = req.body;
    
    // ✅ APPLY THE FIX
    const finalTopic = topic || "Limits";
    const finalDifficulty = standardizeDifficulty(difficulty);
    
    console.log(`✅ [LOGIC] Resolved: Topic="${finalTopic}", Diff="${finalDifficulty}"`);
    console.log("------------------------------------------------");

    SYSTEM_STATE.totalGamesGenerated++;

    let useCache = false;
    let dbCount = 0;

    // -------------------------------------------------------------------------
    // STEP 1: DATABASE CHECK
    // -------------------------------------------------------------------------
    if (SYSTEM_STATE.mongoConnected) {
        try {
            dbCount = await MathCache.countDocuments({ topic: finalTopic, difficulty: finalDifficulty });
            const target = CONFIG.TARGETS[finalDifficulty] || 30;

            if (dbCount >= target) {
                useCache = true;
            } else {
                if (Math.random() < CONFIG.CACHE_RATE) {
                    useCache = true;
                }
            }
        } catch (e) { 
            console.error(e); 
        }
    }

    // -------------------------------------------------------------------------
    // STEP 2: CACHE RETRIEVAL
    // -------------------------------------------------------------------------
    if (useCache && SYSTEM_STATE.mongoConnected) {
        try {
            const cached = await MathCache.aggregate([
                { $match: { topic: finalTopic, difficulty: finalDifficulty } }, 
                { $sample: { size: 1 } }
            ]);

            if (cached.length > 0) {
                SYSTEM_STATE.cacheHits++;
                return res.json({ 
                    text: cached[0].raw_text, 
                    source: "cache",
                    metadata: { topic: finalTopic, difficulty: finalDifficulty }
                });
            }
        } catch (e) {
            logSystem('ERR', 'Cache Read Error', e.message);
        }
    }

    // -------------------------------------------------------------------------
    // STEP 3: AI GENERATION
    // -------------------------------------------------------------------------
    logSystem('AI', 'Calling Gemini API', `${finalTopic} (Target: ${finalDifficulty})`);
    SYSTEM_STATE.aiCalls++;
    
    try {
        const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
        const model = genAI.getGenerativeModel({ model: CONFIG.AI_MODEL });
        
        const aiPrompt = prompt || `Create 1 unique multiple-choice math problem for topic "${finalTopic}" with difficulty "${finalDifficulty}". Return JSON.`;
        
        const result = await model.generateContent(aiPrompt);
        const response = await result.response;
        const text = response.text();
        
        // Save to Database with CORRECTED Difficulty
        if (SYSTEM_STATE.mongoConnected) {
            MathCache.create({
                topic: finalTopic,
                difficulty: finalDifficulty, 
                raw_text: text,
                source_ip: req.ip
            }).catch(e => {
                logSystem('WARN', 'Cache Write Failed', e.message);
            });
        }

        res.json({ 
            text: text, 
            source: "ai", 
            metadata: { topic: finalTopic, difficulty: finalDifficulty } 
        });

    } catch (err) {
        logSystem('ERR', 'AI Service Error', err.message);
        res.status(500).json({ error: "AI Service Unavailable" });
    }
});

/**
 * 🏆 LEADERBOARD SUBMIT API
 */
app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;

    // Validation
    if (!username || typeof score !== 'number' || !difficulty) {
        return res.status(400).json({ success: false, message: "Invalid payload" });
    }
    
    // ✅ APPLY THE FIX HERE TOO
    const finalDiff = standardizeDifficulty(difficulty);

    try {
        const client = await pgPool.connect();

        // Anti-Cheat Check
        const maxAllowed = CONFIG.ALLOWED_SCORES[finalDiff] || 100;
        if (score > maxAllowed) {
            client.release();
            logSystem('SEC', 'Score Rejected', `${username} tried to submit ${score}`);
            return res.status(403).json({ message: "Score rejected" });
        }

        // Check Existing
        const check = await client.query(
            'SELECT id, score FROM leaderboard WHERE username = $1 AND difficulty = $2 ORDER BY id ASC',
            [username, finalDiff]
        );

        if (check.rows.length > 0) {
            // Merge Logic
            const rows = check.rows;
            const targetId = rows[0].id; 
            
            const currentTotal = rows.reduce((acc, row) => acc + row.score, 0);
            const finalScore = currentTotal + score;

            await client.query('UPDATE leaderboard SET score = $1, updated_at = NOW() WHERE id = $2', [finalScore, targetId]);
            logSystem('DB', `Merged Score`, `User: ${username}, Total: ${finalScore} [${finalDiff}]`);

            // Clean Duplicates
            if (rows.length > 1) {
                const idsToDelete = rows.slice(1).map(r => r.id);
                await client.query('DELETE FROM leaderboard WHERE id = ANY($1::int[])', [idsToDelete]);
            }
        } else {
            // New Record
            const userIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            await client.query(
                'INSERT INTO leaderboard(username, score, difficulty, ip_address) VALUES($1, $2, $3, $4)',
                [username, score, finalDiff, userIP]
            );
            logSystem('DB', `New Leaderboard Entry`, `User: ${username} [${finalDiff}]`);
        }

        client.release();
        res.status(201).json({ success: true });

    } catch (err) {
        logSystem('ERR', 'Leaderboard Submit Error', err.message);
        res.status(500).json({ success: false });
    }
});

app.get('/api/leaderboard/top', async (req, res) => {
    try {
        const client = await pgPool.connect();
        const result = await client.query(`
            SELECT username, SUM(score) as score, COUNT(difficulty) as games_played 
            FROM leaderboard 
            GROUP BY username 
            ORDER BY score DESC 
            LIMIT 100
        `);
        client.release();
        res.json(result.rows);
    } catch (err) {
        res.status(500).json([]);
    }
});

// =================================================================================================
// SECTION 9: ADMINISTRATIVE API ENDPOINTS
// =================================================================================================

app.post('/api/submit-request', async (req, res) => {
    const { username, score } = req.body;
    try {
        const client = await pgPool.connect();
        await client.query('INSERT INTO certificate_requests (username, score) VALUES ($1, $2)', [username, score]);
        client.release();
        logSystem('OK', 'Certificate Requested', username);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const client = await pgPool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [req.params.id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Request Not Found");

        const { username, score } = result.rows[0];
        const dateStr = new Date().toLocaleDateString('en-US');
        const msg = `Score: ${score}%0A%0ADate: ${dateStr}`;

        const finalUrl = CONFIG.IMG_API + 
            `&txt-align=center&txt-size=110&txt-color=FFD700&txt=${encodeURIComponent(username.toUpperCase())}&txt-fit=max&w=1800` +
            `&mark-align=center&mark-size=35&mark-color=FFFFFF&mark-y=850&mark-txt=${encodeURIComponent(msg)}&mark-w=1600`;

        res.redirect(finalUrl);
    } catch (e) { res.status(500).send("Generation Error"); }
});

app.delete('/admin/delete-request/:id', async (req, res) => {
    try {
        const client = await pgPool.connect();
        await client.query('DELETE FROM certificate_requests WHERE id = $1', [req.params.id]);
        client.release();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/admin/api/stats', async (req, res) => {
    if (!SYSTEM_STATE.mongoConnected) return res.json({ stats: [] });
    
    // Mongo Stats
    const stats = await MathCache.aggregate([
        { $group: { _id: { topic: "$topic", difficulty: "$difficulty" }, count: { $sum: 1 } } }
    ]);
    
    // Postgres Requests
    const client = await pgPool.connect();
    const certs = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
    client.release();

    res.json({ 
        stats, 
        certRequests: certs.rows,
        isGenerating: SYSTEM_STATE.isGenerating,
        currentTask: SYSTEM_STATE.currentGenTask,
        targets: CONFIG.TARGETS,
        topics: CONFIG.TOPICS
    });
});

app.post('/admin/api/toggle-gen', (req, res) => {
    const { action } = req.body;
    if (action === 'start') {
        startBackgroundGeneration();
    } else {
        SYSTEM_STATE.isGenerating = false;
        logSystem('GEN', 'Manual Stop Triggered');
    }
    res.json({ status: SYSTEM_STATE.isGenerating });
});

// =================================================================================================
// SECTION 10: PREMIUM ADMINISTRATIVE DASHBOARD (GLASSMORPHISM UI)
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
                    <span>v9.6 ULTIMATE</span>
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
                    <a href="/" style="color: var(--text-mute); text-decoration: none; font-size: 0.9rem; display: flex; align-items: center; gap: 10px;">
                        ↩️ ត្រឡប់ទៅ Dashboard
                    </a>
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

            /**
             * Switch between Sidebar Tabs
             */
            function switchTab(id, btn) {
                // Remove active class from all sections
                document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
                // Remove active class from all buttons
                document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
                
                // Add active class to selected
                document.getElementById(id).classList.add('active');
                btn.classList.add('active');
            }

            /**
             * Data Fetching & UI Updates
             */
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
                            // Find matching stats
                            const found = data.stats.find(s => s._id.topic === topic.key && s._id.difficulty === diff);
                            const count = found ? found.count : 0;
                            const target = data.targets[diff];
                            
                            // Calculate Percentage
                            const pct = Math.min((count/target)*100, 100);
                            const barClass = pct >= 100 ? 'prog-bar full' : 'prog-bar';
                            
                            rows += \`
                                <tr>
                                    <td class="diff-badge" width="30%">\${diff}</td>
                                    <td width="20%" style="font-weight:bold; color:white">\${count}</td>
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

            /**
             * Logs Renderer
             * Uses initial server data for immediate display
             */
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
            // Initial Render
            renderLogs(initialLogs);

            /**
             * API Actions
             */
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

            // Start Auto-Refresh Loop (Every 2 seconds)
            setInterval(refreshData, 2000);
            refreshData(); // First call

        </script>
    </body>
    </html>
    `);
});

// =================================================================================================
// SECTION 11: PUBLIC DASHBOARD (SIMPLE STATUS PAGE)
// =================================================================================================

app.get('/', (req, res) => {
    // Basic uptime math
    const uptime = process.uptime();
    const d = Math.floor(uptime / 86400);
    const h = Math.floor((uptime % 86400) / 3600);
    
    // Status badges
    const pg = SYSTEM_STATE.postgresConnected 
        ? '<span style="color:#10b981">● ONLINE</span>' 
        : '<span style="color:#ef4444">● OFFLINE</span>';
        
    const mg = SYSTEM_STATE.mongoConnected 
        ? '<span style="color:#10b981">● ONLINE</span>' 
        : '<span style="color:#ef4444">● OFFLINE</span>';
    
    // Simple HTML response
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
            <h1>🚀 TITAN ENGINE V9.6</h1>
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

/**
 * Start the System
 * Initializes databases and binds the server port.
 */
async function startSystem() {
    console.clear();
    logSystem('OK', 'Booting BrainTest Titan V9.6 (Full Source Ed)...');
    
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
