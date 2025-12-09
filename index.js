/**
 * ==========================================================================================================================================================
 *  ______   ______              _____   _   _   _______   ______    _____   _______ 
 * |  ____| |  ____|     /\     |  __ \ | \ | | |__   __| |  ____|  / ____| |__   __|
 * | |__    | |__       /  \    | |__) ||  \| |    | |    | |__    | (___      | |   
 * |  __|   |  __|     / /\ \   |  _  / | . ` |    | |    |  __|    \___ \     | |   
 * | |____  | |____   / ____ \  | | \ \ | |\  |    | |    | |____   ____) |    | |   
 * |______| |______| /_/    \_\ |_|  \_\|_| \_|    |_|    |______| |_____/     |_|   
 *
 * ==========================================================================================================================================================
 * 
 * PROJECT NAME:        BRAINTEST - TITAN ENTERPRISE BACKEND SYSTEM
 * SYSTEM VERSION:      8.0.0 (ULTIMATE EDITION)
 * DEPLOYMENT TARGET:   CLOUD CLUSTER (RENDER / AWS / GOOGLE CLOUD)
 * ENGINEERING TEAM:    BRAINTEST DEV OPS
 * DATE CREATED:        DECEMBER 2025
 * LICENSE:             PROPRIETARY & CONFIDENTIAL
 * 
 * ==========================================================================================================================================================
 * 
 * [ SYSTEM ARCHITECTURE & DOCUMENTATION ]
 * 
 * 1. CORE RUNTIME ENVIRONMENT
 *    - Platform:       Node.js (LTS Version Recommended)
 *    - Framework:      Express.js (High-performance routing)
 *    - Architecture:   Monolithic Service with Async Non-blocking I/O
 * 
 * 2. HYBRID DATABASE LAYER
 *    - SQL (Primary):  PostgreSQL
 *                      Used for Critical User Data, Leaderboards, and Certificate Requests.
 *                      Features: ACID Compliance, Complex Queries, Smart Merging Logic.
 *    - NoSQL (Cache):  MongoDB (Atlas)
 *                      Used for "Titan Matrix" - The caching layer for Math Problems.
 *                      Features: High-speed JSON retrieval, Geo-redundancy.
 * 
 * 3. ARTIFICIAL INTELLIGENCE ENGINE
 *    - Provider:       Google DeepMind (Gemini API)
 *    - Model:          "gemini-2.5-flash" (Optimized for low-latency reasoning)
 *    - Fallback:       System automatically switches to AI if Database Cache is empty.
 * 
 * 4. LOGIC CONFIGURATION (v8.0.0)
 *    - CACHE RATIO:    50% Database / 50% AI (Perfectly Balanced).
 *    - TOPIC LOGIC:    STRICT MATCHING. 
 *                      (e.g., "Limits" returns "Limits", "General" returns "General").
 *    - SOURCE IP:      PASS-THROUGH.
 *                      (Preserves original source: "TITAN-MATRIX", "AI-GEN", or Admin IP).
 * 
 * 5. SECURITY PROTOCOLS (DUAL LAYER)
 *    - QUOTA LIMIT:    Max 10 requests per 8 Hours (Long-term abuse prevention).
 *    - SPEED LIMIT:    Max 5 requests per 1 Hour (Burst attack prevention).
 *    - ANTI-CHEAT:     Server-side score validation logic.
 * 
 * ==========================================================================================================================================================
 */

// =================================================================================================
// SECTION 1: LIBRARY IMPORTS & DEPENDENCY INJECTION
// =================================================================================================

// 1.1 Load Environment Variables
// Crucial for keeping API Keys and Database URLs secure.
require('dotenv').config();

// 1.2 Core Server Libraries
const express = require('express');           // The web server framework
const cors = require('cors');                 // Middleware to enable Cross-Origin Resource Sharing
const path = require('path');                 // NodeJS utility for file path resolution
const http = require('http');                 // Standard HTTP module

// 1.3 Database Drivers
const { Pool } = require('pg');               // PostgreSQL Client for Node.js
const mongoose = require('mongoose');         // MongoDB Object Modeling Tool

// 1.4 AI SDK Integration
const { GoogleGenerativeAI } = require('@google/generative-ai'); // Google Gemini SDK

// 1.5 Security & Utility Middleware
const rateLimit = require('express-rate-limit'); // For DDoS and Spam protection

// =================================================================================================
// SECTION 2: CENTRALIZED CONFIGURATION (THE BRAIN)
// =================================================================================================

/**
 * CONFIG
 * This object holds all the tuning parameters for the server.
 * Adjust these values to change how the system behaves without rewriting code.
 */
