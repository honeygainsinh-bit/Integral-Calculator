/**
 * =================================================================================================
 *  __  __    _  _____  _   _   ____   _____  ___   _   _   ____   _      _____  __  __ 
 * |  \/  |  / \|_   _|| | | | |  _ \ | ____|/ _ \ | \ | | |  _ \ | |    | ____||  \/  |
 * | |\/| | / _ \ | |  | |_| | | |_) ||  _| | | | ||  \| | | |_) || |    |  _|  | |\/| |
 * | |  | |/ ___ \| |  |  _  | |  __/ | |___| |_| || |\  | |  __/ | |___ | |___ | |  | |
 * |_|  |_/_/   \_\_|  |_| |_| |_|    |_____|\___/ |_| \_| |_|    |_____||_____||_|  |_|
 * 
 * =================================================================================================
 * PROJECT:           BRAINTEST - TITAN ENTERPRISE BACKEND
 * VERSION:           9.0.0 (CAMBODIA EDITION)
 * CODENAME:          "ANGKOR WAT"
 * ARCHITECTURE:      MONOLITHIC NODE.JS WITH HYBRID PERSISTENCE LAYER
 * AUTHOR:            BRAINTEST ENGINEERING TEAM
 * CREATED:           DECEMBER 2025
 * 
 * █ SYSTEM CAPABILITIES:
 * 1. DUAL DATABASE ORCHESTRATION (PostgreSQL + MongoDB)
 * 2. ARTIFICIAL INTELLIGENCE PIPELINE (Google Gemini V2)
 * 3. ADVANCED RATE LIMITING & SECURITY SHIELD
 * 4. REAL-TIME ADMIN DASHBOARD (Server-Side Rendered)
 * 5. AUTOMATED CONTENT GENERATION WORKER
 * 
 * █ CHANGELOG (V9.0.0):
 * - [CRITICAL] Fixed Difficulty Normalization (Easy inputs forcing Medium).
 * - [UPDATE] Curriculum Alignment with MoEYS Grade 12 (New Topics Added).
 * - [REMOVED] Deprecated Modules (Matrices, Logic).
 * - [UI] Overhauled Admin Dashboard with Glassmorphism V3.
 * =================================================================================================
 */

// =================================================================================================
// 📚 MODULE IMPORTS
// =================================================================================================

// Core Node.js Modules
const path = require('path');
const http = require('http');
const fs = require('fs');

// Third-Party Dependencies
require('dotenv').config(); // Environment Variables
const express = require('express'); // Web Framework
const cors = require('cors'); // Cross-Origin Resource Sharing
const { Pool } = require('pg'); // PostgreSQL Client
const mongoose = require('mongoose'); // MongoDB ODM
const { GoogleGenerativeAI } = require('@google/generative-ai'); // AI SDK
const rateLimit = require('express-rate-limit'); // Security

// =================================================================================================
// ⚙️ GLOBAL CONFIGURATION REGISTRY
// =================================================================================================

/**
 * The CONFIG object serves as the single source of truth for all system parameters.
 * Modify these values to tune the server's behavior without touching the logic.
 */
