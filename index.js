/**
 * =================================================================================================
 * PROJECT:      BRAINTEST BACKEND API - ULTIMATE EDITION
 * VERSION:      5.0.0 (STABLE PRODUCTION)
 * AUTHOR:       BRAINTEST TEAM
 * ENVIRONMENT:  Node.js / Express / PostgreSQL / MongoDB
 * * [DESCRIPTION]
 * នេះគឺជាកូដ Backend កម្រិត Enterprise ដែលត្រូវបានរចនាឡើងដើម្បីដោះស្រាយបញ្ហាទាំងអស់របស់អ្នក។
 * វាមានប្រព័ន្ធ "Self-Healing" សម្រាប់ Database និងប្រព័ន្ធតាមដាន IP ដ៏ច្បាស់លាស់។
 * * [KEY FEATURES]
 * 1. HYBRID DATABASE SYSTEM:
 * - PostgreSQL: សម្រាប់ Leaderboard & Certificate (Persistent Data).
 * - MongoDB: សម្រាប់ Global Caching (Permanent Storage).
 * - AUTO-FIX: កូដនឹងជួសជុល MongoDB URL ដោយស្វ័យប្រវត្តិបើអ្នកភ្លេចដាក់ 'mongodb+srv://'.
 * * 2. INTELLIGENT LOGIC (25/75):
 * - 25% នៃសំណើនឹងត្រូវបានដកស្រង់ចេញពី Cache (MongoDB)។
 * - 75% នឹងត្រូវបានបង្កើតថ្មីដោយ AI (Gemini) ហើយរក្សាទុកចូល Cache ភ្លាមៗ។
 * * 3. ADVANCED IP TRACKING:
 * - កត់ត្រា IP របស់អ្នកចូលទស្សនាទាំងអស់។
 * - បង្ហាញ IP នៅក្នុង Console Logs និង Admin Dashboard។
 * * 4. SMART MERGE LEADERBOARD:
 * - បូកពិន្ទុបញ្ចូលគ្នាសម្រាប់ឈ្មោះដូចគ្នា។
 * - លុប ID ស្ទួនចោលដោយស្វ័យប្រវត្តិ។
 * * =================================================================================================
 */

// =================================================================================================
// SECTION 1: LIBRARY IMPORTS & INITIALIZATION
// =================================================================================================

// 1.1 Load Environment Variables
require('dotenv').config();

// 1.2 Import Dependencies
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');

// 1.3 Initialize Express App
const app = express();

// =================================================================================================
// SECTION 2: SYSTEM CONFIGURATION & VALIDATION
// =================================================================================================

// 2.1 Configuration Object
const CONFIG = {
    PORT: process.env.PORT || 3000,
    ENV: process.env.NODE_ENV || 'development',
    
    // Database Configs
    DB_URL: process.env.DATABASE_URL,
    MONGO_URI: process.env.MONGODB_URI,
    
    // API Keys
    AI_KEY: process.env.GEMINI_API_KEY,
    AI_MODEL: "gemini-2.5-flash",
    IMG_API: process.env.EXTERNAL_IMAGE_API,
    
    // Security
    OWNER_IP: process.env.OWNER_IP || '127.0.0.1',
    TRUST_PROXY: 1, // Required for Render to see real IPs
    
    // Game Rules
    ALLOWED_SCORES: {
        "Easy": 5,
        "Medium": 10,
        "Hard": 15,
        "Very Hard": 20
    }
};

// 2.2 Global State & Statistics (In-Memory)
const SYSTEM_STATE = {
    startTime: Date.now(),
    postgresConnected: false,
    mongoConnected: false,
    totalRequests: 0,
    totalGamesGenerated: 0,
    cacheHits: 0,
    aiCalls: 0,
    uniqueIPs: new Set(), // Store unique visitor IPs
    recentLogs: [] // Store last 50 logs for dashboard
};

// =================================================================================================
// SECTION 3: UTILITY FUNCTIONS & LOGGING
// =================================================================================================

/**
 * Custom Logger Function
 * Logs to console and saves to memory for Dashboard viewing.
 */
