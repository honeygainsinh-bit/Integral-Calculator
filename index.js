/**
 * =================================================================================================
 * PROJECT:      MATH QUIZ PRO - ULTIMATE HYBRID BACKEND
 * VERSION:      6.0.0 (PRODUCTION READY)
 * AUTHOR:       BRAINTEST TEAM
 * ENGINE:       Node.js + Express + PostgreSQL + MongoDB + Gemini AI
 * * [SYSTEM ARCHITECTURE]
 * 1. PRIMARY DB (PostgreSQL):
 * - រក្សាទុក Leaderboard (ពិន្ទុអ្នកលេង)
 * - រក្សាទុក Certificate Requests (សំណើលិខិតសរសើរ)
 * - ប្រើប្រាស់ Smart Merge Logic ដើម្បីការពារឈ្មោះស្ទួន
 * * 2. CACHE DB (MongoDB):
 * - រក្សាទុកលំហាត់ដែល AI បង្កើតរួច (Permanent Cache)
 * - ជួយកាត់បន្ថយការហៅទៅ Gemini API
 * * 3. AI ENGINE (Google Gemini):
 * - បង្កើតលំហាត់គណិតវិទ្យាថ្មីៗនៅពេល Cache រកមិនឃើញ
 * =================================================================================================
 */

// =================================================================================================
// SECTION 1: LIBRARY IMPORTS & CONFIGURATION
// =================================================================================================

// 1.1 Load Environment Variables
require('dotenv').config();

// 1.2 Import Dependencies
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');           // សម្រាប់ PostgreSQL
const mongoose = require('mongoose');     // សម្រាប់ MongoDB
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');

// 1.3 System Configuration Object
const CONFIG = {
    PORT: process.env.PORT || 3000,
    ENV: process.env.NODE_ENV || 'development',
    
    // Database Credentials
    POSTGRES_URL: process.env.DATABASE_URL,
    MONGO_URI: process.env.MONGODB_URI,
    
    // AI Configuration
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    AI_MODEL: "gemini-2.5-flash",
    
    // Security & Logic
    IMG_API: process.env.EXTERNAL_IMAGE_API,
    OWNER_IP: process.env.OWNER_IP || '127.0.0.1',
    CACHE_RATE: 0.25, // 25% Chance to use Cache, 75% use AI
    
    // Score Validation
    ALLOWED_SCORES: {
        "Easy": 5,
        "Medium": 10,
        "Hard": 15,
        "Very Hard": 20
    }
};

// 1.4 System State Monitoring (Global Variables)
const SYSTEM_STATE = {
    startTime: Date.now(),
    postgresConnected: false,
    mongoConnected: false,
    totalRequests: 0,
    totalGamesGenerated: 0,
    cacheHits: 0,
    aiCalls: 0,
    visitors: new Set(),
    logs: [] // Stores recent 50 logs for dashboard
};

// =================================================================================================
// SECTION 2: LOGGING & UTILITIES
// =================================================================================================

/**
 * មុខងារកត់ត្រា Log ចូលក្នុង Console និង Memory សម្រាប់ Dashboard
 */
function logSystem(type, message, details = '') {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    let icon = 'ℹ️';

    switch(type) {
        case 'DB': icon = '🗄️'; break;
        case 'AI': icon = '🤖'; break;
        case 'ERR': icon = '❌'; break;
        case 'OK': icon = '✅'; break;
        case 'NET': icon = '📡'; break;
    }

    // Print to Console
    console.log(`[${time}] ${icon} [${type}] ${message} ${details ? '| ' + details : ''}`);

    // Save to Memory (For Dashboard)
    SYSTEM_STATE.logs.unshift({ time, type, msg: message, det: details });
    if (SYSTEM_STATE.logs.length > 50) SYSTEM_STATE.logs.pop();
}

/**
 * មុខងារសម្អាត MongoDB URI (ការពារកំហុស Protocol)
 */
function cleanMongoURI(uri) {
    if (!uri) return null;
    let clean = uri.trim();
    if (!clean.startsWith('mongodb://') && !clean.startsWith('mongodb+srv://')) {
        logSystem('WARN', 'Fixing MongoDB URI', 'Added mongodb+srv:// prefix');
        return `mongodb+srv://${clean}`;
    }
    return clean;
}

// =================================================================================================
// SECTION 3: DATABASE CONNECTIONS
// =================================================================================================

// 3.1 PostgreSQL Connection (Leaderboard & Certificates)
const pgPool = new Pool({
    connectionString: CONFIG.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }, // Required for Cloud DBs like Render/Neon
    connectionTimeoutMillis: 5000
});

