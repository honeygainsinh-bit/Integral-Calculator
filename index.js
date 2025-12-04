require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg'); // PostgreSQL Client

const app = express();
const port = process.env.PORT || 3000;

// ==========================================
// 1. SETUP & CONFIG
// ==========================================
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

const MODEL_NAME = "gemini-2.5-flash"; 

// Tracking Variables
let totalPlays = 0;           
const uniqueVisitors = new Set();

// Middleware: Log Request
app.use((req, res, next) => {
    const ip = req.ip;
    const time = new Date().toLocaleTimeString('km-KH');
    console.log(`[${time}] 📡 IP: ${ip} | Path: ${req.path}`);
    next();
});

// ==========================================
// 2. DATABASE CONFIGURATION (PostgreSQL)
// ==========================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false 
    }
});

async function initializeDatabase() {
    try {
        const client = await pool.connect();
        
        // Table 1: Leaderboard (តារាងពិន្ទុ)
        await client.query(`
            CREATE TABLE IF NOT EXISTS leaderboard (
                id SERIAL PRIMARY KEY,
                username VARCHAR(25) NOT NULL,
                score INTEGER NOT NULL,
                difficulty VARCHAR(15) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Table 2: Certificate Requests (តារាងស្នើសុំលិខិតសរសើរ) - ថ្មី
        await client.query(`
            CREATE TABLE IF NOT EXISTS certificate_requests (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                score INTEGER NOT NULL,
                status VARCHAR(20) DEFAULT 'Pending',
                request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("✅ Database initialized: 'leaderboard' & 'certificate_requests' ready.");
        client.release();
    } catch (err) {
        console.error("❌ Database initialization error:", err.message);
        throw err;
    }
}

// ==========================================
// 3. RATE LIMITER
// ==========================================
const limiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, 
    max: 10, 
    message: { 
        error: "Rate limit exceeded", 
        message: "⚠️ អ្នកបានប្រើប្រាស់អស់ចំនួនកំណត់ហើយ (10ដង ក្នុង 8ម៉ោង)។ សូមសម្រាកសិន!" 
    },
    keyGenerator: (req) => req.ip,
    skip: (req) => {
        const myIp = process.env.OWNER_IP; 
        if (req.ip === myIp) {
            console.log(`👑 Owner Access Detected: ${req.ip} (Unlimited)`);
            return true;
        }
        return false;
    }
});

// ==========================================
// 4. STATIC FILES & ONLINE CHECK
// ==========================================
app.use(express.static(path.join(__dirname, 'public'))); 

app.get('/', (req, res) => {
    res.status(200).send(`
        <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
            <h1 style="color: #22c55e;">Server is Online 🟢</h1>
            <p>Backend API is running smoothly.</p>
            <div style="margin-top: 20px; padding: 10px; background: #f0f9ff; display: inline-block; border-radius: 8px;">
                <a href="/admin/requests" style="text-decoration: none; color: #0284c7; font-weight: bold;">👮‍♂️ ចូលមើលសំណើសុំលិខិតសរសើរ (Admin)</a>
            </div>
        </div>
    `);
});

// ==========================================
// 5. API ROUTES
// ==========================================

// Check Stats
app.get('/stats', (req, res) => {
    res.json({
        status: "Online",
        total_plays: totalPlays,
        unique_players: uniqueVisitors.size,
        owner_ip_configured: process.env.OWNER_IP ? "Yes" : "No"
    });
});

// Generate Problem (Gemini)
app.post('/api/generate-problem', limiter, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "Prompt is required" });

        totalPlays++;
        uniqueVisitors.add(req.ip);

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        res.json({ text });

    } catch (error) {
        console.error("❌ Gemini API Error:", error.message);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
});

// Leaderboard Submission API
app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;

    if (!username || typeof score !== 'number' || score <= 0 || username.trim().length < 3) {
        return res.status(400).json({ success: false, message: "Invalid data." });
    }

    try {
        const client = await pool.connect();
        const query = `
            INSERT INTO leaderboard(username, score, difficulty)
            VALUES($1, $2, $3);
        `;
        const values = [username.trim().substring(0, 25), score, difficulty];
        await client.query(query, values);
        client.release();

        res.status(201).json({ success: true, message: "Score saved successfully." });

    } catch (err) {
        console.error("❌ Score submission error:", err.message);
        res.status(500).json({ success: false, message: "Failed to save score." });
    }
});

app.get('/api/leaderboard/top', async (req, res) => {
    try {
        const client = await pool.connect();
        const limit = parseInt(req.query.limit) || 1000;
        const query = `
            SELECT username, score, difficulty
            FROM leaderboard
            ORDER BY score DESC, created_at DESC
            LIMIT $1; 
        `;
        const result = await client.query(query, [limit]);
        client.release();
        res.json(result.rows);
    } catch (err) {
        console.error("❌ Leaderboard retrieval error:", err.message);
        res.status(500).json({ success: false, message: "Failed to retrieve leaderboard." });
    }
});