class ConfigurationRegistry {
    constructor() {
        this.SERVER = {
            PORT: process.env.PORT || 3000,
            ENV: process.env.NODE_ENV || 'development',
            TIMEOUT: 30000 // 30 Seconds
        };

        this.DATABASES = {
            POSTGRES_URL: process.env.DATABASE_URL,
            MONGO_URI: this._cleanMongoURI(process.env.MONGODB_URI)
        };

        this.AI = {
            API_KEY: process.env.GEMINI_API_KEY,
            MODEL_NAME: "gemini-2.5-flash", // Using Flash for lower latency
            MAX_RETRIES: 3,
            RETRY_DELAY: 60000 // 60 Seconds
        };

        this.SECURITY = {
            OWNER_IP: process.env.OWNER_IP,
            RATE_LIMIT_WINDOW: 8 * 60 * 60 * 1000, // 8 Hours
            MAX_REQUESTS: 100
        };

        this.GENERATOR = {
            CACHE_PROBABILITY: 0.25, // 25% Chance to use Cache if DB is not full
            TARGETS: {
                "Easy": 60,
                "Medium": 40,
                "Hard": 30,
                "Very Hard": 20
            }
        };

        this.GAME_RULES = {
            MAX_SCORES: {
                "Easy": 5,
                "Medium": 10,
                "Hard": 15,
                "Very Hard": 20
            }
        };

        // 🏫 CURRICULUM DEFINITIONS (Updated for Grade 12)
        this.TOPICS = [
            { 
                key: "Limits", 
                label: "លីមីត (Limits)", 
                description: "Calculus Limits: Indeterminate forms (0/0, infinity/infinity), L'Hopital's rule, limits at infinity, and trigonometric limits." 
            },
            { 
                key: "Continuity", 
                label: "ភាពជាប់ (Continuity)", 
                description: "Calculus Continuity: Function continuity at a point, continuity on an interval, finding constants to make a function continuous." 
            },
            { 
                key: "Derivatives", 
                label: "ដេរីវេ (Derivatives)", 
                description: "Calculus Derivatives: Power rule, Product/Quotient rules, Chain rule, Derivatives of exponential/logarithmic functions, and Tangent lines." 
            },
            { 
                key: "StudyFunc", 
                label: "សិក្សាអនុគមន៍ (Functions)", 
                description: "Function Analysis: Domain of definition, Vertical/Horizontal/Oblique Asymptotes, Variations (Increasing/Decreasing), and Graph interpretation." 
            },
            { 
                key: "Integrals", 
                label: "អាំងតេក្រាល (Integrals)", 
                description: "Calculus Integrals: Antiderivatives, Definite integrals, Integration by substitution, Integration by parts, and Area under a curve." 
            },
            { 
                key: "DiffEq", 
                label: "សមីការឌីផេរ៉ង់ស្យែល", 
                description: "Differential Equations: First-order linear equations, Second-order linear homogeneous equations with constant coefficients." 
            },
            { 
                key: "Probability", 
                label: "ប្រូបាប (Probability)", 
                description: "Probability & Statistics: Counting principles, Permutations, Combinations, Probability of events, and Conditional probability." 
            },
            { 
                key: "Complex", 
                label: "ចំនួនកុំផ្លិច (Complex)", 
                description: "Complex Numbers: Arithmetic operations, Conjugate, Modulus, Argument, Polar form, and Solving quadratic equations with complex roots." 
            },
            { 
                key: "Vectors", 
                label: "វ៉ិចទ័រ (Vectors)", 
                description: "3D Geometry (Space): Vectors, Scalar (Dot) product, Vector (Cross) product, Equations of Lines and Planes in space." 
            },
            { 
                key: "Conics", 
                label: "កោនិក (Conics)", 
                description: "Conic Sections: Standard equations, Vertices, Foci, and Directrix of Parabolas, Ellipses, and Hyperbolas." 
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
// 🛡️ UTILITY CLASSES
// =================================================================================================

/**
 * Logger Service
 * Handles console output and in-memory log retention for the dashboard.
 */
class LoggerService {
    constructor() {
        this.logs = [];
        this.maxLogs = 500;
    }

    info(module, message, details = '') {
        this._write('INFO', module, message, details, 'ℹ️');
    }

    success(module, message, details = '') {
        this._write('OK', module, message, details, '✅');
    }

    warn(module, message, details = '') {
        this._write('WARN', module, message, details, '⚠️');
    }

    error(module, message, details = '') {
        this._write('ERR', module, message, details, '❌');
    }

    db(message, details = '') {
        this._write('DB', 'DATABASE', message, details, '🗄️');
    }

    ai(message, details = '') {
        this._write('AI', 'GEMINI', message, details, '🤖');
    }

    gen(message, details = '') {
        this._write('GEN', 'WORKER', message, details, '⚙️');
    }

    _write(type, module, message, details, icon) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
        
        // Console Output
        console.log(`[${timeStr}] ${icon} [${type}:${module}] ${message} ${details ? '| ' + details : ''}`);

        // Memory Storage
        this.logs.unshift({
            timestamp: timeStr,
            type: type,
            module: module,
            message: message,
            details: details
        });

        // Retention Policy
        if (this.logs.length > this.maxLogs) {
            this.logs.pop();
        }
    }

    getLogs() {
        return this.logs;
    }
}

const Logger = new LoggerService();

/**
 * Input Sanitizer
 * Dedicated class to clean and validate user inputs.
 * Specifically fixes the "Easy" -> "Medium" bug.
 */
class InputSanitizer {
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
        // Default to Limits if invalid or missing
        if (!input) return "Limits";
        
        const validKey = CONFIG.TOPICS.find(t => t.key === input);
        return validKey ? validKey.key : "Limits";
    }

    static validateUsername(username) {
        if (!username) return "Anonymous";
        return username.replace(/[^a-zA-Z0-9\s_]/g, '').substring(0, 50);
    }
}

// =================================================================================================
// 🗄️ DATABASE MANAGERS
// =================================================================================================

/**
 * PostgreSQL Manager
 * Handles connection pooling, query execution, and schema initialization.
 */
class PostgresManager {
    constructor() {
        this.pool = new Pool({
            connectionString: CONFIG.DATABASES.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 5000,
            max: 20
        });

        this.pool.on('error', (err) => {
            Logger.error('POSTGRES', 'Unexpected Client Error', err.message);
        });

        this.isConnected = false;
    }

    async connect() {
        try {
            Logger.db('Connecting to PostgreSQL...');
            const client = await this.pool.connect();
            this.isConnected = true;
            
            await this._initSchema(client);
            
            client.release();
            Logger.success('POSTGRES', 'Connection Established & Schema Verified');
        } catch (err) {
            Logger.error('POSTGRES', 'Initialization Failed', err.message);
        }
    }

    async _initSchema(client) {
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

        // Table: Certificate Requests
        await client.query(`
            CREATE TABLE IF NOT EXISTS certificate_requests (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) NOT NULL,
                score INTEGER NOT NULL,
                status VARCHAR(20) DEFAULT 'Pending',
                request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
    }

    async query(text, params) {
        return this.pool.query(text, params);
    }
}

/**
 * MongoDB Manager
 * Handles Mongoose connection and Schema models.
 */
class MongoManager {
    constructor() {
        this.uri = CONFIG.DATABASES.MONGO_URI;
        this.isConnected = false;
        this.Model = null;
        this._defineSchema();
    }

    _defineSchema() {
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

    async connect() {
        if (!this.uri) {
            Logger.warn('MONGO', 'No URI provided. Caching disabled.');
            return;
        }

        try {
            Logger.db('Connecting to MongoDB...');
            await mongoose.connect(this.uri, {
                serverSelectionTimeoutMS: 5000,
                family: 4
            });
            
            this.isConnected = true;
            Logger.success('MONGO', 'Connection Established');

            mongoose.connection.on('disconnected', () => {
                this.isConnected = false;
                Logger.warn('MONGO', 'Disconnected');
            });

        } catch (err) {
            Logger.error('MONGO', 'Connection Failed', err.message);
        }
    }
}

// Instantiate Managers
const PG = new PostgresManager();
const MONGO = new MongoManager();

// =================================================================================================
// 🤖 AI ENGINE (GEMINI INTEGRATION)
// =================================================================================================

class AIEngine {
    constructor() {
        this.apiKey = CONFIG.AI.API_KEY;
        this.modelName = CONFIG.AI.MODEL_NAME;
        this.genAI = null;
        this.model = null;

        if (this.apiKey) {
            this.genAI = new GoogleGenerativeAI(this.apiKey);
            this.model = this.genAI.getGenerativeModel({ model: this.modelName });
        } else {
            Logger.error('AI', 'API Key Missing');
        }
    }

    /**
     * Generates a math problem based on topic and difficulty.
     */
    async generateProblem(topicKey, difficulty) {
        if (!this.model) throw new Error("AI Model not initialized");

        // 1. Context Lookup
        const topicInfo = CONFIG.TOPICS.find(t => t.key === topicKey);
        const description = topicInfo ? topicInfo.description : topicKey;

        // 2. Prompt Engineering
        const prompt = `
            ACT AS: A Senior High School Math Teacher.
            TASK: Create 1 unique multiple-choice math problem.
            CONTEXT: Grade 12 Advanced Mathematics (Cambodia Curriculum).
            TOPIC: "${description}"
            DIFFICULTY: "${difficulty}"

            INSTRUCTIONS:
            1. The problem must be mathematically sound.
            2. Provide 4 distinct options (A, B, C, D).
            3. Include a clear explanation.
            4. Use LaTeX format for mathematical formulas (e.g. \\frac{a}{b}).

            OUTPUT FORMAT:
            Return ONLY a raw JSON object (no markdown, no backticks).
            {
                "question": "string (LaTeX supported)",
                "options": ["string", "string", "string", "string"],
                "answer": "string (The correct option value)",
                "explanation": "string"
            }
        `;

        // 3. Execution
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();

        // 4. Sanitization
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        // 5. Validation
        try {
            JSON.parse(text); // Ensure valid JSON
            return text;
        } catch (e) {
            throw new Error("AI returned invalid JSON: " + text.substring(0, 50));
        }
    }
}

const AI = new AIEngine();

// =================================================================================================
// ⚙️ BACKGROUND WORKER (AUTO-GENERATOR)
// =================================================================================================

class ContentGeneratorWorker {
    constructor() {
        this.isRunning = false;
        this.currentTask = "Idle";
        this.generatedCount = 0;
    }

    async start() {
        if (this.isRunning) return;
        if (!MONGO.isConnected) {
            Logger.error('WORKER', 'Cannot start. MongoDB is offline.');
            return;
        }

        this.isRunning = true;
        Logger.gen('Starting Auto-Generation Sequence...');

        // Outer Loop: Topics
        for (const topic of CONFIG.TOPICS) {
            // Inner Loop: Difficulties
            for (const [level, target] of Object.entries(CONFIG.GENERATOR.TARGETS)) {
                
                // Check Stop Signal
                if (!this.isRunning) {
                    Logger.gen('Stopped by User');
                    this.currentTask = "Stopped";
                    return;
                }

                try {
                    // Check Stock
                    const count = await MONGO.Model.countDocuments({ 
                        topic: topic.key, 
                        difficulty: level 
                    });

                    if (count >= target) continue; // Skip if full

                    const needed = target - count;
                    this.currentTask = `Filling ${topic.label} [${level}] (${count}/${target})`;
                    Logger.gen('Processing Task', `${topic.key} - ${level} - Need: ${needed}`);

                    // Generation Loop
                    for (let i = 0; i < needed; i++) {
                        if (!this.isRunning) break;

                        try {
                            const problemJSON = await AI.generateProblem(topic.key, level);

                            await MONGO.Model.create({
                                topic: topic.key,
                                difficulty: level,
                                raw_text: problemJSON,
                                source_ip: 'AUTO-WORKER'
                            });

                            this.generatedCount++;
                            Logger.gen('Item Created', `${topic.key} #${i+1}`);

                            // Rate Limit Protection (Wait 4s)
                            await new Promise(resolve => setTimeout(resolve, 4000));

                        } catch (err) {
                            Logger.error('WORKER', 'Generation Failed', err.message);
                            // Cooldown 60s
                            Logger.gen('Cooling down (60s)...');
                            await new Promise(resolve => setTimeout(resolve, 60000));
                        }
                    }

                } catch (err) {
                    Logger.error('WORKER', 'Logic Error', err.message);
                }
            }
        }

        this.isRunning = false;
        this.currentTask = "All Targets Met";
        Logger.gen('Sequence Completed');
    }

    stop() {
        this.isRunning = false;
    }

    getStatus() {
        return {
            running: this.isRunning,
            task: this.currentTask,
            generated: this.generatedCount
        };
    }
}