const CONFIG = {
    // -------------------------------------------------------------------------
    // SERVER INFRASTRUCTURE
    // -------------------------------------------------------------------------
    PORT: process.env.PORT || 3000,
    ENV: process.env.NODE_ENV || 'development',
    
    // -------------------------------------------------------------------------
    // DATABASE CONNECTIONS
    // -------------------------------------------------------------------------
    POSTGRES_URL: process.env.DATABASE_URL,
    MONGO_URI: process.env.MONGODB_URI,
    
    // -------------------------------------------------------------------------
    // AI ENGINE PARAMETERS
    // -------------------------------------------------------------------------
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    
    // 🔥 UPDATED: Using the latest Flash model for speed
    AI_MODEL: "gemini-2.5-flash", 
    
    // -------------------------------------------------------------------------
    // CACHING STRATEGY
    // -------------------------------------------------------------------------
    // 0.5 means 50% chance to fetch from MongoDB, 50% chance to ask AI.
    CACHE_RATE: 0.5, 
    
    // -------------------------------------------------------------------------
    // EXTERNAL INTEGRATIONS
    // -------------------------------------------------------------------------
    IMG_API: process.env.EXTERNAL_IMAGE_API, // For generating certificates
    
    // -------------------------------------------------------------------------
    // SECURITY & ACCESS
    // -------------------------------------------------------------------------
    OWNER_IP: process.env.OWNER_IP, // Admin IP Whitelist
    
    // -------------------------------------------------------------------------
    // GAMEPLAY RULES (Anti-Cheat Validation)
    // -------------------------------------------------------------------------
    // Max score allowed per difficulty level to prevent hacking.
    ALLOWED_SCORES: {
        "Easy": 5,
        "Medium": 10,
        "Hard": 15,
        "Very Hard": 20,
        "Extreme": 25
    }
};

// =================================================================================================
// SECTION 3: REAL-TIME MONITORING & LOGGING SYSTEM
// =================================================================================================

/**
 * SYSTEM_STATE
 * A Global Mutable Object that tracks server health statistics in real-time.
 */
const SYSTEM_STATE = {
    startTime: Date.now(),
    postgresConnected: false,
    mongoConnected: false,
    
    // Counters
    totalRequests: 0,
    totalGamesGenerated: 0,
    cacheHits: 0,
    aiCalls: 0,
    
    // Track Unique Visitors
    uniqueVisitors: new Set(), 
    
    // Circular Log Buffer for Dashboard (Last 200 logs)
    logs: [] 
};

/**
 * logSystem()
 * Advanced logging function that prints to Console (with colors) 
 * and saves to the Dashboard Buffer.
 * 
 * @param {string} type - Log Type (DB, AI, NET, ERR, OK)
 * @param {string} message - Primary Message
 * @param {string} details - Secondary Details
 */
function logSystem(type, message, details = '') {
    // 1. Create Timestamp
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour12: false });
    
    // 2. Define Icons and Colors
    let icon = 'ℹ️';
    let colorCode = '\x1b[0m'; // Default White

    switch(type) {
        case 'DB':   
            icon = '🗄️'; 
            colorCode = '\x1b[36m'; // Cyan
            break;
        case 'AI':   
            icon = '🤖'; 
            colorCode = '\x1b[35m'; // Magenta
            break;
        case 'ERR':  
            icon = '❌'; 
            colorCode = '\x1b[31m'; // Red
            break;
        case 'OK':   
            icon = '✅'; 
            colorCode = '\x1b[32m'; // Green
            break;
        case 'NET':  
            icon = '📡'; 
            colorCode = '\x1b[34m'; // Blue
            break;
        case 'WARN': 
            icon = '⚠️'; 
            colorCode = '\x1b[33m'; // Yellow
            break;
        case 'SEC':  
            icon = '🛡️'; 
            colorCode = '\x1b[31m'; // Red
            break;
    }

    // 3. Print to Console (Server Side)
    console.log(`${colorCode}[${timeString}] ${icon} [${type}] ${message}\x1b[0m ${details ? '| ' + details : ''}`);

    // 4. Push to Dashboard Buffer (Client Side)
    SYSTEM_STATE.logs.unshift({ 
        time: timeString, 
        type: type, 
        msg: message, 
        det: details 
    });

    // 5. Memory Management (Prevent Overflow)
    if (SYSTEM_STATE.logs.length > 200) {
        SYSTEM_STATE.logs.pop();
    }
}

/**
 * Helper: MongoDB URI Sanitizer
 * Ensures the connection string works with Atlas.
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
// SECTION 4: POSTGRESQL DATABASE MANAGEMENT (SQL)
// =================================================================================================

// Initialize the Connection Pool
const pgPool = new Pool({
    connectionString: CONFIG.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }, // Essential for Cloud Hosting (Render/Heroku)
    connectionTimeoutMillis: 5000,      
    max: 20                             
});

// Global Error Handler
pgPool.on('error', (err) => {
    SYSTEM_STATE.postgresConnected = false;
    logSystem('ERR', 'PostgreSQL Connection Error', err.message);
});

/**
 * initPostgres()
 * Connects to PostgreSQL and creates necessary tables if they don't exist.
 */
