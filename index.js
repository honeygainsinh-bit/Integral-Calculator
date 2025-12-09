/**
=================================================================================================
|  /  |     | | | |    / ____|
| \  / | __ | || |__ | |  __  ___ _ __  _   _ ___
| |/| |/ ` | | ' | | | |/ _ \ ' | | | / __|
| |  | | (| | || | | | |__| |  __/ | | | || _ \
||  | |_ _|_ \ | _ _ | | _ / ___ | ___ | _ \
||__/_| || _|_/_| / _| _ / _|
||__/_| || _|_/_| / _| _ / _|

PROJECT:           BRAINTEST - TITAN ENTERPRISE BACKEND
VERSION:           7.2.1 (FULL EDITION + AUTO GENERATOR + IMO LEVEL)
AUTHOR:            BRAINTEST ENGINEERING TEAM
DATE:              DECEMBER 2025
=================================================================================================

SYSTEM ARCHITECTURE OVERVIEW:
-----------------------------
CORE ENGINE:      Node.js with Express framework.
DATABASE LAYER:   Hybrid Architecture (SQL + NoSQL).
  - PostgreSQL:   Stores Leaderboard scores & Certificate Requests.
  - MongoDB:      Caches AI math problems (General/Medium Default) & Auto-Generated Batches.

SECURITY LAYER (DUAL DEFENSE):
  - Quota Limiter:  Max 10 requests per 8 Hours.
  - Speed Limiter:  Max 5 requests per 1 Hour (Burst Protection).
  - Anti-Spam:      60-second forced delay after first request.

AI ENGINE:        Google Gemini (Flash Model 1.5) optimized for Speed.
ADMIN TOOLS:      Auto-Generator (Batch 10), Certificate Manager.
INTERFACE:        Server-Side Rendered (SSR) Dashboard with Advanced CSS.

=================================================================================================
DEPLOYMENT INSTRUCTIONS:
1. Ensure 'package.json' includes: express, cors, pg, mongoose, dotenv, @google/generative-ai, express-rate-limit
2. Run 'npm install'
3. Deploy!
=================================================================================================
*/

// =================================================================================================
// SECTION 1: GLOBAL IMPORTS & DEPENDENCY MANAGEMENT
// =================================================================================================

// 1.1 Load Environment Configuration
// Safely load secret keys from the .env file or server environment variables.
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
 * Modify these values to tune performance and behavior.
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
    // Using 'gemini-1.5-flash' for speed optimization in Batch Generation
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
    // CACHING STRATEGY
    // -------------------------------------------------------------------------
    // 0.25 = 25% chance to retrieve from Cache, 75% chance to Generate new AI problem.
    // This helps populate the database initially.
    CACHE_RATE: 0.25,

    // -------------------------------------------------------------------------
    // GAMEPLAY RULES (ANTI-CHEAT & DIFFICULTY)
    // -------------------------------------------------------------------------
    // Validates if a score submitted for a difficulty level is physically possible.
    ALLOWED_SCORES: {
        "Easy": 5,      // BacII Level
        "Medium": 10,   // Scholarship Level
        "Hard": 15,     // National Olympiad
        "Very Hard": 20 // IMO Level
    }
};

// =================================================================================================
// SECTION 3: REAL-TIME SYSTEM MONITORING & LOGGING
// =================================================================================================

/**
 * SYSTEM_STATE
 * A Global Mutable Object that tracks the health and metrics of the server in real-time.
 * This data is fed directly into the Dashboard UI.
 */
const SYSTEM_STATE = {
    startTime: Date.now(),
    postgresConnected: false,
    mongoConnected: false,

    // Metrics
    totalRequests: 0,
    totalGamesGenerated: 0,
    cacheHits: 0,
    aiCalls: 0,
    uniqueVisitors: new Set(), // Using a Set to ensure unique visitor counting

    // Generator State
    isGenerating: false,
    genProgress: 0,
    lastBatchInfo: "None",

    // Log Buffer (Stores last 150 logs for display)
    logs: []
};

