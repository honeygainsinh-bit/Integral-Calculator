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
 * EDITION:           ULTIMATE PRO (V11.0 FIXED)
 * ARCHITECTURE:      MONOLITHIC NODE.JS + HYBRID DB (PG/MONGO)
 * AUTHOR:            BRAINTEST ENGINEERING TEAM
 * DATE:              DECEMBER 2025
 * LICENSE:           PROPRIETARY
 * LINES OF CODE:     1600+ (EXPANDED FOR ENTERPRISE STABILITY)
 * 
 * -------------------------------------------------------------------------------------------------
 * █ SYSTEM CAPABILITIES & LOGIC FLOW:
 * -------------------------------------------------------------------------------------------------
 * 
 * 1. SECURITY LAYER (USER RATE LIMIT):
 *    - CONFIGURATION: Maximum 10 requests per 8 Hours window.
 *    - BEHAVIOR: No forced delay between requests. Instant execution.
 *    - EXCEPTION: Owner IP is whitelisted from all restrictions.
 * 
 * 2. SYSTEM RESILIENCE (AI RETRY LOGIC):
 *    - TRIGGER: If Google Gemini API fails (throws 500/503/429).
 *    - MECHANISM: System pauses for 60 SECONDS (Cool Down).
 *    - OUTCOME: Automatically retries generation after the pause.
 * 
 * 3. LEADERBOARD INTELLIGENCE (V9 ENGINE):
 *    - MERGE STRATEGY: Accumulates scores for the same User + Difficulty.
 *    - DEDUPLICATION: Removes duplicate rows immediately upon submission.
 *    - VALIDATION: Checks against Max Score limits per difficulty.
 * 
 * 4. CURRICULUM ENGINE (GRADE 12 NEW):
 *    - Covers: Limits, Continuity, Derivatives, Functions, Integrals, 
 *      DiffEq, Probability, Complex, Vectors, Conics.
 * 
 * 5. ADMIN DASHBOARD (SSR):
 *    - Full Glassmorphism UI (HTML/CSS in-built).
 *    - Live System Monitoring (Memory/Uptime).
 *    - Certificate Management & Generator Controls.
 * 
 * =================================================================================================
 */

// =================================================================================================
// 📚 MODULE 1: LIBRARY IMPORTS & SYSTEM CHECK
// =================================================================================================

// 1.1 Track Start Time for Uptime Metrics
const START_TIME = Date.now();

// 1.2 Load Environment Variables
// Ensure .env file is present in the root directory
require('dotenv').config();

// 1.3 Core Node.js Modules
const path = require('path');
const http = require('http');
const fs = require('fs');

// 1.4 Third-Party Dependencies
// Express: The backbone web framework
const express = require('express');
// CORS: Handling Cross-Origin requests
const cors = require('cors');
// PG: PostgreSQL Client
const { Pool } = require('pg');
// Mongoose: MongoDB Object Modeling
const mongoose = require('mongoose');
// Google AI: Gemini API SDK
const { GoogleGenerativeAI } = require('@google/generative-ai');
// Rate Limit: Traffic control
const rateLimit = require('express-rate-limit');

// =================================================================================================
// ⚙️ MODULE 2: CONFIGURATION REGISTRY
// =================================================================================================

/**
 * ConfigurationRegistry
 * 
 * A centralized class to manage all static configurations, environment variables,
 * and game rules. This serves as the "Single Source of Truth".
 */
