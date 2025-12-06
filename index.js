/**
 * =================================================================================================
 * PROJECT:      BRAINTEST API PRO - ULTIMATE HYBRID EDITION
 * VERSION:      5.5.0 (STABLE PRODUCTION)
 * AUTHOR:       BRAINTEST TEAM
 * ENVIRONMENT:  Node.js / Express / PostgreSQL / MongoDB
 * * [SYSTEM OVERVIEW]
 * នេះគឺជាប្រព័ន្ធ Backend កម្រិត Enterprise ដែលភ្ជាប់ Database ពីរប្រភេទចូលគ្នា៖
 * 1. PostgreSQL: រក្សាទុកទិន្នន័យសំខាន់ៗ (User Scores, Certificates) ដែលមិនអាចបាត់បង់បាន។
 * 2. MongoDB:    ប្រើជា "Permanent Cache" សម្រាប់រក្សាទុកលំហាត់ដែល AI បង្កើតហើយ។
 * * [KEY FEATURES]
 * - 🛡️ Smart Leaderboard: បូកពិន្ទុបញ្ចូលគ្នា និងលុប ID ស្ទួនដោយស្វ័យប្រវត្តិ។
 * - 🤖 AI + Cache Hybrid: ប្រើរូបមន្ត 25% Cache / 75% AI ដើម្បីសន្សំសំចៃ Cost និងបង្កើនល្បឿន។
 * - 📊 Live Dashboard: បង្ហាញ Status នៃ Database ទាំងពីរ និង Traffic ផ្ទាល់នៅលើ Root URL។
 * - 🔌 Auto-Fix Connection: ប្រព័ន្ធព្យាយាមកែតម្រូវ MongoDB URI ដោយខ្លួនឯង។
 * =================================================================================================
 */

// =================================================================================================
// SECTION 1: LIBRARY IMPORTS & SYSTEM CONFIGURATION
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

// 1.3 System Configuration Object
const CONFIG = {
    PORT: process.env.PORT || 3000,
    ENV: process.env.NODE_ENV || 'development',
    
    // Database Configs
    DB_URL: process.env.DATABASE_URL,    // PostgreSQL
    MONGO_URI: process.env.MONGODB_URI,  // MongoDB
    
    // AI Config
    AI_KEY: process.env.GEMINI_API_KEY,
    AI_MODEL: "gemini-2.5-flash",
    
    // External Services
    IMG_API: process.env.EXTERNAL_IMAGE_API,
    OWNER_IP: process.env.OWNER_IP || '127.0.0.1',
    
    // Anti-Cheat Rules
    ALLOWED_SCORES: {
        "Easy": 5,
        "Medium": 10,
        "Hard": 15,
        "Very Hard": 20
    }
};

// 1.4 Global State (For Dashboard Monitoring)
const SYSTEM_STATE = {
    startTime: Date.now(),
    postgresConnected: false,
    mongoConnected: false,
    totalRequests: 0,
    totalGamesGenerated: 0,
    cacheHits: 0,
    aiCalls: 0,
    activeVisitors: new Set(),
    recentLogs: [] // Stores last 50 logs
};

// =================================================================================================
// SECTION 2: UTILITY FUNCTIONS & LOGGING SYSTEM
// =================================================================================================

/**
 * Custom Logger: Logs to console AND memory for the dashboard
 */
function logSystem(type, message, details = '') {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    let icon = 'ℹ️';
    
    switch(type) {
        case 'INFO': icon = '🔹'; break;
        case 'SUCCESS': icon = '✅'; break;
        case 'WARN': icon = '⚠️'; break;
        case 'ERROR': icon = '❌'; break;
        case 'DB': icon = '🗄️'; break;
        case 'AI': icon = '🤖'; break;
        case 'TRAFFIC': icon = '📡'; break;
    }

    // Console Output
    console.log(`[${timestamp}] ${icon} ${message} ${details ? '| ' + details : ''}`);

    // Dashboard Memory Storage (FIFO)
    SYSTEM_STATE.recentLogs.unshift({ time: timestamp, type, msg: message, det: details });
    if (SYSTEM_STATE.recentLogs.length > 50) SYSTEM_STATE.recentLogs.pop();
}

/**
 * MongoDB URI Cleaner
 * Fixes missing prefixes/protocols automatically.
 */