/**
 * Advanced Logger Utility
 * Provides colorful console output and buffers logs for the web dashboard.
 * @param {string} type - The category of the log (e.g., DB, AI, ERR, SEC, GEN)
 * @param {string} message - The primary log message
 * @param {string} details - Additional technical details (optional)
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
        case 'SEC':  icon = '🛡️'; break; // Security Log
        case 'GEN':  icon = '⚙️'; break; // Generator Log
    }

    // 1. Print to Server Console (Standard Output)
    console.log(`[${timeString}] ${icon} [${type}] ${message} ${details ? '| ' + details : ''}`);

    // 2. Add to Dashboard Buffer
    SYSTEM_STATE.logs.unshift({
        time: timeString,
        type: type,
        msg: message,
        det: details
    });

    // 3. Prevent Memory Leak (Cap log size)
    if (SYSTEM_STATE.logs.length > 200) {
        SYSTEM_STATE.logs.pop();
    }
}

/**
 * MongoDB URI Sanitizer
 * Helper function to ensure the connection string is valid for Atlas.
 * Adds 'mongodb+srv://' if missing.
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
    ssl: { rejectUnauthorized: false }, // Required for secure cloud connections (Render/Neon)
    connectionTimeoutMillis: 5000,      // Timeout after 5s to prevent hanging
    max: 20                             // Max concurrent clients
});

// Global Error Listener for Postgres
pgPool.on('error', (err) => {
    SYSTEM_STATE.postgresConnected = false;
    logSystem('ERR', 'PostgreSQL Connection Error', err.message);
});

/**
 * Initializes PostgreSQL Database
 * Connects to the database.
 * Checks for existence of required tables.
 * Automatically creates tables if they are missing (Auto-Migration).
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
 * Used primarily for caching generated math problems to reduce API costs.
 */
async function initMongo() {
    const uri = cleanMongoURI(CONFIG.MONGO_URI);

    if (!uri) {
        logSystem('WARN', 'MongoDB URI is not defined', 'Caching features will be disabled.');
        return;
    }

    try {
        logSystem('DB', 'Initializing MongoDB connection...');
        
        // Connect without blocking the main thread
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            family: 4 // Use IPv4, skip trying IPv6
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
        index: true // Indexing for fast lookup
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
    
    // New Field: To distinguish auto-generated content
    is_auto_generated: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Compile the Model
const MathCache = mongoose.model('MathProblemCache', problemSchema);

// =================================================================================================
// SECTION 6: SERVER MIDDLEWARE & DUAL SECURITY CONFIGURATION
// =================================================================================================

const app = express();

// Trust Proxy: Crucial for correctly identifying IPs behind Load Balancers (like on Render)
app.set('trust proxy', 1);

// Standard Express Middleware
app.use(cors()); // Allow all origins (for now)
app.use(express.json({ limit: '2mb' })); // Increase limit for larger payloads
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // Serve static assets

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
 * 🛡️ LAYER 1: AI QUOTA LIMITER (The Primary Shield)
 * Prevents users from spamming the "Generate Problem" button.
 * Rule: 10 requests per 8 hours.
 * ENFORCEMENT: Forces a 60-second delay after the FIRST request.
 */
const aiLimiterQuota = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, // 8 Hours Window
    max: 10, // Max 10 Requests per Window

    // 🔥 FORCED DELAY: The 60-second wait logic
    delayAfter: 1,
    delayMs: 60 * 1000, // 60 Seconds

    message: {
        error: "Quota Limit Exceeded",
        message: "⚠️ អ្នកបានប្រើប្រាស់សិទ្ធិអស់ហើយ (10ដង/8ម៉ោង)។"
    },

    standardHeaders: true,
    legacyHeaders: false,

    // Custom key generator for Proxy environments
    keyGenerator: (req) => req.headers['x-forwarded-for'] || req.ip,

    // Bypass Logic for Admin/Owner
    skip: (req) => {
        const currentIP = req.headers['x-forwarded-for'] || req.ip;
        if (CONFIG.OWNER_IP && currentIP && currentIP.includes(CONFIG.OWNER_IP)) {
            logSystem('SEC', 'Owner Bypass', 'Skipping Rate Limit');
            return true;
        }
        return false;
    }
});

