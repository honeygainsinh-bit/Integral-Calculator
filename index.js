/**
 * =================================================================================================
 * PROJECT:      MATH QUIZ PRO - BACKEND API (ENTERPRISE EDITION)
 * AUTHOR:       BRAINTEST TEAM
 * VERSION:      4.0.0 (Refactored & Enhanced)
 * ENVIRONMENT:  Node.js / Express / PostgreSQL
 * * DESCRIPTION:
 * នេះគឺជាប្រព័ន្ធ Backend ដ៏មានអានុភាពសម្រាប់ល្បែងគណិតវិទ្យា។ វាត្រូវបានរចនាឡើងដើម្បីទ្រទ្រង់
 * អ្នកប្រើប្រាស់បានច្រើន ដោយមានសុវត្ថិភាពខ្ពស់ និងសមត្ថភាពគ្រប់គ្រងទិន្នន័យបានល្អ។
 * * CORE FEATURES:
 * 1. AI Integration: ប្រើប្រាស់ Google Gemini សម្រាប់បង្កើតលំហាត់គណិតវិទ្យាដោយស្វ័យប្រវត្តិ។
 * 2. Smart Leaderboard: ប្រព័ន្ធបូកពិន្ទុឆ្លាតវៃ (Score Merging) ការពារការបាត់បង់ទិន្នន័យ។
 * 3. Auto-Certificate: បង្កើតលិខិតសរសើរដោយស្វ័យប្រវត្តិ។
 * 4. Admin Dashboard: ផ្ទាំងគ្រប់គ្រងសម្រាប់ Admin មើល និងចាត់ចែងសំណើ។
 * 5. Security: Rate Limiting, Input Validation, និង CORS Protection.
 * * HISTORY:
 * - v3.2.4: Added Score Merging Logic.
 * - v4.0.0: Complete Code Refactoring, Enhanced Error Handling, Beautified Admin UI.
 * =================================================================================================
 */

// =================================================================================================
// SECTION 1: LIBRARY IMPORTS & CONFIGURATION
// =================================================================================================

// 1.1 Load Environment Variables
require('dotenv').config();

// 1.2 Import Core Libraries
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');

// 1.3 System Constants & Configuration
const CONFIG = {
    PORT: process.env.PORT || 3000,
    ENV: process.env.NODE_ENV || 'development',
    DB_URL: process.env.DATABASE_URL,
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

// 1.4 Global Statistics (In-Memory)
const SERVER_STATS = {
    startTime: Date.now(),
    totalRequests: 0,
    totalGamesPlayed: 0,
    uniqueVisitors: new Set(),
    lastError: null
};

// =================================================================================================
// SECTION 2: DATABASE SETUP (PostgreSQL)
// =================================================================================================

// 2.1 Initialize Connection Pool
const pool = new Pool({
    connectionString: CONFIG.DB_URL,
    ssl: { rejectUnauthorized: false }, // Required for most cloud DBs (Render/Neon/Supabase)
    max: 20, // Max clients in the pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// 2.2 Database Helper Functions
/**
 * មុខងារ: executeQuery
 * គោលបំណង: ធ្វើឱ្យការហៅ SQL កាន់តែងាយស្រួល និងមាន Error Handling មួយកន្លែង
 */
async function executeQuery(text, params) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        // Uncomment line below for deep SQL debugging
        // console.log(`[SQL] Executed in ${duration}ms: ${text}`);
        return res;
    } catch (err) {
        console.error('[SQL ERROR]', err.message);
        throw err;
    }
}

/**
 * មុខងារ: initializeDatabaseTables
 * គោលបំណង: បង្កើត Table ដោយស្វ័យប្រវត្តិនៅពេល Server ចាប់ផ្តើម
 */
async function initializeDatabaseTables() {
    console.log("---------------------------------------------------");
    console.log("🛠️  SYSTEM INITIALIZATION: DATABASE CHECK");
    console.log("---------------------------------------------------");
    
    try {
        const client = await pool.connect();

        // 1. Create Leaderboard Table
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
        console.log("   ✅ Table 'leaderboard' is ready.");

        // 2. Create Certificate Requests Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS certificate_requests (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) NOT NULL,
                score INTEGER NOT NULL,
                status VARCHAR(20) DEFAULT 'Pending',
                processed_by VARCHAR(50),
                request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("   ✅ Table 'certificate_requests' is ready.");

        client.release();
        console.log("---------------------------------------------------");
    } catch (err) {
        console.error("   ❌ CRITICAL DB ERROR:", err.message);
        process.exit(1); // Stop server if DB fails
    }
}

// =================================================================================================
// SECTION 3: EXPRESS APP & MIDDLEWARE
// =================================================================================================

const app = express();

// 3.1 Basic Settings
app.set('trust proxy', 1); // Essential for rate limiting behind proxies (Render/Nginx)

// 3.2 Security & Parsing Middleware
app.use(cors()); // Allow Cross-Origin Resource Sharing
app.use(express.json({ limit: '10kb' })); // Body parser with size limit
app.use(express.urlencoded({ extended: true }));

// 3.3 Static Files
app.use(express.static(path.join(__dirname, 'public')));

// 3.4 Advanced Logging Middleware
app.use((req, res, next) => {
    SERVER_STATS.totalRequests++;
    const timestamp = new Date().toLocaleTimeString('km-KH');
    const method = req.method.padEnd(7); // Formatting
    
    // Log to console
    console.log(`[${timestamp}] 📡 ${method} ${req.url} | IP: ${req.ip}`);
    
    next();
});

// 3.5 AI Rate Limiter (Prevent Abuse)
const aiGenerationLimiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, // 8 Hours
    max: 15, // Allow 15 requests per 8 hours
    standardHeaders: true,
    legacyHeaders: false,
    message: { 
        success: false,
        error: "Rate limit exceeded", 
        message: "⚠️ លោកអ្នកបានប្រើប្រាស់សិទ្ធិបង្កើតលំហាត់អស់ហើយសម្រាប់ថ្ងៃនេះ។ សូមត្រឡប់មកវិញនៅថ្ងៃស្អែក!" 
    },
    keyGenerator: (req) => req.ip,
    skip: (req) => req.ip === CONFIG.OWNER_IP // Whitelist owner
});

