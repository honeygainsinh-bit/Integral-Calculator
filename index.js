/**
 * =================================================================================================
 * __  __       _   _      _____                                
 * |  \/  |     | | | |    / ____|                               
 * | \  / | __ _| |_| |__ | |  __  ___ _ __  _   _ ___           
 * | |\/| |/ _` | __| '_ \| | |_ |/ _ \ '_ \| | | / __|          
 * | |  | | (_| | |_| | | | |__| |  __/ | | | |_| \__ \          
 * |_|  | |\_ \____|\_ \ | \___ \_ | | \_ / \___ | \___ | \_ \
 * |_|\__\____/\_____| _|_| \___|\____/\___|__ / \___| \_ / \___|
 * |_|\__\____/\_____| _|_| \___|\____/\___|__ / \___| \_ / \___|
 * 
 * * PROJECT:           BRAINTEST - TITAN ENTERPRISE BACKEND
 * * EDITION:           ULTIMATE CAMBODIA EDITION (V8.0.3)
 * * FEATURES:          AUTO-GENERATOR + HYBRID CACHE + V7 LEADERBOARD + KHMER ADMIN
 * * AUTHOR:            BRAINTEST ENGINEERING TEAM
 * * DATE:              DECEMBER 2025
 * =================================================================================================
 * 
 * SYSTEM ARCHITECTURE OVERVIEW:
 * -------------------------------------------------------------------------------------------------
 * 1. CORE ENGINE:      Node.js with Express framework.
 * 2. DATABASE LAYER:   Hybrid Architecture (SQL + NoSQL).
 *      - PostgreSQL:   Stores Leaderboard scores (Smart Merge Logic V7).
 *      - MongoDB:      Caches AI math problems (Hybrid Cache Logic V8).
 * 3. SECURITY LAYER:   Dual Defense Strategy.
 *      - Quota Limiter: Max 10 requests per 8 Hours.
 *      - Speed Limiter: Max 5 requests per 1 Hour.
 * 4. AI ENGINE:        Google Gemini (Flash Model) with automatic fallback.
 * 5. GENERATOR:        Background Process to auto-fill database to targets.
 * 6. INTERFACE:        Server-Side Rendered (SSR) Dashboard (Khmer Language).
 * =================================================================================================
 */

// =================================================================================================
// SECTION 1: GLOBAL IMPORTS & DEPENDENCY MANAGEMENT
// =================================================================================================

// 1.1 Load Environment Configuration
require('dotenv').config();

// 1.2 Core Server Dependencies
const express = require('express');           // The backbone web framework
const cors = require('cors');                 // Middleware for Cross-Origin Resource Sharing
const path = require('path');                 // Utility for handling file paths

// 1.3 Database Drivers
const { Pool } = require('pg');               // PostgreSQL client for Node.js
const mongoose = require('mongoose');         // ODM (Object Data Modeling) for MongoDB

// 1.4 Artificial Intelligence Integration
const { GoogleGenerativeAI } = require('@google/generative-ai'); // Google Gemini SDK

// 1.5 Security Middleware
const rateLimit = require('express-rate-limit'); // Middleware to prevent DDoS/Spam

// =================================================================================================
// SECTION 2: ADVANCED SYSTEM CONFIGURATION
// =================================================================================================

/**
 * CONFIGURATION OBJECT
 * Centralized control center for the entire application.
 */
const CONFIG = {
    // -------------------------------------------------------------------------
    // SERVER SETTINGS
    // -------------------------------------------------------------------------
    PORT: process.env.PORT || 3000,
    ENV: process.env.NODE_ENV || 'development',
    
    // -------------------------------------------------------------------------
    // DATABASE CREDENTIALS
    // -------------------------------------------------------------------------
    POSTGRES_URL: process.env.DATABASE_URL,
    MONGO_URI: process.env.MONGODB_URI,
    
    // -------------------------------------------------------------------------
    // AI ENGINE SETTINGS
    // -------------------------------------------------------------------------
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    // Using 'gemini-1.5-flash' for optimal speed/cost ratio
    AI_MODEL: "gemini-1.5-flash", 
    
    // -------------------------------------------------------------------------
    // EXTERNAL SERVICES
    // -------------------------------------------------------------------------
    IMG_API: process.env.EXTERNAL_IMAGE_API, // URL for dynamic certificate generation
    
    // -------------------------------------------------------------------------
    // SECURITY SETTINGS
    // -------------------------------------------------------------------------
    OWNER_IP: process.env.OWNER_IP, // IP Whitelist for admin bypass
    
    // -------------------------------------------------------------------------
    // CACHING STRATEGY (HYBRID V8)
    // -------------------------------------------------------------------------
    // 0.25 = 25% chance to retrieve from Cache, 75% chance to Generate new AI problem.
    // This ONLY applies when the database target is NOT yet met.
    CACHE_RATE: 0.25, 
    
    // -------------------------------------------------------------------------
    // AUTOMATION TARGETS (AUTO-GENERATOR)
    // -------------------------------------------------------------------------
    // The generator will stop once these limits are reached.
    // Once reached, the system forces 100% Cache Usage (No API Cost).
    TARGETS: {
        "Easy": 100,
        "Medium": 30,
        "Hard": 30,
        "Very Hard": 30
    },

    // -------------------------------------------------------------------------
    // TOPIC MAPPING
    // -------------------------------------------------------------------------
    TOPICS: [
        { key: "Limits", label: "លីមីត (Limits)", prompt: "Calculus Limits problems involving infinity and zero" },
        { key: "Derivatives", label: "ដេរីវេ (Derivatives)", prompt: "Calculus Derivatives differentiation rules chain rule" },
        { key: "Integrals", label: "អាំងតេក្រាល (Integrals)", prompt: "Calculus Integrals definite and indefinite integration" },
        { key: "DiffEq", label: "សមីការឌីផេរ៉ង់ស្យែល", prompt: "First and second order Differential Equations" },
        { key: "Complex", label: "ចំនួនកុំផ្លិច (Complex)", prompt: "Complex Numbers arithmetic and polar form" },
        { key: "Vectors", label: "វ៉ិចទ័រ (Vectors)", prompt: "Vector Algebra dot product cross product" },
        { key: "Matrices", label: "ម៉ាទ្រីស (Matrices)", prompt: "Matrix operations determinants and inverses" },
        { key: "Logic", label: "តក្កវិទ្យា (Logic)", prompt: "Mathematical Logic and Set Theory" }
    ],
    
    // -------------------------------------------------------------------------
    // GAMEPLAY RULES (ANTI-CHEAT)
    // -------------------------------------------------------------------------
    // Validates if a score submitted for a difficulty level is physically possible.
    ALLOWED_SCORES: {
        "Easy": 5,
        "Medium": 10,
        "Hard": 15,
        "Very Hard": 20
    }
};