pgPool.on('error', (err) => {
    SYSTEM_STATE.postgresConnected = false;
    logSystem('ERR', 'PostgreSQL Error', err.message);
});

async function initPostgres() {
    try {
        const client = await pgPool.connect();
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
        logSystem('OK', 'PostgreSQL Ready', 'Tables Verified');
        client.release();
    } catch (err) {
        logSystem('ERR', 'PostgreSQL Failed', err.message);
    }
}

// 3.2 MongoDB Connection (Caching Only)
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

// MongoDB Event Listeners
mongoose.connection.on('connected', () => SYSTEM_STATE.mongoConnected = true);
mongoose.connection.on('disconnected', () => SYSTEM_STATE.mongoConnected = false);

// =================================================================================================
// SECTION 4: MONGODB MODELS (SCHEMA)
// =================================================================================================

const problemSchema = new mongoose.Schema({
    topic: { type: String, required: true, index: true },
    difficulty: { type: String, required: true, index: true },
    raw_text: { type: String, required: true }, // JSON String from AI
    source_ip: String,
    createdAt: { type: Date, default: Date.now }
});

const MathCache = mongoose.model('MathProblemCache', problemSchema);

// =================================================================================================
// SECTION 5: MIDDLEWARE CONFIGURATION
// =================================================================================================

const app = express();

// Trust Proxy for Render
app.set('trust proxy', 1);

// Standard Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Traffic Logging Middleware
app.use((req, res, next) => {
    SYSTEM_STATE.totalRequests++;
    const ip = req.ip || req.connection.remoteAddress;
    SYSTEM_STATE.visitors.add(ip);
    
    // Log essential routes
    if (req.path.includes('/api') || req.path.includes('/admin')) {
        logSystem('NET', `${req.method} ${req.path}`, `IP: ${ip}`);
    }
    next();
});

// AI Rate Limiter (Prevent Abuse)
const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // Limit each IP to 20 requests per windowMs
    message: { error: "Rate limit exceeded" },
    skip: (req) => req.ip === CONFIG.OWNER_IP
});

// =================================================================================================
// SECTION 6: DASHBOARD UI (ROOT ROUTE)
// =================================================================================================

