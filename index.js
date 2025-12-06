/**
 * =================================================================================================
 * PROJECT:      MATH QUIZ PRO - BACKEND API (ENTERPRISE EDITION v4.2.0)
 * AUTHOR:       BRAINTEST TEAM
 * ENVIRONMENT:  Node.js / Express / PostgreSQL / MongoDB
 * DESCRIPTION:
 * នេះគឺជាប្រព័ន្ធ Backend ដ៏មានអានុភាពដែលត្រូវបានរចនាឡើងសម្រាប់ភាពធន់ និងការត្រួតពិនិត្យ (Monitoring)។
 * * * [SYSTEM ARCHITECTURE]
 * 1. Primary DB (PostgreSQL): សម្រាប់រក្សាទុកពិន្ទុ និងទិន្នន័យអ្នកប្រើប្រាស់ (Persistent).
 * 2. Secondary DB (MongoDB):  សម្រាប់ធ្វើ Global Caching លំហាត់ (Permanent Storage).
 * 3. AI Engine (Gemini):      សម្រាប់បង្កើតលំហាត់គណិតវិទ្យា។
 * * * [LOGIC FLOW]
 * - Generate: 25% MongoDB (Cache) / 75% AI (Gemini).
 * - Storage: AI results are saved to MongoDB instantly and kept FOREVER.
 * - Leaderboard: Uses Smart Merge to combine scores for duplicate usernames.
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
    ALLOWED_SCORES: {
        "Easy": 5,
        "Medium": 10,
        "Hard": 15,
        "Very Hard": 20
    }
};

// 1.4 System Health State (Live Monitoring Variables)
const SYSTEM_HEALTH = {
    postgres: false, 
    mongo: false,    
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
 */
const pool = new Pool({
    connectionString: CONFIG.DB_URL,
    ssl: { rejectUnauthorized: false }, 
    connectionTimeoutMillis: 5000,
    max: 20 // Optimize pool size
});

// PostgreSQL Event Listeners
pool.on('error', (err) => {
    console.error('❌ PostgreSQL Pool Error:', err.message);
    SYSTEM_HEALTH.postgres = false;
    SYSTEM_HEALTH.lastError = `PG Error: ${err.message}`;
});

pool.connect()
    .then(client => {
        console.log("✅ PostgreSQL: Connection Established (Leaderboard Ready)");
        SYSTEM_HEALTH.postgres = true;
        client.release();
    })
    .catch(err => {
        console.error("❌ PostgreSQL: Initial Connection Failed", err.message);
        SYSTEM_HEALTH.postgres = false;
    });


/**
 * 2.2 MongoDB Setup (Global Cache System)
 */
if (CONFIG.MONGO_URI) {
    mongoose.connect(CONFIG.MONGO_URI, {
        serverSelectionTimeoutMS: 5000 
    })
    .then(() => {
        console.log("✅ MongoDB: Connection Established (Permanent Cache Ready)");
        SYSTEM_HEALTH.mongo = true; 
    })
    .catch(err => {
        console.error("❌ MongoDB: Connection Failed", err.message);
        SYSTEM_HEALTH.mongo = false;
        SYSTEM_HEALTH.lastError = `Mongo Error: ${err.message}`;
    });

    // Mongoose Connection Events
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
// SECTION 3: MONGOOSE SCHEMAS (PERMANENT STORAGE)
// =================================================================================================

const problemCacheSchema = new mongoose.Schema({
    topic: { type: String, required: true, index: true },
    difficulty: { type: String, required: true, index: true },
    raw_text: { type: String, required: true },
    // 🔥 UPDATED: Removed expires option. Data is now kept forever.
    createdAt: { type: Date, default: Date.now } 
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
    if (req.url.includes('/api/')) {
        const time = new Date().toLocaleTimeString('km-KH');
        console.log(`[${time}] 📡 ${req.method} ${req.url} - IP: ${req.ip}`);
    }
    next();
});

// Rate Limiter for AI Generation
const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, 
    message: { error: "Rate limit exceeded. Please wait." },
    skip: (req) => req.ip === CONFIG.OWNER_IP
});

// =================================================================================================
// SECTION 5: ROOT ROUTE - SYSTEM HEALTH DASHBOARD
// =================================================================================================