const Worker = new ContentGeneratorWorker();

// =================================================================================================
// 🚀 EXPRESS SERVER & MIDDLEWARE
// =================================================================================================

const app = express();

// 1. Basic Middleware
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 2. System Analytics Middleware
app.use((req, res, next) => {
    // Log API requests only
    if (req.path.startsWith('/api') || req.path.startsWith('/admin')) {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        Logger.info('NET', `${req.method} ${req.path}`, `IP: ${ip}`);
    }
    next();
});

// 3. Security: Rate Limiters
const limiterQuota = rateLimit({
    windowMs: CONFIG.SECURITY.RATE_LIMIT_WINDOW,
    max: 100, // Adjusted for usability
    message: { error: "Quota Exceeded", message: "You have reached the daily limit." },
    skip: (req) => CONFIG.SECURITY.OWNER_IP && req.ip.includes(CONFIG.SECURITY.OWNER_IP)
});

const limiterSpeed = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 Hour
    max: 50,
    message: { error: "Speed Limit", message: "Please slow down." },
    skip: (req) => CONFIG.SECURITY.OWNER_IP && req.ip.includes(CONFIG.SECURITY.OWNER_IP)
});

// =================================================================================================
// 📡 API ENDPOINTS (CONTROLLERS)
// =================================================================================================