// =================================================================================================
// SECTION 4: API ROUTES - UTILITY & STATUS
// =================================================================================================

// 4.1 Root Route (Landing Page)
app.get('/', (req, res) => {
    const uptimeSeconds = process.uptime();
    const days = Math.floor(uptimeSeconds / (3600*24));
    const hours = Math.floor(uptimeSeconds % (3600*24) / 3600);
    const minutes = Math.floor(uptimeSeconds % 3600 / 60);

    res.status(200).send(`
        <!DOCTYPE html>
        <html lang="km">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Math Quiz Pro API</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .card { background: #1e293b; padding: 40px; border-radius: 20px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); text-align: center; max-width: 500px; width: 90%; border: 1px solid #334155; }
                h1 { color: #22d3ee; margin-bottom: 10px; font-size: 2.5rem; }
                p { color: #94a3b8; margin-bottom: 30px; line-height: 1.6; }
                .btn { display: inline-block; background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 50px; font-weight: bold; transition: transform 0.2s; box-shadow: 0 4px 15px rgba(14, 165, 233, 0.4); }
                .btn:hover { transform: scale(1.05); }
                .status { margin-top: 30px; font-size: 0.8rem; font-family: monospace; color: #64748b; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>Math Quiz API 🚀</h1>
                <p>Welcome to the backend server for Math Quiz Pro. This system handles real-time scoring, AI problem generation, and certificate management.</p>
                <a href="/admin/requests" class="btn">🔐 Access Admin Panel</a>
                <div class="status">
                    Status: ONLINE 🟢<br>
                    Uptime: ${days}d ${hours}h ${minutes}m<br>
                    Version: 4.0.0
                </div>
            </div>
        </body>
        </html>
    `);
});

// 4.2 System Stats API
app.get('/stats', (req, res) => {
    res.json({ 
        status: "healthy",
        system: {
            uptime: process.uptime(),
            memory: process.memoryUsage().heapUsed,
            node_version: process.version
        },
        game: {
            total_games_generated: SERVER_STATS.totalGamesPlayed,
            unique_visitors: SERVER_STATS.uniqueVisitors.size,
            requests_handled: SERVER_STATS.totalRequests
        }
    });
});

// =================================================================================================
// SECTION 5: API ROUTES - CORE GAMEPLAY (AI & LEADERBOARD)
// =================================================================================================