async function initPostgres() {
    try {
        logSystem('DB', 'Initializing PostgreSQL connection...');
        const client = await pgPool.connect();
        SYSTEM_STATE.postgresConnected = true;
        
        // --- Table 1: Leaderboard (Score Storage) ---
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
            
        // --- Table 2: Certificate Requests (Admin Queue) ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS certificate_requests (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) NOT NULL,
                score INTEGER NOT NULL,
                status VARCHAR(20) DEFAULT 'Pending',
                request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        logSystem('OK', 'PostgreSQL Ready', 'Schema verification successful.');
        client.release();
    } catch (err) {
        logSystem('ERR', 'PostgreSQL Initialization Failed', err.message);
    }
}

// =================================================================================================
// SECTION 5: MONGODB DATABASE MANAGEMENT (NOSQL CACHE)
// =================================================================================================

/**
 * initMongo()
 * Connects to MongoDB Atlas for caching math problems.
 */
async function initMongo() {
    const uri = cleanMongoURI(CONFIG.MONGO_URI);
    
    if (!uri) {
        logSystem('WARN', 'MongoDB URI is undefined', 'Caching features disabled.');
        return;
    }

    try {
        logSystem('DB', 'Initializing MongoDB connection...');
        
        // Connect with recommended options
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            family: 4 // IPv4 preference
        });
        
        SYSTEM_STATE.mongoConnected = true;
        logSystem('OK', 'MongoDB Connected', 'Titan Cache System is Active.');
    } catch (err) {
        SYSTEM_STATE.mongoConnected = false;
        logSystem('ERR', 'MongoDB Connection Failed', err.message);
    }
}

// Mongo Event Listeners
mongoose.connection.on('connected', () => { SYSTEM_STATE.mongoConnected = true; });
mongoose.connection.on('disconnected', () => { SYSTEM_STATE.mongoConnected = false; });
mongoose.connection.on('error', (err) => { logSystem('ERR', 'MongoDB Driver Error', err.message); });

// -------------------------------------------------------------------------------------------------
// MONGODB DATA SCHEMA
// -------------------------------------------------------------------------------------------------
const problemSchema = new mongoose.Schema({
    // Topic (e.g., Limits, Algebra)
    topic: { 
        type: String, 
        required: true, 
        index: true 
    },
    // Difficulty (e.g., Easy, Hard)
    difficulty: { 
        type: String, 
        required: true, 
        index: true 
    },
    // JSON Content
    raw_text: { 
        type: String, 
        required: true 
    },
    // Source Origin (Titan Matrix, AI, Admin)
    source_ip: String,
    
    // Timestamp
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

// Create the Model
const MathCache = mongoose.model('MathProblemCache', problemSchema);

// =================================================================================================
// SECTION 6: EXPRESS SERVER & MIDDLEWARE
// =================================================================================================

const app = express();

// Trust Proxy (Essential for Rate Limiting behind Load Balancers)
app.set('trust proxy', 1);

// 6.1 Standard Middleware
app.use(cors()); // Allow Cross-Origin Requests
app.use(express.json({ limit: '5mb' })); // Support large JSON payloads
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // Serve Static Files

// 6.2 Traffic Logger Middleware
app.use((req, res, next) => {
    // Increment global counters
    SYSTEM_STATE.totalRequests++;
    
    // Capture Client IP
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    SYSTEM_STATE.uniqueVisitors.add(ip);
    
    // Log only API requests (Ignore static assets)
    if (req.path.startsWith('/api') || req.path.startsWith('/admin')) {
        logSystem('NET', `${req.method} ${req.path}`, `Client: ${ip}`);
    }
    
    next();
});

// =================================================================================================
// SECTION 7: DUAL-LAYER SECURITY (RATE LIMITERS)
// =================================================================================================

/**
 * 🛡️ LAYER 1: QUOTA LIMITER
 * Prevents long-term abuse.
 * Rule: 10 Requests per 8 Hours.
 */
const aiLimiterQuota = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, // 8 Hours
    max: 10, 
    
    // Forced Delay for Violators
    delayAfter: 1, 
    delayMs: 60 * 1000, // 60 Seconds
    
    message: { 
        error: "Quota Limit Exceeded", 
        message: "⚠️ អ្នកបានប្រើប្រាស់សិទ្ធិអស់ហើយ (10ដង/8ម៉ោង)។" 
    },
    standardHeaders: true, legacyHeaders: false,
    keyGenerator: (req) => req.headers['x-forwarded-for'] || req.ip,
    skip: (req) => {
        const currentIP = req.headers['x-forwarded-for'] || req.ip;
        if (CONFIG.OWNER_IP && currentIP && currentIP.includes(CONFIG.OWNER_IP)) return true;
        return false;
    }
});

