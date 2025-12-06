/**
 * =================================================================================================
 * PROJECT:      MATH QUIZ PRO - BACKEND API (ENTERPRISE EDITION v4.1.0)
 * AUTHOR:       BRAINTEST TEAM
 * ENVIRONMENT:  Node.js / Express / PostgreSQL / MongoDB
 * DESCRIPTION:
 * នេះគឺជាប្រព័ន្ធ Backend ដ៏មានអានុភាពដែលត្រូវបានរចនាឡើងសម្រាប់ភាពធន់ និងការត្រួតពិនិត្យ (Monitoring)។
 * កូដនេះរួមបញ្ចូលទាំង Real-time Status Dashboard នៅលើទំព័រដើម។
 * * [SYSTEM ARCHITECTURE]
 * 1. Primary DB (PostgreSQL): សម្រាប់រក្សាទុកពិន្ទុ និងទិន្នន័យអ្នកប្រើប្រាស់ (Persistent).
 * 2. Secondary DB (MongoDB):  សម្រាប់ធ្វើ Global Caching លំហាត់ (Ephemeral/Performance).
 * 3. AI Engine (Gemini):      សម្រាប់បង្កើតលំហាត់គណិតវិទ្យា។
 * * [CHANGE LOG v4.1.0]
 * - Added: Real-time Connection Status Indicators on Root Route (/).
 * - Added: Connection State Listeners for both databases.
 * - Refactored: Expanded error handling and logging structure.
 * =================================================================================================
 */

// =================================================================================================
// SECTION 1: LIBRARY IMPORTS & SYSTEM CONFIGURATION
// =================================================================================================

// 1.1 Load Environment Variables
require('dotenv').config();

// 1.2 Import Core Libraries
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');

// 1.3 Global System Configuration Object
const CONFIG = {
    PORT: process.env.PORT || 3000,
    ENV: process.env.NODE_ENV || 'development',
    DB_URL: process.env.DATABASE_URL,
    MONGO_URI: process.env.MONGODB_URI,
    AI_KEY: process.env.GEMINI_API_KEY,
    AI_MODEL: "gemini-2.5-flash",
    OWNER_IP: process.env.OWNER_IP || '127.0.0.1',
    IMG_API: process.env.EXTERNAL_IMAGE_API,
    CACHE_EXPIRY: '30d', // 30 Days expiry for MongoDB cache
    ALLOWED_SCORES: {
        "Easy": 5,
        "Medium": 10,
        "Hard": 15,
        "Very Hard": 20
    }
};

// 1.4 System Health State (Live Monitoring Variables)
// នេះជាអថេរសម្រាប់តាមដានស្ថានភាព Database ភ្លាមៗ
const SYSTEM_HEALTH = {
    postgres: false, // នឹងប្តូរទៅ true ពេលភ្ជាប់បាន
    mongo: false,    // នឹងប្តូរទៅ true ពេលភ្ជាប់បាន
    startTime: Date.now(),
    totalRequests: 0,
    totalGamesPlayed: 0,
    cacheHits: 0,
    aiCalls: 0,
    lastError: null
};

// =================================================================================================
// SECTION 2: DATABASE CONNECTIONS & LISTENERS
// =================================================================================================

/**
 * 2.1 PostgreSQL Setup (Leaderboard System)
 * យើងប្រើ Connection Pool ដើម្បីប្រសិទ្ធភាពខ្ពស់
 */
const pool = new Pool({
    connectionString: CONFIG.DB_URL,
    ssl: { rejectUnauthorized: false }, // Required for Render/Neon
    connectionTimeoutMillis: 5000
});

// PostgreSQL Event Listeners for Status Tracking
pool.on('connect', () => {
    // ព្រឹត្តិការណ៍នេះកើតឡើងរាល់ពេល Client ថ្មីត្រូវបានបង្កើតក្នុង Pool
    // ប៉ុន្តែសម្រាប់ការតាមដាន Global Status យើងនឹង Check ពេល Init
});

pool.on('error', (err) => {
    console.error('❌ PostgreSQL Pool Error:', err.message);
    SYSTEM_HEALTH.postgres = false;
    SYSTEM_HEALTH.lastError = `PG Error: ${err.message}`;
});

// Initial Connection Check for Postgres
pool.connect()
    .then(client => {
        console.log("✅ PostgreSQL: Connection Established (Leaderboard Ready)");
        SYSTEM_HEALTH.postgres = true; // Update Status
        client.release();
    })
    .catch(err => {
        console.error("❌ PostgreSQL: Initial Connection Failed", err.message);
        SYSTEM_HEALTH.postgres = false;
    });