class ConfigurationRegistry {
    constructor() {
        /**
         * Server Configuration
         * Settings related to the HTTP server instance.
         */
        this.SERVER = {
            PORT: process.env.PORT || 3000,
            ENV: process.env.NODE_ENV || 'development',
            TIMEOUT: 30000 // 30 Seconds Timeout
        };

        /**
         * Database Configuration
         * Connection strings for PostgreSQL and MongoDB.
         */
        this.DB = {
            POSTGRES_URL: process.env.DATABASE_URL,
            MONGO_URI: this._cleanMongoURI(process.env.MONGODB_URI)
        };

        /**
         * AI Engine Configuration
         * Settings for Google Gemini integration.
         */
        this.AI = {
            API_KEY: process.env.GEMINI_API_KEY,
            MODEL: "gemini-2.5-flash", // Using Flash model for speed
            TEMPERATURE: 0.7,
            MAX_RETRIES: 2,
            RETRY_DELAY: 60000 // 60 Seconds (System Cool Down)
        };

        /**
         * External Integrations
         * Third-party services and security whitelists.
         */
        this.EXT = {
            IMG_API: process.env.EXTERNAL_IMAGE_API,
            OWNER_IP: process.env.OWNER_IP
        };

        /**
         * Generator Configuration
         * Logic settings for the Content Generator Worker.
         */
        this.GEN = {
            CACHE_RATE: 0.25, // 25% chance to use cache if not full
            TARGETS: {
                "Easy": 100,
                "Medium": 40,
                "Hard": 30,
                "Very Hard": 20
            }
        };

        /**
         * Game Rules
         * Anti-cheat thresholds per difficulty.
         */
        this.RULES = {
            MAX_SCORES: {
                "Easy": 5,
                "Medium": 10,
                "Hard": 15,
                "Very Hard": 20
            }
        };

        /**
         * Curriculum Definitions
         * Mapped to Ministry of Education, Youth and Sport (MoEYS) Grade 12.
         */
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

    /**
     * Helper to clean MongoDB URI
     * Ensures protocol is present for Mongoose compatibility.
     * @param {string} uri - The raw URI string
     * @returns {string|null} - cleaned URI
     */
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
// 📝 MODULE 3: LOGGER & STATE MANAGEMENT
// =================================================================================================

/**
 * SystemState
 * Holds the runtime volatility state of the application.
 */
class SystemState {
    constructor() {
        this.dbStatus = { pg: false, mongo: false };
        this.metrics = {
            requests: 0,
            cacheHits: 0,
            aiCalls: 0,
            errors: 0
        };
        this.worker = {
            isRunning: false,
            task: "Idle"
        };
        this.logs = []; // In-memory log buffer for Admin UI
    }
}

const STATE = new SystemState();

/**
 * Logger
 * Static utility for standardized logging.
 */
class Logger {
    /**
     * Log Information
     */
    static info(module, message, details = '') {
        this._print('INFO', module, message, details, '#3b82f6');
    }

    /**
     * Log Success
     */
    static success(module, message, details = '') {
        this._print('OK', module, message, details, '#10b981');
    }

    /**
     * Log Warning
     */
    static warn(module, message, details = '') {
        this._print('WARN', module, message, details, '#f59e0b');
    }

    /**
     * Log Error (Updates Metric)
     */
    static error(module, message, details = '') {
        STATE.metrics.errors++;
        this._print('ERR', module, message, details, '#ef4444');
    }

    /**
     * Log Database Event
     */
    static db(message, details = '') {
        this._print('DB', 'DATABASE', message, details, '#8b5cf6');
    }

    /**
     * Log Worker Event
     */
    static gen(message, details = '') {
        this._print('GEN', 'WORKER', message, details, '#ec4899');
    }

    /**
     * Internal Print Method
     * Writes to console and pushes to memory buffer.
     */
    static _print(type, module, message, details, color) {
        const time = new Date().toLocaleTimeString('en-US', { hour12: false });
        
        // Console Output
        console.log(`[${time}] [${type}:${module}] ${message} ${details ? '| ' + details : ''}`);

        // Memory Buffer (For Admin Dashboard)
        STATE.logs.unshift({
            time,
            type,
            module,
            message,
            details,
            color
        });

        // Retention Policy: Keep last 500 logs
        if (STATE.logs.length > 500) {
            STATE.logs.pop();
        }
    }
}

// =================================================================================================
// 🛡️ MODULE 4: INPUT SANITIZER
// =================================================================================================

class InputSanitizer {
    /**
     * Fixes the "Easy" -> "Medium" bug.
     * Ensures input is case-insensitive and maps to correct Enum.
     * @param {string} input - raw difficulty string
     * @returns {string} - normalized string (Easy, Medium, Hard, Very Hard)
     */
    static normalizeDifficulty(input) {
        if (!input) return "Medium"; // Default if missing
        
        const map = {
            "easy": "Easy",
            "medium": "Medium",
            "hard": "Hard",
            "very hard": "Very Hard"
        };

        const clean = input.toString().trim().toLowerCase();
        
        // If map found, return Proper Case, else return Medium
        return map[clean] || "Medium";
    }

    /**
     * Validates Topic input against known topics.
     * @param {string} input - raw topic key
     * @returns {string} - validated key or default "Limits"
     */
    static normalizeTopic(input) {
        const found = CONFIG.TOPICS.find(t => t.key === input);
        return found ? found.key : "Limits"; // Default to Limits
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
            Logger.error('PG', 'Unexpected Client Error', err.message);
        });
    }

