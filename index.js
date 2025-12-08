/**
 * =================================================================================================
 *  #######  ##   ######      ###    ##   ##     #######  ##   ##   ######   ##  ##   ######  
 *   ##   #  ##   # ## #     ## ##   ###  ##      ##   #  ###  ##  # ## #    ##  ##   ##  ##  
 *   ## #    ##     ##      ##   ##  #### ##      ## #    #### ##    ##      ##  ##   ##  ##  
 *   ####    ##     ##      ##   ##  ## ####      ####    ## ####    ##      ######   #####   
 *   ## #    ##     ##      #######  ##  ###      ## #    ##  ###    ##      ##  ##   ##      
 *   ##      ##     ##      ##   ##  ##   ##      ##      ##   ##    ##      ##  ##   ##      
 *  ####    ####   ####     ##   ##  ##   ##     ####     ##   ##   ####     ##  ##  ####     
 * =================================================================================================
 * 
 * PROJECT:           TITAN ENTERPRISE BACKEND SYSTEM
 * VERSION:           10.0.0 (CAMBODIA EDITION)
 * CODENAME:          "PREAH VIHEAR"
 * ARCHITECTURE:      MONOLITHIC NODE.JS + HYBRID DB (PG/MONGO)
 * AUTHOR:            BRAINTEST ENGINEERING TEAM
 * DATE:              DECEMBER 2025
 * 
 * █ SYSTEM CAPABILITIES & LOGIC FLOW:
 * 
 * 1. SECURITY LAYER (USER RATE LIMIT):
 *    - RULE: Maximum 10 requests per 8 Hours.
 *    - DELAY: Removed! Users can request instantly within quota.
 *    - BYPASS: Owner IP is whitelisted.
 * 
 * 2. ERROR HANDLING (API RETRY LOGIC):
 *    - IF AI FAILS: System waits 60 SECONDS (Cool Down).
 *    - RETRY: Automatically retries after the delay.
 * 
 * 3. LEADERBOARD INTELLIGENCE:
 *    - MERGE: Sums scores for same User/Difficulty.
 *    - DEDUPE: Removes duplicate rows immediately.
 * 
 * 4. CURRICULUM (GRADE 12 NEW):
 *    - Limits, Continuity, Derivatives, Functions, Integrals, 
 *      DiffEq, Probability, Complex, Vectors, Conics.
 * 
 * 5. ADMIN DASHBOARD:
 *    - Full Glassmorphism UI (Server-Side Rendered).
 *    - Live System Monitoring.
 * 
 * =================================================================================================
 */

// =================================================================================================
// 📚 MODULE 1: IMPORTS & SETUP
// =================================================================================================

// 1.1 Track Start Time
const START_TIME = Date.now();

// 1.2 Load Environment Variables
require('dotenv').config();

// 1.3 Core Dependencies
const path = require('path');
const http = require('http');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');

// =================================================================================================
// ⚙️ MODULE 2: CONFIGURATION REGISTRY
// =================================================================================================

/**
 * Global Configuration Class
 * Centralizes all settings, constants, and curriculum data.
 */