/**
 * 2.2 MongoDB Setup (Global Cache System)
 * យើងប្រើ Mongoose ដើម្បីគ្រប់គ្រង Connection State
 */
if (CONFIG.MONGO_URI) {
    mongoose.connect(CONFIG.MONGO_URI, {
        serverSelectionTimeoutMS: 5000 // ឈប់ព្យាយាមបើភ្ជាប់មិនបានក្នុង 5 វិ
    })
    .then(() => {
        console.log("✅ MongoDB: Connection Established (Caching Ready)");
        SYSTEM_HEALTH.mongo = true; // Update Status
    })
    .catch(err => {
        console.error("❌ MongoDB: Connection Failed", err.message);
        SYSTEM_HEALTH.mongo = false;
        SYSTEM_HEALTH.lastError = `Mongo Error: ${err.message}`;
    });

    // Mongoose Connection Events for Real-time Monitoring
    mongoose.connection.on('connected', () => { SYSTEM_HEALTH.mongo = true; });
    mongoose.connection.on('error', () => { SYSTEM_HEALTH.mongo = false; });
    mongoose.connection.on('disconnected', () => { 
        console.warn("⚠️ MongoDB: Disconnected");
        SYSTEM_HEALTH.mongo = false; 
    });
} else {
    console.warn("⚠️ WARNING: MONGODB_URI is missing. Caching feature disabled.");
}

// 2.3 Initialize Database Tables (Schema Migration)
async function initializeDatabaseTables() {
    try {
        const client = await pool.connect();
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
        client.release();
        console.log("🛠️ Database Tables: Verified/Created");
    } catch (err) {
        console.error("❌ DB Init Failed:", err.message);
    }
}

// =================================================================================================
// SECTION 3: MONGOOSE SCHEMAS
// =================================================================================================

const problemCacheSchema = new mongoose.Schema({
    topic: { type: String, required: true, index: true },
    difficulty: { type: String, required: true, index: true },
    raw_text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: CONFIG.CACHE_EXPIRY }
});

const MathProblemCache = mongoose.model('MathProblemCache', problemCacheSchema);

// =================================================================================================
// SECTION 4: EXPRESS CONFIGURATION & MIDDLEWARE
// =================================================================================================

const app = express();
app.set('trust proxy', 1);

// Middleware Stack
app.use(cors());
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Request Logger
app.use((req, res, next) => {
    SYSTEM_HEALTH.totalRequests++;
    // Log only significant requests to keep logs clean
    if (req.url.includes('/api/')) {
        const time = new Date().toLocaleTimeString('km-KH');
        console.log(`[${time}] 📡 ${req.method} ${req.url} - IP: ${req.ip}`);
    }
    next();
});

// Rate Limiter for AI Generation
const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 requests per hour
    message: { error: "Rate limit exceeded. Please wait." },
    skip: (req) => req.ip === CONFIG.OWNER_IP
});

// =================================================================================================
// SECTION 5: ROOT ROUTE - SYSTEM HEALTH DASHBOARD (NEW FEATURE!)
// =================================================================================================