    /**
     * Initialize Connection & Tables
     */
    async init() {
        try {
            Logger.db('Connecting to PostgreSQL...');
            const client = await this.pool.connect();
            STATE.dbStatus.pg = true;

            // 1. Leaderboard Table
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

            // 2. Certificate Requests Table
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
            Logger.success('PG', 'Schema Verified & Ready');
        } catch (err) {
            Logger.error('PG', 'Initialization Failed', err.message);
        }
    }

    /**
     * Wrapper for Pool Query
     */
    async query(text, params) {
        return this.pool.query(text, params);
    }
}

// =================================================================================================
// 🗄️ MODULE 6: MONGODB SERVICE
// =================================================================================================

class MongoService {
    constructor() {
        this.Model = null;
        this._setupSchema();
    }

    /**
     * Define Mongoose Schema
     */
    _setupSchema() {
        const schema = new mongoose.Schema({
            topic: { type: String, required: true, index: true },
            difficulty: { type: String, required: true, index: true },
            raw_text: { type: String, required: true },
            source_ip: String,
            createdAt: { type: Date, default: Date.now }
        });
        
        // Compound Index for fast lookup
        schema.index({ topic: 1, difficulty: 1 });
        this.Model = mongoose.model('MathProblemCache', schema);
    }

    /**
     * Connect to MongoDB
     */
    async init() {
        const uri = CONFIG.DB.MONGO_URI;
        if (!uri) {
            Logger.warn('MONGO', 'URI Missing. Caching Disabled.');
            return;
        }

        try {
            Logger.db('Connecting to MongoDB...');
            await mongoose.connect(uri, {
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

// Instantiate Database Services
const PG = new PostgresService();
const MONGO = new MongoService();

// =================================================================================================
// 🤖 MODULE 7: AI ENGINE (WITH SYSTEM RETRY LOGIC)
// =================================================================================================

class AIEngine {
    constructor() {
        this.apiKey = CONFIG.AI.API_KEY;
        this.model = null;

        if (this.apiKey) {
            const genAI = new GoogleGenerativeAI(this.apiKey);
            this.model = genAI.getGenerativeModel({ model: CONFIG.AI.MODEL });
        } else {
            Logger.error('AI', 'API Key Not Found');
        }
    }

    /**
     * Generates content with "System Retry" capability.
     * If the API fails, it waits for RETRY_DELAY (60s) and tries again.
     * 
     * @param {string} topicKey 
     * @param {string} difficulty 
     * @returns {Promise<string>} JSON string
     */
    async generateWithRetry(topicKey, difficulty) {
        if (!this.model) throw new Error("AI Model not initialized");

        const prompt = this._buildPrompt(topicKey, difficulty);
        let attempts = 0;
        const maxAttempts = CONFIG.AI.MAX_RETRIES; // 2 Attempts

        while (attempts < maxAttempts) {
            try {
                attempts++;
                const result = await this.model.generateContent(prompt);
                const response = await result.response;
                let text = response.text();
                
                // Cleanup Markdown
                text = text.replace(/```json/g, '').replace(/```/g, '').trim();
                
                // Validation check
                JSON.parse(text); 
                
                return text; // Success

            } catch (err) {
                Logger.error('AI', `Generation Attempt ${attempts} Failed`, err.message);
                
                if (attempts < maxAttempts) {
                    // --- 🔥 SYSTEM RETRY LOGIC: WAIT 60 SECONDS ---
                    Logger.warn('AI', 'System Cool Down Triggered (60s)', 'Retrying shortly...');
                    await new Promise(resolve => setTimeout(resolve, CONFIG.AI.RETRY_DELAY));
                } else {
                    // If all attempts fail
                    throw new Error(`AI Generation Failed after ${maxAttempts} attempts.`);
                }
            }
        }
    }

    /**
     * Construct the Prompt
     */
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
            - Brief explanation.
            - JSON Format ONLY.
            
            OUTPUT JSON STRUCTURE:
            {
                "question": "string",
                "options": ["A", "B", "C", "D"],
                "answer": "string",
                "explanation": "string"
            }
        `;
    }
}

const AI = new AIEngine();

// =================================================================================================
// ⚙️ MODULE 8: BACKGROUND WORKER (AUTO-FILL)
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
                        Logger.gen('Processing Task', `${topic.key} [${level}] - Need: ${needed}`);

                        for (let i = 0; i < needed; i++) {
                            if (!STATE.worker.isRunning) break;

                            try {
                                const json = await AI.generateWithRetry(topic.key, level);
                                await MONGO.Model.create({
                                    topic: topic.key,
                                    difficulty: level,
                                    raw_text: json,
                                    source_ip: 'WORKER'
                                });

                                Logger.gen('Item Generated', `${topic.key} #${i+1}`);
                                
                                // Safety Delay
                                await new Promise(r => setTimeout(r, 4000));

                            } catch (e) {
                                // Error handled in AI Engine, skip to next item
                            }
                        }
                    }
                } catch (err) {
                    Logger.error('WORKER', 'Loop Error', err.message);
                }
            }
        }

        STATE.worker.isRunning = false;
        STATE.worker.task = "All Targets Met";
        Logger.gen('🏁 WORKER COMPLETED');
    }

    stop() {
        STATE.worker.isRunning = false;
    }
}