// =================================================================================================
// SECTION 3: REAL-TIME SYSTEM MONITORING & LOGGING
// =================================================================================================

/**
 * SYSTEM_STATE
 * A Global Mutable Object that tracks the health and metrics of the server in real-time.
 */
const SYSTEM_STATE = {
    startTime: Date.now(),
    postgresConnected: false,
    mongoConnected: false,
    
    // Generator State
    isGenerating: false,
    currentGenTask: "Idle",
    
    // Metrics
    totalRequests: 0,
    totalGamesGenerated: 0,
    cacheHits: 0,
    aiCalls: 0,
    uniqueVisitors: new Set(), 
    
    // Log Buffer (Stores last 250 logs for display)
    logs: [] 
};

/**
 * Advanced Logger Utility
 * Provides colorful console output and buffers logs for the web dashboard.
 */
function logSystem(type, message, details = '') {
    // Format timestamp
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour12: false });
    
    // Icon mapping for visual clarity
    let icon = 'ℹ️';
    switch(type) {
        case 'DB':   icon = '🗄️'; break;
        case 'AI':   icon = '🤖'; break;
        case 'ERR':  icon = '❌'; break;
        case 'OK':   icon = '✅'; break;
        case 'NET':  icon = '📡'; break;
        case 'WARN': icon = '⚠️'; break;
        case 'SEC':  icon = '🛡️'; break; 
        case 'GEN':  icon = '⚙️'; break; // Generator specific icon
    }

    // 1. Print to Server Console
    console.log(`[${timeString}] ${icon} [${type}] ${message} ${details ? '| ' + details : ''}`);

    // 2. Add to Dashboard Buffer
    SYSTEM_STATE.logs.unshift({ 
        time: timeString, 
        type: type, 
        msg: message, 
        det: details 
    });
    
    // 3. Prevent Memory Leak (Cap log size)
    if (SYSTEM_STATE.logs.length > 250) {
        SYSTEM_STATE.logs.pop();
    }
}

/**
 * MongoDB URI Sanitizer
 * Helper function to ensure the connection string is valid for Atlas.
 */
function cleanMongoURI(uri) {
    if (!uri) return null;
    let clean = uri.trim();
    if (!clean.startsWith('mongodb://') && !clean.startsWith('mongodb+srv://')) {
        logSystem('WARN', 'Fixing MongoDB URI', 'Added mongodb+srv:// prefix automatically.');
        return `mongodb+srv://${clean}`;
    }
    return clean;
}

// =================================================================================================
// SECTION 4: POSTGRESQL DATABASE MANAGEMENT (RELATIONAL)
// =================================================================================================

// Initialize PostgreSQL Connection Pool
const pgPool = new Pool({
    connectionString: CONFIG.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }, 
    connectionTimeoutMillis: 5000,      
    max: 20                             
});

// Global Error Listener for Postgres
pgPool.on('error', (err) => {
    SYSTEM_STATE.postgresConnected = false;
    logSystem('ERR', 'PostgreSQL Connection Error', err.message);
});

/**
 * Initializes PostgreSQL Database
 * - Connects to the database.
 * - Automatically creates tables if they are missing (Auto-Migration).
 */