function sanitizeMongoURI(uri) {
    if (!uri) return null;
    let clean = uri.trim();
    // If user forgot protocol, assume SRV
    if (!clean.startsWith('mongodb://') && !clean.startsWith('mongodb+srv://')) {
        logSystem('WARN', 'Auto-fixing MongoDB URI', '(Adding mongodb+srv:// prefix)');
        return `mongodb+srv://${clean}`;
    }
    return clean;
}

// =================================================================================================
// SECTION 3: DATABASE CONNECTION MANAGERS
// =================================================================================================

/**
 * 3.1 PostgreSQL Connection (Primary DB)
 */
const pool = new Pool({
    connectionString: CONFIG.DB_URL,
    ssl: { rejectUnauthorized: false }, // Necessary for Render/Neon
    connectionTimeoutMillis: 5000,
    max: 20
});

// Postgres Event Listeners
pool.on('error', (err) => {
    SYSTEM_STATE.postgresConnected = false;
    logSystem('ERROR', 'PostgreSQL Pool Error', err.message);
});

async function initPostgres() {
    try {
        const client = await pool.connect();
        SYSTEM_STATE.postgresConnected = true;
        
        // Auto-Create Tables (Schema Migration)
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
        logSystem('SUCCESS', 'PostgreSQL Connected', '(Tables Verified)');
        client.release();
    } catch (err) {
        logSystem('ERROR', 'PostgreSQL Init Failed', err.message);
    }
}

/**
 * 3.2 MongoDB Connection (Cache DB)
 */
async function initMongo() {
    const validURI = sanitizeMongoURI(CONFIG.MONGO_URI);
    
    if (!validURI) {
        logSystem('WARN', 'MongoDB URI Missing', 'Caching Disabled');
        return;
    }

    try {
        await mongoose.connect(validURI, {
            serverSelectionTimeoutMS: 5000, // Fail fast if network bad
            socketTimeoutMS: 45000,
        });
        SYSTEM_STATE.mongoConnected = true;
        logSystem('SUCCESS', 'MongoDB Connected', '(Cache System Ready)');
    } catch (err) {
        SYSTEM_STATE.mongoConnected = false;
        logSystem('ERROR', 'MongoDB Failed', err.message);
    }
}

// Mongoose Event Listeners
mongoose.connection.on('connected', () => SYSTEM_STATE.mongoConnected = true);
mongoose.connection.on('disconnected', () => {
    if (SYSTEM_STATE.mongoConnected) logSystem('WARN', 'MongoDB Disconnected');
    SYSTEM_STATE.mongoConnected = false;
});

// =================================================================================================
// SECTION 4: MONGOOSE SCHEMAS (CACHE MODELS)
// =================================================================================================

// Schema for storing math problems permanently
const problemSchema = new mongoose.Schema({
    topic: { type: String, required: true, index: true },
    difficulty: { type: String, required: true, index: true },
    raw_text: { type: String, required: true },
    source_ip: { type: String },
    createdAt: { type: Date, default: Date.now } // No Expiry = Permanent
});

const MathCache = mongoose.model('MathProblemCache', problemSchema);

// =================================================================================================
// SECTION 5: MIDDLEWARE & SERVER SETUP
// =================================================================================================

const app = express();

// 5.1 Trust Proxy (For Render IP Tracking)
app.set('trust proxy', 1);

// 5.2 Core Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 5.3 Advanced Traffic Tracker
app.use((req, res, next) => {
    SYSTEM_STATE.totalRequests++;
    const userIP = req.ip || req.connection.remoteAddress;
    SYSTEM_STATE.activeVisitors.add(userIP);
    
    // Log meaningful API hits only
    if (req.url.startsWith('/api') || req.url.startsWith('/admin')) {
        logSystem('TRAFFIC', `${req.method} ${req.url}`, `IP: ${userIP}`);
    }
    next();
});

// 5.4 AI Rate Limiter
const aiRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 Hour
    max: 20, // 20 Requests
    message: { error: "Rate limit exceeded. Please wait." },
    skip: (req) => req.ip === CONFIG.OWNER_IP
});

// =================================================================================================
// SECTION 6: SYSTEM DASHBOARD (ROOT ROUTE)
// =================================================================================================

