/**
 * =================================================================================================
 * PROJECT:      BRAINTEST - ULTIMATE HYBRID BACKEND (ENTERPRISE EDITION)
 * VERSION:      6.3.3 (FULL STABLE + CLIENT FIX)
 * AUTHOR:       BRAINTEST TEAM
 * DATE:         DECEMBER 2025
 * * DESCRIPTION:  
 * This is the complete backend solution for the BrainTest application.
 * It integrates PostgreSQL for leaderboards and certificates, and MongoDB for 
 * AI problem caching. It features a robust anti-spam system and a full 
 * graphical dashboard for monitoring.
 * * KEY FEATURES:
 * 1. Hybrid AI/Cache Logic (Gemini API + MongoDB)
 * 2. Anti-Spam Rate Limiting (10 requests/8 hours + 60s Forced Delay)
 * 3. Smart Leaderboard Merging (PostgreSQL)
 * 4. Automatic "General/Medium" default for missing client data
 * 5. Full HTML/CSS Dashboard & Admin Panel
 * =================================================================================================
 */

// =================================================================================================
// SECTION 1: LIBRARY IMPORTS & SYSTEM CONFIGURATION
// =================================================================================================

// 1.1 Load Environment Variables
// This loads the secret keys from your Render Environment
require('dotenv').config();

// 1.2 Import Essential Dependencies
const express = require('express');           // The Web Server Framework
const cors = require('cors');                 // Cross-Origin Resource Sharing
const path = require('path');                 // File Path Utilities
const { Pool } = require('pg');               // PostgreSQL Client
const mongoose = require('mongoose');         // MongoDB Object Modeling
const { GoogleGenerativeAI } = require('@google/generative-ai'); // AI Engine
const rateLimit = require('express-rate-limit'); // Security Limiter

// 1.3 System Configuration Object
// Centralized configuration for easy adjustments
const CONFIG = {
    // Server Port (Default to 3000 if not specified)
    PORT: process.env.PORT || 3000,
    
    // Environment Mode
    ENV: process.env.NODE_ENV || 'development',
    
    // Database Connection Strings
    POSTGRES_URL: process.env.DATABASE_URL,
    MONGO_URI: process.env.MONGODB_URI,
    
    // Google Gemini AI Configuration
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    AI_MODEL: "gemini-2.5-flash", // Fast and efficient model
    
    // External Services
    IMG_API: process.env.EXTERNAL_IMAGE_API, // For generating certificates
    
    // Security Whitelist
    // Put your IP here in Render .env to bypass rate limits
    OWNER_IP: process.env.OWNER_IP, 
    
    // Cache Strategy
    CACHE_RATE: 0.25, // 25% chance to read from cache, 75% chance to generate new
    
    // Score Validation Limits (Anti-Cheat)
    ALLOWED_SCORES: {
        "Easy": 5,
        "Medium": 10,
        "Hard": 15,
        "Very Hard": 20
    }
};

// 1.4 System State Monitoring (Global Variables)
// These variables track the server's health in real-time
const SYSTEM_STATE = {
    startTime: Date.now(),
    postgresConnected: false,
    mongoConnected: false,
    totalRequests: 0,
    totalGamesGenerated: 0,
    cacheHits: 0,
    aiCalls: 0,
    visitors: new Set(), // Tracks unique IPs
    logs: [] // Stores recent 100 logs for the dashboard display
};

// =================================================================================================
// SECTION 2: LOGGING UTILITIES & HELPERS
// =================================================================================================

/**
 * Advanced System Logger
 * Logs messages to the console AND saves them to memory for the Dashboard.
 * * @param {string} type - The category of the log (DB, AI, ERR, NET, OK, WARN)
 * @param {string} message - The main log message
 * @param {string} details - Additional technical details (optional)
 */
function logSystem(type, message, details = '') {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    let icon = 'ℹ️';

    // Assign icons based on log type
    switch(type) {
        case 'DB': icon = '🗄️'; break;
        case 'AI': icon = '🤖'; break;
        case 'ERR': icon = '❌'; break;
        case 'OK': icon = '✅'; break;
        case 'NET': icon = '📡'; break;
        case 'WARN': icon = '⚠️'; break;
    }

    // 1. Print to Server Console (Render Logs)
    console.log(`[${time}] ${icon} [${type}] ${message} ${details ? '| ' + details : ''}`);

    // 2. Save to Memory (For Dashboard UI)
    // Add to the beginning of the array
    SYSTEM_STATE.logs.unshift({ time, type, msg: message, det: details });
    
    // Keep only the last 100 logs to prevent memory overflow
    if (SYSTEM_STATE.logs.length > 100) {
        SYSTEM_STATE.logs.pop();
    }
}