async function initPostgres() {
    try {
        logSystem('DB', 'Initializing PostgreSQL connection...');
        const client = await pgPool.connect();
        SYSTEM_STATE.postgresConnected = true;
        
        // ---------------------------------------------------------------------
        // TABLE 1: LEADERBOARD (Scores)
        // Stores High Scores linked to Usernames.
        // ---------------------------------------------------------------------
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
            
        // ---------------------------------------------------------------------
        // TABLE 2: CERTIFICATE REQUESTS (Admin)
        // Queue for generating completion certificates.
        // ---------------------------------------------------------------------
        await client.query(`
            CREATE TABLE IF NOT EXISTS certificate_requests (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) NOT NULL,
                score INTEGER NOT NULL,
                status VARCHAR(20) DEFAULT 'Pending',
                request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        logSystem('OK', 'PostgreSQL Ready', 'Schema verification complete.');
        client.release();
    } catch (err) {
        logSystem('ERR', 'PostgreSQL Initialization Failed', err.message);
    }
}

// =================================================================================================
// SECTION 5: MONGODB DATABASE MANAGEMENT (NOSQL / CACHE)
// =================================================================================================

/**
 * Initializes MongoDB Connection
 * Used primarily for caching generated math problems.
 */
async function initMongo() {
    const uri = cleanMongoURI(CONFIG.MONGO_URI);
    
    if (!uri) {
        logSystem('WARN', 'MongoDB URI is not defined', 'Caching features will be disabled.');
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
        logSystem('OK', 'MongoDB Connected', 'Hybrid caching system active.');
    } catch (err) {
        SYSTEM_STATE.mongoConnected = false;
        logSystem('ERR', 'MongoDB Connection Failed', err.message);
    }
}

// Event Listeners for MongoDB Health
mongoose.connection.on('connected', () => {
    SYSTEM_STATE.mongoConnected = true;
});
mongoose.connection.on('disconnected', () => {
    SYSTEM_STATE.mongoConnected = false;
    logSystem('WARN', 'MongoDB Disconnected', 'Attempting auto-reconnect...');
});
mongoose.connection.on('error', (err) => {
    logSystem('ERR', 'MongoDB Driver Error', err.message);
});

// -------------------------------------------------------------------------------------------------
// MONGODB DATA SCHEMA
// -------------------------------------------------------------------------------------------------

const problemSchema = new mongoose.Schema({
    // Topic: e.g., "Calculus", "Algebra"
    topic: { 
        type: String, 
        required: true, 
        index: true 
    },
    // Difficulty: e.g., "Easy", "Hard"
    difficulty: { 
        type: String, 
        required: true, 
        index: true 
    },
    // The actual JSON content of the problem
    raw_text: { 
        type: String, 
        required: true 
    },
    // Metadata for tracking
    source_ip: String,
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

// Compound Index for fast lookups
problemSchema.index({ topic: 1, difficulty: 1 });

// Compile the Model
const MathCache = mongoose.model('MathProblemCache', problemSchema);

// =================================================================================================
// SECTION 6: BACKGROUND BATCH GENERATOR (AUTO-FILLER)
// =================================================================================================

/**
 * ⚙️ AUTOMATIC BATCH GENERATOR
 * This function runs in the background and populates the database until targets are met.
 * It respects API limits by adding delays.
 */
async function startBackgroundGeneration() {
    if (SYSTEM_STATE.isGenerating) return; // Prevent double execution
    if (!SYSTEM_STATE.mongoConnected) {
        logSystem('ERR', 'Generator Failed', 'No Database Connection');
        return;
    }

    SYSTEM_STATE.isGenerating = true;
    logSystem('GEN', '🚀 STARTING AUTO-GENERATION PROCESS...');

    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: CONFIG.AI_MODEL });

    // Loop through all defined Topics
    for (const topicObj of CONFIG.TOPICS) {
        // Loop through all defined Difficulties
        for (const [diffLevel, targetCount] of Object.entries(CONFIG.TARGETS)) {
            
            // Safety Check: Did user stop the process?
            if (!SYSTEM_STATE.isGenerating) {
                logSystem('GEN', 'Process Stopped by Admin');
                return;
            }

            try {
                // 1. Check current count in DB
                const currentCount = await MathCache.countDocuments({ 
                    topic: topicObj.key, 
                    difficulty: diffLevel 
                });

                // If target reached, skip to next
                if (currentCount >= targetCount) {
                    continue; 
                }

                const needed = targetCount - currentCount;
                SYSTEM_STATE.currentGenTask = `${topicObj.label} (${diffLevel}): ${currentCount}/${targetCount}`;
                
                logSystem('GEN', `Task: ${topicObj.key} - ${diffLevel}`, `Need: ${needed}`);

                // 2. Generate loop for missing items
                for (let i = 0; i < needed; i++) {
                    if (!SYSTEM_STATE.isGenerating) break;

                    const prompt = `Create 1 unique multiple-choice math problem for topic "${topicObj.prompt}" with difficulty "${diffLevel}".
                    Return ONLY a JSON object. Format: { "question": "LaTeX supported string", "options": ["A", "B", "C", "D"], "answer": "Option Value", "explanation": "Brief explanation" }.
                    Make sure options are distinct. Do not include markdown code blocks.`;

                    try {
                        const result = await model.generateContent(prompt);
                        const response = await result.response;
                        let text = response.text();
                        
                        // Clean markdown if present
                        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

                        // Validate JSON (Simple parse check)
                        JSON.parse(text); 

                        // Save to DB
                        await MathCache.create({
                            topic: topicObj.key,
                            difficulty: diffLevel,
                            raw_text: text,
                            source_ip: 'AUTO-GEN'
                        });

                        logSystem('GEN', `✅ Created: ${topicObj.key} [${diffLevel}]`, `(${i+1}/${needed})`);

                    } catch (err) {
                        logSystem('ERR', 'Gen Failed', err.message);
                        // Backoff if error to let API cool down
                        await new Promise(r => setTimeout(r, 10000));
                    }

                    // ⏳ DELAY: 4 seconds between requests to protect API Key health
                    await new Promise(r => setTimeout(r, 4000));
                }

            } catch (err) {
                logSystem('ERR', 'Generator Loop Error', err.message);
            }
        }
    }

    SYSTEM_STATE.isGenerating = false;
    SYSTEM_STATE.currentGenTask = "Completed";
    logSystem('GEN', '🏁 ALL TARGETS MET. GENERATION COMPLETE.');
}

// =================================================================================================
// SECTION 7: SERVER MIDDLEWARE & DUAL SECURITY CONFIGURATION
// =================================================================================================

const app = express();

// Trust Proxy: Crucial for correctly identifying IPs behind Load Balancers
app.set('trust proxy', 1);

// Standard Express Middleware
app.use(cors()); 
app.use(express.json({ limit: '2mb' })); 
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); 

// Custom Logging Middleware
app.use((req, res, next) => {
    // Increment global counters
    SYSTEM_STATE.totalRequests++;
    
    // Extract real IP
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    SYSTEM_STATE.uniqueVisitors.add(ip);
    
    // Log API traffic (filter out static file requests to keep logs clean)
    if (req.path.startsWith('/api') || req.path.startsWith('/admin')) {
        logSystem('NET', `${req.method} ${req.path}`, `IP: ${ip}`);
    }
    
    next();
});

// -------------------------------------------------------------------------------------------------
// 🛡️ DUAL SECURITY LAYER: RATE LIMITERS
// -------------------------------------------------------------------------------------------------

/**
 * 🛡️ LAYER 1: AI QUOTA LIMITER
 * Rule: 10 requests per 8 hours.
 * Enforces a 60-second delay after the FIRST request.
 */
const aiLimiterQuota = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, // 8 Hours Window
    max: 10, // Max 10 Requests per Window
    delayAfter: 1, 
    delayMs: 60 * 1000, // 60 Seconds
    message: { 
        error: "Quota Limit Exceeded", 
        message: "⚠️ អ្នកបានប្រើប្រាស់សិទ្ធិអស់ហើយ (10ដង/8ម៉ោង)។" 
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.headers['x-forwarded-for'] || req.ip,
    skip: (req) => CONFIG.OWNER_IP && req.ip.includes(CONFIG.OWNER_IP)
});

/**
 * 🛡️ LAYER 2: SPEED LIMITER
 * Rule: 5 requests per 1 hour.
 */
const aiSpeedLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 Hour Window
    max: 5, // Max 5 requests per hour
    message: { 
        error: "Speed Limit Exceeded", 
        message: "⚠️ ល្បឿនប្រើប្រាស់លឿនពេក (កំណត់ត្រឹម 5ដង/ម៉ោង)។ សូមរង់ចាំមួយរយៈ។" 
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.headers['x-forwarded-for'] || req.ip,
    skip: (req) => CONFIG.OWNER_IP && req.ip.includes(CONFIG.OWNER_IP)
});

// =================================================================================================
// SECTION 8: CORE GAME ENGINE (HYBRID V8 LOGIC)
// =================================================================================================

/**
 * 🤖 GENERATE PROBLEM API
 * Logic Flow:
 * 1. Check DB Count for requested topic/difficulty.
 * 2. IF Count >= Target: FORCE 100% CACHE USE (Disable API).
 * 3. IF Count < Target: Randomly decide (25% Cache / 75% API) to populate DB.
 */
app.post('/api/generate-problem', aiLimiterQuota, aiSpeedLimiter, async (req, res) => {
    // 1. Data Extraction
    const { prompt, topic, difficulty } = req.body;
    
    // Default Values
    const finalTopic = topic || "Limits";
    const finalDifficulty = difficulty || "Medium";
    
    SYSTEM_STATE.totalGamesGenerated++;

    let useCache = false;
    let dbCount = 0;

    // -------------------------------------------------------------------------
    // STEP 1: CHECK DATABASE STATE
    // -------------------------------------------------------------------------
    if (SYSTEM_STATE.mongoConnected) {
        try {
            // Count existing problems
            dbCount = await MathCache.countDocuments({ topic: finalTopic, difficulty: finalDifficulty });
            const target = CONFIG.TARGETS[finalDifficulty] || 30;

            if (dbCount >= target) {
                // ✅ TARGET MET: Force 100% Cache usage to save API costs.
                useCache = true;
            } else {
                // 🎲 TARGET NOT MET: Use Hybrid RNG (Feature #4).
                // 25% Chance to read from cache, 75% Chance to generate & save.
                if (Math.random() < CONFIG.CACHE_RATE) {
                    useCache = true;
                }
            }
        } catch (e) { 
            console.error(e); 
        }
    }

    // -------------------------------------------------------------------------
    // STEP 2: CACHE EXECUTION (If Selected)
    // -------------------------------------------------------------------------
    if (useCache && SYSTEM_STATE.mongoConnected) {
        try {
            // MongoDB Aggregation: Random Sample
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
    // STEP 3: AI GENERATION FALLBACK
    // -------------------------------------------------------------------------
    // This runs if Cache was skipped OR Cache returned nothing.
    logSystem('AI', 'Calling Gemini API', `${finalTopic} (DB: ${dbCount})`);
    SYSTEM_STATE.aiCalls++;
    
    try {
        const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
        const model = genAI.getGenerativeModel({ model: CONFIG.AI_MODEL });
        
        const aiPrompt = prompt || `Generate a ${finalDifficulty} math problem about ${finalTopic}. Return JSON.`;
        
        const result = await model.generateContent(aiPrompt);
        const response = await result.response;
        const text = response.text();
        
        // SAVE TO DB (Populate for future)
        if (SYSTEM_STATE.mongoConnected) {
            MathCache.create({
                topic: finalTopic,
                difficulty: finalDifficulty,
                raw_text: text,
                source_ip: req.ip
            }).then(() => {
                // logSystem('DB', 'Saved New Problem', 'Database growing...');
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
        logSystem('ERR', 'AI Generation Failed', err.message);
        res.status(500).json({ error: "AI Service Failure" });
    }
});

// =================================================================================================
// SECTION 9: LEADERBOARD & SCORING SYSTEM (V7 LOGIC)
// =================================================================================================

/**
 * 🏆 SUBMIT SCORE API
 * V7 Logic: Checks for duplicates, merges scores, keeps oldest ID, deletes others.
 */
app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;

    if (!username || typeof score !== 'number' || !difficulty) {
        return res.status(400).json({ success: false, message: "Missing username, score, or difficulty" });
    }

    try {
        const client = await pgPool.connect();

        // 1. ANTI-CHEAT: SCORE LIMIT CHECK
        const maxAllowed = CONFIG.ALLOWED_SCORES[difficulty] || 100;
        if (score > maxAllowed) {
            logSystem('SEC', `Score Rejected (Anti-Cheat)`, `User: ${username}, Score: ${score}`);
            client.release();
            return res.status(403).json({ success: false, message: "Score exceeds difficulty limit." });
        }

        // 2. V7 SMART MERGE & DEDUPLICATE LOGIC (Feature #3)
        const check = await client.query(
            'SELECT id, score FROM leaderboard WHERE username = $1 AND difficulty = $2 ORDER BY id ASC',
            [username, difficulty]
        );

        if (check.rows.length > 0) {
            // MERGE
            const rows = check.rows;
            const targetId = rows[0].id; // Keep the oldest ID (First row)
            
            // Calculate Total Score (Sum of all duplicates + New Score)
            const currentTotal = rows.reduce((acc, row) => acc + row.score, 0);
            const finalScore = currentTotal + score;

            // Update the Target Row
            await client.query('UPDATE leaderboard SET score = $1, updated_at = NOW() WHERE id = $2', [finalScore, targetId]);
            logSystem('DB', `Merged Score (V7)`, `User: ${username}, Total: ${finalScore}`);

            // DELETE DUPLICATES (If user has multiple rows somehow)
            if (rows.length > 1) {
                const idsToDelete = rows.slice(1).map(r => r.id);
                await client.query('DELETE FROM leaderboard WHERE id = ANY($1::int[])', [idsToDelete]);
                logSystem('DB', `Cleaned Duplicates`, `IDs: ${idsToDelete.join(',')}`);
            }
        } else {
            // INSERT NEW
            const userIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            await client.query(
                'INSERT INTO leaderboard(username, score, difficulty, ip_address) VALUES($1, $2, $3, $4)',
                [username, score, difficulty, userIP]
            );
            logSystem('DB', `New Leaderboard Row`, `User: ${username}`);
        }

        client.release();
        res.status(201).json({ success: true });

    } catch (err) {
        logSystem('ERR', 'Submit Failed', err.message);
        res.status(500).json({ success: false });
    }
});

/**
 * 📊 GET TOP SCORES API
 */
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
        logSystem('ERR', 'Leaderboard Fetch Failed', err.message);
        res.status(500).json([]);
    }
});

// =================================================================================================
// SECTION 10: ADMINISTRATIVE PANEL APIs
// =================================================================================================

/**
 * API: Request a Certificate
 */
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

/**
 * API: Generate Certificate Image Redirect
 */
app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const client = await pgPool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [req.params.id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Request Not Found");

        const { username, score } = result.rows[0];
        const dateStr = new Date().toLocaleDateString('en-US', { dateStyle: 'long' });
        const msg = `Score: ${score}%0A%0ADate Issued: ${dateStr}%0A%0APresented by: BrainTest Inc.`;

        const finalUrl = CONFIG.IMG_API + 
            `&txt-align=center&txt-size=110&txt-color=FFD700&txt=${encodeURIComponent(username.toUpperCase())}&txt-fit=max&w=1800` +
            `&mark-align=center&mark-size=35&mark-color=FFFFFF&mark-y=850&mark-txt=${encodeURIComponent(msg)}&mark-w=1600`;

        res.redirect(finalUrl);
    } catch (e) { res.status(500).send("Generation Error"); }
});

/**
 * API: Delete Request
 */
app.delete('/admin/delete-request/:id', async (req, res) => {
    try {
        const client = await pgPool.connect();
        await client.query('DELETE FROM certificate_requests WHERE id = $1', [req.params.id]);
        client.release();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

/**
 * API: Admin Stats for UI
 */
app.get('/admin/api/stats', async (req, res) => {
    if (!SYSTEM_STATE.mongoConnected) return res.json({ stats: [] });
    
    // Aggregation for Generator
    const stats = await MathCache.aggregate([
        { $group: { _id: { topic: "$topic", difficulty: "$difficulty" }, count: { $sum: 1 } } }
    ]);
    
    // Recent Cert Requests
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

/**
 * API: Toggle Generator
 */
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
// SECTION 11: ADMINISTRATIVE DASHBOARD UI (SSR HTML/CSS)
// =================================================================================================

app.get('/admin', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="km">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BRAINTEST TITAN ADMIN</title>
        <link href="https://fonts.googleapis.com/css2?family=Battambang:wght@400;700&family=JetBrains+Mono:wght@400&family=Inter:wght@400;700&display=swap" rel="stylesheet">
        <style>
            :root {
                --bg: #0f172a; 
                --panel: #1e293b; 
                --text: #f8fafc; 
                --text-mute: #94a3b8;
                --primary: #3b82f6; 
                --primary-hover: #2563eb;
                --danger: #ef4444; 
                --success: #22c55e; 
                --warn: #f59e0b;
            }
            
            body { 
                font-family: 'Battambang', 'Inter', sans-serif; 
                background: var(--bg); 
                color: var(--text); 
                margin: 0; 
                padding: 20px; 
            }
            
            .container { max-width: 1400px; margin: 0 auto; }
            
            /* Header Styling */
            .header { 
                display: flex; 
                justify-content: space-between; 
                align-items: center; 
                margin-bottom: 30px; 
                border-bottom: 2px solid var(--panel); 
                padding-bottom: 20px; 
            }
            .brand h1 { margin: 0; font-size: 1.8rem; color: var(--primary); }
            .brand span { font-size: 0.9rem; color: var(--text-mute); }

            /* Navigation Tabs */
            .tabs { display: flex; gap: 10px; margin-bottom: 20px; }
            .tab-btn { 
                background: var(--panel); 
                border: none; 
                color: var(--text-mute); 
                padding: 12px 24px; 
                border-radius: 8px; 
                cursor: pointer; 
                font-family: 'Battambang'; 
                font-size: 1rem; 
                transition: 0.2s; 
            }
            .tab-btn.active { background: var(--primary); color: white; font-weight: bold; }
            .tab-btn:hover:not(.active) { background: #334155; }

            /* Sections */
            .section { display: none; animation: fadeIn 0.3s; }
            .section.active { display: block; }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

            /* Card Grid Layout */
            .grid { 
                display: grid; 
                grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); 
                gap: 20px; 
            }
            .card { 
                background: var(--panel); 
                border-radius: 12px; 
                padding: 20px; 
                border: 1px solid #334155; 
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            .card h3 { 
                margin-top: 0; 
                color: var(--primary); 
                font-size: 1.1rem; 
                border-bottom: 1px solid #334155; 
                padding-bottom: 10px; 
            }

            /* Generator Progress Table */
            .stat-table { width: 100%; font-size: 0.9rem; border-collapse: collapse; }
            .stat-table td { padding: 8px 0; border-bottom: 1px solid #334155; }
            .prog-track { 
                width: 100px; 
                height: 6px; 
                background: #334155; 
                border-radius: 3px; 
                display: inline-block; 
                vertical-align: middle; 
                margin-left: 10px; 
                overflow: hidden; 
            }
            .prog-fill { 
                height: 100%; 
                background: var(--primary); 
                width: 0%; 
                transition: width 0.5s; 
            }
            .prog-fill.full { background: var(--success); }

            /* Generator Controls */
            .controls { 
                background: var(--panel); 
                padding: 20px; 
                border-radius: 12px; 
                margin-bottom: 20px; 
                display: flex; 
                justify-content: space-between; 
                align-items: center; 
                border: 1px solid var(--primary); 
            }
            .gen-btn { 
                background: var(--success); 
                color: white; 
                border: none; 
                padding: 15px 30px; 
                font-size: 1.1rem; 
                border-radius: 8px; 
                cursor: pointer; 
                font-weight: bold; 
                font-family: 'Battambang'; 
                box-shadow: 0 4px 12px rgba(34,197,94,0.3); 
                transition: 0.2s; 
            }
            .gen-btn.stop { background: var(--danger); box-shadow: 0 4px 12px rgba(239,68,68,0.3); }
            .gen-btn:hover { transform: scale(1.02); }

            /* Certificate Table */
            .cert-table { width: 100%; border-collapse: collapse; }
            .cert-table th { text-align: left; padding: 15px; color: var(--text-mute); background: #0f172a; }
            .cert-table td { padding: 15px; border-bottom: 1px solid #334155; }
            .btn-icon { 
                background: none; 
                border: 1px solid #475569; 
                color: white; 
                width: 35px; 
                height: 35px; 
                border-radius: 50%; 
                cursor: pointer; 
                transition: 0.2s; 
            }
            .btn-icon:hover { background: var(--primary); border-color: var(--primary); }
            .btn-del:hover { background: var(--danger); border-color: var(--danger); }

            /* Logs Terminal */
            .log-box { 
                height: 400px; 
                overflow-y: auto; 
                background: #000; 
                border-radius: 8px; 
                padding: 15px; 
                font-family: 'JetBrains Mono'; 
                font-size: 0.8rem; 
                border: 1px solid #334155; 
            }
            .log-line { margin-bottom: 4px; border-bottom: 1px solid #1e1e1e; padding-bottom: 2px; }
            
            /* Custom Scrollbar */
            ::-webkit-scrollbar { width: 8px; }
            ::-webkit-scrollbar-track { background: var(--bg); }
            ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="brand">
                    <h1>🛡️ BRAINTEST ADMIN</h1>
                    <span>Titan Engine v8.0.3 (Ultimate Khmer)</span>
                </div>
                <div style="text-align:right">
                    <a href="/" style="color:var(--primary); text-decoration:none">← Public Dashboard</a>
                </div>
            </div>

            <div class="tabs">
                <button class="tab-btn active" onclick="switchTab('gen')">⚙️ ម៉ាស៊ីនផលិត (Generator)</button>
                <button class="tab-btn" onclick="switchTab('cert')">🎓 វិញ្ញាបនបត្រ (Certificates)</button>
                <button class="tab-btn" onclick="switchTab('logs')">📡 កំណត់ត្រា (Logs)</button>
            </div>

            <!-- TAB 1: GENERATOR -->
            <div id="gen" class="section active">
                <div class="controls">
                    <div>
                        <h2 style="margin:0">ស្ថានភាពផលិត: <span id="statusTxt" style="color:var(--warn)">កំពុងរង់ចាំ...</span></h2>
                        <small style="color:var(--text-mute)" id="taskTxt">Task: Idle</small>
                    </div>
                    <button id="mainBtn" class="gen-btn" onclick="toggleGen()">⚡ ចាប់ផ្តើមផលិត (Start)</button>
                </div>

                <div class="grid" id="statsGrid">
                    <!-- Cards Injected JS -->
                    <div style="padding:40px; text-align:center; grid-column:span 3;">កំពុងផ្ទុកទិន្នន័យ...</div>
                </div>
            </div>

            <!-- TAB 2: CERTIFICATES -->
            <div id="cert" class="section">
                <div class="card">
                    <h3>សំណើរសុំវិញ្ញាបនបត្រថ្មីៗ (Recent Requests)</h3>
                    <table class="cert-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>ឈ្មោះសិស្ស</th>
                                <th>ពិន្ទុ</th>
                                <th>កាលបរិច្ឆេទ</th>
                                <th>សកម្មភាព</th>
                            </tr>
                        </thead>
                        <tbody id="certBody"></tbody>
                    </table>
                </div>
            </div>

            <!-- TAB 3: LOGS -->
            <div id="logs" class="section">
                <div class="card">
                    <h3>Live System Terminal</h3>
                    <div class="log-box" id="logTerm">
                        ${SYSTEM_STATE.logs.map(l => `<div class="log-line"><span style="color:#64748b">${l.time}</span> [${l.type}] ${l.msg}</div>`).join('')}
                    </div>
                </div>
            </div>

        </div>

        <script>
            // --- UI LOGIC ---
            function switchTab(id) {
                document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
                document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
                document.getElementById(id).classList.add('active');
                event.target.classList.add('active');
            }

            // --- DATA FETCHING ---
            let isRunning = false;

            async function refreshData() {
                try {
                    const res = await fetch('/admin/api/stats');
                    const data = await res.json();

                    // 1. Update Generator Status
                    isRunning = data.isGenerating;
                    const btn = document.getElementById('mainBtn');
                    const stTxt = document.getElementById('statusTxt');
                    const tskTxt = document.getElementById('taskTxt');

                    if (isRunning) {
                        btn.innerText = "🛑 បញ្ឈប់ (STOP)";
                        btn.className = "gen-btn stop";
                        stTxt.innerText = "កំពុងដំណើរការ...";
                        stTxt.style.color = "var(--success)";
                        tskTxt.innerText = "Current: " + data.currentTask;
                    } else {
                        btn.innerText = "⚡ ចាប់ផ្តើមផលិត (START)";
                        btn.className = "gen-btn";
                        stTxt.innerText = "បានផ្អាក / រង់ចាំ";
                        stTxt.style.color = "var(--warn)";
                        tskTxt.innerText = "System Idle";
                    }

                    // 2. Render Generator Stats
                    const grid = document.getElementById('statsGrid');
                    grid.innerHTML = '';
                    
                    data.topics.forEach(topic => {
                        let rows = '';
                        ['Easy', 'Medium', 'Hard', 'Very Hard'].forEach(diff => {
                            const found = data.stats.find(s => s._id.topic === topic.key && s._id.difficulty === diff);
                            const count = found ? found.count : 0;
                            const target = data.targets[diff];
                            const pct = Math.min((count/target)*100, 100);
                            const barClass = pct >= 100 ? 'prog-fill full' : 'prog-fill';
                            
                            rows += \`
                                <tr>
                                    <td width="30%">\${diff}</td>
                                    <td width="20%" style="font-weight:bold; color:white">\${count}</td>
                                    <td width="50%">
                                        <div style="display:flex; align-items:center">
                                            <span style="font-size:0.7rem; color:#64748b">\${target}</span>
                                            <div class="prog-track"><div class="\${barClass}" style="width:\${pct}%"></div></div>
                                        </div>
                                    </td>
                                </tr>
                            \`;
                        });
                        
                        grid.innerHTML += \`
                            <div class="card">
                                <h3>\${topic.label}</h3>
                                <table class="stat-table">\${rows}</table>
                            </div>
                        \`;
                    });

                    // 3. Render Certificates
                    const tbody = document.getElementById('certBody');
                    tbody.innerHTML = data.certRequests.map(r => \`
                        <tr>
                            <td><span style="font-family:monospace; color:#64748b">#\${r.id}</span></td>
                            <td>\${r.username}</td>
                            <td><span style="background:#dbeafe; color:#1e40af; padding:2px 8px; border-radius:10px; font-weight:bold">\${r.score}</span></td>
                            <td>\${new Date(r.request_date).toLocaleDateString()}</td>
                            <td>
                                <a href="/admin/generate-cert/\${r.id}" target="_blank"><button class="btn-icon" title="Print">🖨️</button></a>
                                <button class="btn-icon btn-del" onclick="delCert(\${r.id})" title="Delete">🗑️</button>
                            </td>
                        </tr>
                    \`).join('');

                } catch (e) { console.error(e); }
            }

            // --- ACTIONS ---
            async function toggleGen() {
                const action = isRunning ? 'stop' : 'start';
                await fetch('/admin/api/toggle-gen', { 
                    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action}) 
                });
                refreshData();
            }

            async function delCert(id) {
                if(confirm('Delete this request?')) {
                    await fetch('/admin/delete-request/'+id, {method:'DELETE'});
                    refreshData();
                }
            }

            // --- INIT ---
            setInterval(refreshData, 2000);
            refreshData();
        </script>
    </body>
    </html>
    `);
});