function logSystem(type, message, details = '') {
    const timestamp = new Date().toLocaleTimeString('km-KH', { hour12: false });
    let icon = 'ℹ️';
    
    switch(type) {
        case 'INFO': icon = 'ℹ️'; break;
        case 'SUCCESS': icon = '✅'; break;
        case 'WARN': icon = '⚠️'; break;
        case 'ERROR': icon = '❌'; break;
        case 'DB': icon = '🗄️'; break;
        case 'AI': icon = '🤖'; break;
        case 'TRAFFIC': icon = '📡'; break;
    }

    const logString = `[${timestamp}] ${icon} ${message} ${details}`;
    console.log(logString);

    // Save to memory (Keep only last 50)
    SYSTEM_STATE.recentLogs.unshift({ time: timestamp, type, msg: message, det: details });
    if (SYSTEM_STATE.recentLogs.length > 50) SYSTEM_STATE.recentLogs.pop();
}

/**
 * MongoDB URL Fixer
 * Automatically prepends 'mongodb+srv://' if missing.
 */
function fixMongoURI(uri) {
    if (!uri) return null;
    let fixedURI = uri.trim();
    if (!fixedURI.startsWith('mongodb://') && !fixedURI.startsWith('mongodb+srv://')) {
        logSystem('WARN', 'MongoDB URI format incorrect. Auto-fixing...');
        return `mongodb+srv://${fixedURI}`;
    }
    return fixedURI;
}

// =================================================================================================
// SECTION 4: DATABASE CONNECTION MANAGERS
// =================================================================================================

// 4.1 PostgreSQL Manager (Leaderboard)
const pool = new Pool({
    connectionString: CONFIG.DB_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 20
});

pool.on('connect', () => {
    // Connection event (silent to reduce noise)
});

pool.on('error', (err) => {
    logSystem('ERROR', 'PostgreSQL Pool Error', err.message);
    SYSTEM_STATE.postgresConnected = false;
});

async function initPostgres() {
    try {
        const client = await pool.connect();
        logSystem('SUCCESS', 'PostgreSQL Connected', '(Leaderboard System Ready)');
        SYSTEM_STATE.postgresConnected = true;
        
        // Auto-Create Tables
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
        logSystem('DB', 'Database Tables Verified/Created');
        client.release();
    } catch (err) {
        logSystem('ERROR', 'PostgreSQL Init Failed', err.message);
    }
}

// 4.2 MongoDB Manager (Caching)
async function initMongo() {
    const cleanURI = fixMongoURI(CONFIG.MONGO_URI);
    
    if (!cleanURI) {
        logSystem('WARN', 'MongoDB URI missing. Cache disabled.');
        return;
    }

    try {
        await mongoose.connect(cleanURI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        logSystem('SUCCESS', 'MongoDB Connected', '(Global Cache Ready)');
        SYSTEM_STATE.mongoConnected = true;
    } catch (err) {
        logSystem('ERROR', 'MongoDB Connection Failed', err.message);
        SYSTEM_STATE.mongoConnected = false;
    }
}

// Mongoose Events
mongoose.connection.on('connected', () => SYSTEM_STATE.mongoConnected = true);
mongoose.connection.on('disconnected', () => {
    if (SYSTEM_STATE.mongoConnected) logSystem('WARN', 'MongoDB Disconnected');
    SYSTEM_STATE.mongoConnected = false;
});

// =================================================================================================
// SECTION 5: MONGOOSE MODELS (SCHEMA DEFINITIONS)
// =================================================================================================

// Problem Cache Schema (Permanent Storage - No Expiry)
const problemCacheSchema = new mongoose.Schema({
    topic: { type: String, required: true, index: true },
    difficulty: { type: String, required: true, index: true },
    raw_text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }, // No expires option = Forever
    source_ip: { type: String } // Track who generated this
});

const MathProblemCache = mongoose.model('MathProblemCache', problemCacheSchema);

// =================================================================================================
// SECTION 6: MIDDLEWARE SETUP
// =================================================================================================

// 6.1 Trust Proxy (Crucial for Render IP Tracking)
app.set('trust proxy', CONFIG.TRUST_PROXY);