/**
 * MongoDB URI Cleaner
 * Ensures the connection string has the correct prefix for Atlas.
 */
function cleanMongoURI(uri) {
    if (!uri) return null;
    let clean = uri.trim();
    // Add mongodb+srv:// if missing
    if (!clean.startsWith('mongodb://') && !clean.startsWith('mongodb+srv://')) {
        logSystem('WARN', 'Fixing MongoDB URI', 'Added mongodb+srv:// prefix');
        return `mongodb+srv://${clean}`;
    }
    return clean;
}

// =================================================================================================
// SECTION 3: DATABASE CONNECTIONS (POSTGRESQL & MONGODB)
// =================================================================================================

// -------------------------------------------------------------------------------------------------
// 3.1 PostgreSQL Connection (For Leaderboard & Certificates)
// -------------------------------------------------------------------------------------------------
const pgPool = new Pool({
    connectionString: CONFIG.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }, // Required for secure cloud connections
    connectionTimeoutMillis: 5000 // 5 second timeout
});

// Global Error Handler for Postgres
pgPool.on('error', (err) => {
    SYSTEM_STATE.postgresConnected = false;
    logSystem('ERR', 'PostgreSQL Error', err.message);
});

async function initPostgres() {
    try {
        const client = await pgPool.connect();
        SYSTEM_STATE.postgresConnected = true;
        
        // AUTO-MIGRATION: Create Tables if they don't exist
        // Note: We include 'updated_at' and 'ip_address' columns
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
            
            CREATE TABLE IF NOT EXISTS certificate_requests (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) NOT NULL,
                score INTEGER NOT NULL,
                status VARCHAR(20) DEFAULT 'Pending',
                request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        logSystem('OK', 'PostgreSQL Ready', 'Tables Verified');
        client.release();
    } catch (err) {
        logSystem('ERR', 'PostgreSQL Failed', err.message);
    }
}

// -------------------------------------------------------------------------------------------------
// 3.2 MongoDB Connection (For Caching Math Problems)
// -------------------------------------------------------------------------------------------------
async function initMongo() {
    const uri = cleanMongoURI(CONFIG.MONGO_URI);
    
    if (!uri) {
        logSystem('WARN', 'MongoDB URI Missing', 'Caching Disabled');
        return;
    }

    try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        SYSTEM_STATE.mongoConnected = true;
        logSystem('OK', 'MongoDB Connected', 'Cache System Ready');
    } catch (err) {
        SYSTEM_STATE.mongoConnected = false;
        logSystem('ERR', 'MongoDB Failed', err.message);
    }
}

// Listen for Mongo events
mongoose.connection.on('connected', () => SYSTEM_STATE.mongoConnected = true);
mongoose.connection.on('disconnected', () => SYSTEM_STATE.mongoConnected = false);

// =================================================================================================
// SECTION 4: MONGODB MODELS (DATA SCHEMA)
// =================================================================================================

// Schema for storing AI-generated math problems
const problemSchema = new mongoose.Schema({
    topic: { type: String, required: true, index: true },      // e.g., "Calculus"
    difficulty: { type: String, required: true, index: true }, // e.g., "Hard"
    raw_text: { type: String, required: true },                // The JSON from AI
    source_ip: String,                                         // IP that requested it
    createdAt: { type: Date, default: Date.now }
});

const MathCache = mongoose.model('MathProblemCache', problemSchema);

// =================================================================================================
// SECTION 5: SERVER MIDDLEWARE & SECURITY LAYERS
// =================================================================================================

const app = express();
app.set('trust proxy', 1); // Crucial for Render to detect real IPs