// 5.1 Generate Math Problem using Gemini AI
app.post('/api/generate-problem', aiGenerationLimiter, async (req, res) => {
    try {
        const { prompt } = req.body;
        
        // Input Validation
        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ error: "Invalid Request: 'prompt' is required." });
        }

        // Stats Update
        SERVER_STATS.totalGamesPlayed++;
        SERVER_STATS.uniqueVisitors.add(req.ip);

        // AI Processing
        const genAI = new GoogleGenerativeAI(CONFIG.AI_KEY);
        const model = genAI.getGenerativeModel({ model: CONFIG.AI_MODEL });
        
        console.log(`🤖 Generating content for IP: ${req.ip}`);
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Successful Response
        res.json({ success: true, text: text });

    } catch (error) {
        console.error("❌ GEMINI API FAILURE:", error);
        SERVER_STATS.lastError = error.message;
        
        // Detailed error response for client
        res.status(500).json({ 
            success: false,
            error: "AI Generation Failed", 
            message: "សេវាកម្មកំពុងមានបញ្ហា សូមព្យាយាមម្តងទៀតនៅពេលក្រោយ។",
            details: CONFIG.ENV === 'development' ? error.message : undefined
        });
    }
});

// 5.2 Submit Score (Complex Merge Logic)
app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;
    
    // --- Step 1: Strict Validation ---
    if (!username || username.trim() === "") {
        return res.status(400).json({ success: false, message: "សូមបញ្ចូលឈ្មោះរបស់អ្នក!" });
    }
    if (typeof score !== 'number') {
        return res.status(400).json({ success: false, message: "ពិន្ទុត្រូវតែជាលេខ!" });
    }
    if (!difficulty) {
        return res.status(400).json({ success: false, message: "សូមជ្រើសរើសកម្រិត!" });
    }

    // --- Step 2: Anti-Cheat Mechanism ---
    const maxAllowed = CONFIG.ALLOWED_SCORES[difficulty];
    if (!maxAllowed || score > maxAllowed) {
        console.warn(`🚨 CHEAT DETECTED: IP ${req.ip} submitted ${score} for ${difficulty}`);
        return res.status(403).json({ 
            success: false, 
            message: "⚠️ ពិន្ទុរបស់អ្នកមិនប្រក្រតី! ប្រព័ន្ធបានបដិសេធ។" 
        });
    }

    try {
        const client = await pool.connect();
        
        // --- Step 3: Check for Duplicates (The Core Logic) ---
        // យើងស្វែងរកឈ្មោះដែលដូចគ្នា និងកម្រិតដូចគ្នា
        const checkUserQuery = `
            SELECT id, score 
            FROM leaderboard 
            WHERE username = $1 AND difficulty = $2 
            ORDER BY id ASC
        `;
        const checkResult = await client.query(checkUserQuery, [username.trim(), difficulty]);

        if (checkResult.rows.length > 0) {
            /**
             * =========================================================
             * SMART MERGE STRATEGY
             * =========================================================
             * ប្រសិនបើមានឈ្មោះនេះរួចហើយនៅក្នុង Database យើងមិនត្រូវបង្កើត
             * row ថ្មីទេ។ យើងត្រូវ៖
             * 1. យក ID របស់ row ដំបូងគេ (Target ID)។
             * 2. បូកពិន្ទុដែលមានស្រាប់ទាំងអស់បញ្ចូលគ្នា។
             * 3. បូកពិន្ទុថ្មី (Current Score) ចូល។
             * 4. Update Target ID ជាមួយពិន្ទុសរុបថ្មី។
             * 5. លុប row ផ្សេងៗដែលស្ទួនចោល (Cleanup)។
             */
            
            const targetId = checkResult.rows[0].id;
            
            // Calculate Total Existing Score
            let totalExistingScore = 0;
            checkResult.rows.forEach(row => {
                totalExistingScore += row.score;
            });

            // Calculate Final Grand Total
            const finalScore = totalExistingScore + score;

            // 3.1 Update the Main Record
            await client.query(
                'UPDATE leaderboard SET score = $1, updated_at = NOW() WHERE id = $2',
                [finalScore, targetId]
            );
            console.log(`🔄 MERGE SUCCESS: ${username} (ID:${targetId}) Updated to ${finalScore}`);

            // 3.2 Cleanup Duplicates (If any exist beyond the first one)
            if (checkResult.rows.length > 1) {
                // Get all IDs except the first one
                const duplicateIds = checkResult.rows.slice(1).map(row => row.id);
                
                await client.query(
                    'DELETE FROM leaderboard WHERE id = ANY($1::int[])', 
                    [duplicateIds]
                );
                console.log(`🧹 CLEANUP: Removed ${duplicateIds.length} duplicate records.`);
            }

        } else {
            // --- Step 4: Insert New Record (If user doesn't exist) ---
            await client.query(
                'INSERT INTO leaderboard(username, score, difficulty, ip_address) VALUES($1, $2, $3, $4)', 
                [username.trim(), score, difficulty, req.ip]
            );
            console.log(`🆕 NEW USER: ${username} added to ${difficulty} list.`);
        }

        client.release();
        res.status(201).json({ success: true, message: "ពិន្ទុត្រូវបានរក្សាទុកដោយជោគជ័យ!" });

    } catch (err) {
        console.error("❌ DB SUBMIT ERROR:", err);
        res.status(500).json({ success: false, message: "មិនអាចរក្សាទុកពិន្ទុបានទេ។ សូមព្យាយាមម្តងទៀត។" });
    }
});