// ==========================================
// 6. CERTIFICATE REQUEST SYSTEM (NEW) 🔥
// ==========================================

// 6.1 API សម្រាប់ទទួលសំណើពី Frontend
app.post('/api/submit-request', async (req, res) => {
    const { username, score, date } = req.body;
    
    // Validate
    if (!username || !score) {
        return res.status(400).json({ success: false, message: "Missing username or score" });
    }

    try {
        const client = await pool.connect();
        // Insert ចូលក្នុង Database
        const query = `
            INSERT INTO certificate_requests (username, score, request_date)
            VALUES ($1, $2, NOW())
        `;
        await client.query(query, [username, score]);
        client.release();

        console.log(`📩 New Certificate Request: ${username} (Score: ${score})`);
        res.json({ success: true, message: "Request submitted successfully" });

    } catch (err) {
        console.error("❌ Submit Request Error:", err.message);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// 6.2 Admin Page សម្រាប់មើលសំណើ (HTML View)
app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pool.connect();
        // ទាញយកសំណើចុងក្រោយ 50
        const result = await client.query(`
            SELECT * FROM certificate_requests 
            ORDER BY request_date DESC 
            LIMIT 50
        `);
        client.release();

        const requests = result.rows;

        // បង្កើត HTML Table ធម្មតា
        let html = `
        <!DOCTYPE html>
        <html lang="km">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Admin - សំណើសុំលិខិតសរសើរ</title>
            <style>
                body { font-family: sans-serif; background: #f0f2f5; padding: 20px; }
                h1 { color: #1e3a8a; }
                .card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); overflow-x: auto;}
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 12px 15px; border-bottom: 1px solid #ddd; text-align: left; }
                th { background-color: #3b82f6; color: white; }
                tr:hover { background-color: #f1f5f9; }
                .high-score { color: #16a34a; font-weight: bold; }
                .low-score { color: #dc2626; font-weight: bold; }
                .badge { padding: 5px 10px; border-radius: 15px; font-size: 0.8rem; }
                .verify-link { display: inline-block; margin-top: 5px; color: #2563eb; text-decoration: none; font-size: 0.9rem;}
            </style>
        </head>
        <body>
            <h1>👮‍♂️ Admin Panel - សំណើសុំលិខិតសរសើរ</h1>
            <div class="card">
                <table>
                    <thead>
                        <tr>
                            <th>#ID</th>
                            <th>ឈ្មោះ (Username)</th>
                            <th>ពិន្ទុ (Score)</th>
                            <th>ស្ថានភាព</th>
                            <th>កាលបរិច្ឆេទ</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        if (requests.length === 0) {
            html += `<tr><td colspan="5" style="text-align:center; padding: 20px;">មិនទាន់មានសំណើនៅឡើយទេ។</td></tr>`;
        } else {
            requests.forEach(req => {
                const isHigh = req.score >= 500;
                const scoreClass = isHigh ? 'high-score' : 'low-score';
                const statusText = isHigh ? '✅ អាចចេញប័ណ្ណបាន' : '⚠️ ពិន្ទុមិនដល់';
                
                html += `
                    <tr>
                        <td>${req.id}</td>
                        <td style="font-weight:bold;">${req.username}</td>
                        <td class="${scoreClass}">${req.score}</td>
                        <td>${statusText}</td>
                        <td>${new Date(req.request_date).toLocaleString('km-KH')}</td>
                    </tr>
                `;
            });
        }

        html += `
                    </tbody>
                </table>
            </div>
            <p style="margin-top:20px; color:gray; font-size:0.9rem;">*សូមផ្ទៀងផ្ទាត់ពិន្ទុក្នុង Leaderboard ម្តងទៀតមុនចេញប័ណ្ណ។</p>
        </body>
        </html>
        `;

        res.send(html);

    } catch (err) {
        console.error("❌ Admin View Error:", err.message);
        res.status(500).send("Server Error: មិនអាចទាញយកទិន្នន័យបាន។");
    }
});

// ==========================================
// 7. START SERVER
// ==========================================
async function startServer() {
    if (!process.env.DATABASE_URL) {
        console.error("🛑 CRITICAL: DATABASE_URL is missing.");
        throw new Error("Missing DATABASE_URL");
    }

    console.log(`🔑 Firebase Project ID Loaded: ${process.env.FIREBASE_PROJECT_ID ? 'Yes' : 'No'}`);
    
    try {
        await initializeDatabase();
        app.listen(port, () => {
            console.log(`🚀 Server running on port ${port}`);
            console.log(`👮‍♂️ Admin Link: http://localhost:${port}/admin/requests`);
        });
    } catch (error) {
        console.error("🛑 Server failed to start due to Database error.");
    }
}

startServer();