// =================================================================================================
// SECTION 12: PUBLIC DASHBOARD UI (SERVER-SIDE RENDERED)
// =================================================================================================

app.get('/', (req, res) => {
    // Calculate Server Uptime
    const uptime = process.uptime();
    const d = Math.floor(uptime / 86400);
    const h = Math.floor((uptime % 86400) / 3600);
    const m = Math.floor((uptime % 3600) / 60);

    // Dynamic Status Indicators
    const pgStatus = SYSTEM_STATE.postgresConnected ? 
        '<span class="status-indicator online">● CONNECTED</span>' : '<span class="status-indicator offline">● FAILED</span>';
    const mgStatus = SYSTEM_STATE.mongoConnected ? 
        '<span class="status-indicator online">● CONNECTED</span>' : '<span class="status-indicator offline">● FAILED</span>';

    // HTML Template with Embedded CSS
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BRAINTEST ENTERPRISE HUB</title>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
        <style>
            :root {
                --bg-main: #0b1121;
                --bg-panel: #151e32;
                --text-primary: #f1f5f9;
                --text-secondary: #94a3b8;
                --accent-color: #3b82f6;
                --accent-hover: #2563eb;
                --border-color: #334155;
                --success: #10b981;
                --error: #ef4444;
                --warning: #f59e0b;
            }
            
            * { box-sizing: border-box; }
            
            body {
                background-color: var(--bg-main);
                color: var(--text-primary);
                font-family: 'Inter', system-ui, sans-serif;
                margin: 0;
                padding: 40px;
                min-height: 100vh;
                display: flex;
                flex-direction: column;
                align-items: center;
            }

            .dashboard-wrapper {
                width: 100%;
                max-width: 1200px;
                display: grid;
                gap: 30px;
            }

            /* --- CARDS --- */
            .panel {
                background-color: var(--bg-panel);
                border: 1px solid var(--border-color);
                border-radius: 16px;
                padding: 30px;
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2);
            }

            /* --- HEADER --- */
            .header-flex {
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid var(--border-color);
                padding-bottom: 20px;
                margin-bottom: 20px;
            }

            h1 {
                margin: 0;
                font-size: 1.8rem;
                font-weight: 800;
                color: var(--accent-color);
                display: flex;
                align-items: center;
                gap: 15px;
            }
            
            .version-tag {
                font-size: 0.8rem;
                background: #1e293b;
                color: var(--text-secondary);
                padding: 4px 8px;
                border-radius: 6px;
                font-weight: 400;
            }

            .system-info {
                font-family: 'JetBrains Mono', monospace;
                font-size: 0.85rem;
                color: var(--text-secondary);
            }

            /* --- METRICS GRID --- */
            .metrics-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 20px;
            }

            .metric-box {
                background: rgba(0,0,0,0.2);
                border: 1px solid var(--border-color);
                border-radius: 12px;
                padding: 20px;
                text-align: center;
                transition: transform 0.2s;
            }
            .metric-box:hover {
                transform: translateY(-2px);
                border-color: var(--accent-color);
            }

            .metric-label {
                font-size: 0.7rem;
                text-transform: uppercase;
                letter-spacing: 1px;
                color: var(--text-secondary);
                margin-bottom: 10px;
                font-weight: 700;
            }

            .metric-value {
                font-family: 'JetBrains Mono', monospace;
                font-size: 1.5rem;
                font-weight: 700;
                color: var(--text-primary);
            }

            .status-indicator { font-size: 0.8rem; }
            .status-indicator.online { color: var(--success); }
            .status-indicator.offline { color: var(--error); }

            /* --- LOG VIEWER --- */
            .log-container {
                background: #000;
                border: 1px solid var(--border-color);
                border-radius: 12px;
                height: 500px;
                overflow-y: auto;
                padding: 20px;
                font-family: 'JetBrains Mono', monospace;
                font-size: 0.85rem;
            }

            .log-entry {
                display: flex;
                gap: 15px;
                margin-bottom: 6px;
                border-bottom: 1px solid #1e1e1e;
                padding-bottom: 4px;
            }
            
            .log-time { color: var(--text-secondary); min-width: 80px; }
            .log-msg { color: #e2e8f0; font-weight: 600; }
            .log-detail { color: #64748b; font-size: 0.8rem; }

            /* --- BUTTONS --- */
            .action-btn {
                display: block;
                width: 100%;
                background: var(--accent-color);
                color: white;
                text-decoration: none;
                text-align: center;
                padding: 18px;
                border-radius: 12px;
                font-weight: 700;
                font-size: 1rem;
                margin-top: 20px;
                transition: background 0.3s;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .action-btn:hover { background: var(--accent-hover); }

            /* SCROLLBAR */
            ::-webkit-scrollbar { width: 10px; }
            ::-webkit-scrollbar-track { background: var(--bg-main); }
            ::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 5px; }

        </style>
    </head>
    <body>
        <div class="dashboard-wrapper">
            
            <div class="panel">
                <div class="header-flex">
                    <h1>
                        <span style="font-size: 2rem;">🚀</span>
                        BRAINTEST CLOUD CORE
                        <span class="version-tag">v8.0.3 (Ultimate)</span>
                    </h1>
                    <div class="system-info">
                        UPTIME: <span style="color:#fff">${d}d ${h}h ${m}m</span>
                    </div>
                </div>

                <div class="metrics-grid">
                    <div class="metric-box">
                        <div class="metric-label">PostgreSQL Database</div>
                        <div class="metric-value">${pgStatus}</div>
                    </div>
                    <div class="metric-box">
                        <div class="metric-label">MongoDB Cache</div>
                        <div class="metric-value">${mgStatus}</div>
                    </div>
                    <div class="metric-box">
                        <div class="metric-label">Generator Status</div>
                        <div class="metric-value" style="color: ${SYSTEM_STATE.isGenerating ? 'var(--success)' : 'var(--warning)'}">${SYSTEM_STATE.isGenerating ? 'RUNNING' : 'IDLE'}</div>
                    </div>
                </div>

                <div class="metrics-grid" style="margin-top: 20px;">
                    <div class="metric-box">
                        <div class="metric-label">Total Requests</div>
                        <div class="metric-value" style="color:#fbbf24">${SYSTEM_STATE.totalRequests}</div>
                    </div>
                    <div class="metric-box">
                        <div class="metric-label">AI Generations</div>
                        <div class="metric-value" style="color:#f472b6">${SYSTEM_STATE.aiCalls}</div>
                    </div>
                    <div class="metric-box">
                        <div class="metric-label">Cache Hits</div>
                        <div class="metric-value" style="color:#34d399">${SYSTEM_STATE.cacheHits}</div>
                    </div>
                    <div class="metric-box">
                        <div class="metric-label">Unique IPs</div>
                        <div class="metric-value" style="color:#a78bfa">${SYSTEM_STATE.uniqueVisitors.size}</div>
                    </div>
                </div>
            </div>

            <div class="panel">
                <div class="header-flex">
                    <h1>
                        <span style="font-size: 1.5rem;">📡</span>
                        LIVE SERVER TELEMETRY
                    </h1>
                    <div class="status-indicator online">REAL-TIME</div>
                </div>
                <div class="log-container" id="terminal">
                    ${SYSTEM_STATE.logs.map(l => `
                        <div class="log-entry">
                            <span class="log-time">${l.time}</span>
                            <span class="log-msg">${l.msg}</span>
                            <span class="log-detail">${l.det}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <a href="/admin" class="action-btn">
                🔐 ACCESS ADMINISTRATIVE CONTROL PANEL
            </a>

        </div>

        <script>
            // Automatic Dashboard Refresh (Every 10 Seconds)
            // Keeps connection alive and updates metrics
            setTimeout(() => {
                window.location.reload();
            }, 10000);
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// =================================================================================================
// SECTION 13: SYSTEM INITIALIZATION (NON-BLOCKING STARTUP)
// =================================================================================================

/**
 * 🚀 STARTUP SEQUENCE
 * Initializes the server components without 'await' to ensure immediate listening.
 */
async function startSystem() {
    console.clear();
    logSystem('OK', `Initializing BrainTest Titan Engine v8.0.3...`);
    logSystem('INFO', `Starting Non-Blocking Database Connections...`);

    // 1. Trigger Database Connections (Background Process)
    initPostgres(); 
    initMongo();    

    // 2. Start Web Server (Immediate)
    const server = app.listen(CONFIG.PORT, () => {
        logSystem('NET', `HTTP Server Bound`, `Port: ${CONFIG.PORT}`);
        logSystem('OK', `System Online`, `Dashboard: http://localhost:${CONFIG.PORT}`);
        
        console.log('\n');
        console.log('===================================================');
        console.log(`   BRAINTEST BACKEND IS LIVE ON PORT ${CONFIG.PORT}   `);
        console.log('===================================================');
        console.log('\n');
    });

    // 3. Graceful Shutdown Logic
    process.on('SIGTERM', () => {
        logSystem('WARN', 'SIGTERM Received', 'Shutting down gracefully...');
        server.close(() => {
            logSystem('OK', 'Server Closed', 'Goodbye.');
            process.exit(0);
        });
    });
}

// EXECUTE MAIN FUNCTION
startSystem();
