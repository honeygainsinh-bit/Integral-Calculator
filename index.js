Require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// ==========================================
// 1. SETUP & CONFIG
// ==========================================
// ⚠️ Trust proxy is critical for getting the correct IP in environments like Render
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
        const queryLeaderboard = `
            CREATE TABLE IF NOT EXISTS leaderboard (
                id SERIAL PRIMARY KEY,
                username VARCHAR(25) NOT NULL,
                score INTEGER NOT NULL,
                difficulty VARCHAR(15) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;
        // Table to track IP usage for Daily Challenge (1/day)
        const queryLimits = `
            CREATE TABLE IF NOT EXISTS ip_play_limits (
                ip_address VARCHAR(45) NOT NULL,
                play_date DATE DEFAULT CURRENT_DATE,
                daily_seed VARCHAR(50) NOT NULL,
                PRIMARY KEY (ip_address, daily_seed)
            );
        `;
        await client.query(queryLeaderboard);
        await client.query(queryLimits);
        console.log("✅ Database initialized: 'leaderboard' and 'ip_play_limits' tables ready.");
        client.release();
    } catch (err) {
        console.error("❌ Database initialization error:", err.message);
        throw err;
    }
}

// ==========================================
// 3. RATE LIMITERS (Mixed Window)
// ==========================================

// 🎯 Limiter សម្រាប់លំហាត់ទូទៅ: ១០ ដង ក្នុង ៨ ម៉ោង (General Play Limit)
const generalLimiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, // 8 hours
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
        // Skip General Limiter if it's a Daily Challenge, handled by dailyLimiter
        if (req.body.is_daily_challenge) {
            return true; 
        }
        return false;
    }
});

// 📅 Limiter សម្រាប់ Daily Challenge: ១ ដង ក្នុងមួយ Seed/ថ្ងៃ (Database Check)
async function dailyLimiter(req, res, next) {
    const { is_daily_challenge, problem_seed } = req.body;
    const ip = req.ip;

    if (!is_daily_challenge || !problem_seed) {
        // If not a daily challenge, proceed to the next middleware (generalLimiter)
        return next();
    }
    
    // Owner IP exception
    if (ip === process.env.OWNER_IP) {
        return next();
    }

    const client = await pool.connect();
    try {
        // Check if this IP has already generated/attempted this specific daily seed
        const dailyCheckQuery = `
            SELECT COUNT(*) FROM ip_play_limits 
            WHERE ip_address = $1 AND daily_seed = $2;
        `;
        const dailyCheckResult = await client.query(dailyCheckQuery, [ip, problem_seed]);

        if (dailyCheckResult.rows[0].count > 0) {
            return res.status(429).json({ 
                error: "Daily Challenge limit exceeded", 
                message: "⚠️ អ្នកបានលេង Daily Challenge រួចហើយសម្រាប់ថ្ងៃនេះ (១ ដង/ថ្ងៃ)។" 
            });
        }
        
        // Register the attempt BEFORE generation (blocks immediate replays)
        const insertDailyAttempt = `
            INSERT INTO ip_play_limits (ip_address, daily_seed)
            VALUES ($1, $2);
        `;
        await client.query(insertDailyAttempt, [ip, problem_seed]);
        
        next(); 
    } catch (error) {
        console.error("❌ Database error during Daily Limit check:", error.message);
        res.status(500).json({ error: "Internal Limit Check Error" });
    } finally {
        client.release();
    }
}

// ==========================================
// 4. STATIC FILES & ONLINE CHECK
// ==========================================
app.use(express.static(path.join(__dirname, 'public'))); 

app.get('/', (req, res) => {
    // Check if the request is for the root path, usually served by the static files.
    // We keep this check for API debugging only.
    res.status(200).send(`
        <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
            <h1 style="color: #22c55e;">Server is Online 🟢</h1>
            <p>Backend API is running smoothly.</p>
            <p style="color: gray; font-size: 0.8rem;">Note: Game should be served from /index.html in the 'public' folder.</p>
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
        owner_ip_configured: process.env.OWNER_IP ? "Yes" : "No",
        general_limit: "10 requests / 8 hours",
        daily_limit: "1 request / daily seed (via DB)"
    });
});

// Generate Problem (Applies Daily Check, then General 10/8h Limit)
app.post('/api/generate-problem', dailyLimiter, generalLimiter, async (req, res) => {
    // Requires: { prompt, is_daily_challenge, problem_seed }
    const { prompt } = req.body;
    
    try {
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


// Leaderboard Submission API (No limit check here, limits are enforced at generation)
app.post('/api/leaderboard/submit', async (req, res) => {
    // Requires: { username, score, difficulty, is_daily_challenge, problem_seed, ip_address, topic_name }
    const { username, score, difficulty } = req.body;

    // Server-side Validation
    if (!username || typeof score !== 'number' || score <= 0 || username.trim().length < 3) {
        return res.status(400).json({ success: false, message: "Invalid data: Username must be 3+ chars and score > 0." });
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
        res.status(500).json({ success: false, message: "Failed to save score due to server error." });
    }
});


// Leaderboard Retrieval API
app.get('/api/leaderboard/top', async (req, res) => {
    try {
        const client = await pool.connect();
        const query = `
            SELECT username, score, difficulty
            FROM leaderboard
            ORDER BY score DESC, created_at ASC
            LIMIT 10;
        `;
        const result = await client.query(query);
        client.release();

        res.json(result.rows);

    } catch (err) {
        console.error("❌ Leaderboard retrieval error:", err.message);
        res.status(500).json({ success: false, message: "Failed to retrieve leaderboard." });
    }
});


// ==========================================
// 6. START SERVER
// ==========================================
async function startServer() {
    if (!process.env.DATABASE_URL) {
        console.error("🛑 CRITICAL: DATABASE_URL is missing.");
        throw new Error("Missing DATABASE_URL");
    }
    
    try {
        await initializeDatabase();
        app.listen(port, () => {
            console.log(`🚀 Server running on port ${port}`);
        });
    } catch (error) {
        console.error("🛑 Server failed to start due to Database error.");
    }
}

startServer();