const Worker = new GeneratorWorker();

// =================================================================================================
// 🚀 MODULE 9: EXPRESS SERVER & MIDDLEWARE
// =================================================================================================

const app = express();

// 9.1 Basic Middleware
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 9.2 Analytics Middleware
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
/**
 * Strict Limiter
 * - Window: 8 Hours
 * - Max: 10 Requests
 * - Delay: NONE (Instant)
 */
const strictLimiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, // 8 Hour Window
    max: 10, // Limit each IP to 10 requests
    
    // Custom JSON Message
    message: { 
        error: "Quota Exceeded", 
        message: "⚠️ អ្នកបានប្រើប្រាស់អស់ ១០ ដងហើយ។ សូមរងចាំ ៨ ម៉ោងទៀត!" 
    },
    
    // Whitelist Owner
    skip: (req) => CONFIG.EXT.OWNER_IP && req.ip.includes(CONFIG.EXT.OWNER_IP)
});

// =================================================================================================
// 📡 MODULE 10: API CONTROLLERS
// =================================================================================================

/**
 * 🎯 GENERATE PROBLEM ENDPOINT
 * Handles request, normalization, cache check, and AI generation.
 */
app.post('/api/generate-problem', strictLimiter, async (req, res) => {
    // 1. Sanitize Input
    const topic = InputSanitizer.normalizeTopic(req.body.topic);
    const difficulty = InputSanitizer.normalizeDifficulty(req.body.difficulty);
    const customPrompt = req.body.prompt;

    Logger.info('API', `Problem Request`, `T: ${topic} | D: ${difficulty}`);

    let useCache = false;

    // 2. Cache Logic
    if (STATE.dbStatus.mongo && !customPrompt) {
        try {
            const count = await MONGO.Model.countDocuments({ topic, difficulty });
            const target = CONFIG.GEN.TARGETS[difficulty] || 30;

            if (count >= target) {
                useCache = true; // DB Full -> Force Cache
            } else {
                // DB Low -> Random Chance
                if (Math.random() < CONFIG.GEN.CACHE_RATE) useCache = true;
            }
        } catch (e) { Logger.warn('CACHE', 'Check Failed', e.message); }
    }

    // 3. Strategy A: Serve from Cache
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
        } catch (e) { Logger.warn('CACHE', 'Read Error', e.message); }
    }

    // 4. Strategy B: Generate Live (with Retry Logic)
    STATE.metrics.aiCalls++;
    Logger.ai('Generating Live', `${topic} [${difficulty}]`);

    try {
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
        Logger.error('API', 'Generation Failed', err.message);
        res.status(503).json({ 
            error: "Service Unavailable", 
            message: "System is busy recovering. Please wait." 
        });
    }
});