app.get('/', (req, res) => {
    // Uptime Calculation
    const uptime = process.uptime();
    const d = Math.floor(uptime / 86400);
    const h = Math.floor((uptime % 86400) / 3600);
    const m = Math.floor((uptime % 3600) / 60);

    // Dynamic Status Colors
    const pgClass = SYSTEM_STATE.postgresConnected ? 'status-ok' : 'status-fail';
    const pgText = SYSTEM_STATE.postgresConnected ? 'CONNECTED' : 'FAILED';
    const mgClass = SYSTEM_STATE.mongoConnected ? 'status-ok' : 'status-fail';
    const mgText = SYSTEM_STATE.mongoConnected ? 'CONNECTED' : 'FAILED';

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BrainTest Hybrid Server</title>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
        <style>
            :root { --bg: #0f172a; --card: #1e293b; --text: #f1f5f9; --green: #10b981; --red: #ef4444; --blue: #3b82f6; }
            body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; margin: 0; padding: 20px; min-height: 100vh; display: flex; justify-content: center; align-items: center; }
            .container { width: 100%; max-width: 600px; display: flex; flex-direction: column; gap: 20px; }
            
            .card { background: var(--card); border-radius: 16px; padding: 25px; border: 1px solid #334155; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
            
            h1 { margin: 0; font-size: 22px; color: var(--blue); letter-spacing: -0.5px; display: flex; align-items: center; gap: 10px; }
            .subtitle { font-size: 12px; color: #94a3b8; margin-top: 5px; font-family: 'JetBrains Mono', monospace; }

            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 20px; }
            .stat-box { background: #020617; padding: 15px; border-radius: 12px; border: 1px solid #1e293b; }
            .label { font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; }
            .val { font-size: 14px; font-weight: 700; margin-top: 5px; font-family: 'JetBrains Mono', monospace; }
            
            .status-ok { color: var(--green); text-shadow: 0 0 10px rgba(16, 185, 129, 0.3); }
            .status-fail { color: var(--red); text-shadow: 0 0 10px rgba(239, 68, 68, 0.3); }

            .log-viewer { height: 250px; overflow-y: auto; background: #000; border-radius: 12px; padding: 15px; font-family: 'JetBrains Mono', monospace; font-size: 11px; border: 1px solid #334155; }
            .log-line { margin-bottom: 6px; border-bottom: 1px solid #1e1e1e; padding-bottom: 4px; display: flex; gap: 10px; }
            .log-time { color: #64748b; min-width: 60px; }
            .log-msg { color: #e2e8f0; }
            .log-det { color: #475569; }

            .btn { display: block; width: 100%; padding: 15px; background: var(--blue); color: white; text-align: center; text-decoration: none; border-radius: 12px; font-weight: 700; margin-top: 10px; transition: 0.2s; }
            .btn:hover { background: #2563eb; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="card">
                <h1>🚀 BRAINTEST SERVER v5.5.0</h1>
                <div class="subtitle">Environment: ${CONFIG.ENV.toUpperCase()} | Uptime: ${d}d ${h}h ${m}m</div>
                
                <div class="grid">
                    <div class="stat-box">
                        <div class="label">PostgreSQL</div>
                        <div class="val ${pgClass}">● ${pgText}</div>
                    </div>
                    <div class="stat-box">
                        <div class="label">MongoDB</div>
                        <div class="val ${mgClass}">● ${mgText}</div>
                    </div>
                    <div class="stat-box">
                        <div class="label">Total Traffic</div>
                        <div class="val">${SYSTEM_STATE.totalRequests} Reqs</div>
                    </div>
                    <div class="stat-box">
                        <div class="label">Unique IPs</div>
                        <div class="val">${SYSTEM_STATE.activeVisitors.size}</div>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="label" style="margin-bottom:10px;">SYSTEM LOGS (REAL-TIME)</div>
                <div class="log-viewer">
                    ${SYSTEM_STATE.recentLogs.map(l => `
                        <div class="log-line">
                            <span class="log-time">${l.time}</span>
                            <span class="log-msg">${l.msg}</span>
                            <span class="log-det">${l.det}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <a href="/admin/requests" class="btn">🔐 Access Admin Panel</a>
        </div>
        <script>setTimeout(() => window.location.reload(), 15000);</script>
    </body>
    </html>
    `;
    res.send(html);
});

// =================================================================================================
// SECTION 7: HYBRID AI & CACHE LOGIC (The Core Feature)
// =================================================================================================

app.post('/api/generate-problem', aiRateLimit, async (req, res) => {
    const { prompt, topic, difficulty } = req.body;

    // 7.1 Input Validation
    if (!prompt || !topic || !difficulty) {
        return res.status(400).json({ error: "Missing required fields." });
    }

    SYSTEM_STATE.totalGamesGenerated++;

    // 7.2 Strategy Decision (25% Cache / 75% AI)
    const CACHE_CHANCE = 0.25; 
    const tryCache = Math.random() < CACHE_CHANCE;
    
    let problemData = null;
    let source = "ai";

    // --- STRATEGY A: TRY MONGODB CACHE ---
    if (tryCache && SYSTEM_STATE.mongoConnected) {
        logSystem('DB', `Strategy 25%: Searching Cache for ${topic}...`);
        try {
            // Retrieve 1 random problem matching criteria
            const cachedDocs = await MathCache.aggregate([
                { $match: { topic: topic, difficulty: difficulty } },
                { $sample: { size: 1 } }
            ]);

            if (cachedDocs.length > 0) {
                problemData = cachedDocs[0].raw_text;
                source = "cache";
                SYSTEM_STATE.cacheHits++;
                logSystem('SUCCESS', 'Cache Hit', '(Served from MongoDB)');
            } else {
                logSystem('INFO', 'Cache Miss', '(Topic empty in DB)');
            }
        } catch (e) {
            logSystem('WARN', 'Cache Read Error', e.message);
        }
    }

    // --- STRATEGY B: FALLBACK TO GEMINI AI ---
    if (!problemData) {
        logSystem('AI', 'Generating with Gemini', '(75% or Fallback)');
        SYSTEM_STATE.aiCalls++;

        try {
            const genAI = new GoogleGenerativeAI(CONFIG.AI_KEY);
            const model = genAI.getGenerativeModel({ model: CONFIG.AI_MODEL });
            
            const result = await model.generateContent(prompt);
            const response = await result.response;
            problemData = response.text();

            // --- STRATEGY C: SAVE TO CACHE (PERMANENT) ---
            if (problemData && SYSTEM_STATE.mongoConnected) {
                // Async Save: Don't wait for it to finish, just log it
                MathCache.create({
                    topic,
                    difficulty,
                    raw_text: problemData,
                    source_ip: req.ip
                }).then(() => logSystem('DB', 'Saved to Cache', '(Permanent)'))
                  .catch(e => logSystem('WARN', 'Cache Write Failed', e.message));
            }
        } catch (err) {
            logSystem('ERROR', 'AI Gen Failed', err.message);
            return res.status(500).json({ error: "AI Service Unavailable" });
        }
    }

    res.json({ text: problemData, source });
});

// =================================================================================================
// SECTION 8: LEADERBOARD LOGIC (POSTGRESQL SMART MERGE)
// =================================================================================================

app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;

    // 8.1 Validation
    if (!username || typeof score !== 'number' || !difficulty) return res.status(400).json({ error: "Invalid Data" });

    // 8.2 Anti-Cheat
    const maxScore = CONFIG.ALLOWED_SCORES[difficulty] || 0;
    if (score > maxScore) {
        logSystem('WARN', `Cheat Attempt: ${username}`, `Score: ${score}`);
        return res.status(403).json({ error: "Score Rejected" });
    }

    try {
        const client = await pool.connect();
        
        // --- SMART MERGE ALGORITHM ---
        // 1. Find existing rows
        const checkRes = await client.query(
            'SELECT id, score FROM leaderboard WHERE username = $1 AND difficulty = $2 ORDER BY id ASC',
            [username, difficulty]
        );

        if (checkRes.rows.length > 0) {
            // MERGE: Keep Oldest ID (Target), Sum Scores, Delete others
            const rows = checkRes.rows;
            const targetId = rows[0].id;
            
            // Calculate Total
            const currentTotal = rows.reduce((acc, row) => acc + row.score, 0);
            const newTotal = currentTotal + score;

            // Update Target
            await client.query('UPDATE leaderboard SET score = $1, updated_at = NOW() WHERE id = $2', [newTotal, targetId]);
            logSystem('DB', `Merged Score: ${username}`, `Total: ${newTotal}`);

            // Cleanup Duplicates
            if (rows.length > 1) {
                const dupIds = rows.slice(1).map(r => r.id);
                await client.query('DELETE FROM leaderboard WHERE id = ANY($1::int[])', [dupIds]);
            }
        } else {
            // INSERT NEW
            await client.query(
                'INSERT INTO leaderboard(username, score, difficulty, ip_address) VALUES($1, $2, $3, $4)',
                [username, score, difficulty, req.ip]
            );
            logSystem('DB', `New Entry: ${username}`, `Score: ${score}`);
        }

        client.release();
        res.status(201).json({ success: true });

    } catch (err) {
        logSystem('ERROR', 'Leaderboard Submit Failed', err.message);
        res.status(500).json({ success: false });
    }
});

// Get Top 100
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
// SECTION 9: ADMIN PANEL & CERTIFICATES
// =================================================================================================

app.post('/api/submit-request', async (req, res) => {
    const { username, score } = req.body;
    try {
        const client = await pool.connect();
        await client.query('INSERT INTO certificate_requests (username, score) VALUES ($1, $2)', [username, score]);
        client.release();
        logSystem('INFO', `Cert Request: ${username}`, `${score} pts`);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [req.params.id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Not Found");
        
        const { username, score } = result.rows[0];
        const dateStr = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
        const msg = `Score: ${score}%0A%0ADate Issued: ${dateStr}%0A%0AWith immense pride... Presented by: braintest.fun`;
        
        const finalUrl = CONFIG.IMG_API + 
            `&txt-align=center&txt-size=110&txt-color=FFD700&txt=${encodeURIComponent(username.toUpperCase())}&txt-fit=max&w=1800` +
            `&mark-align=center&mark-size=35&mark-color=FFFFFF&mark-y=850&mark-txt=${encodeURIComponent(msg)}&mark-w=1600`;
            
        res.redirect(finalUrl);
    } catch (e) { res.status(500).send("Error"); }
});

app.delete('/admin/delete-request/:id', async (req, res) => {
    try {
        const client = await pool.connect();
        await client.query('DELETE FROM certificate_requests WHERE id = $1', [req.params.id]);
        client.release();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 100');
        client.release();

        const rows = result.rows.map(r => `
            <tr id="row-${r.id}">
                <td>#${r.id}</td>
                <td><b>${r.username}</b></td>
                <td><span style="background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px;">${r.score}</span></td>
                <td>${new Date(r.request_date).toLocaleDateString()}</td>
                <td>
                    <a href="/admin/generate-cert/${r.id}" target="_blank" style="text-decoration:none;">🖨️</a>
                    <span onclick="del(${r.id})" style="cursor:pointer; margin-left:10px;">🗑️</span>
                </td>
            </tr>
        `).join('');

        res.send(`
            <!DOCTYPE html><html><head><title>Admin</title>
            <style>body{font-family:sans-serif;padding:30px;background:#f8fafc;} table{width:100%;border-collapse:collapse;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.1);} th,td{padding:12px;border-bottom:1px solid #e2e8f0;text-align:left;} th{background:#f1f5f9;}</style>
            </head><body><h2>🛡️ Admin Panel (${result.rows.length})</h2>
            <table><thead><tr><th>ID</th><th>User</th><th>Score</th><th>Date</th><th>Act</th></tr></thead><tbody>${rows}</tbody></table>
            <script>async function del(id){if(confirm('Del?')){await fetch('/admin/delete-request/'+id,{method:'DELETE'});document.getElementById('row-'+id).remove();}}</script>
            </body></html>
        `);
    } catch (e) { res.status(500).send("Error"); }
});

// =================================================================================================
// SECTION 10: SYSTEM STARTUP SEQUENCE
// =================================================================================================

async function startServer() {
    console.clear();
    logSystem('INFO', `Starting BrainTest Server v5.5.0`);
    
    // Initialize Databases
    await initPostgres();
    await initMongo();

    // Start Express
    app.listen(CONFIG.PORT, () => {
        logSystem('SUCCESS', `Server Running on Port ${CONFIG.PORT}`);
        logSystem('INFO', `Dashboard Access: http://localhost:${CONFIG.PORT}`);
    });
}

startServer();