// 6.2 CORS & Body Parsing
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// 6.3 Static Files
app.use(express.static(path.join(__dirname, 'public')));

// 6.4 Advanced Traffic Logger & IP Tracker
app.use((req, res, next) => {
    SYSTEM_STATE.totalRequests++;
    
    // Capture Real IP
    const realIP = req.ip || req.connection.remoteAddress;
    SYSTEM_STATE.uniqueIPs.add(realIP);
    
    // Log API calls only (to keep logs clean)
    if (req.url.startsWith('/api') || req.url.startsWith('/admin')) {
        logSystem('TRAFFIC', `${req.method} ${req.url}`, `IP: ${realIP}`);
    }
    
    next();
});

// 6.5 Rate Limiter (AI Endpoints Only)
const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // limit each IP to 20 requests per windowMs
    message: { error: "Rate limit exceeded. Please wait 1 hour." },
    standardHeaders: true,
    legacyHeaders: false,
});

// =================================================================================================
// SECTION 7: API ROUTES - SYSTEM HEALTH & DEBUG
// =================================================================================================

// 7.1 Root Dashboard (System Status)
app.get('/', (req, res) => {
    // Calculate Uptime
    const uptime = process.uptime();
    const d = Math.floor(uptime / (3600*24));
    const h = Math.floor(uptime % (3600*24) / 3600);
    const m = Math.floor(uptime % 3600 / 60);

    // Render HTML Dashboard
    res.send(`
    <!DOCTYPE html>
    <html lang="km">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BrainTest Server Status</title>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
        <style>
            :root { --bg: #0f172a; --surface: #1e293b; --primary: #3b82f6; --text: #f8fafc; --success: #10b981; --error: #ef4444; }
            body { background-color: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; margin: 0; padding: 20px; min-height: 100vh; display: flex; justify-content: center; }
            .dashboard { width: 100%; max-width: 800px; display: grid; gap: 20px; }
            
            .card { background: var(--surface); border-radius: 16px; padding: 24px; border: 1px solid #334155; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
            
            h1 { margin: 0; font-size: 24px; color: var(--primary); display: flex; align-items: center; gap: 10px; }
            h2 { margin: 0 0 15px 0; font-size: 16px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
            
            .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
            .status-item { background: #020617; padding: 15px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; }
            .status-label { font-weight: 600; font-size: 14px; color: #cbd5e1; }
            .status-badge { font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; padding: 4px 8px; border-radius: 4px; }
            .online { background: rgba(16, 185, 129, 0.2); color: var(--success); }
            .offline { background: rgba(239, 68, 68, 0.2); color: var(--error); }
            
            .log-window { background: #000; font-family: 'JetBrains Mono', monospace; font-size: 12px; height: 300px; overflow-y: auto; padding: 15px; border-radius: 12px; color: #a5b4fc; }
            .log-entry { margin-bottom: 5px; border-bottom: 1px solid #1e1e24; padding-bottom: 2px; }
            
            .btn { display: inline-block; background: var(--primary); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; text-align: center; }
            .btn:hover { filter: brightness(1.1); }

            .stats-row { display: flex; justify-content: space-between; margin-top: 10px; font-size: 13px; color: #64748b; }
        </style>
    </head>
    <body>
        <div class="dashboard">
            <div class="card">
                <h1>🚀 BRAINTEST SERVER v5.0.0</h1>
                <div class="stats-row">
                    <span>Uptime: ${d}d ${h}h ${m}m</span>
                    <span>Env: ${CONFIG.ENV}</span>
                </div>
            </div>

            <div class="card">
                <h2>System Health</h2>
                <div class="status-grid">
                    <div class="status-item">
                        <span class="status-label">PostgreSQL</span>
                        <span class="status-badge ${SYSTEM_STATE.postgresConnected ? 'online' : 'offline'}">
                            ${SYSTEM_STATE.postgresConnected ? 'CONNECTED' : 'FAILED'}
                        </span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">MongoDB</span>
                        <span class="status-badge ${SYSTEM_STATE.mongoConnected ? 'online' : 'offline'}">
                            ${SYSTEM_STATE.mongoConnected ? 'CONNECTED' : 'FAILED'}
                        </span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">AI Engine</span>
                        <span class="status-badge ${CONFIG.AI_KEY ? 'online' : 'offline'}">
                            ${CONFIG.AI_KEY ? 'READY' : 'MISSING KEY'}
                        </span>
                    </div>
                </div>
            </div>

            <div class="card">
                <h2>Live Statistics</h2>
                <div class="status-grid">
                    <div class="status-item">
                        <span class="status-label">Unique Visitors</span>
                        <span style="color:white; font-weight:bold;">${SYSTEM_STATE.uniqueIPs.size}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Games Played</span>
                        <span style="color:white; font-weight:bold;">${SYSTEM_STATE.totalGamesGenerated}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Cache Hits</span>
                        <span style="color:#38bdf8; font-weight:bold;">${SYSTEM_STATE.cacheHits}</span>
                    </div>
                </div>
            </div>

            <div class="card">
                <h2>Real-time Logs</h2>
                <div class="log-window">
                    ${SYSTEM_STATE.recentLogs.map(l => 
                        `<div class="log-entry"><span style="color:#64748b">[${l.time}]</span> <span style="color:#e2e8f0">${l.msg}</span> <span style="color:#94a3b8">${l.det}</span></div>`
                    ).join('')}
                </div>
            </div>

            <a href="/admin/requests" class="btn">🔐 ACCESS ADMIN PANEL</a>
        </div>
        <script>
            // Auto-refresh every 10 seconds
            setTimeout(() => window.location.reload(), 10000);
        </script>
    </body>
    </html>
    `);
});