// 5.3 Get Top 100 Leaderboard
app.get('/api/leaderboard/top', async (req, res) => {
    try {
        // We group by username to show the total score across all difficulties if needed,
        // OR we can just show the raw table. Here we aggregate to be safe.
        const query = `
            SELECT 
                username, 
                SUM(score) AS score,
                COUNT(difficulty) AS total_games_played
            FROM leaderboard 
            GROUP BY username 
            ORDER BY score DESC 
            LIMIT 100
        `;
        const result = await executeQuery(query);
        res.json(result.rows);
    } catch (err) {
        console.error("Leaderboard Fetch Error:", err);
        res.status(500).json({ success: false, message: "Failed to load leaderboard." });
    }
});

// =================================================================================================
// SECTION 6: CERTIFICATE SYSTEM
// =================================================================================================

// 6.1 Request a Certificate
app.post('/api/submit-request', async (req, res) => {
    const { username, score } = req.body;
    
    if (!username || score === undefined) {
        return res.status(400).json({ success: false, message: "ទិន្នន័យមិនគ្រប់គ្រាន់" });
    }

    try {
        const query = 'INSERT INTO certificate_requests (username, score, request_date) VALUES ($1, $2, NOW())';
        await executeQuery(query, [username, score]);
        
        console.log(`📩 CERT REQUEST: ${username} requested a cert for score ${score}`);
        res.json({ success: true, message: "សំណើរបស់អ្នកត្រូវបានផ្ញើទៅកាន់ Admin រួចរាល់!" });
    } catch (err) {
        console.error("Cert Request Error:", err.message);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// 6.2 Generate Certificate Image (Redirect to Imgix)
app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const id = req.params.id;
        
        // Fetch Request Details
        const result = await executeQuery('SELECT * FROM certificate_requests WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return res.status(404).send("<h1>404 - Request Not Found</h1>");
        }

        const { username, score } = result.rows[0];
        
        // --- Certificate Generation Configuration ---
        const dateObj = new Date();
        const formattedDate = dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
        
        const certText = `With immense pride and recognition of your intellectual brilliance, we bestow this award upon you. Your outstanding performance demonstrates a profound mastery of mathematics and a relentless spirit of excellence. May this achievement serve as a stepping stone to a future filled with boundless success and wisdom. Presented by: braintest.fun`;

        const BASE_IMGIX_URL = CONFIG.IMG_API;
        if (!BASE_IMGIX_URL) {
            return res.status(500).send("Error: IMGIX API URL is not configured in .env");
        }

        // --- Build Complex URL ---
        // 1. Username Layer
        const nameLayer = `&txt-align=center&txt-size=110&txt-color=FFD700&txt=${encodeURIComponent(username.toUpperCase())}&txt-fit=max&w=1800`;
        
        // 2. Details Layer (Score, Date, Message)
        const detailsText = `Score: ${score}%0A%0A` + `Date Issued: ${formattedDate}%0A%0A%0A` + `${certText}`;
        const detailsLayer = `&mark-align=center&mark-size=35&mark-color=FFFFFF&mark-y=850&mark-txt=${encodeURIComponent(detailsText)}&mark-w=1600&mark-fit=max`;

        const finalUrl = BASE_IMGIX_URL + nameLayer + detailsLayer;

        // Redirect user/admin to the generated image
        res.redirect(finalUrl);

    } catch (err) {
        console.error("❌ Certificate Gen Error:", err.message);
        res.status(500).send(`Server Error: ${err.message}`);
    }
});