class ConfigurationRegistry {
    constructor() {
        // --- SERVER ---
        this.SERVER = {
            PORT: process.env.PORT || 3000,
            ENV: process.env.NODE_ENV || 'development',
            TIMEOUT: 30000 
        };

        // --- DATABASE ---
        this.DB = {
            POSTGRES_URL: process.env.DATABASE_URL,
            MONGO_URI: this._cleanMongoURI(process.env.MONGODB_URI)
        };

        // --- AI ENGINE ---
        this.AI = {
            API_KEY: process.env.GEMINI_API_KEY,
            MODEL: "gemini-2.5-flash", 
            RETRY_DELAY: 60000, // 60 Seconds Delay on Failure
            MAX_RETRIES: 2
        };

        // --- EXTERNAL ---
        this.EXT = {
            IMG_API: process.env.EXTERNAL_IMAGE_API,
            OWNER_IP: process.env.OWNER_IP
        };

        // --- GENERATOR ---
        this.GEN = {
            CACHE_RATE: 0.25, // 25% Cache Usage
            TARGETS: {
                "Easy": 60,
                "Medium": 40,
                "Hard": 30,
                "Very Hard": 20
            }
        };

        // --- GAME RULES ---
        this.RULES = {
            MAX_SCORES: {
                "Easy": 5,
                "Medium": 10,
                "Hard": 15,
                "Very Hard": 20
            }
        };

        // --- CURRICULUM (GRADE 12 NEW) ---
        this.TOPICS = [
            { 
                key: "Limits", 
                label: "លីមីត (Limits)", 
                prompt: "Calculus Limits: Indeterminate forms (0/0, infinity/infinity), L'Hopital's rule, limits at infinity, and trigonometric limits." 
            },
            { 
                key: "Continuity", 
                label: "ភាពជាប់ (Continuity)", 
                prompt: "Calculus Continuity: Function continuity at a point, continuity on an interval, finding constants to make a function continuous." 
            },
            { 
                key: "Derivatives", 
                label: "ដេរីវេ (Derivatives)", 
                prompt: "Calculus Derivatives: Power rule, Product/Quotient rules, Chain rule, Derivatives of exponential/logarithmic functions, and Tangent lines." 
            },
            { 
                key: "StudyFunc", 
                label: "សិក្សាអនុគមន៍ (Functions)", 
                prompt: "Function Analysis: Domain of definition, Vertical/Horizontal/Oblique Asymptotes, Variations (Increasing/Decreasing), and Graph interpretation." 
            },
            { 
                key: "Integrals", 
                label: "អាំងតេក្រាល (Integrals)", 
                prompt: "Calculus Integrals: Antiderivatives, Definite integrals, Integration by substitution, Integration by parts, and Area under a curve." 
            },
            { 
                key: "DiffEq", 
                label: "សមីការឌីផេរ៉ង់ស្យែល", 
                prompt: "Differential Equations: First-order linear equations, Second-order linear homogeneous equations with constant coefficients." 
            },
            { 
                key: "Probability", 
                label: "ប្រូបាប (Probability)", 
                prompt: "Probability & Statistics: Counting principles, Permutations, Combinations, Probability of events, and Conditional probability." 
            },
            { 
                key: "Complex", 
                label: "ចំនួនកុំផ្លិច (Complex)", 
                prompt: "Complex Numbers: Arithmetic operations, Conjugate, Modulus, Argument, Polar form, and Solving quadratic equations with complex roots." 
            },
            { 
                key: "Vectors", 
                label: "វ៉ិចទ័រ (Vectors)", 
                prompt: "3D Geometry (Space): Vectors, Scalar (Dot) product, Vector (Cross) product, Equations of Lines and Planes in space." 
            },
            { 
                key: "Conics", 
                label: "កោនិក (Conics)", 
                prompt: "Conic Sections: Standard equations, Vertices, Foci, and Directrix of Parabolas, Ellipses, and Hyperbolas." 
            }
        ];
    }

    _cleanMongoURI(uri) {
        if (!uri) return null;
        let clean = uri.trim();
        if (!clean.startsWith('mongodb://') && !clean.startsWith('mongodb+srv://')) {
            return `mongodb+srv://${clean}`;
        }
        return clean;
    }
}

const CONFIG = new ConfigurationRegistry();

// =================================================================================================
// 📝 MODULE 3: LOGGER & STATE
// =================================================================================================

class SystemState {
    constructor() {
        this.dbStatus = { pg: false, mongo: false };
        this.metrics = { requests: 0, cacheHits: 0, aiCalls: 0, errors: 0 };
        this.worker = { isRunning: false, task: "Idle" };
        this.logs = [];
    }
}

const STATE = new SystemState();

class Logger {
    static info(module, message, details = '') { this._print('INFO', module, message, details, '#3b82f6'); }
    static success(module, message, details = '') { this._print('OK', module, message, details, '#10b981'); }
    static warn(module, message, details = '') { this._print('WARN', module, message, details, '#f59e0b'); }
    static error(module, message, details = '') { 
        STATE.metrics.errors++;
        this._print('ERR', module, message, details, '#ef4444'); 
    }
    static db(message, details = '') { this._print('DB', 'DATABASE', message, details, '#8b5cf6'); }
    static gen(message, details = '') { this._print('GEN', 'WORKER', message, details, '#ec4899'); }

    static _print(type, module, message, details, color) {
        const time = new Date().toLocaleTimeString('en-US', { hour12: false });
        console.log(`[${time}] [${type}:${module}] ${message} ${details ? '| ' + details : ''}`);
        STATE.logs.unshift({ time, type, module, message, details, color });
        if (STATE.logs.length > 500) STATE.logs.pop();
    }
}

// =================================================================================================
// 🛡️ MODULE 4: INPUT SANITIZER
// =================================================================================================