app.get('/', (req, res) => {
    const uptime = process.uptime();
    const d = Math.floor(uptime / 86400);
    const h = Math.floor((uptime % 86400) / 3600);
    const m = Math.floor((uptime % 3600) / 60);

    const pgStatus = SYSTEM_STATE.postgresConnected ? 
        '<span style="color:#10b981">● CONNECTED</span>' : '<span style="color:#ef4444">● FAILED</span>';
    
    const mgStatus = SYSTEM_STATE.mongoConnected ? 
        '<span style="color:#10b981">● CONNECTED</span>' : '<span style="color:#ef4444">● FAILED</span>';

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BrainTest Hybrid Server v6.0</title>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;700&display=swap" rel="stylesheet">
        <style>
            :root { --bg: #0f172a; --card: #1e293b; --text: #f8fafc; --accent: #3b82f6; }
            body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; padding: 20px; display: flex; justify-content: center; }
            .container { max-width: 700px; width: 100%; display: grid; gap: 20px; }
            .card { background: var(--card); padding: 20px; border-radius: 12px; border: 1px solid #334155; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
            h1 { font-size: 1.5rem; color: var(--accent); margin: 0 0 5px 0; }
            .sub { font-size: 0.8rem; color: #94a3b8; font-family: 'JetBrains Mono', monospace; }
            
            .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px; }
            .stat { background: #020617; padding: 15px; border-radius: 8px; border: 1px solid #1e293b; }
            .stat-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; color: #64748b; font-weight: bold; }
            .stat-val { font-size: 1rem; font-weight: bold; margin-top: 5px; font-family: 'JetBrains Mono', monospace; }
            
            .log-box { height: 300px; overflow-y: auto; background: #000; border-radius: 8px; padding: 15px; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; border: 1px solid #334155; }
            .log-item { margin-bottom: 6px; border-bottom: 1px solid #1e1e1e; padding-bottom: 4px; display: flex; gap: 10px; }
            .time { color: #64748b; min-width: 65px; }
            .msg { color: #e2e8f0; }
            .det { color: #475569; }
            
            .btn { display: block; width: 100%; background: var(--accent); color: white; text-align: center; padding: 12px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 10px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="card">
                <h1>🚀 BRAINTEST ENGINE v6.0</h1>
                <div class="sub">Uptime: ${d}d ${h}h ${m}m | Env: ${CONFIG.ENV.toUpperCase()}</div>
                
                <div class="stats-grid">
                    <div class="stat"><div class="stat-label">PostgreSQL</div><div class="stat-val">${pgStatus}</div></div>
                    <div class="stat"><div class="stat-label">MongoDB Cache</div><div class="stat-val">${mgStatus}</div></div>
                    <div class="stat"><div class="stat-label">Total Requests</div><div class="stat-val">${SYSTEM_STATE.totalRequests}</div></div>
                    <div class="stat"><div class="stat-label">Unique Visitors</div><div class="stat-val">${SYSTEM_STATE.visitors.size}</div></div>
                    <div class="stat"><div class="stat-label">AI Calls</div><div class="stat-val">${SYSTEM_STATE.aiCalls}</div></div>
                    <div class="stat"><div class="stat-label">Cache Hits</div><div class="stat-val">${SYSTEM_STATE.cacheHits}</div></div>
                </div>
            </div>

            <div class="card">
                <div class="stat-label" style="margin-bottom:10px">SYSTEM LOGS</div>
                <div class="log-box">
                    ${SYSTEM_STATE.logs.map(l => `
                        <div class="log-item">
                            <span class="time">${l.time}</span>
                            <span class="msg">${l.msg}</span>
                            <span class="det">${l.det}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <a href="/admin/requests" class="btn">🔐 OPEN ADMIN PANEL</a>
        </div>
        <script>setTimeout(() => location.reload(), 10000);</script>
    </body>
    </html>
    `;
    res.send(html);
});

// =================================================================================================
// SECTION 7: CORE HYBRID LOGIC (AI + CACHE)
// =================================================================================================

app.post('/api/generate-problem', aiLimiter, async (req, res) => {
    // 1. Extract Data
    const { prompt, topic, difficulty } = req.body;
    
    // 2. Validate Input
    if (!prompt) return res.status(400).json({ error: "Missing Prompt" });

    SYSTEM_STATE.totalGamesGenerated++;

    // 3. CACHE STRATEGY: Try MongoDB First?
    // We use Math.random() < 0.25 to try cache 25% of the time.
    // This saves AI costs but keeps content fresh.
    let problemContent = null;
    let source = "ai";

    if (SYSTEM_STATE.mongoConnected && topic && difficulty && Math.random() < CONFIG.CACHE_RATE) {
        logSystem('DB', `Checking Cache for ${topic}...`);
        try {
            // Find 1 random problem matching criteria
            const cached = await MathCache.aggregate([
                { $match: { topic, difficulty } },
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

    // 4. AI FALLBACK: If Cache missed or skipped, call Gemini
    if (!problemContent) {
        logSystem('AI', 'Calling Gemini API', 'Generating New Problem...');
        SYSTEM_STATE.aiCalls++;
        
        try {
            // --- CRITICAL: DO NOT TOUCH THIS GEMINI LOGIC ---
            const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
            const model = genAI.getGenerativeModel({ model: CONFIG.AI_MODEL });
            
            const result = await model.generateContent(prompt);
            const response = await result.response;
            problemContent = response.text();
            // ------------------------------------------------

            // 5. SAVE TO CACHE (If successful)
            if (problemContent && SYSTEM_STATE.mongoConnected && topic && difficulty) {
                // Async save (don't wait)
                MathCache.create({
                    topic,
                    difficulty,
                    raw_text: problemContent,
                    source_ip: req.ip
                }).catch(e => logSystem('WARN', 'Cache Write Failed', e.message));
            }

        } catch (err) {
            logSystem('ERR', 'AI Generation Failed', err.message);
            return res.status(500).json({ error: "Failed to generate problem" });
        }
    }

    // 6. Return Result
    res.json({ text: problemContent, source });
});

// =================================================================================================
// SECTION 8: LEADERBOARD SYSTEM (POSTGRES SMART MERGE)
// =================================================================================================

app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;

    // 8.1 Basic Validation
    if (!username || typeof score !== 'number' || !difficulty) {
        return res.status(400).json({ success: false, message: "Invalid Data" });
    }

    // 8.2 Anti-Cheat Validation
    const maxAllowed = CONFIG.ALLOWED_SCORES[difficulty] || 0;
    if (score > maxAllowed) {
        logSystem('WARN', `Suspicious Score: ${username}`, `Points: ${score}`);
        return res.status(403).json({ success: false, message: "Score Rejected" });
    }

    try {
        const client = await pgPool.connect();

        // 8.3 SMART MERGE LOGIC
        // Step 1: Check existing records
        const check = await client.query(
            'SELECT id, score FROM leaderboard WHERE username = $1 AND difficulty = $2 ORDER BY id ASC',
            [username, difficulty]
        );

        if (check.rows.length > 0) {
            // MERGE MODE
            const rows = check.rows;
            const targetId = rows[0].id; // Keep oldest ID
            
            // Calculate total existing score + new score
            const currentTotal = rows.reduce((acc, row) => acc + row.score, 0);
            const finalScore = currentTotal + score;

            // Update Target
            await client.query('UPDATE leaderboard SET score = $1, updated_at = NOW() WHERE id = $2', [finalScore, targetId]);
            logSystem('DB', `Merged Score: ${username}`, `Total: ${finalScore}`);

            // Delete Duplicates (If any)
            if (rows.length > 1) {
                const idsToDelete = rows.slice(1).map(r => r.id);
                await client.query('DELETE FROM leaderboard WHERE id = ANY($1::int[])', [idsToDelete]);
            }

        } else {
            // INSERT MODE (New User)
            await client.query(
                'INSERT INTO leaderboard(username, score, difficulty, ip_address) VALUES($1, $2, $3, $4)',
                [username, score, difficulty, req.ip]
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
// SECTION 9: ADMIN & CERTIFICATE PANEL
// =================================================================================================

// 9.1 Submit Request
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

// 9.2 Generate Image (Redirect to Imgix)
app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const client = await pgPool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [req.params.id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Not Found");

        const { username, score } = result.rows[0];
        const dateStr = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
        const msg = `Score: ${score}%0A%0ADate Issued: ${dateStr}%0A%0APresented by: braintest.fun`;

        // Construct Image URL
        const finalUrl = CONFIG.IMG_API + 
            `&txt-align=center&txt-size=110&txt-color=FFD700&txt=${encodeURIComponent(username.toUpperCase())}&txt-fit=max&w=1800` +
            `&mark-align=center&mark-size=35&mark-color=FFFFFF&mark-y=850&mark-txt=${encodeURIComponent(msg)}&mark-w=1600`;

        res.redirect(finalUrl);
    } catch (e) { res.status(500).send("Error generating certificate"); }
});

// 9.3 Delete Request
app.delete('/admin/delete-request/:id', async (req, res) => {
    try {
        const client = await pgPool.connect();
        await client.query('DELETE FROM certificate_requests WHERE id = $1', [req.params.id]);
        client.release();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// 9.4 Admin UI
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
                    <a href="/admin/generate-cert/${r.id}" target="_blank">🖨️</a>
                    <span class="del" onclick="del(${r.id})">🗑️</span>
                </td>
            </tr>
        `).join('');

        res.send(`
            <!DOCTYPE html><html><head><title>Admin Panel</title>
            <style>
                body{font-family:sans-serif;background:#f1f5f9;padding:20px;max-width:900px;margin:0 auto;} 
                h2{color:#1e293b;}
                table{width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 5px rgba(0,0,0,0.05);} 
                th,td{padding:15px;text-align:left;border-bottom:1px solid #e2e8f0;} 
                th{background:#f8fafc;font-weight:bold;color:#64748b;text-transform:uppercase;font-size:0.8rem;}
                .badge{background:#e0f2fe;color:#0369a1;padding:4px 8px;border-radius:4px;font-weight:bold;font-size:0.9rem;}
                a, .del{cursor:pointer;font-size:1.2rem;margin-right:10px;text-decoration:none;}
            </style>
            </head><body>
            <h2>🛡️ Certificate Requests (${result.rows.length})</h2>
            <table><thead><tr><th>ID</th><th>User</th><th>Score</th><th>Date</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>
            <script>async function del(id){if(confirm('Delete this request?')){await fetch('/admin/delete-request/'+id,{method:'DELETE'});document.getElementById('row-'+id).remove();}}</script>
            </body></html>
        `);
    } catch (e) { res.status(500).send("Server Error"); }
});

// =================================================================================================
// SECTION 10: SERVER STARTUP
// =================================================================================================

async function startSystem() {
    console.clear();
    logSystem('OK', `Starting BrainTest Engine v6.0`);

    // 1. Init Databases
    await initPostgres(); // Leaderboard
    await initMongo();    // Caching

    // 2. Start Express
    app.listen(CONFIG.PORT, () => {
        logSystem('OK', `Server Listening on Port ${CONFIG.PORT}`);
        logSystem('INFO', `Dashboard: http://localhost:${CONFIG.PORT}`);
    });
}

startSystem();