/**
 * 🛡️ LAYER 2: SPEED LIMITER
 * Prevents burst attacks.
 * Rule: 5 Requests per 1 Hour.
 */
const aiSpeedLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 Hour
    max: 5, 
    message: { 
        error: "Speed Limit Exceeded", 
        message: "⚠️ ល្បឿនប្រើប្រាស់លឿនពេក (កំណត់ត្រឹម 5ដង/ម៉ោង)។ សូមរង់ចាំមួយរយៈ។" 
    },
    standardHeaders: true, legacyHeaders: false,
    keyGenerator: (req) => req.headers['x-forwarded-for'] || req.ip,
    skip: (req) => {
        const currentIP = req.headers['x-forwarded-for'] || req.ip;
        if (CONFIG.OWNER_IP && currentIP && currentIP.includes(CONFIG.OWNER_IP)) return true;
        return false;
    }
});

// =================================================================================================
// SECTION 8: DASHBOARD UI (SERVER-SIDE RENDERED)
// =================================================================================================

app.get('/', (req, res) => {
    // Calculate Uptime
    const uptime = process.uptime();
    const d = Math.floor(uptime / 86400);
    const h = Math.floor((uptime % 86400) / 3600);
    const m = Math.floor((uptime % 3600) / 60);

    // Status Badges
    const pgStatus = SYSTEM_STATE.postgresConnected ? 
        '<span class="badge online">● ONLINE</span>' : '<span class="badge offline">● OFFLINE</span>';
    const mgStatus = SYSTEM_STATE.mongoConnected ? 
        '<span class="badge online">● ONLINE</span>' : '<span class="badge offline">● OFFLINE</span>';

    // HTML Output
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BRAINTEST TITAN ENTERPRISE</title>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
        <style>
            :root {
                --bg-main: #0b1121; --bg-panel: #151e32; --bg-card: #1e293b;
                --text-main: #f1f5f9; --text-muted: #94a3b8;
                --primary: #3b82f6; --primary-dark: #2563eb;
                --success: #10b981; --danger: #ef4444; --warning: #f59e0b;
                --border: #334155;
            }
            body {
                background-color: var(--bg-main); color: var(--text-main); font-family: 'Inter', sans-serif;
                margin: 0; padding: 40px; min-height: 100vh;
                display: flex; flex-direction: column; align-items: center;
                background-image: radial-gradient(circle at 10% 20%, rgba(59, 130, 246, 0.1) 0%, transparent 20%);
            }
            .dashboard-container { width: 100%; max-width: 1200px; display: grid; gap: 30px; }
            
            .panel {
                background-color: var(--bg-panel); border: 1px solid var(--border);
                border-radius: 16px; padding: 30px;
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
            }
            
            .header-flex { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 20px; margin-bottom: 25px; }
            h1 { font-size: 1.8rem; font-weight: 800; color: var(--primary); display: flex; align-items: center; gap: 15px; margin: 0; }
            .tag { background: #0f172a; padding: 5px 10px; border-radius: 6px; font-size: 0.8rem; border: 1px solid var(--border); color: var(--text-muted); }
            
            .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; }
            .stat-box {
                background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 25px;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                transition: transform 0.2s;
            }
            .stat-box:hover { transform: translateY(-5px); border-color: var(--primary); }
            .stat-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1.5px; color: var(--text-muted); font-weight: 700; margin-bottom: 10px; }
            .stat-value { font-family: 'JetBrains Mono', monospace; font-size: 1.6rem; font-weight: 700; color: #fff; }
            
            .badge { font-size: 0.75rem; font-weight: 700; padding: 4px 8px; border-radius: 99px; }
            .badge.online { color: var(--success); background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); }
            .badge.offline { color: var(--danger); background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); }
            
            .terminal {
                background: #000; border: 1px solid var(--border); border-radius: 12px;
                height: 500px; overflow-y: auto; padding: 20px;
                font-family: 'JetBrains Mono', monospace; font-size: 0.85rem;
                box-shadow: inset 0 0 20px rgba(0,0,0,0.5);
            }
            .log-entry { display: flex; gap: 15px; margin-bottom: 8px; border-bottom: 1px solid #111; padding-bottom: 4px; }
            
            .btn-action {
                background: var(--primary); color: white; width: 100%; padding: 18px;
                border-radius: 12px; text-align: center; text-decoration: none; font-weight: 800;
                display: block; margin-top: 20px; font-size: 1.1rem; letter-spacing: 1px;
                transition: background 0.2s;
            }
            .btn-action:hover { background: var(--primary-dark); }
            
            /* Scrollbar Styling */
            ::-webkit-scrollbar { width: 10px; }
            ::-webkit-scrollbar-track { background: var(--bg-main); }
            ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 5px; }
        </style>
    </head>
    <body>
        <div class="dashboard-container">
            <!-- STATUS PANEL -->
            <div class="panel">
                <div class="header-flex">
                    <h1>🚀 TITAN CORE <span class="tag">v8.0.0</span></h1>
                    <div style="text-align:right">
                        <div class="tag">UPTIME: ${d}d ${h}h ${m}m</div>
                    </div>
                </div>
                
                <div class="stats-grid">
                    <div class="stat-box">
                        <span class="stat-label">PostgreSQL</span>
                        ${pgStatus}
                    </div>
                    <div class="stat-box">
                        <span class="stat-label">MongoDB Cache</span>
                        ${mgStatus}
                    </div>
                    <div class="stat-box">
                        <span class="stat-label">AI Engine</span>
                        <div class="badge online" style="color:#a78bfa; border-color:#a78bfa;">GEMINI 2.5</div>
                    </div>
                    <div class="stat-box">
                        <span class="stat-label">Logic Mode</span>
                        <div class="badge online" style="color:#fbbf24; border-color:#fbbf24;">STRICT MATCH</div>
                    </div>
                </div>

                <div class="stats-grid" style="margin-top:20px;">
                    <div class="stat-box"><span class="stat-label">Total Requests</span><span class="stat-value" style="color:#38bdf8">${SYSTEM_STATE.totalRequests}</span></div>
                    <div class="stat-box"><span class="stat-label">AI Generations</span><span class="stat-value" style="color:#f472b6">${SYSTEM_STATE.aiCalls}</span></div>
                    <div class="stat-box"><span class="stat-label">Cache Hits</span><span class="stat-value" style="color:#34d399">${SYSTEM_STATE.cacheHits}</span></div>
                    <div class="stat-box"><span class="stat-label">Visitors</span><span class="stat-value" style="color:#a78bfa">${SYSTEM_STATE.uniqueVisitors.size}</span></div>
                </div>
            </div>

            <!-- TERMINAL LOGS -->
            <div class="panel">
                <div class="header-flex">
                    <h1>📡 SYSTEM TELEMETRY</h1>
                    <span class="badge online">LIVE MONITORING</span>
                </div>
                <div class="terminal" id="console">
                    ${SYSTEM_STATE.logs.map(l => `
                        <div class="log-entry">
                            <span style="color:#64748b; min-width:80px;">${l.time}</span>
                            <span style="color:#e2e8f0; font-weight:700;">[${l.type}]</span>
                            <span style="color:#cbd5e1; flex-grow:1;">${l.msg}</span>
                            <span style="color:#475569; font-size:0.8rem;">${l.det}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <a href="/admin/requests" class="btn-action">🔐 OPEN ADMINISTRATIVE CONSOLE</a>
        </div>

        <script>
            // Auto Refresh Dashboard Every 10 Seconds
            setInterval(() => {
                window.location.reload();
            }, 10000);
            
            // Auto Scroll Terminal to Bottom
            const term = document.getElementById('console');
            term.scrollTop = term.scrollHeight;
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// =================================================================================================
// SECTION 9: CORE GAME ENGINE (STRICT MATCHING + SOURCE PASS-THROUGH)
// =================================================================================================

/**
 * API: /api/generate-problem
 * -------------------------------------------------------------------------
 * This is the heart of the system. It decides whether to fetch a problem
 * from the MongoDB Cache (Titan Matrix) or generate a new one via AI.
 * 
 * LOGIC FLOW:
 * 1. Receive Request (Topic, Difficulty).
 * 2. Apply Defaults if null.
 * 3. Cache Check (50% Chance):
 *    - Search MongoDB for STRICT MATCH (Topic = Topic, Difficulty = Difficulty).
 *    - DO NOT filter by source (allow Titan-Matrix, AI, Admin to all show up).
 *    - Randomly sample 1 result.
 * 4. AI Fallback (50% Chance or Cache Miss):
 *    - Call Google Gemini 2.5 Flash.
 *    - Generate JSON.
 *    - Save to MongoDB for future use.
 */
app.post('/api/generate-problem', aiLimiterQuota, aiSpeedLimiter, async (req, res) => {
    // 1. Extract Payload
    const { prompt, topic, difficulty } = req.body;
    
    // 2. Validate Inputs
    if (!prompt) {
        return res.status(400).json({ 
            error: "Bad Request", 
            message: "Prompt field is mandatory." 
        });
    }

    // Increment Usage Counter
    SYSTEM_STATE.totalGamesGenerated++;

    // 3. Set Defaults (Fail-safe)
    const finalTopic = topic || "General";
    const finalDifficulty = difficulty || "Medium";
    
    let problemContent = null;
    let source = "ai"; // Default fallback source

    // -------------------------------------------------------------------------
    // STEP 3: SMART CACHE LOOKUP (BALANCED 50/50)
    // -------------------------------------------------------------------------
    // Logic: Check cache only if DB is online AND Random Number < 0.5
    if (SYSTEM_STATE.mongoConnected && Math.random() < CONFIG.CACHE_RATE) {
        
        // A. Build Query Object
        let query = {};
        
        // B. Apply Strict Difficulty Filter
        query.difficulty = finalDifficulty;

        // C. Apply Strict Topic Filter
        // Note: Even if "General", we search for "General".
        // This ensures "General" is a category, not a random mix.
        query.topic = finalTopic;
        
        logSystem('DB', 'Search Strategy', `Strict Match: ${finalTopic} (Level: ${finalDifficulty})`);

        try {
            // D. Execute Aggregation
            // We do NOT filter by 'source_ip'. This allows Titan-Matrix & AI content to mix.
            const cached = await MathCache.aggregate([
                { $match: query }, 
                { $sample: { size: 1 } } // Statistical Random Sampling
            ]);

            if (cached.length > 0) {
                // E. Cache Hit!
                problemContent = cached[0].raw_text;
                
                // Use the original source from DB (Titan-Matrix / AI / Admin)
                source = cached[0].source_ip ? cached[0].source_ip : "cache";
                
                SYSTEM_STATE.cacheHits++;
                logSystem('OK', 'Cache Hit', `Fetched: ${cached[0].topic} | Source: ${source}`);
            } else {
                // F. Cache Miss
                logSystem('WARN', 'Cache Miss', `No inventory found for ${finalTopic} (${finalDifficulty})`);
            }
        } catch (e) {
            logSystem('ERR', 'Cache Read Exception', e.message);
        }
    }

    // -------------------------------------------------------------------------
    // STEP 4: AI GENERATION FALLBACK (GEMINI 2.5)
    // -------------------------------------------------------------------------
    // This block runs if:
    // 1. Cache was skipped (the 50% chance).
    // 2. Cache was checked but found nothing.
    if (!problemContent) {
        logSystem('AI', 'Initiating GenAI', `Model: ${CONFIG.AI_MODEL}`);
        SYSTEM_STATE.aiCalls++;
        
        try {
            // Initialize Google AI Client
            const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
            const model = genAI.getGenerativeModel({ model: CONFIG.AI_MODEL });
            
            // Execute Generation
            const result = await model.generateContent(prompt);
            const response = await result.response;
            problemContent = response.text();
            
            // -----------------------------------------------------------------
            // STEP 5: SAVE TO DATABASE (FUTURE CACHING)
            // -----------------------------------------------------------------
            if (problemContent && SYSTEM_STATE.mongoConnected) {
                MathCache.create({
                    topic: finalTopic,            
                    difficulty: finalDifficulty,  
                    raw_text: problemContent,
                    source_ip: req.ip // Mark as 'AI-Generated' from this user IP
                }).then(() => {
                    logSystem('DB', 'Cache Updated', `Archived new problem for ${finalTopic}`);
                }).catch(e => {
                    logSystem('WARN', 'Cache Write Failed', e.message);
                });
            }

        } catch (err) {
            logSystem('ERR', 'AI Service Failure', err.message);
            // Graceful Failure: Return 500. Rate Limiter will handle abuse.
            return res.status(500).json({ error: "AI Service Unavailable" });
        }
    }

    // 6. Return Result to Client
    res.json({ 
        text: problemContent, 
        source: source,
        metadata: {
            topic: finalTopic,
            difficulty: finalDifficulty,
            timestamp: new Date()
        }
    });
});

// =================================================================================================
// SECTION 10: LEADERBOARD SYSTEM (SCORE MERGE & DEDUPLICATION)
// =================================================================================================

/**
 * API: /api/leaderboard/submit
 * -------------------------------------------------------------------------
 * Submits a user's score.
 * FEATURES:
 * 1. Anti-Cheat: Rejects scores higher than allowed limit.
 * 2. Merge Logic: If user exists, ADDS new score to old score.
 * 3. Deduplication: Removes duplicate rows if they exist.
 */
app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;

    // 1. Basic Validation
    if (!username || typeof score !== 'number' || !difficulty) {
        return res.status(400).json({ success: false, message: "Invalid payload structure." });
    }

    try {
        const client = await pgPool.connect();

        // 2. Anti-Cheat Validation
        const maxAllowed = CONFIG.ALLOWED_SCORES[difficulty] || 100;
        if (score > maxAllowed) {
            logSystem('SEC', `Anti-Cheat Triggered`, `User: ${username}, Score: ${score}`);
            client.release();
            return res.status(403).json({ success: false, message: "Score validation failed." });
        }

        // 3. Check for existing record(s)
        const check = await client.query(
            'SELECT id, score FROM leaderboard WHERE username = $1 AND difficulty = $2 ORDER BY id ASC',
            [username, difficulty]
        );

        // 4. Smart Merge Logic
        if (check.rows.length > 0) {
            const rows = check.rows;
            const targetId = rows[0].id; 
            
            // Calculate Total (Old + New)
            const currentTotal = rows.reduce((acc, row) => acc + row.score, 0);
            const finalScore = currentTotal + score;

            // Update the primary record
            await client.query('UPDATE leaderboard SET score = $1, updated_at = NOW() WHERE id = $2', [finalScore, targetId]);
            
            // Delete duplicates if any found
            if (rows.length > 1) {
                const idsToDelete = rows.slice(1).map(r => r.id);
                await client.query('DELETE FROM leaderboard WHERE id = ANY($1::int[])', [idsToDelete]);
            }
            logSystem('DB', `Score Merged`, `${username} (+${score}) -> ${finalScore}`);
        } else {
            // 5. Insert New Record
            const userIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            await client.query(
                'INSERT INTO leaderboard(username, score, difficulty, ip_address) VALUES($1, $2, $3, $4)',
                [username, score, difficulty, userIP]
            );
            logSystem('DB', `New Leaderboard Entry`, `${username}: ${score}`);
        }

        client.release();
        res.status(201).json({ success: true });

    } catch (err) {
        logSystem('ERR', 'Leaderboard Transaction Failed', err.message);
        res.status(500).json({ success: false });
    }
});

/**
 * API: /api/leaderboard/top
 * Retrieves the top 100 players aggregated by username.
 */
app.get('/api/leaderboard/top', async (req, res) => {
    try {
        const client = await pgPool.connect();
        const result = await client.query(`
            SELECT 
                username, 
                SUM(score) as score, 
                COUNT(difficulty) as games_played 
            FROM leaderboard 
            GROUP BY username 
            ORDER BY score DESC 
            LIMIT 100
        `);
        client.release();
        res.json(result.rows);
    } catch (err) {
        logSystem('ERR', 'Fetch Leaderboard Error', err.message);
        res.status(500).json([]);
    }
});

// =================================================================================================
// SECTION 11: ADMINISTRATIVE CONTROL PANEL (HTML)
// =================================================================================================

// Endpoint: Submit Certificate Request
app.post('/api/submit-request', async (req, res) => {
    const { username, score } = req.body;
    try {
        const client = await pgPool.connect();
        await client.query('INSERT INTO certificate_requests (username, score) VALUES ($1, $2)', [username, score]);
        client.release();
        logSystem('OK', 'Certificate Requested', `User: ${username}`);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Endpoint: Generate & Print Certificate
app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const client = await pgPool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [req.params.id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Request ID Not Found");

        const { username, score } = result.rows[0];
        const dateStr = new Date().toLocaleDateString('en-US', { dateStyle: 'long' });
        const msg = `Score: ${score}%0A%0ADate Issued: ${dateStr}%0A%0APresented by: BrainTest Inc.`;

        // Construct Dynamic Image URL
        const finalUrl = CONFIG.IMG_API + 
            `&txt-align=center&txt-size=110&txt-color=FFD700&txt=${encodeURIComponent(username.toUpperCase())}&txt-fit=max&w=1800` +
            `&mark-align=center&mark-size=35&mark-color=FFFFFF&mark-y=850&mark-txt=${encodeURIComponent(msg)}&mark-w=1600`;

        res.redirect(finalUrl);
    } catch (e) { res.status(500).send("Image Generation Error"); }
});

// Endpoint: Delete Request
app.delete('/admin/delete-request/:id', async (req, res) => {
    try {
        const client = await pgPool.connect();
        await client.query('DELETE FROM certificate_requests WHERE id = $1', [req.params.id]);
        client.release();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Endpoint: Admin Interface (HTML)
app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pgPool.connect();
        const result = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
        client.release();

        const rows = result.rows.map(r => `
            <tr id="row-${r.id}">
                <td><span class="id-tag">#${r.id}</span></td>
                <td style="font-weight:700; color:#1e293b;">${r.username}</td>
                <td><span class="score-pill">${r.score}</span></td>
                <td>${new Date(r.request_date).toLocaleDateString()}</td>
                <td class="action-cell">
                    <a href="/admin/generate-cert/${r.id}" target="_blank" class="btn-icon print" title="Print">🖨️</a>
                    <button class="btn-icon del" onclick="del(${r.id})" title="Delete">🗑️</button>
                </td>
            </tr>
        `).join('');

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>BrainTest Admin Control</title>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Inter', sans-serif; background:#f1f5f9; padding:50px; color:#334155; display:flex; justify-content:center; min-height:100vh; }
                    .admin-panel { width: 100%; max-width:1000px; background:white; padding:40px; border-radius:16px; box-shadow:0 10px 25px -5px rgba(0,0,0,0.1); }
                    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }
                    h2 { margin:0; color:#0f172a; font-size: 1.5rem; display:flex; gap:10px; align-items:center; }
                    .back-link { text-decoration:none; color:#64748b; font-weight:600; padding:10px 20px; border-radius:8px; background:#f8fafc; transition: all 0.2s; }
                    .back-link:hover { background: #e2e8f0; color:#0f172a; }
                    table { width:100%; border-collapse:separate; border-spacing: 0 8px; }
                    th { text-align:left; padding:15px; color:#94a3b8; font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; }
                    td { background: #fff; padding:15px; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; }
                    tr { transition: transform 0.2s; }
                    tr:hover td { background: #f8fafc; }
                    td:first-child { border-left: 1px solid #e2e8f0; border-top-left-radius: 8px; border-bottom-left-radius: 8px; }
                    td:last-child { border-right: 1px solid #e2e8f0; border-top-right-radius: 8px; border-bottom-right-radius: 8px; }
                    .id-tag { font-family: monospace; color: #64748b; background: #f1f5f9; padding: 4px 8px; border-radius: 4px; }
                    .score-pill { background:#dbeafe; color:#1e40af; padding:5px 12px; border-radius:99px; font-weight:700; font-size:0.85rem; }
                    .action-cell { display: flex; gap: 10px; }
                    .btn-icon { border:1px solid #e2e8f0; background:white; cursor:pointer; width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; text-decoration: none; font-size: 1.1rem; }
                    .print:hover { background: #eff6ff; border-color: #3b82f6; color: #3b82f6; }
                    .del:hover { background: #fef2f2; border-color: #ef4444; color: #ef4444; }
                </style>
            </head>
            <body>
                <div class="admin-panel">
                    <div class="header">
                        <h2>🛡️ Certificate Requests</h2>
                        <a href="/" class="back-link">Back to Dashboard</a>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Ref ID</th>
                                <th>Username</th>
                                <th>High Score</th>
                                <th>Date</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <script>
                    async function del(id){
                        if(confirm('Are you sure you want to delete this request permanently?')){
                            const row = document.getElementById('row-'+id);
                            row.style.opacity = '0.5';
                            await fetch('/admin/delete-request/'+id,{method:'DELETE'});
                            row.remove();
                        }
                    }
                </script>
            </body>
            </html>
        `;
        res.send(html);
    } catch (e) { res.status(500).send("Admin Panel Error"); }
});