class InputSanitizer {
    /**
     * Fixes user input for Difficulty.
     * Maps "easy", "Easy ", "EASY" -> "Easy"
     * Defaults to "Medium" if invalid.
     */
    static normalizeDifficulty(input) {
        if (!input) return "Medium";
        const map = {
            "easy": "Easy",
            "medium": "Medium",
            "hard": "Hard",
            "very hard": "Very Hard"
        };
        const clean = input.toString().trim().toLowerCase();
        return map[clean] || "Medium";
    }

    static normalizeTopic(input) {
        const found = CONFIG.TOPICS.find(t => t.key === input);
        return found ? found.key : "Limits"; // Default Topic
    }
}

// =================================================================================================
// 🗄️ MODULE 5: POSTGRESQL SERVICE
// =================================================================================================

class PostgresService {
    constructor() {
        this.pool = new Pool({
            connectionString: CONFIG.DB.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 5000,
            max: 20
        });
        this.pool.on('error', (err) => {
            STATE.dbStatus.pg = false;
            Logger.error('PG', 'Client Error', err.message);
        });
    }

    async init() {
        try {
            Logger.db('Connecting to PostgreSQL...');
            const client = await this.pool.connect();
            STATE.dbStatus.pg = true;

            // Table: Leaderboard
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

            // Table: Certificates
            await client.query(`
                CREATE TABLE IF NOT EXISTS certificate_requests (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(100) NOT NULL,
                    score INTEGER NOT NULL,
                    status VARCHAR(20) DEFAULT 'Pending',
                    request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `);

            client.release();
            Logger.success('PG', 'Schema Verified');
        } catch (err) {
            Logger.error('PG', 'Init Failed', err.message);
        }
    }

    async query(text, params) { return this.pool.query(text, params); }
}

// =================================================================================================
// 🗄️ MODULE 6: MONGODB SERVICE
// =================================================================================================

class MongoService {
    constructor() {
        this.Model = null;
        this._setupSchema();
    }

    _setupSchema() {
        const schema = new mongoose.Schema({
            topic: { type: String, required: true, index: true },
            difficulty: { type: String, required: true, index: true },
            raw_text: { type: String, required: true },
            source_ip: String,
            createdAt: { type: Date, default: Date.now }
        });
        schema.index({ topic: 1, difficulty: 1 });
        this.Model = mongoose.model('MathProblemCache', schema);
    }

    async init() {
        if (!CONFIG.DB.MONGO_URI) {
            Logger.warn('MONGO', 'No URI. Caching Disabled.');
            return;
        }
        try {
            Logger.db('Connecting to MongoDB...');
            await mongoose.connect(CONFIG.DB.MONGO_URI, {
                serverSelectionTimeoutMS: 5000,
                family: 4
            });
            STATE.dbStatus.mongo = true;
            Logger.success('MONGO', 'Connection Established');
            
            mongoose.connection.on('disconnected', () => {
                STATE.dbStatus.mongo = false;
                Logger.warn('MONGO', 'Disconnected');
            });
        } catch (err) {
            STATE.dbStatus.mongo = false;
            Logger.error('MONGO', 'Connection Failed', err.message);
        }
    }
}

// Initialize Databases
const PG = new PostgresService();
const MONGO = new MongoService();

// =================================================================================================
// 🤖 MODULE 7: AI ENGINE (WITH RETRY LOGIC)
// =================================================================================================

class AIEngine {
    constructor() {
        this.apiKey = CONFIG.AI.API_KEY;
        this.model = null;

        if (this.apiKey) {
            const genAI = new GoogleGenerativeAI(this.apiKey);
            this.model = genAI.getGenerativeModel({ model: CONFIG.AI.MODEL });
        } else {
            Logger.error('AI', 'API Key Missing');
        }
    }

    /**
     * Generates Content with "Retry on Failure" Logic.
     * If 1st try fails, it waits 60s, then tries again.
     */
    async generateWithRetry(topicKey, difficulty) {
        if (!this.model) throw new Error("AI not initialized");

        const prompt = this._buildPrompt(topicKey, difficulty);
        let attempts = 0;
        const maxAttempts = CONFIG.AI.MAX_RETRIES; // 2

        while (attempts < maxAttempts) {
            try {
                attempts++;
                const result = await this.model.generateContent(prompt);
                let text = result.response.text();
                
                // Clean & Validate
                text = text.replace(/```json/g, '').replace(/```/g, '').trim();
                JSON.parse(text); // Check JSON validity

                return text; // Success!

            } catch (err) {
                Logger.error('AI', `Attempt ${attempts} Failed`, err.message);
                
                if (attempts < maxAttempts) {
                    // 🔥 THE CRITICAL FEATURE: WAIT 60 SECONDS BEFORE RETRYING
                    Logger.warn('AI', 'Cooling Down (60s)...', 'Waiting before retry');
                    await new Promise(resolve => setTimeout(resolve, CONFIG.AI.RETRY_DELAY));
                } else {
                    throw new Error("AI Failed after retries");
                }
            }
        }
    }