// 7.2 Debug IP Route
// Helps you see exactly what IP Render is forwarding
app.get('/api/debug-ip', (req, res) => {
    res.json({
        ip: req.ip,
        remoteAddress: req.connection.remoteAddress,
        xForwardedFor: req.headers['x-forwarded-for'],
        note: "This IP is what the server uses for Rate Limiting & Leaderboard."
    });
});

// =================================================================================================
// SECTION 8: CORE GAME LOGIC (25% CACHE / 75% AI)
// =================================================================================================

app.post('/api/generate-problem', aiLimiter, async (req, res) => {
    const { prompt, topic, difficulty } = req.body;

    // 8.1 Validation
    if (!prompt || !topic || !difficulty) {
        return res.status(400).json({ error: "Missing prompt, topic, or difficulty" });
    }

    // 8.2 Update Stats
    SYSTEM_STATE.totalGamesGenerated++;

    // 8.3 Determine Strategy
    const CACHE_CHANCE = 0.25; // 25% chance to use cache
    const useCache = Math.random() < CACHE_CHANCE;
    
    let finalProblem = null;
    let source = "ai";

    // --- STRATEGY A: ATTEMPT CACHE (MongoDB) ---
    if (useCache && SYSTEM_STATE.mongoConnected) {
        logSystem('DB', `Strategy 25%: Checking MongoDB for ${topic}...`);
        
        try {
            const cachedDocs = await MathProblemCache.aggregate([
                { $match: { topic: topic, difficulty: difficulty } },
                { $sample: { size: 1 } }
            ]);

            if (cachedDocs.length > 0) {
                finalProblem = cachedDocs[0].raw_text;
                source = "cache";
                SYSTEM_STATE.cacheHits++;
                logSystem('SUCCESS', 'Cache Hit', '(Served from MongoDB)');
            } else {
                logSystem('INFO', 'Cache Miss', '(MongoDB empty for this topic)');
            }
        } catch (e) {
            logSystem('WARN', 'Cache Read Error', e.message);
        }
    }

    // --- STRATEGY B: GENERATE NEW (AI) ---
    if (!finalProblem) {
        logSystem('AI', 'Generating with Gemini', '(75% or Fallback)');
        SYSTEM_STATE.aiCalls++;

        try {
            const genAI = new GoogleGenerativeAI(CONFIG.AI_KEY);
            const model = genAI.getGenerativeModel({ model: CONFIG.AI_MODEL });
            
            const result = await model.generateContent(prompt);
            const response = await result.response;
            finalProblem = response.text();

            // --- STRATEGY C: SAVE TO CACHE (PERMANENT) ---
            if (finalProblem && finalProblem.includes("[PROBLEM]") && SYSTEM_STATE.mongoConnected) {
                // Async save - don't wait
                MathProblemCache.create({
                    topic,
                    difficulty,
                    raw_text: finalProblem,
                    source_ip: req.ip
                }).catch(err => logSystem('WARN', 'Cache Write Failed', err.message));
                
                logSystem('DB', 'Saved new problem to MongoDB', '(Forever)');
            }

        } catch (err) {
            logSystem('ERROR', 'AI Generation Failed', err.message);
            return res.status(500).json({ error: "Failed to generate problem" });
        }
    }

    res.json({ text: finalProblem, source });
});

