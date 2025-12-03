// index.js (Server Side)

import 'dotenv/config'; // Used for local testing environment (Render uses its own env)
import express from 'express';
import cors from 'cors';
import path from 'path';
import { GoogleGenAI } from '@google/genai'; // 💡 CHANGED: Use the correct, stable package name
import rateLimit from 'express-rate-limit';
import { Pool } from 'pg'; // PostgreSQL Client
import { fileURLToPath } from 'url'; // Required for __dirname equivalent in ES Modules

// ES Module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000; // Changed default port to 5000 for standard web service convention

// ==========================================
// 1. SETUP & CONFIG
// ==========================================
app.set('trust proxy', 1); // Trust first proxy (essential for getting correct req.ip on Render)
app.use(cors());
app.use(express.json());

// 💡 NEW: Initialize the GoogleGenAI instance with the correct API key from environment
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await client.query(query);
        console.log("✅ Database initialized: 'leaderboard' table ready.");
        client.release();
    } catch (err) {
        console.error("❌ Database initialization error:", err.message);
        throw err;
    }
}

// ==========================================
// 3. RATE LIMITER
// ==========================================
// Limit each IP to 10 requests per 8 hours
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
// Serving static files (index.html, CSS, JS) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public'))); 

// Health Check / Root route
app.get('/', (req, res) => {
    // If the request doesn't map to a static file (like index.html), show the status message
    if (!req.path.endsWith('.html') && req.path !== '/') {
        return res.status(404).send("Not Found");
    }
    
    // Fallback/Status check (This will rarely run if index.html exists in 'public')
    res.status(200).send(`
        <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
            <h1 style="color: #22c55e;">Server is Online 🟢</h1>
            <p>Backend API is running smoothly on port ${PORT}.</p>
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

// Generate Problem
app.post('/api/generate-problem', limiter, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "Prompt is required" });

        totalPlays++;
        uniqueVisitors.add(req.ip);

        // 💡 Use the initialized 'ai' instance
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: {
                systemInstruction: "You are a professional Cambodian high school math problem generator. You strictly follow all formatting rules including the [PROBLEM] and [ANSWER] tags, and use LaTeX for math formulas. Ensure the options ក, ខ, គ, ឃ are mathematically distinct and the final problem is solvable.",
                temperature: 0.7,
                maxOutputTokens: 2048
            }
        });
        
        const text = response.text;

        res.json({ text });

    } catch (error) {
        console.error("❌ Gemini API Error:", error.message);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
});


// Leaderboard Submission API
app.post('/api/leaderboard/submit', async (req, res) => {
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
    // Check for necessary keys
    if (!process.env.DATABASE_URL) {
        console.error("🛑 CRITICAL: DATABASE_URL is missing. Check Render settings.");
        // Exit process immediately if DB is not configured
        return process.exit(1); 
    }
    if (!process.env.GEMINI_API_KEY) {
        console.error("🛑 WARNING: GEMINI_API_KEY is missing. Problem generation will fail.");
    }
    
    try {
        await initializeDatabase();
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error("🛑 Server failed to start due to Database initialization error. Check DATABASE_URL and permissions.");
        process.exit(1);
    }
}

startServer();