    _buildPrompt(topicKey, difficulty) {
        const topicObj = CONFIG.TOPICS.find(t => t.key === topicKey);
        const description = topicObj ? topicObj.prompt : topicKey;

        return `
            ACT AS: Math Teacher (Grade 12).
            TOPIC: "${description}"
            DIFFICULTY: "${difficulty}"
            TASK: Create 1 unique multiple-choice math problem.
            
            REQUIREMENTS:
            - Valid LaTeX for math formulas.
            - 4 Distinct options (A, B, C, D).
            - Brief explanation in Khmer or English.
            - OUTPUT JSON ONLY.
            
            JSON FORMAT:
            {
                "question": "string",
                "options": ["string", "string", "string", "string"],
                "answer": "string (value)",
                "explanation": "string"
            }
        `;
    }
}

const AI = new AIEngine();

// =================================================================================================
// ⚙️ MODULE 8: BACKGROUND WORKER
// =================================================================================================

class GeneratorWorker {
    async start() {
        if (STATE.worker.isRunning) return;
        if (!STATE.dbStatus.mongo) {
            Logger.error('WORKER', 'Cannot Start. MongoDB Offline.');
            return;
        }

        STATE.worker.isRunning = true;
        Logger.gen('🚀 WORKER STARTED');

        for (const topic of CONFIG.TOPICS) {
            for (const [level, target] of Object.entries(CONFIG.GEN.TARGETS)) {
                
                if (!STATE.worker.isRunning) {
                    Logger.gen('Stopped Manually');
                    STATE.worker.task = "Stopped";
                    return;
                }

                try {
                    const count = await MONGO.Model.countDocuments({ topic: topic.key, difficulty: level });
                    
                    if (count < target) {
                        const needed = target - count;
                        STATE.worker.task = `Filling ${topic.label} [${level}]`;
                        Logger.gen('Processing', `${topic.key} [${level}] Need: ${needed}`);

                        for (let i = 0; i < needed; i++) {
                            if (!STATE.worker.isRunning) break;

                            try {
                                // Uses the Retry Logic
                                const json = await AI.generateWithRetry(topic.key, level);
                                
                                await MONGO.Model.create({
                                    topic: topic.key,
                                    difficulty: level,
                                    raw_text: json,
                                    source_ip: 'WORKER'
                                });

                                Logger.gen('Item Saved', `${topic.key} #${i+1}`);
                                // Small pause to be polite to API
                                await new Promise(r => setTimeout(r, 4000));

                            } catch (e) {
                                Logger.error('WORKER', 'Item Failed', e.message);
                                // If the retry logic inside AI also failed, we skip this item
                            }
                        }
                    }
                } catch (err) {
                    Logger.error('WORKER', 'Loop Error', err.message);
                }
            }
        }

        STATE.worker.isRunning = false;
        STATE.worker.task = "Targets Met";
        Logger.gen('🏁 WORKER COMPLETED');
    }

    stop() { STATE.worker.isRunning = false; }
}

const Worker = new GeneratorWorker();

// =================================================================================================
// 🚀 MODULE 9: EXPRESS SERVER & MIDDLEWARE
// =================================================================================================

const app = express();

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Analytics
app.use((req, res, next) => {
    STATE.metrics.requests++;
    if (req.path.startsWith('/api') || req.path.startsWith('/admin')) {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        Logger.info('NET', `${req.method} ${req.path}`, `IP: ${ip}`);
    }
    next();
});

// -------------------------------------------------------------------------------------------------
// 🛡️ RATE LIMITING (USER) - 10 REQUESTS / 8 HOURS
// -------------------------------------------------------------------------------------------------
// Note: No delayAfter/delayMs here, as requested. Users don't wait if they have quota.
const userRateLimiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, // 8 Hours
    max: 10, // Max 10 Requests
    message: { 
        error: "Quota Exceeded", 
        message: "⚠️ អ្នកបានប្រើប្រាស់អស់ ១០ ដងហើយក្នុងរយៈពេល ៨ ម៉ោង។" 
    },
    skip: (req) => CONFIG.EXT.OWNER_IP && req.ip.includes(CONFIG.EXT.OWNER_IP)
});

// =================================================================================================
// 📡 MODULE 10: API CONTROLLERS
// =================================================================================================