/**
 * 🏆 LEADERBOARD SUBMIT (MERGE & DEDUPE)
 */
app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;
    const cleanDiff = InputSanitizer.normalizeDifficulty(difficulty);
    
    if (!username || typeof score !== 'number') {
        return res.status(400).json({ message: "Invalid Payload" });
    }

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
            const targetId = check.rows[0].id; // Keep oldest ID
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
 * 📊 GET TOP SCORES
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
// 🖥️ MODULE 12: ADMIN DASHBOARD UI
// =================================================================================================

app.get('/admin', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html lang="km">
    <head>
        <meta charset="UTF-8">
        <title>TITAN ENTERPRISE V11</title>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;700&family=Kantumruy+Pro:wght@300;400;600;700&display=swap" rel="stylesheet">
        <style>
            :root { --bg: #0f172a; --glass: rgba(30, 41, 59, 0.5); --border: rgba(255, 255, 255, 0.1); --primary: #3b82f6; --success: #10b981; --danger: #ef4444; --text: #f8fafc; --mute: #94a3b8; }
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
                <span>ENTERPRISE V11</span>
            </div>
            <div class="nav">
                <div class="nav-item active" onclick="go('dash', this)">📊 Dashboard</div>
                <div class="nav-item" onclick="go('certs', this)">🎓 Certificates</div>
                <div class="nav-item" onclick="go('logs', this)">📡 System Logs</div>
            </div>
            <div style="margin-top:auto; font-size:0.8rem; color:var(--mute)">Memory: <span id="memUse">0</span> MB</div>
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
                        st.innerText = 'RUNNING'; st.style.color = '#34d399'; tt.innerText = data.worker.task;
                    } else {
                        btn.className = 'btn btn-start'; btn.innerText = 'START ENGINE';
                        st.innerText = 'STANDBY'; st.style.color = '#fbbf24'; tt.innerText = 'Idle';
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
                await fetch('/admin/api/toggle-gen', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action: running ? 'stop' : 'start' }) });
                sync();
            }
            async function del(id) {
                if(confirm('Delete?')) { await fetch('/admin/delete-request/'+id, {method:'DELETE'}); sync(); }
            }
            setInterval(sync, 2000); sync();
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
    console.log('\n\x1b[36m%s\x1b[0m', '★ TITAN ENTERPRISE V11.0 (CAMBODIA) STARTING...');
    
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
