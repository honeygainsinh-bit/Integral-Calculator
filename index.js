// index.js (Server Side)

import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { Pool } from 'pg';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

// --- CONFIGURATION & INITIALIZATION ---

// 1. Database Setup
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for external connections like Render/Heroku
});

// 2. AI Setup
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const modelName = "gemini-2.5-flash"; // Powerful and cost-effective model

// 3. Express App Setup
const app = express();
const PORT = process.env.PORT || 5000;
const OWNER_IP = process.env.OWNER_IP; // IP of the developer/owner (for testing/unlimited play)

// Middleware
app.use(cors()); // Allow cross-origin requests
app.use(express.json()); // To parse JSON bodies

// --- DATABASE FUNCTIONS ---

/**
 * Initializes the database tables if they don't exist.
 */
async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS leaderboard (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                score INTEGER NOT NULL,
                difficulty VARCHAR(20),
                played_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                ip_address VARCHAR(45) -- To log the user IP
            );
        `);
        console.log("Leaderboard table ensured.");

        // Table to track IP limits for daily challenges and general plays
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ip_play_limits (
                id SERIAL PRIMARY KEY,
                ip_address VARCHAR(45) NOT NULL,
                daily_seed VARCHAR(10), -- e.g., '2025-12-03'
                is_daily_challenge BOOLEAN NOT NULL DEFAULT FALSE,
                last_play_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (ip_address, daily_seed) -- Enforce 1 daily play per IP
            );
        `);
        console.log("IP Play Limits table ensured.");
        
    } catch (error) {
        console.error("Error initializing database:", error.message);
        throw error; // Propagate error to crash server if DB fails to start
    }
}


// --- RATE LIMITING MIDDLEWARES ---

/**
 * 1. Daily Challenge Limiter (1 request per daily seed per IP)
 * - Uses database for persistent, accurate tracking.
 */
const dailyLimiter = async (req, res, next) => {
    const isDaily = req.body.is_daily_challenge;
    const seed = req.body.problem_seed; // Expected format YYYY-MM-DD
    const clientIp = req.ip;

    // Owner bypass
    if (clientIp === OWNER_IP) {
        return next();
    }

    // Only apply DB check if it's a daily challenge with a valid seed
    if (isDaily && seed) {
        try {
            const result = await pool.query(
                'SELECT COUNT(*) FROM ip_play_limits WHERE ip_address = $1 AND daily_seed = $2 AND is_daily_challenge = TRUE',
                [clientIp, seed]
            );

            if (result.rows[0].count > 0) {
                return res.status(429).json({ 
                    success: false, 
                    message: "អ្នកបានលេង Daily Challenge សម្រាប់ថ្ងៃនេះរួចហើយ។ សូមរង់ចាំថ្ងៃស្អែក។" 
                });
            }
        } catch (error) {
            console.error("Daily Limiter DB error:", error);
            // Allow access if DB check fails to prevent blocking all users on DB error
        }
    }
    
    // Proceed if not a daily challenge or if daily check passed
    next();
};

/**
 * 2. General Challenge Limiter (10 requests per 8 hours per IP)
 * - Uses the standard express-rate-limit memory store.
 */
const generalLimiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, // 8 hours
    max: 10, // Limit each IP to 10 requests per windowMs
    keyGenerator: (req) => {
        // Owner bypass
        if (req.ip === OWNER_IP) {
            return req.ip + "_UNLIMITED";
        }
        // Only apply to general plays (not daily)
        if (req.body.is_daily_challenge) {
            return req.ip + "_DAILY_BYPASS"; // Use a unique key to effectively skip limit for daily
        }
        return req.ip;
    },
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: "អ្នកបានប្រើប្រាស់ចំនួនលេងអតិបរមា (10 ដង/8 ម៉ោង) របស់លំហាត់ទូទៅរួចហើយ។ សូមរង់ចាំបន្តិច។"
        });
    }
});


// --- API ENDPOINTS ---

/**
 * GET /
 * Health check endpoint.
 */
app.get('/', (req, res) => {
    res.send({ status: "OK", message: "Math Game API is running.", port: PORT, ip: req.ip });
});