// =================================================================================================
// SECTION 7: ADMIN PANEL (Server-Side Rendered HTML)
// =================================================================================================

app.get('/admin/requests', async (req, res) => {
    try {
        const result = await executeQuery('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 100');
        
        // HTML Template Construction
        // Note: Using a template string for simplicity, but formatted for "Enterprise" look
        let htmlRows = '';
        
        if (result.rows.length === 0) {
            htmlRows = `<tr><td colspan="5" class="empty-state">🚫 មិនមានសំណើថ្មីទេនៅពេលនេះ</td></tr>`;
        } else {
            result.rows.forEach(row => {
                const scoreBadge = row.score >= 500 
                    ? `<span class="badge badge-high">🏆 ${row.score}</span>` 
                    : `<span class="badge badge-normal">${row.score}</span>`;
                
                htmlRows += `
                    <tr id="row-${row.id}">
                        <td><span class="id-tag">#${row.id}</span></td>
                        <td>
                            <div class="user-info">
                                <span class="username">${row.username}</span>
                                <span class="date">${new Date(row.request_date).toLocaleString('km-KH')}</span>
                            </div>
                        </td>
                        <td>${scoreBadge}</td>
                        <td><span class="status-pending">Pending</span></td>
                        <td>
                            <div class="action-buttons">
                                <a href="/admin/generate-cert/${row.id}" target="_blank" class="btn-icon btn-print" title="Generate & Print">
                                    🖨️ Print
                                </a>
                                <button onclick="deleteRequest(${row.id})" class="btn-icon btn-delete" title="Delete Request">
                                    🗑️ Reject
                                </button>
                            </div>
                        </td>
                    </tr>`;
            });
        }

        const fullHtml = `
        <!DOCTYPE html>
        <html lang="km">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Admin Dashboard | Math Quiz Pro</title>
            <link href="https://fonts.googleapis.com/css2?family=Hanuman:wght@300;400;700&family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
            <style>
                :root {
                    --primary: #2563eb;
                    --bg: #f8fafc;
                    --surface: #ffffff;
                    --text: #1e293b;
                    --text-secondary: #64748b;
                    --danger: #ef4444;
                    --success: #10b981;
                }
                body { font-family: 'Inter', 'Hanuman', sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 20px; }
                
                /* Layout */
                .container { max-width: 1200px; margin: 0 auto; background: var(--surface); border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden; }
                
                /* Header */
                .header { background: #1e293b; color: white; padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; }
                .header h1 { margin: 0; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.025em; display: flex; align-items: center; gap: 10px; }
                .stats-badge { background: rgba(255,255,255,0.1); padding: 5px 12px; border-radius: 99px; font-size: 0.875rem; font-weight: 500; }
                
                /* Table */
                .table-container { overflow-x: auto; }
                table { width: 100%; border-collapse: collapse; min-width: 800px; }
                th { background: #f1f5f9; color: var(--text-secondary); font-weight: 600; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; padding: 16px 24px; text-align: left; border-bottom: 1px solid #e2e8f0; }
                td { padding: 16px 24px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
                tr:last-child td { border-bottom: none; }
                tr:hover { background-color: #f8fafc; transition: background-color 0.2s; }
                
                /* Components */
                .id-tag { font-family: monospace; color: var(--text-secondary); background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; }
                .user-info { display: flex; flex-direction: column; }
                .username { font-weight: 600; color: var(--text); font-size: 1rem; }
                .date { font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px; }
                
                .badge { display: inline-flex; align-items: center; px: 2.5; py: 0.5; border-radius: 99px; font-size: 0.875rem; font-weight: 700; padding: 4px 12px; }
                .badge-high { background: #dcfce7; color: #15803d; }
                .badge-normal { background: #fee2e2; color: #b91c1c; }
                
                .status-pending { background: #fef3c7; color: #b45309; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
                
                /* Buttons */
                .action-buttons { display: flex; gap: 8px; }
                .btn-icon { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; border: none; text-decoration: none; transition: all 0.2s; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); }
                .btn-print { background: var(--primary); color: white; }
                .btn-print:hover { background: #1d4ed8; transform: translateY(-1px); }
                .btn-delete { background: white; color: var(--danger); border: 1px solid #fee2e2; }
                .btn-delete:hover { background: #fee2e2; transform: translateY(-1px); }

                .empty-state { text-align: center; padding: 60px; color: var(--text-secondary); font-size: 1.1rem; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🛡️ Admin Dashboard</h1>
                    <span class="stats-badge">Requests: ${result.rows.length}</span>
                </div>
                
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th width="80">ID</th>
                                <th>Candidate Info</th>
                                <th width="120">Score</th>
                                <th width="100">Status</th>
                                <th width="220">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${htmlRows}
                        </tbody>
                    </table>
                </div>
            </div>

            <script>
                // Modern Async Delete Function
                async function deleteRequest(id) {
                    if (!confirm("⚠️ Confirmation Required\\n\\nAre you sure you want to PERMANENTLY delete Request #" + id + "?")) return;
                    
                    const row = document.getElementById('row-' + id);
                    const btn = row.querySelector('.btn-delete');
                    
                    // UI Feedback
                    btn.innerText = "Deleting...";
                    btn.disabled = true;
                    row.style.opacity = '0.5';

                    try {
                        const response = await fetch('/admin/delete-request/' + id, { method: 'DELETE' });
                        const result = await response.json();

                        if (result.success) {
                            // Smooth removal animation
                            row.style.transition = 'all 0.5s';
                            row.style.transform = 'translateX(50px)';
                            row.style.opacity = '0';
                            setTimeout(() => row.remove(), 500);
                        } else {
                            alert("❌ Error: " + result.message);
                            // Reset UI
                            btn.innerText = "🗑️ Reject";
                            btn.disabled = false;
                            row.style.opacity = '1';
                        }
                    } catch (err) {
                        alert("Network Error: Could not connect to server.");
                        btn.innerText = "Error";
                    }
                }
            </script>
        </body>
        </html>`;
        
        res.send(fullHtml);

    } catch (err) {
        console.error("Admin Panel Error:", err);
        res.status(500).send("<h1>500 - Internal Server Error</h1><p>Check server logs.</p>");
    }
});