// =================================================================================================
// SECTION 12: SYSTEM INITIALIZATION BOOTSTRAP
// =================================================================================================

/**
 * startSystem()
 * The main entry point. Orchestrates the startup sequence:
 * 1. Clears Console.
 * 2. Connects to Databases (Async).
 * 3. Starts HTTP Server.
 * 4. Sets up Graceful Shutdown signals.
 */
async function startSystem() {
    console.clear();
    logSystem('OK', `Initializing BrainTest Titan Engine v8.0.0...`);
    logSystem('INFO', `Environment: ${CONFIG.ENV.toUpperCase()}`);
    logSystem('INFO', `AI Model: ${CONFIG.AI_MODEL}`);
    logSystem('INFO', `Cache Rate: ${CONFIG.CACHE_RATE * 100}%`);

    // Initialize Database Drivers
    initPostgres(); 
    initMongo();    

    // Launch Web Server
    const server = app.listen(CONFIG.PORT, () => {
        logSystem('NET', `Server Listening`, `Port: ${CONFIG.PORT}`);
        
        console.log('\n');
        console.log('================================================================');
        console.log('   BRAINTEST BACKEND SYSTEM IS ONLINE AND READY FOR TRAFFIC    ');
        console.log(`   DASHBOARD: http://localhost:${CONFIG.PORT}                  `);
        console.log('================================================================');
        console.log('\n');
    });

    // Graceful Shutdown Logic (SIGTERM)
    process.on('SIGTERM', () => {
        logSystem('WARN', 'SIGTERM Signal Received', 'Shutting down safely...');
        server.close(() => {
            logSystem('OK', 'Server Terminated', 'Process Exited.');
            process.exit(0);
        });
    });
}

// EXECUTE MAIN FUNCTION
startSystem();