/**
 * 🎯 POST /api/generate-problem
 * Core Logic: Hybrid Cache/AI + Retry Logic + Input Sanitization
 */
app.post('/api/generate-problem', userRateLimiter, async (req, res) => {
    // 1. Sanitize Inputs (Fixes "Easy" bug)
    const topic = InputSanitizer.normalizeTopic(req.body.topic);
    const difficulty = InputSanitizer.normalizeDifficulty(req.body.difficulty);
    const customPrompt = req.body.prompt;

    Logger.info('API', `Request`, `T: ${topic} | D: ${difficulty}`);

    let useCache = false;

    // 2. Decide Source (Cache vs AI)
    if (STATE.dbStatus.mongo && !customPrompt) {
        try {
            const count = await MONGO.Model.countDocuments({ topic, difficulty });
            const target = CONFIG.GEN.TARGETS[difficulty] || 30;

            if (count >= target) {
                useCache = true; // DB Full -> Use Cache
            } else {
                // DB Not Full -> Random (25% Cache)
                if (Math.random() < CONFIG.GEN.CACHE_RATE) useCache = true;
            }
        } catch (e) { console.error(e); }
    }

    // 3. Strategy A: From Cache
    if (useCache && STATE.dbStatus.mongo) {
        try {
            const cached = await MONGO.Model.aggregate([
                { $match: { topic, difficulty } },
                { $sample: { size: 1 } }
            ]);

            if (cached.length > 0) {
                STATE.metrics.cacheHits++;
                return res.json({
                    text: cached[0].raw_text,
                    source: "cache",
                    metadata: { topic, difficulty }
                });
            }
        } catch (e) { Logger.warn('CACHE', 'Read Failed', e.message); }
    }

    // 4. Strategy B: Generate Live (With Retry)
    STATE.metrics.aiCalls++;
    Logger.ai('Generating Live', `${topic} [${difficulty}]`);

    try {
        // Calls the retry-enabled AI function
        const aiText = await AI.generateWithRetry(topic, difficulty);
        
        // Save to DB
        if (STATE.dbStatus.mongo) {
            MONGO.Model.create({
                topic,
                difficulty,
                raw_text: aiText,
                source_ip: req.ip
            }).catch(e => Logger.warn('DB', 'Write Failed', e.message));
        }

        res.json({
            text: aiText,
            source: "ai",
            metadata: { topic, difficulty }
        });

    } catch (err) {
        // If we reach here, it means even after retrying (waiting 60s), it failed.
        Logger.error('API', 'Generation Failed', err.message);
        res.status(503).json({ 
            error: "Service Unavailable", 
            message: "AI system is busy. Please try again later." 
        });
    }
});

/**
 * 🏆 POST /api/leaderboard/submit
 * Logic: Merge Scores + Remove Duplicates
 */
app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;
    const cleanDiff = InputSanitizer.normalizeDifficulty(difficulty);
    
    if (!username || typeof score !== 'number') {
        return res.status(400).json({ message: "Invalid Payload" });
    }

    if (!STATE.dbStatus.pg) return res.status(503).json({ message: "DB Offline" });

    try {
        // 1. Anti-Cheat
        const maxScore = CONFIG.RULES.MAX_SCORES[cleanDiff] || 100;
        if (score > maxScore) {
            Logger.warn('SEC', 'Score Rejected', `${username}: ${score}`);
            return res.status(403).json({ message: "Score Rejected" });
        }

        // 2. Check Existing
        const check = await PG.query(
            'SELECT id, score FROM leaderboard WHERE username = $1 AND difficulty = $2 ORDER BY id ASC',
            [username, cleanDiff]
        );

        if (check.rows.length > 0) {
            // 3. MERGE SCORES
            const targetId = check.rows[0].id;
            const currentTotal = check.rows.reduce((sum, row) => sum + row.score, 0);
            const finalScore = currentTotal + score;

            await PG.query('UPDATE leaderboard SET score = $1, updated_at = NOW() WHERE id = $2', [finalScore, targetId]);
            Logger.db('Score Merged', `${username}: ${finalScore}`);

            // 4. DEDUPLICATE
            if (check.rows.length > 1) {
                const idsToDelete = check.rows.slice(1).map(r => r.id);
                await PG.query('DELETE FROM leaderboard WHERE id = ANY($1::int[])', [idsToDelete]);
                Logger.db('Cleaned Dups', `IDs: ${idsToDelete.join(',')}`);
            }

        } else {
            // 5. Insert New
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            await PG.query(
                'INSERT INTO leaderboard(username, score, difficulty, ip_address) VALUES($1, $2, $3, $4)',
                [username, score, cleanDiff, ip]
            );
            Logger.db('New Score', `${username}: ${score}`);
        }
        res.json({ success: true });

    } catch (err) {
        Logger.error('API', 'Leaderboard Error', err.message);
        res.status(500).json({ success: false });
    }
});