/**
 * 🎯 POST /api/generate-problem
 * The core logic for serving math problems.
 * Implements the "Hybrid V8" logic (Cache vs AI).
 */
app.post('/api/generate-problem', limiterQuota, limiterSpeed, async (req, res) => {
    try {
        // A. Input Sanitization (THE FIX)
        const topic = InputSanitizer.normalizeTopic(req.body.topic);
        const difficulty = InputSanitizer.normalizeDifficulty(req.body.difficulty);
        const promptOverride = req.body.prompt;

        // B. Database Check (Hybrid Logic)
        let useCache = false;

        if (MONGO.isConnected && !promptOverride) {
            const count = await MONGO.Model.countDocuments({ topic, difficulty });
            const target = CONFIG.GENERATOR.TARGETS[difficulty] || 30;

            if (count >= target) {
                useCache = true; // Database is full -> Use Cache
            } else {
                // Database not full -> Random chance based on CONFIG
                if (Math.random() < CONFIG.GENERATOR.CACHE_PROBABILITY) {
                    useCache = true;
                }
            }
        }

        // C. Strategy 1: Fetch from Cache
        if (useCache && MONGO.isConnected) {
            const cachedDocs = await MONGO.Model.aggregate([
                { $match: { topic, difficulty } },
                { $sample: { size: 1 } }
            ]);

            if (cachedDocs.length > 0) {
                Logger.info('API', `Served from Cache`, `${topic} [${difficulty}]`);
                return res.json({
                    text: cachedDocs[0].raw_text,
                    source: "cache",
                    metadata: { topic, difficulty, id: cachedDocs[0]._id }
                });
            }
        }

        // D. Strategy 2: Generate Live with AI
        Logger.ai(`Generating Live Problem`, `${topic} [${difficulty}]`);
        const aiText = await AI.generateProblem(topic, difficulty);

        // Save to DB for future use
        if (MONGO.isConnected) {
            MONGO.Model.create({
                topic,
                difficulty,
                raw_text: aiText,
                source_ip: req.ip
            }).catch(e => Logger.warn('CACHE', 'Write Failed', e.message));
        }

        res.json({
            text: aiText,
            source: "ai",
            metadata: { topic, difficulty }
        });

    } catch (err) {
        Logger.error('API', 'Generation Error', err.message);
        res.status(500).json({ error: "Service Error", message: err.message });
    }
});

/**
 * 🏆 POST /api/leaderboard/submit
 * Handles score submission with V7 Logic (Merge & Deduplicate).
 */