/**
 * 🛡️ LAYER 2: SPEED LIMITER (The Burst Protection) - NEW
 * Prevents "Quota Burning" (using up all 10 requests in 10 minutes).
 * Rule: 5 requests per 1 hour.
 */
const aiSpeedLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 Hour Window
    max: 5, // 🔥 Max 5 requests per hour (The new strict limit)

    message: {
        error: "Speed Limit Exceeded",
        message: "⚠️ ល្បឿនប្រើប្រាស់លឿនពេក (កំណត់ត្រឹម 5ដង/ម៉ោង)។ សូមរង់ចាំមួយរយៈ។"
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.headers['x-forwarded-for'] || req.ip,
    skip: (req) => {
        const currentIP = req.headers['x-forwarded-for'] || req.ip;
        if (CONFIG.OWNER_IP && currentIP && currentIP.includes(CONFIG.OWNER_IP)) {
            return true;
        }
        return false;
    }
});

// =================================================================================================
// SECTION 7: DASHBOARD UI (SERVER-SIDE RENDERED)
// =================================================================================================

/**
 * MAIN ROUTE (/)
 * Renders the robust HTML/CSS Dashboard for monitoring the system.
 */
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
            .panel {
                background-color: var(--bg-panel);
                border: 1px solid var(--border-color);
                border-radius: 16px;
                padding: 30px;
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2);
            }
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
            
            .btn-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
                margin-top: 20px;
            }

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
                transition: background 0.3s;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .action-btn:hover { background: var(--accent-hover); }
            .action-btn.purple { background: #8b5cf6; }
            .action-btn.purple:hover { background: #7c3aed; }

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
                        <span class="version-tag">v7.2.1 (Auto-Gen + IMO)</span>
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
                        <div class="metric-label">Security Protocol</div>
                        <div class="metric-value" style="color: var(--success)">DUAL ACTIVE</div>
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

            <div class="btn-grid">
                <a href="/admin/requests" class="action-btn">
                    🔐 CERTIFICATE MANAGER
                </a>
                <a href="/admin/generator" class="action-btn purple">
                    ⚙️ AUTO-GENERATOR ENGINE
                </a>
            </div>

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
// SECTION 8: CORE GAME ENGINE (HYBRID AI + CACHE)
// =================================================================================================

/**
 * 🤖 GENERATE PROBLEM API
 * The core logic of the BrainTest app.
 * LOGIC FLOW:
 * 1. Validate Client Input.
 * 2. Force Default Metadata (Topic/Difficulty) if missing.
 * 3. Check MongoDB Cache (25% Probability).
 * 4. If Cache Miss -> Call Google Gemini AI.
 * 5. Save AI result to Cache.
 * 6. Return Problem to Client.
 */
// 🔥 APPLIED DUAL RATE LIMITERS (QUOTA + SPEED)
app.post('/api/generate-problem', aiLimiterQuota, aiSpeedLimiter, async (req, res) => {
    // 1. Data Extraction
    const { prompt, topic, difficulty } = req.body;

    // 2. Validation
    if (!prompt) {
        return res.status(400).json({ error: "Bad Request", message: "Prompt is required." });
    }

    SYSTEM_STATE.totalGamesGenerated++;

    // 🔥 VITAL WORKAROUND: DEFAULT VALUES
    // Ensures we can always save to cache, even if client app sends nulls.
    const finalTopic = topic || "General";
    const finalDifficulty = difficulty || "Medium";

    let problemContent = null;
    let source = "ai"; // Default source tag

    // -------------------------------------------------------------------------
    // STEP 3: CACHE LOOKUP STRATEGY
    // -------------------------------------------------------------------------
    // We only check cache if Mongo is connected AND RNG < CACHE_RATE (25%)
    if (SYSTEM_STATE.mongoConnected && Math.random() < CONFIG.CACHE_RATE) {
        logSystem('DB', `Searching Cache...`, `${finalTopic} / ${finalDifficulty}`);
        try {
            // MongoDB Aggregation Pipeline: Match + Random Sample
            const cached = await MathCache.aggregate([
                { $match: { topic: finalTopic, difficulty: finalDifficulty } },
                { $sample: { size: 1 } }
            ]);
            
            if (cached.length > 0) {
                problemContent = cached[0].raw_text;
                source = "cache";
                SYSTEM_STATE.cacheHits++;
                logSystem('OK', 'Cache Hit', 'Content served from MongoDB');
            }
        } catch (e) {
            logSystem('ERR', 'Cache Read Error', e.message);
        }
    }

    // -------------------------------------------------------------------------
    // STEP 4: AI GENERATION FALLBACK
    // -------------------------------------------------------------------------
    // If no cache result found, we MUST generate new content.
    if (!problemContent) {
        logSystem('AI', 'Calling Gemini API', 'Generating fresh content...');
        SYSTEM_STATE.aiCalls++;
        
        try {
            // Initialize Gemini
            const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
            const model = genAI.getGenerativeModel({ model: CONFIG.AI_MODEL });
            
            // Execute Generation
            const result = await model.generateContent(prompt);
            const response = await result.response;
            problemContent = response.text();
            
            // -----------------------------------------------------------------
            // STEP 5: SAVE TO CACHE
            // -----------------------------------------------------------------
            if (problemContent && SYSTEM_STATE.mongoConnected) {
                MathCache.create({
                    topic: finalTopic,            // Using forced defaults
                    difficulty: finalDifficulty,  // Using forced defaults
                    raw_text: problemContent,
                    source_ip: req.ip
                }).then(() => {
                    logSystem('DB', 'Cache Updated', 'New problem saved permanently.');
                }).catch(e => {
                    logSystem('WARN', 'Cache Write Failed', e.message);
                });
            }

        } catch (err) {
            logSystem('ERR', 'AI Generation Failed', err.message);
            // Return 500. The Rate Limiter will ensure the client 
            // waits before retrying, preventing spam loops.
            return res.status(500).json({ error: "AI Service Failure" });
        }
    }

    // 6. Final Response
    res.json({
        text: problemContent,
        source: source,
        metadata: {
            topic: finalTopic,
            difficulty: finalDifficulty
        }
    });
});

// =================================================================================================
// SECTION 9: LEADERBOARD & SCORING SYSTEM
// =================================================================================================

/**
 * 🏆 SUBMIT SCORE API (PUBLIC/GUEST)
 * Handles score submission using client-supplied username.
 */
app.post('/api/leaderboard/submit', async (req, res) => {
    // 🔥 NO TOKEN REQUIRED - PUBLIC MODE
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

        // 2. SMART MERGE LOGIC
        const check = await client.query(
            'SELECT id, score FROM leaderboard WHERE username = $1 AND difficulty = $2 ORDER BY id ASC',
            [username, difficulty]
        );

        if (check.rows.length > 0) {
            // MERGE
            const rows = check.rows;
            const targetId = rows[0].id; 
            const currentTotal = rows.reduce((acc, row) => acc + row.score, 0);
            const finalScore = currentTotal + score;

            await client.query('UPDATE leaderboard SET score = $1, updated_at = NOW() WHERE id = $2', [finalScore, targetId]);
            logSystem('DB', `Merged Score`, `User: ${username}, Total: ${finalScore}`);

            // DEDUPLICATE
            if (rows.length > 1) {
                const idsToDelete = rows.slice(1).map(r => r.id);
                await client.query('DELETE FROM leaderboard WHERE id = ANY($1::int[])', [idsToDelete]);
            }
        } else {
            // INSERT
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
 * Returns aggregated scores for the global leaderboard.
 */
app.get('/api/leaderboard/top', async (req, res) => {
    try {
        const client = await pgPool.connect();
        // SQL Aggregation: Sum scores across all difficulties per user
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
// SECTION 10: ADMINISTRATIVE PANEL - CERTIFICATES
// =================================================================================================

// 1. Submit Request
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

// 2. Generate Image Link
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

// 3. Delete Request
app.delete('/admin/delete-request/:id', async (req, res) => {
    try {
        const client = await pgPool.connect();
        await client.query('DELETE FROM certificate_requests WHERE id = $1', [req.params.id]);
        client.release();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// 4. Admin UI (Requests)
app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pgPool.connect();
        const result = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
        client.release();

        const rows = result.rows.map(r => `
            <tr id="row-${r.id}">
                <td><span class="id-badge">#${r.id}</span></td>
                <td style="font-weight:700; color:#1e293b;">${r.username}</td>
                <td><span class="score-badge">${r.score}</span></td>
                <td>${new Date(r.request_date).toLocaleDateString()}</td>
                <td class="actions">
                    <a href="/admin/generate-cert/${r.id}" target="_blank" class="btn-icon print" title="Generate & Print">🖨️</a>
                    <button class="btn-icon del" onclick="del(${r.id})" title="Remove">🗑️</button>
                </td>
            </tr>
        `).join('');

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>BrainTest Admin Control</title>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Inter', sans-serif; background:#f8fafc; padding:50px; color:#334155; display:flex; justify-content:center; }
                    .admin-panel { width: 100%; max-width:1000px; background:white; padding:40px; border-radius:20px; box-shadow:0 10px 25px -5px rgba(0,0,0,0.05); }
                    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; }
                    h2 { margin:0; color:#0f172a; font-size: 1.5rem; }
                    .back-link { text-decoration:none; color:#64748b; font-weight:600; transition: color 0.2s; }
                    .back-link:hover { color: #3b82f6; }
                    table { width:100%; border-collapse:separate; border-spacing: 0 10px; }
                    th { text-align:left; padding:15px; color:#94a3b8; font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; }
                    td { background: #f8fafc; padding:15px; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; }
                    .id-badge { font-family: monospace; color: #94a3b8; }
                    .score-badge { background:#dbeafe; color:#1e40af; padding:5px 10px; border-radius:99px; font-weight:700; font-size:0.85rem; }
                    .actions { display: flex; gap: 15px; }
                    .btn-icon { border:none; background:white; cursor:pointer; font-size:1.2rem; width: 40px; height: 40px; border-radius: 50%; box-shadow: 0 2px 5px rgba(0,0,0,0.05); transition: transform 0.2s; text-decoration: none; display: flex; align-items: center; justify-content: center; }
                    .btn-icon:hover { transform: scale(1.1); }
                </style>
            </head>
            <body>
                <div class="admin-panel">
                    <div class="header">
                        <h2>🛡️ Certificate Management</h2>
                        <a href="/" class="back-link">← DASHBOARD</a>
                    </div>
                    <table>
                        <thead>
                            <tr><th>Ref ID</th><th>Username</th><th>High Score</th><th>Submission Date</th><th>Actions</th></tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <script>
                    async function del(id){
                        if(confirm('Are you sure you want to PERMANENTLY delete this request?')){
                            const row = document.getElementById('row-'+id);
                            row.style.opacity = '0.5';
                            await fetch('/admin/delete-request/'+id,{method:'DELETE'});
                            row.remove();
                        }
                    }
                </script>
            </body>
            </html>
        `);
    } catch (e) { res.status(500).send("Admin Panel Error"); }
});

// =================================================================================================
// SECTION 11: ADMINISTRATIVE PANEL - AUTO GENERATOR (NEW FEATURE)
// =================================================================================================

/** 
 * HELPER: Math Topic Dictionary
 * Defines the complex forms for specific targeting in the generator.
 */
const MATH_TOPICS = {
    "Limits": ["Indeterminate 0/0", "Indeterminate Infinity/Infinity", "Trigonometric Limits", "Exponential Limits", "Continuity"],
    "Derivatives": ["Chain Rule", "Implicit Differentiation", "Parametric Equations", "Higher Order Derivatives"],
    "Integrals": ["Rational Functions", "Integration by Parts", "Trigonometric Substitution", "Definite Integrals", "Area & Volume"],
    "Complex Numbers": ["Modulus & Argument", "De Moivre's Theorem", "Roots of Unity", "Geometric Representation"],
    "Geometry": ["3D Space Vectors", "Plane Equations", "Sphere Equations", "Cross Product Applications"],
    "Probability": ["Conditional Probability", "Combinatorics", "Bernoulli Trials"]
};

/**
 * HELPER: Difficulty Prompt Modifier
 * Ensures the AI understands exactly what "Hard" means for our context.
 */
function getDifficultyPrompt(level) {
    switch(level) {
        case "Easy": return "Level: Grade 12 Advanced Exam (BacII). Requires standard formulas but careful calculation.";
        case "Medium": return "Level: University Scholarship Exam. Requires trick substitutions or deep understanding.";
        case "Hard": return "Level: National Math Olympiad. Requires creative insight, proof, or non-standard approach.";
        case "Very Hard": return "Level: IMO (International Math Olympiad). Extremely abstract, multi-step logic, very difficult.";
        default: return "Level: Standard.";
    }
}

/**
 * API: Trigger Batch Generation
 * Runs in background to prevent timeout.
 */
app.post('/admin/run-auto-gen', async (req, res) => {
    const { topic, subtopic, difficulty } = req.body;
    
    // Safety Checks
    if (SYSTEM_STATE.isGenerating) return res.status(429).json({ error: "Job already running" });
    if (!SYSTEM_STATE.mongoConnected) return res.status(500).json({ error: "MongoDB not connected" });

    // Lock System
    SYSTEM_STATE.isGenerating = true;
    SYSTEM_STATE.genProgress = 0;
    SYSTEM_STATE.lastBatchInfo = `${topic} (${subtopic}) - ${difficulty}`;
    
    // Start background process (Fire and Forget)
    (async () => {
        const count = 10;
        const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
        const model = genAI.getGenerativeModel({ model: CONFIG.AI_MODEL });

        logSystem('GEN', `Starting Batch Job: ${topic} (${subtopic}) - ${difficulty}`);

        for (let i = 0; i < count; i++) {
            try {
                // Construct High-Precision Prompt
                const prompt = `
                Create a unique math problem.
                Topic: ${topic} specifically focusing on ${subtopic}.
                ${getDifficultyPrompt(difficulty)}
                
                OUTPUT FORMAT:
                Return ONLY the math problem in LaTeX or clear text.
                Do NOT provide the solution.
                Ensure the numbers are clean but the logic is challenging.
                `;

                // Call AI
                const result = await model.generateContent(prompt);
                const text = result.response.text();

                // Save to DB (Marked as Auto-Generated)
                await MathCache.create({
                    topic: topic, 
                    difficulty: difficulty,
                    raw_text: text,
                    source_ip: 'AUTO-GEN-BOT',
                    is_auto_generated: true
                });

                // Update Progress
                SYSTEM_STATE.genProgress = ((i + 1) / count) * 100;
                logSystem('GEN', `Generated ${i+1}/${count}`, `${topic} - ${difficulty}`);
                
                // Sleep 2 seconds to avoid Rate Limits (Google Flash Limit)
                await new Promise(r => setTimeout(r, 2000));

            } catch (err) {
                logSystem('ERR', 'Batch Gen Failed', err.message);
            }
        }
        
        // Unlock System
        SYSTEM_STATE.isGenerating = false;
        logSystem('GEN', 'Batch Job Complete', '10 Problems Added.');
    })();

    res.json({ success: true, message: "Started generating 10 problems in background." });
});

/**
 * UI: Generator Dashboard
 * A specialized interface for the admin to control the bot.
 */
app.get('/admin/generator', (req, res) => {
    // Dynamically build dropdown options from dictionary
    let topicOptions = "";
    for (const [key, subs] of Object.entries(MATH_TOPICS)) {
        subs.forEach(sub => {
            topicOptions += `<option value="${key}|${sub}">${key} - ${sub}</option>`;
        });
    }

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Titan Auto-Generator</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
        <style>
            body { background: #0f172a; color: #fff; font-family: 'Inter', sans-serif; padding: 50px; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin:0; }
            .card { background: #1e293b; padding: 40px; border-radius: 20px; width: 600px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #334155; }
            h2 { color: #8b5cf6; margin-top: 0; display: flex; align-items: center; gap: 10px; }
            label { display: block; margin-bottom: 8px; color: #94a3b8; font-size: 0.9rem; font-weight: bold; }
            select, button { width: 100%; padding: 15px; margin-bottom: 20px; border-radius: 10px; border: 1px solid #334155; background: #0f172a; color: white; font-size: 1rem; appearance: none; }
            select:focus, button:focus { outline: 2px solid #8b5cf6; }
            
            button { background: #8b5cf6; font-weight: bold; cursor: pointer; transition: 0.2s; border: none; text-transform: uppercase; letter-spacing: 1px; }
            button:hover { background: #7c3aed; transform: translateY(-2px); }
            button:disabled { background: #475569; cursor: not-allowed; transform: none; }
            
            .status { margin-top: 20px; padding: 20px; background: #000; border-radius: 10px; font-family: monospace; color: #4ade80; border: 1px solid #334155; height: 150px; overflow-y: auto; }
            .back { text-align: center; display: block; color: #64748b; text-decoration: none; margin-top: 20px; font-weight: 600; }
            .back:hover { color: #fff; }
            
            .badge-imo { background: #dc2626; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; vertical-align: middle; }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>⚙️ AI MATH GENERATOR</h2>
            <p style="color: #cbd5e1; margin-bottom: 30px;">
                Generates 10 problems per batch. Content is automatically saved to the MongoDB Cluster.
            </p>
            
            <label>TARGET TOPIC & SUB-FORM</label>
            <select id="topicSel">${topicOptions}</select>

            <label>DIFFICULTY LEVEL</label>
            <select id="diffSel">
                <option value="Easy">Easy (BacII Standard)</option>
                <option value="Medium" selected>Medium (Scholarship/Uni)</option>
                <option value="Hard">Hard (National Olympiad)</option>
                <option value="Very Hard">Very Hard (IMO / Global) 🔥</option>
            </select>

            <button onclick="startGen()" id="btnGen">⚡ GENERATE BATCH (10)</button>
            
            <label>CONSOLE OUTPUT</label>
            <div class="status" id="console">System Ready... Waiting for command.</div>
            
            <a href="/" class="back">← RETURN TO MAIN DASHBOARD</a>
        </div>

        <script>
            async function startGen() {
                const btn = document.getElementById('btnGen');
                const con = document.getElementById('console');
                const [topic, subtopic] = document.getElementById('topicSel').value.split('|');
                const diff = document.getElementById('diffSel').value;

                // UI Lockdown
                btn.disabled = true;
                btn.innerText = "⏳ CONTACTING TITAN ENGINE...";
                con.innerText = ">> [INIT] Establishing connection to Gemini 1.5 Flash...\\n";
                con.innerText += ">> [REQ] Generating batch for: " + topic + " (" + diff + ")\\n";

                try {
                    const res = await fetch('/admin/run-auto-gen', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ topic, subtopic, difficulty: diff })
                    });
                    const data = await res.json();
                    
                    if(data.success) {
                        con.innerText += ">> [OK] Job Started Successfully!\\n";
                        con.innerText += ">> [INFO] Check Server Terminal for real-time logs.\\n";
                        con.innerText += ">> [WAIT] Please wait 20 seconds for the batch to finish...\\n";
                        
                        // Cooldown timer visual
                        let timeLeft = 20;
                        const timer = setInterval(() => {
                            btn.innerText = "PROCESSING... (" + timeLeft + "s)";
                            timeLeft--;
                            if(timeLeft < 0) {
                                clearInterval(timer);
                                btn.disabled = false;
                                btn.innerText = "⚡ GENERATE BATCH (10)";
                                con.innerText += ">> [DONE] Batch complete. Ready for next task.";
                            }
                        }, 1000);
                        
                    } else {
                        con.innerText += ">> [ERR] " + data.error;
                        btn.disabled = false;
                        btn.innerText = "⚡ GENERATE BATCH (10)";
                    }
                } catch(e) {
                    con.innerText += ">> [FATAL] Connection Failed.";
                    btn.disabled = false;
                    btn.innerText = "RETRY CONNECTION";
                }
            }
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// =================================================================================================
// SECTION 12: SYSTEM INITIALIZATION (NON-BLOCKING STARTUP)
// =================================================================================================

/**
 * 🚀 STARTUP SEQUENCE
 * Initializes the server components without 'await' to ensure immediate listening.
 */
async function startSystem() {
    console.clear();
    logSystem('OK', 'Initializing BrainTest Titan Engine v7.2.1...');
    logSystem('INFO', 'Starting Non-Blocking Database Connections...');

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
        console.log(`   ADMIN GENERATOR: /admin/generator               `);
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