/**
 * POST /api/generate-problem
 * Generates a math problem using the Gemini API.
 */
app.post('/api/generate-problem', dailyLimiter, generalLimiter, async (req, res) => {
    const { prompt, is_daily_challenge, problem_seed } = req.body;
    const clientIp = req.ip;
    
    if (!prompt) {
        return res.status(400).json({ success: false, message: "Prompt is required." });
    }

    try {
        // 1. Generate Problem using Gemini
        const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
                systemInstruction: "You are a professional Cambodian high school math problem generator. You strictly follow all formatting rules including the [PROBLEM] and [ANSWER] tags, and use LaTeX for math formulas. Ensure the options ក, ខ, គ, ឃ are mathematically distinct.",
                temperature: 0.7,
                maxOutputTokens: 2048
            }
        });
        
        const text = response.text;
        
        // 2. Log play for rate limiting
        if (is_daily_challenge && problem_seed) {
            // Log daily challenge play (only if daily challenge)
            await pool.query(
                'INSERT INTO ip_play_limits (ip_address, daily_seed, is_daily_challenge, last_play_time) VALUES ($1, $2, TRUE, NOW()) ON CONFLICT (ip_address, daily_seed) DO NOTHING',
                [clientIp, problem_seed]
            );
        } else {
            // General plays are handled by generalLimiter (memory store) - no DB write needed here.
        }

        res.json({ success: true, text });
        
    } catch (error) {
        console.error("Gemini API or Logging Error:", error.message);
        res.status(500).json({ success: false, message: "Server error during problem generation.", error: error.message });
    }
});

/**
 * POST /api/leaderboard/submit
 * Submits a new score to the leaderboard.
 */
app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty, is_daily_challenge, problem_seed, ip_address } = req.body;
    const clientIp = req.ip;

    if (!username || typeof score !== 'number' || score <= 0) {
        return res.status(400).json({ success: false, message: "Invalid submission data." });
    }

    try {
        // 1. Check/Log daily challenge play (if this score submission is for a daily challenge)
        if (is_daily_challenge && problem_seed) {
            const check = await pool.query(
                'SELECT COUNT(*) FROM ip_play_limits WHERE ip_address = $1 AND daily_seed = $2 AND is_daily_challenge = TRUE',
                [clientIp, problem_seed]
            );

            // Double check: if they already played, prevent score submission
            if (check.rows[0].count > 0 && clientIp !== OWNER_IP) {
                return res.status(429).json({
                    success: false,
                    message: "អ្នកបានបា៉ះ Daily Challenge រួចហើយ។ មិនអាចរក្សាទុកពិន្ទុបានទេ! (Error Code: DB_DUP_DAILY)"
                });
            }
            
            // Log the play now, since submission is successful
            await pool.query(
                'INSERT INTO ip_play_limits (ip_address, daily_seed, is_daily_challenge, last_play_time) VALUES ($1, $2, TRUE, NOW()) ON CONFLICT (ip_address, daily_seed) DO UPDATE SET last_play_time = NOW()',
                [clientIp, problem_seed]
            );
        }

        // 2. Insert into Leaderboard
        const result = await pool.query(
            'INSERT INTO leaderboard (username, score, difficulty, ip_address) VALUES ($1, $2, $3, $4) RETURNING *',
            [username, score, difficulty, clientIp]
        );

        res.json({ success: true, data: result.rows[0] });

    } catch (error) {
        console.error("Score submission error:", error.message);
        res.status(500).json({ success: false, message: "Error saving score." });
    }
});

/**
 * GET /api/leaderboard/top
 * Retrieves the top 10 scores.
 */
app.get('/api/leaderboard/top', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT username, score, difficulty FROM leaderboard ORDER BY score DESC, played_at ASC LIMIT 10'
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Leaderboard fetch error:", error.message);
        res.status(500).json({ success: false, message: "Error fetching leaderboard." });
    }
});


// --- SERVER START ---
async function startServer() {
    try {
        await initDatabase();
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error("CRITICAL: Failed to start server due to DB or setup error.", error);
        process.exit(1); // Exit with status 1 on critical failure
    }
}

startServer();