// =================================================================================================
// SECTION 9: LEADERBOARD SYSTEM (POSTGRESQL - SMART MERGE)
// =================================================================================================

// 9.1 Submit Score
app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;

    // Validate Input
    if (!username || typeof score !== 'number' || !difficulty) return res.status(400).json({ message: "Bad Request" });

    // Anti-Cheat
    const maxScore = CONFIG.ALLOWED_SCORES[difficulty] || 0;
    if (score > maxScore) {
        logSystem('WARN', `Cheating attempt blocked: ${username} score ${score}`);
        return res.status(403).json({ message: "Score rejected" });
    }

    try {
        const client = await pool.connect();
        
        // --- SMART MERGE LOGIC ---
        // 1. Find all records for this user & difficulty
        const checkRes = await client.query(
            'SELECT id, score FROM leaderboard WHERE username = $1 AND difficulty = $2 ORDER BY id ASC',
            [username, difficulty]
        );

        if (checkRes.rows.length > 0) {
            // Existing User Found
            const rows = checkRes.rows;
            const targetId = rows[0].id; // Keep oldest ID
            
            // Sum all scores (previous + new)
            const oldTotal = rows.reduce((sum, r) => sum + r.score, 0);
            const newTotal = oldTotal + score;

            // Update Target Record
            await client.query('UPDATE leaderboard SET score = $1, updated_at = NOW() WHERE id = $2', [newTotal, targetId]);
            logSystem('DB', `Merged Score for ${username}`, `${oldTotal} + ${score} = ${newTotal}`);

            // Cleanup Duplicates (if any)
            if (rows.length > 1) {
                const duplicateIds = rows.slice(1).map(r => r.id);
                await client.query('DELETE FROM leaderboard WHERE id = ANY($1::int[])', [duplicateIds]);
            }
        } else {
            // New User Insert
            await client.query(
                'INSERT INTO leaderboard(username, score, difficulty, ip_address) VALUES($1, $2, $3, $4)',
                [username, score, difficulty, req.ip]
            );
            logSystem('DB', `New Leaderboard Entry: ${username}`);
        }

        client.release();
        res.status(201).json({ success: true });

    } catch (err) {
        logSystem('ERROR', 'Leaderboard Submit Failed', err.message);
        res.status(500).json({ success: false });
    }
});