// 7.1 Delete Request API
app.delete('/admin/delete-request/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const client = await pool.connect();
        
        // Execute Delete
        const result = await client.query('DELETE FROM certificate_requests WHERE id = $1', [id]);
        client.release();

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "ID not found in database." });
        }

        console.log(`🗑️ ADMIN ACTION: Deleted Request ID #${id}`);
        res.json({ success: true, message: "Record deleted successfully." });
    } catch (err) {
        console.error("Delete Error:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});

// =================================================================================================
// SECTION 8: SERVER INITIALIZATION & STARTUP
// =================================================================================================

/**
 * មុខងារ: startServer
 * គោលបំណង: ចាប់ផ្តើមប្រព័ន្ធទាំងមូលតាមលំដាប់លំដោយ
 * 1. ពិនិត្យ Config
 * 2. ភ្ជាប់ Database
 * 3. បើក Port
 */
async function startServer() {
    console.clear();
    console.log(`
    ===================================================
      MATH QUIZ PRO - BACKEND API v4.0.0
      (c) 2024 BrainTest Team
    ===================================================
    `);

    // 1. Config Check
    if (!CONFIG.DB_URL) {
        console.error("🛑 CRITICAL ERROR: DATABASE_URL is missing in .env file.");
        process.exit(1);
    }
    if (!CONFIG.AI_KEY) {
        console.warn("⚠️  WARNING: GEMINI_API_KEY is missing. AI features will fail.");
    }

    // 2. Database Init
    await initializeDatabaseTables();

    // 3. Start Listener
    app.listen(CONFIG.PORT, () => {
        console.log(`\n🚀 SERVER IS RUNNING!`);
        console.log(`   👉 API Access:   http://localhost:${CONFIG.PORT}`);
        console.log(`   👉 Admin Panel:  http://localhost:${CONFIG.PORT}/admin/requests`);
        console.log(`   👉 Environment:  ${CONFIG.ENV.toUpperCase()}`);
        console.log(`\nwaiting for requests...\n`);
    });
}

// Global Error Handler for Uncaught Exceptions
process.on('uncaughtException', (error) => {
    console.error('🔥 UNCAUGHT EXCEPTION:', error);
    // In production, you might want to restart the process here
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 UNHANDLED REJECTION:', reason);
});

// --- Execute Start ---
startServer();