app.post('/api/leaderboard/submit', async (req, res) => {
    const username = InputSanitizer.validateUsername(req.body.username);
    const score = parseInt(req.body.score);
    const difficulty = InputSanitizer.normalizeDifficulty(req.body.difficulty);

    if (isNaN(score)) return res.status(400).json({ message: "Invalid Score" });

    try {
        // Anti-Cheat Check
        const maxScore = CONFIG.GAME_RULES.MAX_SCORES[difficulty] || 100;
        if (score > maxScore) {
            Logger.warn('SEC', 'Score Rejected', `User: ${username}, Score: ${score}, Diff: ${difficulty}`);
            return res.status(403).json({ message: "Score rejected by Anti-Cheat system." });
        }

        // Database Transaction
        if (PG.isConnected) {
            const check = await PG.query(
                'SELECT id, score FROM leaderboard WHERE username = $1 AND difficulty = $2 ORDER BY id ASC',
                [username, difficulty]
            );

            if (check.rows.length > 0) {
                // Logic: Merge scores
                const targetId = check.rows[0].id;
                const currentTotal = check.rows.reduce((acc, row) => acc + row.score, 0);
                const newTotal = currentTotal + score;

                await PG.query('UPDATE leaderboard SET score = $1, updated_at = NOW() WHERE id = $2', [newTotal, targetId]);
                
                // Logic: Remove duplicates if any exist
                if (check.rows.length > 1) {
                    const idsToDelete = check.rows.slice(1).map(r => r.id);
                    await PG.query('DELETE FROM leaderboard WHERE id = ANY($1::int[])', [idsToDelete]);
                }
                
                Logger.db('Score Merged', `${username}: ${newTotal}`);
            } else {
                // New Entry
                const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
                await PG.query(
                    'INSERT INTO leaderboard(username, score, difficulty, ip_address) VALUES($1, $2, $3, $4)',
                    [username, score, difficulty, ip]
                );
                Logger.db('New Highscore', `${username}: ${score}`);
            }
            res.json({ success: true });
        } else {
            res.status(503).json({ message: "Database Unavailable" });
        }

    } catch (err) {
        Logger.error('API', 'Leaderboard Error', err.message);
        res.status(500).json({ success: false });
    }
});

/**
 * 📊 GET /api/leaderboard/top
 * Retrieves aggregated global rankings.
 */