app.get('/', (req, res) => {
    // Calculate Uptime
    const uptime = process.uptime();
    const d = Math.floor(uptime / (3600*24));
    const h = Math.floor(uptime % (3600*24) / 3600);
    const m = Math.floor(uptime % 3600 / 60);

    // Determine Status Colors
    const pgStatus = SYSTEM_HEALTH.postgres ? '<span style="color:#10b981">● CONNECTED</span>' : '<span style="color:#ef4444">● DISCONNECTED</span>';
    const mongoStatus = SYSTEM_HEALTH.mongo ? '<span style="color:#10b981">● CONNECTED</span>' : '<span style="color:#ef4444">● DISCONNECTED</span>';
    const aiStatus = CONFIG.AI_KEY ? '<span style="color:#10b981">● READY</span>' : '<span style="color:#f59e0b">● MISSING KEY</span>';

    // HTML Response
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>BrainTest API Status</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { background: #0f172a; color: #f8fafc; font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
                .dashboard { background: #1e293b; padding: 40px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); width: 100%; max-width: 450px; border: 1px solid #334155; }
                h1 { margin: 0 0 20px 0; color: #38bdf8; font-size: 24px; text-align: center; text-transform: uppercase; letter-spacing: 2px; }
                .status-grid { display: flex; flex-direction: column; gap: 15px; margin-bottom: 30px; }
                .status-item { display: flex; justify-content: space-between; align-items: center; padding: 15px; background: #0f172a; border-radius: 10px; border: 1px solid #334155; }
                .label { font-weight: bold; color: #94a3b8; font-size: 14px; }
                .value { font-weight: bold; font-size: 14px; font-family: monospace; }
                .stats-row { display: flex; justify-content: space-between; margin-top: 10px; font-size: 12px; color: #64748b; }
                .btn { display: block; width: 100%; padding: 15px; background: #2563eb; color: white; text-align: center; text-decoration: none; border-radius: 10px; font-weight: bold; margin-top: 20px; transition: 0.2s; }
                .btn:hover { background: #1d4ed8; }
            </style>
        </head>
        <body>
            <div class="dashboard">
                <h1>System Health</h1>
                
                <div class="status-grid">
                    <div class="status-item">
                        <span class="label">LEADERBOARD DB (PG)</span>
                        <span class="value">${pgStatus}</span>
                    </div>
                    <div class="status-item">
                        <span class="label">CACHE DB (MONGO)</span>
                        <span class="value">${mongoStatus}</span>
                    </div>
                    <div class="status-item">
                        <span class="label">AI ENGINE</span>
                        <span class="value">${aiStatus}</span>
                    </div>
                </div>

                <div class="stats-row">
                    <span>Uptime: ${d}d ${h}h ${m}m</span>
                    <span>Requests: ${SYSTEM_HEALTH.totalRequests}</span>
                </div>
                
                <a href="/admin/requests" class="btn">🔐 Access Admin Panel</a>
            </div>
            
            <script>
                // Auto-refresh page every 30 seconds to update status
                setTimeout(() => window.location.reload(), 30000);
            </script>
        </body>
        </html>
    `);
});

// =================================================================================================
// SECTION 6: API ROUTES - LOGIC (25% CACHE / 75% AI)
// =================================================================================================

app.post('/api/generate-problem', aiLimiter, async (req, res) => {
    try {
        const { prompt, topic, difficulty } = req.body;

        // 6.1 Validation
        if (!prompt || !topic || !difficulty) {
            return res.status(400).json({ error: "Missing required fields." });
        }

        // 6.2 Stats Update
        SYSTEM_HEALTH.totalGamesPlayed++;
        SYSTEM_HEALTH.uniqueVisitors.add(req.ip);

        // 6.3 Logic Decision
        const CACHE_CHANCE = 0.25; // 25% Chance
        const tryCache = Math.random() < CACHE_CHANCE;
        
        let problemData = null;
        let source = "ai";

        // --- STRATEGY A: TRY MONGODB CACHE ---
        if (tryCache && SYSTEM_HEALTH.mongo) {
            console.log(`🎲 Strategy: Checking Cache (25%) for ${topic}...`);
            try {
                const cached = await MathProblemCache.aggregate([
                    { $match: { topic: topic, difficulty: difficulty } },
                    { $sample: { size: 1 } }
                ]);

                if (cached.length > 0) {
                    problemData = cached[0].raw_text;
                    source = "cache";
                    SYSTEM_HEALTH.cacheHits++;
                    console.log("✅ CACHE HIT: Served from MongoDB.");
                } else {
                    console.log("⚠️ CACHE MISS: Empty result.");
                }
            } catch (mongoErr) {
                console.error("Cache Read Error:", mongoErr.message);
                // Fail silently and fall back to AI
            }
        }

        // --- STRATEGY B: CALL AI API ---
        if (!problemData) {
            console.log("🤖 Strategy: Calling Gemini AI (75% or Fallback)...");
            SYSTEM_HEALTH.aiCalls++;

            const genAI = new GoogleGenerativeAI(CONFIG.AI_KEY);
            const model = genAI.getGenerativeModel({ model: CONFIG.AI_MODEL });
            
            const result = await model.generateContent(prompt);
            const response = await result.response;
            problemData = response.text();

            // --- STRATEGY C: SAVE TO CACHE ---
            // Only save if valid problem and MongoDB is online
            if (problemData && problemData.includes("[PROBLEM]") && SYSTEM_HEALTH.mongo) {
                // Run in background (don't await) to speed up response
                MathProblemCache.create({
                    topic: topic,
                    difficulty: difficulty,
                    raw_text: problemData
                }).catch(e => console.error("Cache Write Error:", e.message));
                
                console.log("💾 SAVED: Stored in MongoDB for future use.");
            }
        }

        res.json({ success: true, text: problemData, source: source });

    } catch (error) {
        console.error("❌ Generation Error:", error);
        SYSTEM_HEALTH.lastError = error.message;
        res.status(500).json({ error: "Failed to generate problem." });
    }
});

// =================================================================================================
// SECTION 7: LEADERBOARD SYSTEM (POSTGRESQL)
// =================================================================================================

app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;

    // 7.1 Input Validation
    if (!username || typeof score !== 'number' || !difficulty) {
        return res.status(400).json({ success: false, message: "Invalid Input" });
    }

    // 7.2 Anti-Cheat Validation
    const limit = CONFIG.ALLOWED_SCORES[difficulty] || 0;
    if (score > limit) {
        return res.status(403).json({ success: false, message: "Score Rejected (Suspicious)" });
    }

    // 7.3 Database Operation (Merge Logic)
    try {
        const client = await pool.connect();
        
        // Find existing records
        const checkQuery = 'SELECT id, score FROM leaderboard WHERE username = $1 AND difficulty = $2 ORDER BY id ASC';
        const { rows } = await client.query(checkQuery, [username, difficulty]);

        if (rows.length > 0) {
            // MERGE: Sum all scores
            const totalScore = rows.reduce((sum, r) => sum + r.score, 0) + score;
            const targetId = rows[0].id;

            // Update Primary Record
            await client.query('UPDATE leaderboard SET score = $1, updated_at = NOW() WHERE id = $2', [totalScore, targetId]);
            
            // Delete Duplicates if any
            if (rows.length > 1) {
                const duplicateIds = rows.slice(1).map(r => r.id);
                await client.query('DELETE FROM leaderboard WHERE id = ANY($1::int[])', [duplicateIds]);
            }
            console.log(`🔄 Merged Score for ${username}: New Total ${totalScore}`);
        } else {
            // INSERT NEW
            await client.query(
                'INSERT INTO leaderboard(username, score, difficulty, ip_address) VALUES($1, $2, $3, $4)',
                [username, score, difficulty, req.ip]
            );
            console.log(`🆕 New Leaderboard Entry: ${username}`);
        }

        client.release();
        res.status(201).json({ success: true, message: "Score Saved" });

    } catch (err) {
        console.error("Leaderboard Error:", err);
        res.status(500).json({ success: false });
    }
});

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
// SECTION 8: ADMIN & CERTIFICATE SYSTEM
// =================================================================================================

// 8.1 Submit Request
app.post('/api/submit-request', async (req, res) => {
    const { username, score } = req.body;
    try {
        const client = await pool.connect();
        await client.query(
            'INSERT INTO certificate_requests (username, score) VALUES ($1, $2)', 
            [username, score]
        );
        client.release();
        res.json({ success: true, message: "Request Sent" });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 8.2 Generate Certificate Image
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
    } catch (err) { res.status(500).send("Gen Error"); }
});

// 8.3 Admin Dashboard UI
app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 100');
        client.release();

        let rows = result.rows.map(r => `
            <tr id="row-${r.id}">
                <td>#${r.id}</td>
                <td><b>${r.username}</b></td>
                <td>${r.score}</td>
                <td>${new Date(r.request_date).toLocaleDateString()}</td>
                <td>
                    <a href="/admin/generate-cert/${r.id}" target="_blank" class="btn-sm print">🖨️</a>
                    <button onclick="del(${r.id})" class="btn-sm del">🗑️</button>
                </td>
            </tr>
        `).join('');

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Admin</title>
                <style>
                    body { font-family: sans-serif; background: #f1f5f9; padding: 20px; }
                    .container { max-width: 900px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
                    th { background: #3b82f6; color: white; }
                    .btn-sm { padding: 5px 10px; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; display: inline-block; }
                    .print { background: #3b82f6; color: white; }
                    .del { background: #ef4444; color: white; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>👮‍♂️ Admin Panel</h1>
                    <table><thead><tr><th>ID</th><th>User</th><th>Score</th><th>Date</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No data</td></tr>'}</tbody></table>
                </div>
                <script>
                    async function del(id) {
                        if(!confirm('Delete?')) return;
                        await fetch('/admin/delete-request/'+id, {method:'DELETE'});
                        document.getElementById('row-'+id).remove();
                    }
                </script>
            </body>
            </html>
        `);
    } catch (err) { res.status(500).send("Error"); }
});

app.delete('/admin/delete-request/:id', async (req, res) => {
    try {
        const client = await pool.connect();
        await client.query('DELETE FROM certificate_requests WHERE id = $1', [req.params.id]);
        client.release();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// =================================================================================================
// SECTION 9: STARTUP
// =================================================================================================

async function start() {
    console.clear();
    console.log("🚀 STARTING BRAINTEST SERVER v4.1.0...");
    await initializeDatabaseTables();
    app.listen(CONFIG.PORT, () => {
        console.log(`✅ SERVER RUNNING ON PORT ${CONFIG.PORT}`);
        console.log(`👉 CHECK STATUS: http://localhost:${CONFIG.PORT}`);
    });
}

start();
