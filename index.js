// **FIXED: Changed Require to require (lowercase 'r') to fix deployment error**
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
        const query = `
            CREATE TABLE IF NOT EXISTS leaderboard (
                id SERIAL PRIMARY KEY,
                username VARCHAR(25) NOT NULL,
                score INTEGER NOT NULL,
                difficulty VARCHAR(15) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                -- NEW FIELDS FOR DAILY/CHALLENGE TRACKING (Supporting features 1 & 3)
                is_daily_challenge BOOLEAN DEFAULT FALSE, 
                problem_seed VARCHAR(50) 
            );
        `;
        await client.query(query);
        console.log("✅ Database initialized: 'leaderboard' table ready with new fields.");
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
            <p style="color: gray; font-size: 0.8rem;">Note: If you don't see the game, check your 'public' folder.</p>
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

/**
 * Generate Problem (Gemini Logic) - UPDATED TO ACCEPT SEED (Feature 3)
 * The client side can send a seed for deterministic daily/challenge generation.
 */
app.post('/api/generate-problem', limiter, async (req, res) => {
    try {
        // Now extracting both 'prompt' and optional 'seed'
        const { prompt, seed } = req.body; 
        if (!prompt) return res.status(400).json({ error: "Prompt is required" });

        totalPlays++;
        uniqueVisitors.add(req.ip);

        // Append the seed to the prompt to enforce deterministic generation if provided
        let finalPrompt = prompt;
        if (seed) {
            finalPrompt += ` CRITICAL RULE: Use this deterministic seed for generation: ${seed}.`;
            console.log(`[Seed Mode] Seed used: ${seed}`);
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        const text = response.text();

        res.json({ text });

    } catch (error) {
        console.error("❌ Gemini API Error:", error.message);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
});


/**
 * Leaderboard Submission API - UPDATED TO INCLUDE NEW FIELDS (Features 1 & 3)
 */
app.post('/api/leaderboard/submit', async (req, res) => {
    // Extract new optional fields: is_daily_challenge, problem_seed
    const { username, score, difficulty, is_daily_challenge, problem_seed } = req.body; 

    // Server-side Validation
    if (!username || typeof score !== 'number' || score <= 0 || username.trim().length < 3) {
        return res.status(400).json({ success: false, message: "Invalid data: Username must be 3+ chars and score > 0." });
    }

    try {
        const client = await pool.connect();
        const query = `
            INSERT INTO leaderboard(username, score, difficulty, is_daily_challenge, problem_seed)
            VALUES($1, $2, $3, $4, $5);
        `;
        const values = [
            username.trim().substring(0, 25), 
            score, 
            difficulty, 
            is_daily_challenge || false, // Default to false if not provided
            problem_seed || null
        ];
        await client.query(query, values);
        client.release();

        res.status(201).json({ success: true, message: "Score saved successfully." });

    } catch (err) {
        console.error("❌ Score submission error:", err.message);
        res.status(500).json({ success: false, message: "Failed to save score due to server error." });
    }
});


/**
 * Leaderboard Retrieval API (Overall Top 10)
 */
app.get('/api/leaderboard/top', async (req, res) => {
    try {
        const client = await pool.connect();
        // Sum score by username to show total performance
        const query = `
            SELECT username, SUM(score) as total_score, COUNT(*) as games_played
            FROM leaderboard
            GROUP BY username
            ORDER BY total_score DESC
            LIMIT 10;
        `;
        const result = await client.query(query);
        client.release();

        res.json(result.rows.map(row => ({
            username: row.username,
            score: parseInt(row.total_score),
            games_played: parseInt(row.games_played)
        })));

    } catch (err) {
        console.error("❌ Leaderboard retrieval error:", err.message);
        res.status(500).json({ success: false, message: "Failed to retrieve leaderboard." });
    }
});

/**
 * NEW API: Daily Challenge Leaderboard Retrieval (Feature 3)
 */
app.get('/api/leaderboard/daily-top', async (req, res) => {
    try {
        const client = await pool.connect();
        // Get today's seed (date)
        const todaySeed = new Date().toISOString().slice(0, 10); 
        
        // Find the top scores submitted for today's daily challenge
        const query = `
            SELECT username, score
            FROM leaderboard
            WHERE is_daily_challenge = TRUE
              AND problem_seed = $1
            ORDER BY score DESC, created_at ASC
            LIMIT 10;
        `;
        const result = await client.query(query, [todaySeed]);
        client.release();

        res.json(result.rows);

    } catch (err) {
        console.error("❌ Daily Leaderboard retrieval error:", err.message);
        res.status(500).json({ success: false, message: "Failed to retrieve daily leaderboard." });
    }
});


// ==========================================
// 6. START SERVER
// ==========================================
async function startServer() {
    if (!process.env.DATABASE_URL) {
        console.error("🛑 CRITICAL: DATABASE_URL is missing. Check Render settings.");
        throw new Error("Missing DATABASE_URL");
    }

    console.log(`🔑 Gemini API Key Loaded: ${process.env.GEMINI_API_KEY ? 'Yes' : 'No'}`);
    
    try {
        await initializeDatabase();
        app.listen(port, () => {
            console.log(`🚀 Server running on port ${port}`);
        });
    } catch (error) {
        console.error("🛑 Server failed to start due to Database error. Check DATABASE_URL and permissions.");
    }
}

startServer();