// 9.2 Get Top Scores
app.get('/api/leaderboard/top', async (req, res) => {
    try {
        const client = await pool.connect();
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
// SECTION 10: ADMIN PANEL & CERTIFICATES
// =================================================================================================

// 10.1 Certificate Request
app.post('/api/submit-request', async (req, res) => {
    const { username, score } = req.body;
    try {
        const client = await pool.connect();
        await client.query('INSERT INTO certificate_requests (username, score) VALUES ($1, $2)', [username, score]);
        client.release();
        logSystem('INFO', `Cert Request: ${username}`, `Score: ${score}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 10.2 Generate Certificate Image
app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [req.params.id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Not Found");

        const { username, score } = result.rows[0];
        const dateStr = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
        const message = `Score: ${score}%0A%0ADate Issued: ${dateStr}%0A%0AWith immense pride... Presented by: braintest.fun`;
        
        const finalUrl = CONFIG.IMG_API + 
            `&txt-align=center&txt-size=110&txt-color=FFD700&txt=${encodeURIComponent(username.toUpperCase())}&txt-fit=max&w=1800` +
            `&mark-align=center&mark-size=35&mark-color=FFFFFF&mark-y=850&mark-txt=${encodeURIComponent(message)}&mark-w=1600`;

        res.redirect(finalUrl);
    } catch (err) {
        res.status(500).send("Generation Error");
    }
});

// 10.3 Delete Request
app.delete('/admin/delete-request/:id', async (req, res) => {
    try {
        const client = await pool.connect();
        await client.query('DELETE FROM certificate_requests WHERE id = $1', [req.params.id]);
        client.release();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 10.4 ADMIN DASHBOARD HTML (Server Side Rendered)
app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 100');
        client.release();

        const rows = result.rows.map(r => `
            <tr id="row-${r.id}">
                <td><span class="badge-id">#${r.id}</span></td>
                <td><div class="user-row"><span class="uname">${r.username}</span></div></td>
                <td><span class="badge-score">${r.score}</span></td>
                <td>${new Date(r.request_date).toLocaleDateString()}</td>
                <td>
                    <div class="actions">
                        <a href="/admin/generate-cert/${r.id}" target="_blank" class="btn-icon print" title="Print">🖨️</a>
                        <button onclick="del(${r.id})" class="btn-icon del" title="Delete">🗑️</button>
                    </div>
                </td>
            </tr>
        `).join('');

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Admin Panel</title>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Inter', sans-serif; background: #f1f5f9; padding: 40px; margin: 0; color: #334155; }
                    .container { max-width: 1000px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); overflow: hidden; }
                    .header { background: #1e293b; color: white; padding: 24px; display: flex; justify-content: space-between; align-items: center; }
                    .header h1 { margin: 0; font-size: 18px; }
                    table { width: 100%; border-collapse: collapse; }
                    th { background: #f8fafc; color: #64748b; font-size: 12px; text-transform: uppercase; padding: 16px; text-align: left; border-bottom: 1px solid #e2e8f0; }
                    td { padding: 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
                    .badge-id { font-family: monospace; color: #94a3b8; }
                    .uname { font-weight: 600; color: #0f172a; }
                    .badge-score { background: #dbeafe; color: #1e40af; padding: 4px 8px; border-radius: 6px; font-weight: 600; font-size: 12px; }
                    .actions { display: flex; gap: 8px; }
                    .btn-icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 6px; border: none; cursor: pointer; text-decoration: none; transition: 0.2s; }
                    .print { background: #3b82f6; color: white; }
                    .del { background: #fee2e2; color: #ef4444; }
                    .del:hover { background: #ef4444; color: white; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🛡️ Admin Dashboard</h1>
                        <span style="background:rgba(255,255,255,0.1); padding:4px 10px; border-radius:20px; font-size:12px;">${result.rows.length} Pending</span>
                    </div>
                    <table>
                        <thead><tr><th>ID</th><th>User</th><th>Score</th><th>Date</th><th>Action</th></tr></thead>
                        <tbody>${rows || '<tr><td colspan="5" style="text-align:center; padding:40px;">No Data</td></tr>'}</tbody>
                    </table>
                </div>
                <script>
                    async function del(id) {
                        if(!confirm('Delete Request #'+id+'?')) return;
                        document.getElementById('row-'+id).style.opacity = 0.5;
                        await fetch('/admin/delete-request/'+id, {method:'DELETE'});
                        document.getElementById('row-'+id).remove();
                    }
                </script>
            </body>
            </html>
        `);

    } catch (e) { res.status(500).send("Error"); }
});

// =================================================================================================
// SECTION 11: SERVER STARTUP SEQUENCE
// =================================================================================================

async function startServer() {
    console.clear();
    console.log("🚀 STARTING SERVER v5.0.0...");
    
    // Connect Databases
    await initPostgres();
    await initMongo();

    // Start Listener
    app.listen(CONFIG.PORT, () => {
        logSystem('SUCCESS', `Server Running on Port ${CONFIG.PORT}`);
        logSystem('INFO', `Status Page: http://localhost:${CONFIG.PORT}`);
    });
}

// Start the engine
startServer();