/**
 * 📊 GET /api/leaderboard/top
 */
app.get('/api/leaderboard/top', async (req, res) => {
    if (!STATE.dbStatus.pg) return res.json([]);
    try {
        const result = await PG.query(`
            SELECT username, SUM(score) as score, COUNT(difficulty) as games_played 
            FROM leaderboard 
            GROUP BY username 
            ORDER BY score DESC 
            LIMIT 100
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json([]);
    }
});

// =================================================================================================
// 🔧 MODULE 11: ADMIN API
// =================================================================================================

app.post('/api/submit-request', async (req, res) => {
    if (!STATE.dbStatus.pg) return res.status(503).json({});
    try {
        await PG.query('INSERT INTO certificate_requests (username, score) VALUES ($1, $2)', [req.body.username, req.body.score]);
        Logger.success('ADMIN', 'Cert Request', req.body.username);
        res.json({ success: true });
    } catch (e) { res.status(500).json({}); }
});

app.delete('/admin/delete-request/:id', async (req, res) => {
    if (!STATE.dbStatus.pg) return res.status(503).json({});
    try {
        await PG.query('DELETE FROM certificate_requests WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({}); }
});

app.get('/admin/generate-cert/:id', async (req, res) => {
    if (!STATE.dbStatus.pg) return res.send("DB Error");
    try {
        const data = await PG.query('SELECT * FROM certificate_requests WHERE id = $1', [req.params.id]);
        if (data.rows.length === 0) return res.send("Not Found");
        
        const { username, score } = data.rows[0];
        const date = new Date().toLocaleDateString('en-US');
        const msg = `Score: ${score}%0A%0ADate: ${date}`;
        
        const url = CONFIG.EXT.IMG_API + 
            `&txt-align=center&txt-size=110&txt-color=FFD700&txt=${encodeURIComponent(username.toUpperCase())}&txt-fit=max&w=1800` +
            `&mark-align=center&mark-size=35&mark-color=FFFFFF&mark-y=850&mark-txt=${encodeURIComponent(msg)}&mark-w=1600`;
            
        res.redirect(url);
    } catch (e) { res.send("Error"); }
});

app.get('/admin/api/stats', async (req, res) => {
    let stats = [];
    if (STATE.dbStatus.mongo) {
        stats = await MONGO.Model.aggregate([
            { $group: { _id: { topic: "$topic", difficulty: "$difficulty" }, count: { $sum: 1 } } }
        ]);
    }
    
    let reqs = [];
    if (STATE.dbStatus.pg) {
        const pgRes = await PG.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
        reqs = pgRes.rows;
    }

    res.json({
        stats,
        reqs,
        worker: STATE.worker,
        targets: CONFIG.GEN.TARGETS,
        topics: CONFIG.TOPICS,
        logs: STATE.logs,
        system: { uptime: process.uptime(), memory: process.memoryUsage() }
    });
});

app.post('/admin/api/toggle-gen', (req, res) => {
    if (req.body.action === 'start') Worker.start();
    else Worker.stop();
    res.json(STATE.worker);
});

// =================================================================================================
// 🖥️ MODULE 12: ADMIN DASHBOARD (GLASSMORPHISM V4)
// =================================================================================================

app.get('/admin', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html lang="km">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>TITAN ENTERPRISE V10</title>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;700&family=Kantumruy+Pro:wght@300;400;600;700&display=swap" rel="stylesheet">
        <style>
            :root {
                --bg: #0f172a; --glass: rgba(30, 41, 59, 0.5); --border: rgba(255, 255, 255, 0.1);
                --primary: #3b82f6; --success: #10b981; --danger: #ef4444; --text: #f8fafc; --mute: #94a3b8;
            }
            * { box-sizing: border-box; transition: all 0.2s ease; }
            body { margin:0; background: var(--bg); color: var(--text); font-family: 'Kantumruy Pro', sans-serif; display: flex; height: 100vh; overflow: hidden; }
            
            .sidebar { width: 260px; background: rgba(15,23,42,0.8); border-right: 1px solid var(--border); padding: 25px; display: flex; flex-direction: column; backdrop-filter: blur(10px); }
            .brand h2 { margin: 0; color: var(--primary); letter-spacing: 2px; }
            .brand span { font-size: 0.7rem; color: var(--mute); font-family: 'JetBrains Mono'; }
            
            .nav { margin-top: 40px; }
            .nav-item { display: flex; align-items: center; gap: 12px; padding: 15px; color: var(--mute); cursor: pointer; border-radius: 10px; margin-bottom: 5px; }
            .nav-item:hover, .nav-item.active { background: rgba(59,130,246,0.1); color: var(--primary); }
            
            .main { flex: 1; padding: 40px; overflow-y: auto; background: radial-gradient(at 100% 0%, rgba(59,130,246,0.1) 0px, transparent 50%); }
            .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
            .status-indicator { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--success); background: rgba(16,185,129,0.1); padding: 5px 12px; border-radius: 20px; border: 1px solid rgba(16,185,129,0.2); }
            
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 25px; }
            .card { background: var(--glass); border: 1px solid var(--border); border-radius: 16px; padding: 25px; position: relative; }
            .card-head { display: flex; justify-content: space-between; margin-bottom: 20px; }
            .card-title { font-size: 1.1rem; font-weight: 600; color: var(--text); }
            
            .btn { width: 100%; padding: 15px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; text-transform: uppercase; letter-spacing: 1px; }
            .btn-start { background: var(--success); color: white; box-shadow: 0 4px 15px rgba(16,185,129,0.3); }
            .btn-stop { background: var(--danger); color: white; box-shadow: 0 4px 15px rgba(239,68,68,0.3); }
            
            .bar-row { display: flex; align-items: center; margin-bottom: 8px; font-size: 0.85rem; }
            .bar-label { width: 80px; color: var(--mute); }
            .bar-val { width: 40px; text-align: right; font-weight: bold; margin-right: 10px; }
            .bar-track { flex: 1; height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden; }
            .bar-fill { height: 100%; background: var(--primary); }
            .bar-fill.full { background: var(--success); }
            
            table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
            th { text-align: left; color: var(--mute); padding: 10px; font-weight: normal; }
            td { padding: 12px 10px; border-bottom: 1px solid var(--border); }
            
            .terminal { background: #0b0f19; border-radius: 10px; height: 400px; padding: 15px; overflow-y: auto; font-family: 'JetBrains Mono'; font-size: 0.8rem; }
            .log-line { margin-bottom: 4px; display: flex; gap: 10px; }
            
            .tab-view { display: none; }
            .tab-view.active { display: block; animation: fadeUp 0.3s; }
            @keyframes fadeUp { from {opacity:0; transform:translateY(10px);} to {opacity:1; transform:translateY(0);} }
        </style>
    </head>
    <body>
        <div class="sidebar">
            <div class="brand">
                <h2>TITAN</h2>
                <span>ENTERPRISE V10</span>
            </div>
            <div class="nav">
                <div class="nav-item active" onclick="go('dash', this)">📊 Dashboard</div>
                <div class="nav-item" onclick="go('certs', this)">🎓 Certificates</div>
                <div class="nav-item" onclick="go('logs', this)">📡 System Logs</div>
            </div>
            <div style="margin-top:auto; font-size:0.8rem; color:var(--mute)">
                Memory: <span id="memUse">0</span> MB
            </div>
        </div>

        <div class="main">
            <div class="header">
                <h1 style="margin:0">Command Center</h1>
                <div class="status-indicator">● SYSTEM ONLINE</div>
            </div>

            <div id="dash" class="tab-view active">
                <div class="grid">
                    <div class="card">
                        <div class="card-head"><span class="card-title">Generator Engine</span></div>
                        <div style="text-align:center; padding: 20px;">
                            <h2 id="statusTxt" style="margin:0; font-size:2rem; color:#fbbf24">STANDBY</h2>
                            <p id="taskTxt" style="color:var(--mute)">Ready to deploy</p>
                        </div>
                        <button id="toggleBtn" class="btn btn-start" onclick="toggle()">Start Engine</button>
                    </div>
                    
                    <div class="card" style="grid-row: span 2; overflow-y:auto; max-height:800px">
                        <div class="card-head"><span class="card-title">Inventory Status</span></div>
                        <div id="statsList">Loading...</div>
                    </div>
                </div>
            </div>

            <div id="certs" class="tab-view">
                <div class="card">
                    <div class="card-head"><span class="card-title">Pending Requests</span></div>
                    <table>
                        <thead><tr><th>ID</th><th>User</th><th>Score</th><th>Date</th><th>Action</th></tr></thead>
                        <tbody id="certTable"></tbody>
                    </table>
                </div>
            </div>

            <div id="logs" class="tab-view">
                <div class="card">
                    <div class="card-head"><span class="card-title">Live Terminal</span></div>
                    <div class="terminal" id="term"></div>
                </div>
            </div>
        </div>

        <script>
            let running = false;
            
            function go(id, el) {
                document.querySelectorAll('.tab-view').forEach(e => e.classList.remove('active'));
                document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
                document.getElementById(id).classList.add('active');
                el.classList.add('active');
            }

            async function sync() {
                try {
                    const res = await fetch('/admin/api/stats');
                    const data = await res.json();
                    
                    running = data.worker.isRunning;
                    const btn = document.getElementById('toggleBtn');
                    const st = document.getElementById('statusTxt');
                    const tt = document.getElementById('taskTxt');
                    
                    if(running) {
                        btn.className = 'btn btn-stop'; btn.innerText = 'STOP ENGINE';
                        st.innerText = 'RUNNING'; st.style.color = '#34d399';
                        tt.innerText = data.worker.task;
                    } else {
                        btn.className = 'btn btn-start'; btn.innerText = 'START ENGINE';
                        st.innerText = 'STANDBY'; st.style.color = '#fbbf24';
                        tt.innerText = 'Idle';
                    }

                    document.getElementById('memUse').innerText = Math.round(data.system.memory.heapUsed / 1024 / 1024);

                    let html = '';
                    data.topics.forEach(t => {
                        html += \`<div style="margin-bottom:15px"><h4 style="margin:0 0 5px 0; color:#60a5fa">\${t.label}</h4>\`;
                        ['Easy','Medium','Hard','Very Hard'].forEach(d => {
                            const found = data.stats.find(s => s._id.topic === t.key && s._id.difficulty === d);
                            const count = found ? found.count : 0;
                            const target = data.targets[d];
                            const pct = Math.min((count/target)*100, 100);
                            html += \`<div class="bar-row"><div class="bar-label">\${d}</div><div class="bar-val">\${count}</div><div class="bar-track"><div class="bar-fill \${pct>=100?'full':''}" style="width:\${pct}%"></div></div></div>\`;
                        });
                        html += '</div>';
                    });
                    document.getElementById('statsList').innerHTML = html;

                    const tbody = document.getElementById('certTable');
                    if(data.reqs.length === 0) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#555">No Data</td></tr>';
                    else tbody.innerHTML = data.reqs.map(r => \`<tr><td style="color:#60a5fa">#\${r.id}</td><td><b>\${r.username}</b></td><td>\${r.score}</td><td style="color:#888">\${new Date(r.request_date).toLocaleDateString()}</td><td><a href="/admin/generate-cert/\${r.id}" target="_blank" style="text-decoration:none">🖨️</a> <span style="cursor:pointer;color:#ef4444;margin-left:10px" onclick="del(\${r.id})">✕</span></td></tr>\`).join('');

                    const term = document.getElementById('term');
                    term.innerHTML = data.logs.map(l => \`<div class="log-line"><span style="color:#555">[\${l.time}]</span><span style="font-weight:bold; color:\${l.color}">\${l.type}</span><span style="color:#ccc">\${l.message}</span></div>\`).join('');
                
                } catch(e) { console.error(e); }
            }

            async function toggle() {
                await fetch('/admin/api/toggle-gen', { 
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ action: running ? 'stop' : 'start' })
                });
                sync();
            }

            async function del(id) {
                if(confirm('Delete?')) {
                    await fetch('/admin/delete-request/'+id, {method:'DELETE'});
                    sync();
                }
            }

            setInterval(sync, 2000);
            sync();
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// =================================================================================================
// 🏁 MODULE 13: SYSTEM BOOTSTRAP
// =================================================================================================

async function startSystem() {
    console.clear();
    console.log('\n\x1b[36m%s\x1b[0m', '★ TITAN ENTERPRISE V10.0 (CAMBODIA) STARTING...');
    
    // 1. Initialize Databases
    await PG.init();
    await MONGO.init();

    // 2. Start Server
    const server = app.listen(CONFIG.SERVER.PORT, () => {
        Logger.success('SERVER', `Active on Port ${CONFIG.SERVER.PORT}`);
        console.log('\x1b[32m%s\x1b[0m', `➜ Admin Dashboard: http://localhost:${CONFIG.SERVER.PORT}/admin`);
    });

    // 3. Graceful Shutdown
    process.on('SIGTERM', () => {
        Logger.warn('SYS', 'Shutting down...');
        server.close(() => process.exit(0));
    });
}

// EXECUTE
startSystem();