// Standard Middleware
app.use(cors()); // Allow all connections
app.use(express.json({ limit: '1mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files

// Traffic Logger Middleware
app.use((req, res, next) => {
    SYSTEM_STATE.totalRequests++;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    SYSTEM_STATE.visitors.add(ip);
    
    // Log API calls to dashboard
    if (req.path.includes('/api') || req.path.includes('/admin')) {
        logSystem('NET', `${req.method} ${req.path}`, `IP: ${ip}`);
    }
    next();
});

/**
 * 🔥 STRICT ANTI-SPAM RATE LIMITER (v6.3.3)
 * This is the primary defense against the "30 calls at once" issue.
 * * Rules:
 * 1. Window: 8 Hours
 * 2. Max Requests: 10
 * 3. DELAY: After the 1st request, force a 60 second wait.
 */
const aiLimiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, // 8 Hours
    max: 10, // Limit each IP to 10 requests per window
    
    // 🔥 THE FIX: Stop auto-retry loops immediately
    delayAfter: 1, 
    delayMs: 60 * 1000, // 60 Seconds forced delay
    
    message: { 
        error: "Rate limit exceeded", 
        message: "⚠️ អ្នកបានប្រើប្រាស់សិទ្ធិអស់ហើយ (10ដង/8ម៉ោង)។ សូមរង់ចាំ 60 វិនាទី។" 
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Extract IP correctly on Render
    keyGenerator: (req) => {
        return req.headers['x-forwarded-for'] || req.ip; 
    },
    // Bypass logic for Owner
    skip: (req) => {
        const currentIP = req.headers['x-forwarded-for'] || req.ip;
        const ownerIP = CONFIG.OWNER_IP;
        
        // If the IP matches the owner, skip all limits
        if (ownerIP && currentIP && currentIP.includes(ownerIP)) {
            logSystem('OK', '👑 Owner Access Bypass', `Skipped Limit`);
            return true; 
        }
        return false;
    }
});

// =================================================================================================
// SECTION 6: DASHBOARD UI (THE "ENTERPRISE" LOOK)
// =================================================================================================

app.get('/', (req, res) => {
    // Calculate Uptime
    const uptime = process.uptime();
    const d = Math.floor(uptime / 86400);
    const h = Math.floor((uptime % 86400) / 3600);
    const m = Math.floor((uptime % 3600) / 60);

    // Status Indicators
    const pgStatus = SYSTEM_STATE.postgresConnected ? 
        '<span style="color:#10b981">● CONNECTED</span>' : '<span style="color:#ef4444">● FAILED</span>';
    
    const mgStatus = SYSTEM_STATE.mongoConnected ? 
        '<span style="color:#10b981">● CONNECTED</span>' : '<span style="color:#ef4444">● FAILED</span>';

    // Render HTML
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BRAINTEST ENTERPRISE v6.3.3</title>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;700&display=swap" rel="stylesheet">
        <style>
            :root { 
                --bg: #0f172a; 
                --card: #1e293b; 
                --text: #f8fafc; 
                --accent: #3b82f6; 
                --success: #10b981; 
                --error: #ef4444; 
            }
            body { 
                background: var(--bg); 
                color: var(--text); 
                font-family: 'Inter', sans-serif; 
                padding: 20px; 
                margin: 0; 
                min-height: 100vh; 
                display: flex; 
                justify-content: center; 
            }
            .container { max-width: 900px; width: 100%; display: grid; gap: 20px; }
            .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
            .card { 
                background: var(--card); 
                padding: 25px; 
                border-radius: 12px; 
                border: 1px solid #334155; 
                box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); 
            }
            h1 { font-size: 1.8rem; color: var(--accent); margin: 0; display: flex; align-items: center; gap: 10px; }
            .sub { font-size: 0.9rem; color: #94a3b8; font-family: 'JetBrains Mono', monospace; margin-top: 5px; }
            
            .stats-grid { 
                display: grid; 
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); 
                gap: 15px; 
                margin-top: 20px; 
            }
            .stat { 
                background: #020617; 
                padding: 20px; 
                border-radius: 8px; 
                border: 1px solid #1e293b; 
                text-align: center; 
            }
            .stat-label { 
                font-size: 0.7rem; 
                text-transform: uppercase; 
                letter-spacing: 1px; 
                color: #64748b; 
                font-weight: bold; 
                margin-bottom: 8px; 
            }
            .stat-val { font-size: 1.2rem; font-weight: bold; font-family: 'JetBrains Mono', monospace; }
            
            .log-box { 
                height: 400px; 
                overflow-y: auto; 
                background: #000; 
                border-radius: 8px; 
                padding: 15px; 
                font-family: 'JetBrains Mono', monospace; 
                font-size: 0.8rem; 
                border: 1px solid #334155; 
                box-shadow: inset 0 0 10px rgba(0,0,0,0.5); 
            }
            .log-item { margin-bottom: 8px; border-bottom: 1px solid #1e1e1e; padding-bottom: 6px; display: flex; gap: 12px; }
            .time { color: #64748b; min-width: 70px; }
            .msg { color: #e2e8f0; flex: 1; }
            .det { color: #475569; font-size: 0.75rem; }
            
            .btn { 
                display: inline-block; 
                width: 100%; 
                background: var(--accent); 
                color: white; 
                text-align: center; 
                padding: 15px; 
                border-radius: 8px; 
                text-decoration: none; 
                font-weight: bold; 
                margin-top: 15px; 
                transition: 0.2s; 
            }
            .btn:hover { background: #2563eb; }
            
            /* Scrollbar styling */
            ::-webkit-scrollbar { width: 8px; }
            ::-webkit-scrollbar-track { background: #0f172a; }
            ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="card">
                <div class="header">
                    <h1>🚀 BRAINTEST <span style="font-size:0.8em; opacity:0.7;">v6.3.3</span></h1>
                    <div style="text-align:right">
                        <div class="sub">STATUS: ONLINE</div>
                    </div>
                </div>
                <div class="sub">Uptime: ${d}d ${h}h ${m}m | Protection: 60s Delay Active</div>
                
                <div class="stats-grid">
                    <div class="stat"><div class="stat-label">PostgreSQL</div><div class="stat-val">${pgStatus}</div></div>
                    <div class="stat"><div class="stat-label">MongoDB Cache</div><div class="stat-val">${mgStatus}</div></div>
                    <div class="stat"><div class="stat-label">Total Requests</div><div class="stat-val" style="color:#fbbf24">${SYSTEM_STATE.totalRequests}</div></div>
                    <div class="stat"><div class="stat-label">Unique Visitors</div><div class="stat-val" style="color:#a78bfa">${SYSTEM_STATE.visitors.size}</div></div>
                    <div class="stat"><div class="stat-label">AI Generated</div><div class="stat-val" style="color:#f472b6">${SYSTEM_STATE.aiCalls}</div></div>
                    <div class="stat"><div class="stat-label">Cache Hits</div><div class="stat-val" style="color:#34d399">${SYSTEM_STATE.cacheHits}</div></div>
                </div>
            </div>

            <div class="card">
                <div class="header">
                    <div class="stat-label">SYSTEM LOGS (REAL-TIME)</div>
                </div>
                <div class="log-box" id="logs">
                    ${SYSTEM_STATE.logs.map(l => `
                        <div class="log-item">
                            <span class="time">${l.time}</span>
                            <span class="msg">${l.msg}</span>
                            <span class="det">${l.det}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <a href="/admin/requests" class="btn">🔐 ACCESS ADMIN CONTROL PANEL</a>
        </div>
        <script>
            // Auto Refresh Logic to keep dashboard alive
            setTimeout(() => location.reload(), 10000);
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// =================================================================================================
// SECTION 7: CORE HYBRID LOGIC (AI + CACHE)
// =================================================================================================

app.post('/api/generate-problem', aiLimiter, async (req, res) => {
    // 1. Extract Data from Client
    const { prompt, topic, difficulty } = req.body;
    
    // 2. Validate Input
    if (!prompt) return res.status(400).json({ error: "Missing Prompt" });

    SYSTEM_STATE.totalGamesGenerated++;

    // ---------------------------------------------------------------------------------------------
    // 🔥 WORKAROUND FIX (v6.3.3)
    // If the client app forgets to send topic/difficulty, we FORCE default values.
    // This ensures MongoDB ALWAYS saves the problem.
    // ---------------------------------------------------------------------------------------------
    const finalTopic = topic || "General";
    const finalDifficulty = difficulty || "Medium";
    
    // 3. CACHE STRATEGY (25% Chance to check Cache first)
    let problemContent = null;
    let source = "ai";

    if (SYSTEM_STATE.mongoConnected && Math.random() < CONFIG.CACHE_RATE) {
        logSystem('DB', `Checking Cache for ${finalTopic}...`);
        try {
            // Find a random problem matching criteria
            const cached = await MathCache.aggregate([
                { $match: { topic: finalTopic, difficulty: finalDifficulty } }, 
                { $sample: { size: 1 } }
            ]);

            if (cached.length > 0) {
                problemContent = cached[0].raw_text;
                source = "cache";
                SYSTEM_STATE.cacheHits++;
                logSystem('OK', 'Cache Hit', 'Served from MongoDB');
            }
        } catch (e) {
            logSystem('ERR', 'Cache Read Failed', e.message);
        }
    }

    // 4. AI FALLBACK (75% Chance or if Cache was empty)
    if (!problemContent) {
        logSystem('AI', 'Calling Gemini API', 'Generating New Problem...');
        SYSTEM_STATE.aiCalls++;
        
        try {
            // --- GEMINI API LOGIC ---
            const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
            const model = genAI.getGenerativeModel({ model: CONFIG.AI_MODEL });
            
            const result = await model.generateContent(prompt);
            const response = await result.response;
            problemContent = response.text();
            // ------------------------

            // 5. SAVE TO CACHE (Unconditional Save)
            // We use finalTopic/finalDifficulty so it never skips saving
            if (problemContent && SYSTEM_STATE.mongoConnected) {
                MathCache.create({
                    topic: finalTopic,           // Use forced default if missing
                    difficulty: finalDifficulty, // Use forced default if missing
                    raw_text: problemContent,
                    source_ip: req.ip
                }).then(() => {
                    logSystem('DB', 'Saved to Cache', `${finalTopic} / ${finalDifficulty}`);
                }).catch(e => {
                    logSystem('WARN', 'Cache Write Failed', e.message);
                });
            }

        } catch (err) {
            logSystem('ERR', 'AI Generation Failed', err.message);
            // Return 500 error. The client will try to retry, BUT our 60s delay
            // will prevent it from spamming us.
            return res.status(500).json({ error: "AI Failed" });
        }
    }

    // 6. Return Result to Client
    res.json({ text: problemContent, source });
});

// =================================================================================================
// SECTION 8: LEADERBOARD SYSTEM (SMART MERGE LOGIC)
// =================================================================================================

app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;

    // Validation
    if (!username || typeof score !== 'number' || !difficulty) {
        return res.status(400).json({ success: false, message: "Invalid Data" });
    }

    // Anti-Cheat Check
    const maxAllowed = CONFIG.ALLOWED_SCORES[difficulty] || 100;
    if (score > maxAllowed) {
        logSystem('WARN', `Suspicious Score: ${username}`, `Points: ${score}`);
        return res.status(403).json({ success: false, message: "Score Rejected" });
    }

    try {
        const client = await pgPool.connect();

        // 8.1 SMART MERGE ALGORITHM
        // First, check if this user already has an entry for this difficulty
        const check = await client.query(
            'SELECT id, score FROM leaderboard WHERE username = $1 AND difficulty = $2 ORDER BY id ASC',
            [username, difficulty]
        );

        if (check.rows.length > 0) {
            // MERGE MODE: User exists, so update their score
            const rows = check.rows;
            const targetId = rows[0].id; // Keep the oldest ID
            
            // Calculate total score (sum of existing + new)
            const currentTotal = rows.reduce((acc, row) => acc + row.score, 0);
            const finalScore = currentTotal + score;

            // Update the main record
            await client.query('UPDATE leaderboard SET score = $1, updated_at = NOW() WHERE id = $2', [finalScore, targetId]);
            logSystem('DB', `Merged Score: ${username}`, `Total: ${finalScore}`);

            // Cleanup: Delete any duplicate rows if they exist
            if (rows.length > 1) {
                const idsToDelete = rows.slice(1).map(r => r.id);
                await client.query('DELETE FROM leaderboard WHERE id = ANY($1::int[])', [idsToDelete]);
            }

        } else {
            // INSERT MODE: New user/difficulty combo
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
        logSystem('ERR', 'Submit Failed', err.message);
        res.status(500).json({ success: false });
    }
});

// Get Top 100 Players
app.get('/api/leaderboard/top', async (req, res) => {
    try {
        const client = await pgPool.connect();
        // Aggregation query to sum scores across all difficulties if needed
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
// SECTION 9: ADMIN & CERTIFICATE PANEL
// =================================================================================================

// 9.1 Submit a Certificate Request
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

// 9.2 Generate Certificate Image (Redirects to Image API)
app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const client = await pgPool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [req.params.id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Not Found");

        const { username, score } = result.rows[0];
        const dateStr = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
        const msg = `Score: ${score}%0A%0ADate Issued: ${dateStr}%0A%0APresented by: braintest.fun`;

        // Construct URL for External Image API
        const finalUrl = CONFIG.IMG_API + 
            `&txt-align=center&txt-size=110&txt-color=FFD700&txt=${encodeURIComponent(username.toUpperCase())}&txt-fit=max&w=1800` +
            `&mark-align=center&mark-size=35&mark-color=FFFFFF&mark-y=850&mark-txt=${encodeURIComponent(msg)}&mark-w=1600`;

        res.redirect(finalUrl);
    } catch (e) { res.status(500).send("Error generating certificate"); }
});

// 9.3 Delete Request API
app.delete('/admin/delete-request/:id', async (req, res) => {
    try {
        const client = await pgPool.connect();
        await client.query('DELETE FROM certificate_requests WHERE id = $1', [req.params.id]);
        client.release();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// 9.4 Admin Interface (HTML)
app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pgPool.connect();
        const result = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
        client.release();

        const rows = result.rows.map(r => `
            <tr id="row-${r.id}">
                <td>#${r.id}</td>
                <td><b>${r.username}</b></td>
                <td><span class="badge">${r.score}</span></td>
                <td>${new Date(r.request_date).toLocaleDateString()}</td>
                <td>
                    <a href="/admin/generate-cert/${r.id}" target="_blank" title="Print Certificate">🖨️</a>
                    <span class="del" onclick="del(${r.id})" title="Delete Request">🗑️</span>
                </td>
            </tr>
        `).join('');

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>BrainTest Admin Panel</title>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
                <style>
                    body{
                        font-family: 'Inter', sans-serif; 
                        background:#f1f5f9; 
                        padding:40px; 
                        max-width:900px; 
                        margin:0 auto; 
                        color: #334155;
                    } 
                    h2{
                        color:#0f172a; 
                        margin-bottom: 20px; 
                        display: flex; 
                        align-items: center; 
                        gap: 10px;
                    }
                    .table-container { 
                        background: white; 
                        border-radius: 12px; 
                        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); 
                        overflow: hidden; 
                        border: 1px solid #e2e8f0; 
                    }
                    table{width:100%; border-collapse:collapse;} 
                    th,td{padding:18px; text-align:left; border-bottom:1px solid #e2e8f0;} 
                    th{
                        background:#f8fafc; 
                        font-weight:bold; 
                        color:#64748b; 
                        text-transform:uppercase; 
                        font-size:0.75rem; 
                        letter-spacing: 0.05em;
                    }
                    tr:last-child td { border-bottom: none; }
                    tr:hover { background-color: #f8fafc; }
                    .badge{
                        background:#e0f2fe; 
                        color:#0369a1; 
                        padding:4px 10px; 
                        border-radius:20px; 
                        font-weight:bold; 
                        font-size:0.85rem;
                    }
                    a, .del{
                        cursor:pointer; 
                        font-size:1.2rem; 
                        margin-right:15px; 
                        text-decoration:none; 
                        transition: 0.2s; 
                        display: inline-block;
                    }
                    a:hover { transform: scale(1.1); }
                    .del:hover { color: #ef4444; transform: scale(1.1); }
                    .btn-back { 
                        display: inline-block; 
                        margin-bottom: 20px; 
                        color: #64748b; 
                        text-decoration: none; 
                        font-weight: bold; 
                    }
                </style>
            </head>
            <body>
            <a href="/" class="btn-back">← Back to Dashboard</a>
            <h2>🛡️ Certificate Requests (${result.rows.length})</h2>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>User</th>
                            <th>Score</th>
                            <th>Date</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <script>
                async function del(id){
                    if(confirm('Are you sure you want to delete this request?')){
                        await fetch('/admin/delete-request/'+id,{method:'DELETE'});
                        const row = document.getElementById('row-'+id);
                        row.style.background = '#fee2e2';
                        setTimeout(() => row.remove(), 300);
                    }
                }
            </script>
            </body>
            </html>
        `);
    } catch (e) { res.status(500).send("Server Error"); }
});

// =================================================================================================
// SECTION 10: SERVER STARTUP
// =================================================================================================

async function startSystem() {
    console.clear();
    logSystem('OK', `Starting BrainTest Engine v6.3.3`);
    logSystem('INFO', `Initializing Database Connections...`);

    // Initialize Databases
    await initPostgres(); // Leaderboard
    await initMongo();    // Caching

    // Start Express Server
    app.listen(CONFIG.PORT, () => {
        logSystem('OK', `Server Listening on Port ${CONFIG.PORT}`);
        logSystem('INFO', `Dashboard available at http://localhost:${CONFIG.PORT}`);
        logSystem('INFO', `Anti-Spam Active: 60s Delay after first request.`);
    });
}

// Execute Startup
startSystem();