app.get('/', (req, res) => {
    // Calculate Uptime
    const uptime = process.uptime();
    const d = Math.floor(uptime / (3600*24));
    const h = Math.floor(uptime % (3600*24) / 3600);
    const m = Math.floor(uptime % 3600 / 60);

    // Status Indicators
    const pgStatus = SYSTEM_HEALTH.postgres 
        ? '<span class="status-indicator online">● CONNECTED</span>' 
        : '<span class="status-indicator offline">● DISCONNECTED</span>';
    
    const mongoStatus = SYSTEM_HEALTH.mongo 
        ? '<span class="status-indicator online">● CONNECTED</span>' 
        : '<span class="status-indicator offline">● DISCONNECTED</span>';
    
    const aiStatus = CONFIG.AI_KEY 
        ? '<span class="status-indicator online">● READY</span>' 
        : '<span class="status-indicator warning">● MISSING KEY</span>';

    // Modern Dashboard HTML
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>BrainTest System Status</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
            <style>
                :root { --bg: #0f172a; --card: #1e293b; --text: #f8fafc; --accent: #38bdf8; --green: #10b981; --red: #ef4444; }
                body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; }
                .dashboard { background: var(--card); padding: 40px; border-radius: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.5); width: 100%; max-width: 480px; border: 1px solid #334155; }
                .header { text-align: center; margin-bottom: 30px; }
                h1 { margin: 0; color: var(--accent); font-size: 28px; font-weight: 800; letter-spacing: -1px; }
                .subtitle { color: #64748b; font-size: 14px; margin-top: 5px; }
                
                .status-grid { display: flex; flex-direction: column; gap: 12px; margin-bottom: 30px; }
                .status-item { display: flex; justify-content: space-between; align-items: center; padding: 16px; background: #020617; border-radius: 12px; border: 1px solid #1e293b; transition: transform 0.2s; }
                .status-item:hover { border-color: #475569; transform: translateY(-2px); }
                
                .label { font-weight: 600; color: #94a3b8; font-size: 13px; letter-spacing: 0.5px; }
                .status-indicator { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 700; }
                .online { color: var(--green); text-shadow: 0 0 10px rgba(16, 185, 129, 0.3); }
                .offline { color: var(--red); text-shadow: 0 0 10px rgba(239, 68, 68, 0.3); }
                .warning { color: #f59e0b; }
                
                .stats-box { background: rgba(56, 189, 248, 0.1); border-radius: 12px; padding: 15px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 25px; }
                .stat { text-align: center; }
                .stat-val { display: block; font-size: 18px; font-weight: 700; color: var(--accent); }
                .stat-lbl { font-size: 11px; color: #94a3b8; text-transform: uppercase; }

                .btn { display: flex; justify-content: center; align-items: center; gap: 10px; width: 100%; padding: 16px; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; text-decoration: none; border-radius: 12px; font-weight: 700; transition: all 0.2s; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3); }
                .btn:hover { transform: scale(1.02); box-shadow: 0 6px 20px rgba(37, 99, 235, 0.4); }
                
                .footer { margin-top: 20px; text-align: center; font-size: 11px; color: #475569; }
            </style>
        </head>
        <body>
            <div class="dashboard">
                <div class="header">
                    <h1>SYSTEM STATUS</h1>
                    <div class="subtitle">v4.2.0 • Hybrid Database Engine</div>
                </div>
                
                <div class="stats-box">
                    <div class="stat">
                        <span class="stat-val">${d}d ${h}h ${m}m</span>
                        <span class="stat-lbl">Uptime</span>
                    </div>
                    <div class="stat">
                        <span class="stat-val">${SYSTEM_HEALTH.totalRequests}</span>
                        <span class="stat-lbl">Total Requests</span>
                    </div>
                </div>

                <div class="status-grid">
                    <div class="status-item">
                        <span class="label">LEADERBOARD (PG)</span>
                        ${pgStatus}
                    </div>
                    <div class="status-item">
                        <span class="label">CACHE (MONGO)</span>
                        ${mongoStatus}
                    </div>
                    <div class="status-item">
                        <span class="label">AI ENGINE (GEMINI)</span>
                        ${aiStatus}
                    </div>
                </div>
                
                <a href="/admin/requests" class="btn">
                    <span>🔐</span> Access Admin Panel
                </a>

                <div class="footer">
                    Auto-refreshing every 30s • Secure Connection
                </div>
            </div>
            
            <script>
                setTimeout(() => window.location.reload(), 30000);
            </script>
        </body>
        </html>
    `);
});

// =================================================================================================
// SECTION 6: API ROUTES - CORE LOGIC (25% CACHE / 75% AI)
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

        // 6.3 Hybrid Logic Decision
        const CACHE_CHANCE = 0.25; // 25% Chance
        const tryCache = Math.random() < CACHE_CHANCE;
        
        let problemData = null;
        let source = "ai";

        // --- STRATEGY A: TRY MONGODB CACHE ---
        if (tryCache && SYSTEM_HEALTH.mongo) {
            console.log(`🎲 Strategy: Checking MongoDB (25%) for ${topic}...`);
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
            }
        }

        // --- STRATEGY B: CALL AI API (Fallback) ---
        if (!problemData) {
            console.log("🤖 Strategy: Calling Gemini AI (75% or Fallback)...");
            SYSTEM_HEALTH.aiCalls++;

            const genAI = new GoogleGenerativeAI(CONFIG.AI_KEY);
            const model = genAI.getGenerativeModel({ model: CONFIG.AI_MODEL });
            
            const result = await model.generateContent(prompt);
            const response = await result.response;
            problemData = response.text();

            // --- STRATEGY C: SAVE TO CACHE (PERMANENT) ---
            if (problemData && problemData.includes("[PROBLEM]") && SYSTEM_HEALTH.mongo) {
                // Background save (no await)
                MathProblemCache.create({
                    topic: topic,
                    difficulty: difficulty,
                    raw_text: problemData
                }).catch(e => console.error("Cache Write Error:", e.message));
                
                console.log("💾 SAVED: Stored in MongoDB Forever.");
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

    // 7.3 Smart Merge Logic
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
            
            // Cleanup Duplicates
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

// 8.3 Admin Dashboard UI (Server-Side Rendered)
app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 100');
        client.release();

        let rows = result.rows.map(r => `
            <tr id="row-${r.id}">
                <td><span class="id-badge">#${r.id}</span></td>
                <td>
                    <div class="user-cell">
                        <span class="uname">${r.username}</span>
                    </div>
                </td>
                <td><span class="score-badge">${r.score}</span></td>
                <td class="date-cell">${new Date(r.request_date).toLocaleDateString()}</td>
                <td>
                    <div class="actions">
                        <a href="/admin/generate-cert/${r.id}" target="_blank" class="btn-icon print" title="Generate">🖨️</a>
                        <button onclick="del(${r.id})" class="btn-icon del" title="Reject">🗑️</button>
                    </div>
                </td>
            </tr>
        `).join('');

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Admin Control</title>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Inter', sans-serif; background: #f8fafc; color: #1e293b; padding: 40px; margin: 0; }
                    .container { max-width: 1000px; margin: 0 auto; background: white; padding: 0; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); overflow: hidden; }
                    
                    .header { background: #1e293b; color: white; padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; }
                    .header h1 { margin: 0; font-size: 20px; font-weight: 600; }
                    .count { background: rgba(255,255,255,0.1); padding: 4px 12px; border-radius: 20px; font-size: 12px; }

                    table { width: 100%; border-collapse: collapse; }
                    th { background: #f1f5f9; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; padding: 16px 24px; text-align: left; border-bottom: 1px solid #e2e8f0; }
                    td { padding: 16px 24px; border-bottom: 1px solid #e2e8f0; font-size: 14px; vertical-align: middle; }
                    tr:hover { background: #f8fafc; }

                    .id-badge { font-family: monospace; color: #94a3b8; font-size: 12px; }
                    .uname { font-weight: 600; color: #0f172a; }
                    .score-badge { background: #dbeafe; color: #1e40af; padding: 4px 10px; border-radius: 6px; font-weight: 600; font-size: 12px; }
                    
                    .actions { display: flex; gap: 8px; }
                    .btn-icon { width: 32px; height: 32px; display: flex; alignItems: center; justify-content: center; border-radius: 8px; border: none; cursor: pointer; text-decoration: none; font-size: 14px; transition: all 0.2s; }
                    .print { background: #3b82f6; color: white; display: flex; align-items: center; justify-content: center;}
                    .del { background: #fee2e2; color: #ef4444; }
                    .del:hover { background: #ef4444; color: white; }

                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🛡️ Admin Panel</h1>
                        <span class="count">${result.rows.length} Requests</span>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th width="80">ID</th>
                                <th>Candidate</th>
                                <th width="100">Score</th>
                                <th width="150">Date</th>
                                <th width="120">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows || '<tr><td colspan="5" style="text-align:center; padding: 40px; color: #94a3b8;">No pending requests found.</td></tr>'}
                        </tbody>
                    </table>
                </div>
                <script>
                    async function del(id) {
                        if(!confirm('⚠️ Are you sure you want to permanently delete Request #' + id + '?')) return;
                        
                        const row = document.getElementById('row-'+id);
                        row.style.opacity = '0.5';
                        
                        try {
                            const res = await fetch('/admin/delete-request/'+id, {method:'DELETE'});
                            const data = await res.json();
                            
                            if(data.success) {
                                row.remove();
                            } else {
                                alert('Error: ' + data.message);
                                row.style.opacity = '1';
                            }
                        } catch (e) {
                            alert('Network Error');
                            row.style.opacity = '1';
                        }
                    }
                </script>
            </body>
            </html>
        `);
    } catch (err) { 
        console.error(err);
        res.status(500).send("Admin Panel Error"); 
    }
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
    console.log("🚀 STARTING BRAINTEST SERVER v4.2.0...");
    await initializeDatabaseTables();
    app.listen(CONFIG.PORT, () => {
        console.log(`✅ SERVER RUNNING ON PORT ${CONFIG.PORT}`);
        console.log(`👉 CHECK STATUS: http://localhost:${CONFIG.PORT}`);
    });
}

start();