app.get('/api/leaderboard/top', async (req, res) => {
    if (!PG.isConnected) return res.json([]);
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
// 👑 ADMIN API & DASHBOARD BACKEND
// =================================================================================================

// 1. Certificate Management
app.post('/api/submit-request', async (req, res) => {
    const { username, score } = req.body;
    if (!PG.isConnected) return res.status(503).json({ success: false });
    
    try {
        await PG.query('INSERT INTO certificate_requests (username, score) VALUES ($1, $2)', [username, score]);
        Logger.info('ADMIN', 'Certificate Requested', username);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.delete('/admin/delete-request/:id', async (req, res) => {
    if (!PG.isConnected) return res.status(503).json({ success: false });
    try {
        await PG.query('DELETE FROM certificate_requests WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/admin/generate-cert/:id', async (req, res) => {
    if (!PG.isConnected) return res.send("DB Offline");
    try {
        const resDb = await PG.query('SELECT * FROM certificate_requests WHERE id = $1', [req.params.id]);
        if (resDb.rows.length === 0) return res.send("Not Found");

        const { username, score } = resDb.rows[0];
        const dateStr = new Date().toLocaleDateString('en-US');
        const msg = `Score: ${score}%0A%0ADate: ${dateStr}`;

        // Construct Image URL
        let url = process.env.EXTERNAL_IMAGE_API || 'https://via.placeholder.com/800?text=Certificate';
        if (process.env.EXTERNAL_IMAGE_API) {
            url += `&txt-align=center&txt-size=110&txt-color=FFD700&txt=${encodeURIComponent(username.toUpperCase())}&txt-fit=max&w=1800` +
                   `&mark-align=center&mark-size=35&mark-color=FFFFFF&mark-y=850&mark-txt=${encodeURIComponent(msg)}&mark-w=1600`;
        }

        res.redirect(url);
    } catch (e) { res.status(500).send("Error"); }
});

// 2. Data Aggregator for Dashboard
app.get('/admin/api/stats', async (req, res) => {
    let mongoStats = [];
    if (MONGO.isConnected) {
        mongoStats = await MONGO.Model.aggregate([
            { $group: { _id: { topic: "$topic", difficulty: "$difficulty" }, count: { $sum: 1 } } }
        ]);
    }

    let certs = [];
    if (PG.isConnected) {
        const resPg = await PG.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
        certs = resPg.rows;
    }

    res.json({
        stats: mongoStats,
        certRequests: certs,
        worker: Worker.getStatus(),
        targets: CONFIG.GENERATOR.TARGETS,
        topics: CONFIG.TOPICS,
        system: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            logs: Logger.getLogs()
        }
    });
});

// 3. Worker Control
app.post('/admin/api/toggle-gen', (req, res) => {
    const { action } = req.body;
    if (action === 'start') {
        Worker.start();
    } else {
        Worker.stop();
    }
    res.json(Worker.getStatus());
});

// =================================================================================================
// 🖥️ ADMIN DASHBOARD (SERVER-SIDE RENDERED HTML)
// =================================================================================================

app.get('/admin', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html lang="km">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BRAINTEST TITAN V9 | COMMAND CENTER</title>
        
        <!-- Fonts -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;700&family=Kantumruy+Pro:wght@300;400;600;700&display=swap" rel="stylesheet">
        
        <style>
            :root {
                --bg-main: #020617;
                --glass: rgba(30, 41, 59, 0.4);
                --glass-border: rgba(255, 255, 255, 0.08);
                --glass-hover: rgba(255, 255, 255, 0.05);
                --primary: #3b82f6;
                --success: #10b981;
                --danger: #ef4444;
                --warning: #f59e0b;
                --text-main: #f8fafc;
                --text-muted: #94a3b8;
                --font-main: 'Kantumruy Pro', sans-serif;
                --font-code: 'JetBrains Mono', monospace;
            }

            * { box-sizing: border-box; }

            body {
                margin: 0;
                padding: 0;
                background-color: var(--bg-main);
                background-image: 
                    radial-gradient(at 0% 0%, rgba(59, 130, 246, 0.15) 0px, transparent 50%),
                    radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.1) 0px, transparent 50%);
                color: var(--text-main);
                font-family: var(--font-main);
                min-height: 100vh;
                display: flex;
            }

            /* --- SIDEBAR --- */
            .sidebar {
                width: 280px;
                height: 100vh;
                background: rgba(15, 23, 42, 0.6);
                backdrop-filter: blur(20px);
                border-right: 1px solid var(--glass-border);
                position: fixed;
                padding: 30px;
                display: flex;
                flex-direction: column;
                z-index: 100;
            }

            .logo {
                margin-bottom: 40px;
                padding-bottom: 20px;
                border-bottom: 1px solid var(--glass-border);
            }
            .logo h1 {
                margin: 0;
                font-size: 1.5rem;
                font-weight: 800;
                letter-spacing: 2px;
                background: linear-gradient(to right, #3b82f6, #60a5fa);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }
            .logo span {
                font-family: var(--font-code);
                font-size: 0.7rem;
                color: var(--text-muted);
                display: block;
                margin-top: 5px;
            }

            .nav-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 14px 16px;
                color: var(--text-muted);
                text-decoration: none;
                border-radius: 12px;
                transition: all 0.3s ease;
                margin-bottom: 8px;
                cursor: pointer;
                border: 1px solid transparent;
            }
            .nav-item:hover {
                background: var(--glass-hover);
                color: var(--text-main);
            }
            .nav-item.active {
                background: rgba(59, 130, 246, 0.1);
                color: var(--primary);
                border-color: rgba(59, 130, 246, 0.2);
                box-shadow: 0 0 15px rgba(59, 130, 246, 0.1);
            }
            .nav-item svg { width: 20px; height: 20px; }

            /* --- MAIN CONTENT --- */
            .main {
                margin-left: 280px;
                flex: 1;
                padding: 40px;
                max-width: 1600px;
            }

            .header-bar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 40px;
            }
            .page-title { margin: 0; font-size: 1.8rem; font-weight: 700; }
            
            .live-indicator {
                display: flex;
                align-items: center;
                gap: 8px;
                background: rgba(16, 185, 129, 0.1);
                border: 1px solid rgba(16, 185, 129, 0.3);
                color: var(--success);
                padding: 6px 12px;
                border-radius: 20px;
                font-size: 0.8rem;
                font-weight: 600;
                font-family: var(--font-code);
            }
            .dot {
                width: 8px; height: 8px; background: currentColor;
                border-radius: 50%;
                animation: pulse 2s infinite;
            }
            @keyframes pulse { 0% {opacity: 1;} 50% {opacity: 0.4;} 100% {opacity: 1;} }

            /* --- CARDS --- */
            .grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 25px;
                margin-bottom: 40px;
            }

            .card {
                background: var(--glass);
                backdrop-filter: blur(12px);
                border: 1px solid var(--glass-border);
                border-radius: 20px;
                padding: 25px;
                position: relative;
                overflow: hidden;
            }

            .card-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }
            .card-title { margin: 0; font-size: 1.1rem; color: var(--text-main); }
            
            /* --- GENERATOR CONTROL --- */
            .status-box {
                text-align: center;
                padding: 20px;
                background: rgba(0,0,0,0.2);
                border-radius: 12px;
                margin-bottom: 20px;
            }
            .status-label { color: var(--text-muted); font-size: 0.9rem; }
            .status-value { font-size: 1.4rem; font-weight: 700; margin-top: 5px; color: var(--text-main); }
            
            .btn-large {
                width: 100%;
                padding: 18px;
                border: none;
                border-radius: 12px;
                font-family: var(--font-main);
                font-weight: 700;
                font-size: 1.1rem;
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .btn-start {
                background: linear-gradient(135deg, var(--success), #059669);
                color: white;
                box-shadow: 0 4px 20px rgba(16, 185, 129, 0.3);
            }
            .btn-stop {
                background: linear-gradient(135deg, var(--danger), #991b1b);
                color: white;
                box-shadow: 0 4px 20px rgba(239, 68, 68, 0.3);
            }
            .btn-large:active { transform: scale(0.98); }

            /* --- PROGRESS BARS --- */
            .topic-row {
                display: flex;
                align-items: center;
                margin-bottom: 12px;
                font-size: 0.9rem;
            }
            .diff-label { width: 80px; color: var(--text-muted); font-family: var(--font-code); font-size: 0.8rem; }
            .count-label { width: 60px; text-align: right; font-weight: bold; margin-right: 15px; }
            .bar-track {
                flex: 1;
                height: 6px;
                background: rgba(255,255,255,0.05);
                border-radius: 3px;
                overflow: hidden;
            }
            .bar-fill { height: 100%; background: var(--primary); transition: width 0.5s ease; }
            .bar-fill.full { background: var(--success); }

            /* --- TERMINAL --- */
            .terminal {
                background: #09090b;
                border: 1px solid #27272a;
                border-radius: 12px;
                height: 500px;
                overflow-y: auto;
                padding: 20px;
                font-family: var(--font-code);
                font-size: 0.85rem;
                box-shadow: inset 0 0 20px rgba(0,0,0,0.5);
            }
            .log-entry { margin-bottom: 6px; display: flex; gap: 10px; }
            .ts { color: #52525b; user-select: none; }
            .mod { font-weight: bold; width: 60px; }
            .msg { color: #e4e4e7; }
            .det { color: #71717a; font-style: italic; }

            /* --- TABLES --- */
            table { width: 100%; border-collapse: collapse; }
            th { text-align: left; color: var(--text-muted); padding: 10px; font-weight: 600; font-size: 0.85rem; }
            td { padding: 12px 10px; border-bottom: 1px solid var(--glass-border); font-size: 0.9rem; }
            .badge { padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
            .badge-blue { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
            
            /* --- TABS SYSTEM --- */
            .tab-content { display: none; animation: fadeIn 0.4s ease; }
            .tab-content.active { display: block; }
            @keyframes fadeIn { from {opacity:0; transform:translateY(10px);} to {opacity:1; transform:translateY(0);} }

        </style>
    </head>
    <body>

        <!-- SIDEBAR -->
        <nav class="sidebar">
            <div class="logo">
                <h1>TITAN</h1>
                <span>ENTERPRISE V9.0.0</span>
            </div>
            
            <div class="nav-item active" onclick="setTab('dashboard', this)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                <span>Dashboard</span>
            </div>
            <div class="nav-item" onclick="setTab('certs', this)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
                <span>Certificates</span>
            </div>
            <div class="nav-item" onclick="setTab('logs', this)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
                <span>System Logs</span>
            </div>

            <div style="margin-top: auto; padding-top: 20px; border-top: 1px solid var(--glass-border);">
                 <a href="/" style="color: var(--text-muted); text-decoration: none; font-size: 0.9rem;">← Return to App</a>
            </div>
        </nav>

        <!-- MAIN -->
        <main class="main">
            
            <!-- HEADER -->
            <div class="header-bar">
                <h2 class="page-title">Command Center</h2>
                <div class="live-indicator"><div class="dot"></div> LIVE CONNECTION</div>
            </div>

            <!-- TAB: DASHBOARD -->
            <div id="dashboard" class="tab-content active">
                <div class="grid" style="grid-template-columns: 1fr 2fr;">
                    
                    <!-- Control Panel -->
                    <div class="card">
                        <div class="card-header"><h3 class="card-title">Generator Engine</h3></div>
                        
                        <div class="status-box">
                            <div class="status-label">Current Status</div>
                            <div class="status-value" id="genStatus">STANDBY</div>
                        </div>

                        <div class="status-box" style="text-align:left">
                            <div class="status-label">Active Task</div>
                            <div style="color:var(--text-main); margin-top:5px; font-size:0.95rem" id="genTask">None</div>
                        </div>

                        <button id="toggleBtn" class="btn-large btn-start" onclick="toggleWorker()">
                            INITIALIZE ENGINE
                        </button>
                    </div>

                    <!-- Database Stats -->
                    <div class="card">
                        <div class="card-header"><h3 class="card-title">Database Inventory</h3></div>
                        <div id="statsContainer" style="max-height: 400px; overflow-y: auto; padding-right:10px;">
                            <!-- Injected via JS -->
                            <div style="text-align:center; padding:40px; color:var(--text-muted)">Loading telemetry...</div>
                        </div>
                    </div>

                </div>
            </div>

            <!-- TAB: CERTS -->
            <div id="certs" class="tab-content">
                <div class="card">
                    <div class="card-header"><h3 class="card-title">Certificate Request Queue</h3></div>
                    <table>
                        <thead>
                            <tr><th>ID</th><th>STUDENT NAME</th><th>SCORE</th><th>DATE</th><th>ACTIONS</th></tr>
                        </thead>
                        <tbody id="certTable"></tbody>
                    </table>
                </div>
            </div>

            <!-- TAB: LOGS -->
            <div id="logs" class="tab-content">
                <div class="card" style="padding:0; overflow:hidden">
                    <div class="terminal" id="terminal"></div>
                </div>
            </div>

        </main>

        <script>
            // --- FRONTEND LOGIC ---
            
            // State
            let workerRunning = false;
            
            // Tab Switcher
            function setTab(id, el) {
                document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                document.getElementById(id).classList.add('active');
                el.classList.add('active');
            }

            // Data Fetcher
            async function sync() {
                try {
                    const req = await fetch('/admin/api/stats');
                    const data = await req.json();
                    
                    updateEngineUI(data.worker);
                    updateStatsUI(data);
                    updateCertsUI(data.certRequests);
                    updateLogsUI(data.system.logs);
                } catch(e) { console.error(e); }
            }

            function updateEngineUI(worker) {
                workerRunning = worker.running;
                const btn = document.getElementById('toggleBtn');
                const status = document.getElementById('genStatus');
                const task = document.getElementById('genTask');

                if (workerRunning) {
                    btn.className = 'btn-large btn-stop';
                    btn.innerText = 'EMERGENCY STOP';
                    status.innerText = 'RUNNING';
                    status.style.color = '#34d399';
                    task.innerText = worker.task;
                    task.style.color = '#34d399';
                } else {
                    btn.className = 'btn-large btn-start';
                    btn.innerText = 'START ENGINE';
                    status.innerText = 'STANDBY';
                    status.style.color = '#fbbf24';
                    task.innerText = 'Ready to deploy';
                    task.style.color = '#94a3b8';
                }
            }

            function updateStatsUI(data) {
                const container = document.getElementById('statsContainer');
                let html = '';

                data.topics.forEach(topic => {
                    let rows = '';
                    const levels = ['Easy', 'Medium', 'Hard', 'Very Hard'];
                    
                    levels.forEach(lvl => {
                        const found = data.stats.find(s => s._id.topic === topic.key && s._id.difficulty === lvl);
                        const count = found ? found.count : 0;
                        const target = data.targets[lvl];
                        const pct = Math.min((count/target)*100, 100);
                        const fullClass = pct >= 100 ? 'full' : '';

                        rows += \`
                            <div class="topic-row">
                                <div class="diff-label">\${lvl}</div>
                                <div class="count-label">\${count}</div>
                                <div class="bar-track">
                                    <div class="bar-fill \${fullClass}" style="width: \${pct}%"></div>
                                </div>
                            </div>
                        \`;
                    });

                    html += \`
                        <div style="margin-bottom:20px">
                            <h4 style="margin:0 0 10px 0; color:#60a5fa">\${topic.label}</h4>
                            \${rows}
                        </div>
                    \`;
                });

                container.innerHTML = html;
            }

            function updateCertsUI(reqs) {
                const tbody = document.getElementById('certTable');
                if (reqs.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:#52525b">No pending requests</td></tr>';
                    return;
                }
                tbody.innerHTML = reqs.map(r => \`
                    <tr>
                        <td style="font-family:monospace; color:#60a5fa">#\${r.id}</td>
                        <td><b>\${r.username}</b></td>
                        <td><span class="badge badge-blue">\${r.score}</span></td>
                        <td style="color:#94a3b8">\${new Date(r.request_date).toLocaleDateString()}</td>
                        <td>
                            <a href="/admin/generate-cert/\${r.id}" target="_blank" style="text-decoration:none; margin-right:15px">🖨️</a>
                            <a href="#" onclick="delCert(\${r.id})" style="text-decoration:none; color:#ef4444">✕</a>
                        </td>
                    </tr>
                \`).join('');
            }

            function updateLogsUI(logs) {
                const term = document.getElementById('terminal');
                const html = logs.map(l => {
                    let color = '#3b82f6';
                    if (l.type === 'ERR') color = '#ef4444';
                    if (l.type === 'WARN') color = '#f59e0b';
                    if (l.type === 'GEN') color = '#a855f7';
                    
                    return \`
                        <div class="log-entry">
                            <div class="ts">[\${l.timestamp}]</div>
                            <div class="mod" style="color:\${color}">\${l.module}</div>
                            <div class="msg">\${l.message} <span class="det">\${l.details ? '| ' + l.details : ''}</span></div>
                        </div>
                    \`;
                }).join('');
                
                term.innerHTML = html;
            }

            async function toggleWorker() {
                const action = workerRunning ? 'stop' : 'start';
                await fetch('/admin/api/toggle-gen', { 
                    method:'POST', 
                    headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({action})
                });
                sync();
            }

            async function delCert(id) {
                if(confirm('Delete this request?')) {
                    await fetch('/admin/delete-request/'+id, {method:'DELETE'});
                    sync();
                }
            }

            // Init
            setInterval(sync, 2000);
            sync();

        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// =================================================================================================
// 🏁 SYSTEM BOOTSTRAP
// =================================================================================================

async function start() {
    console.clear();
    console.log('\n\x1b[36m%s\x1b[0m', '★ TITAN ENTERPRISE V9.0.0 (CAMBODIA EDITION) STARTING...');
    
    // 1. Database Connections
    await PG.connect();
    await MONGO.connect();

    // 2. Server Launch
    const server = app.listen(CONFIG.SERVER.PORT, () => {
        Logger.success('SERVER', `Online on Port ${CONFIG.SERVER.PORT}`);
        Logger.info('SYSTEM', `Environment: ${CONFIG.SERVER.ENV}`);
        Logger.info('SYSTEM', `Owner IP: ${CONFIG.SECURITY.OWNER_IP || 'Not Set'}`);
        
        console.log('\n\x1b[32m%s\x1b[0m', '➜  Dashboard:   http://localhost:' + CONFIG.SERVER.PORT + '/admin');
        console.log('\x1b[32m%s\x1b[0m', '➜  Public API:  http://localhost:' + CONFIG.SERVER.PORT + '/api/generate-problem');
        console.log('\n');
    });

    // 3. Graceful Shutdown
    process.on('SIGTERM', () => {
        Logger.warn('SYSTEM', 'SIGTERM Received. Shutting down...');
        server.close(() => {
            Logger.info('SYSTEM', 'HTTP Server Closed');
            process.exit(0);
        });
    });
}

// EXECUTE
start();
