// index.js (Server Side)

import 'dotenv/config'; 
import express from 'express';
import cors from 'cors';
import path from 'path';
import { GoogleGenerativeAI } from '@google/genai';
import rateLimit from 'express-rate-limit';
import { Pool } from 'pg'; 
import { fileURLToPath } from 'url'; 

// ES Module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000; 

// ==========================================
// 1. SETUP & CONFIG
// ==========================================
// CRITICAL for getting correct req.ip on Render/Proxy servers
app.set('trust proxy', 1); 
app.use(cors());
app.use(express.json());

// Initialize AI and Model
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL_NAME = "gemini-2.5-flash"; 

// Tracking Variables
let totalPlays = 0;           
const uniqueVisitors = new Set();

// Helper function to calculate the start of the current day (00:00:00 UTC)
function getStartOfTodayUTC() {
    const today = new Date();
    // Set time to midnight UTC (00:00:00.000)
    today.setUTCHours(0, 0, 0, 0); 
    return today;
}

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
                ip_address VARCHAR(45), 
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await client.query(query);
        console.log("✅ Database initialized: 'leaderboard' table ready. (IP column included)");
        client.release();
    } catch (err) {
        console.error("❌ Database initialization error:", err.message);
        throw err;
    }
}

// ==========================================
// 3. RATE LIMITER (General)
// ==========================================
// 💡 កែតម្រូវ៖ បង្កើត Limiter សម្រាប់តែលំហាត់ធម្មតា (General Rate Limiter)
const generalLimiter = rateLimit({
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

// 💡 NEW: Middleware ដើម្បីអនុវត្ត Limiter លុះត្រាតែវាមិនមែនជា Daily Challenge
const conditionalLimiter = (req, res, next) => {
    // Check req.body.difficulty which is available after app.use(express.json())
    if (req.body && req.body.difficulty === 'Daily Challenge') {
        console.log(`✅ Daily Challenge detected: Skipping general 10/8h limit for IP ${req.ip}`);
        next(); 
    } else {
        // Apply the general 10/8h limit for all other problems
        generalLimiter(req, res, next);
    }
};

// ==========================================
// 4. STATIC FILES & ONLINE CHECK
// ==========================================
app.use(express.static(path.join(__dirname, 'public'))); 

app.get('/', (req, res) => {
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

// Generate Problem (Uses Conditional Limiter)
app.post('/api/generate-problem', conditionalLimiter, async (req, res) => {
    const clientIP = req.ip;
    try {
        const { prompt, difficulty } = req.body; 
        if (!prompt) return res.status(400).json({ error: "Prompt is required" });

        // 🛑 DAILY CHALLENGE GENERATION LIMIT (1 time / day / IP - GLOBAL RESET)
        if (difficulty === 'Daily Challenge') {
            const client = await pool.connect();
            try {
                const startOfTodayUTC = getStartOfTodayUTC(); 
                
                const checkQuery = `
                    SELECT created_at FROM leaderboard
                    WHERE ip_address = $1 
                    AND difficulty = 'Daily Challenge'
                    AND created_at >= $2;
                `;
                const checkResult = await client.query(checkQuery, [clientIP, startOfTodayUTC]);

                if (checkResult.rows.length > 0) {
                    // Block generation
                    console.log(`🛑 Daily Challenge Generation Blocked: IP ${clientIP} already played today (UTC).`);
                    return res.status(403).json({ 
                        error: "Daily Challenge Limit Exceeded", 
                        message: "🛑 លំហាត់ប្រចាំថ្ងៃនេះ អ្នកបានចុចលេងម្តងរួចហើយ សម្រាប់ថ្ងៃនេះ។ នឹង Reset នៅពាក់កណ្តាលអធ្រាត្រ UTC។"
                    });
                }
            } finally {
                client.release();
            }
        }
        // 🏁 END DAILY CHALLENGE CHECK 

        totalPlays++;
        uniqueVisitors.add(req.ip);
        
        const model = ai.getGenerativeModel({ model: MODEL_NAME });

        const result = await model.generateContent({
            contents: prompt,
            config: {
                systemInstruction: "You are a professional Cambodian high school math problem generator. You strictly follow all formatting rules including the [PROBLEM] and [ANSWER] tags, and use LaTeX for math formulas. Ensure the options ក, ខ, គ, ឃ are mathematically distinct and the final problem is solvable.",
                temperature: 0.7,
                maxOutputTokens: 2048
            }
        });
        
        const text = result.text;

        res.json({ text });

    } catch (error) {
        console.error("❌ Gemini API Error:", error.message);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
});


// Leaderboard Submission API (Kept the Global Reset check for integrity/fallback)
app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;
    const clientIP = req.ip; 

    // Server-side Validation
    if (!username || typeof score !== 'number' || score <= 0 || username.trim().length < 3) {
        return res.status(400).json({ success: false, message: "Invalid data: Username must be 3+ chars and score > 0." });
    }

    try {
        const client = await pool.connect();
        
        // 1. CHECK DAILY CHALLENGE LIMIT (AS FALLBACK - Global Reset)
        if (difficulty === 'Daily Challenge') {
            const startOfTodayUTC = getStartOfTodayUTC();
            
            const checkQuery = `
                SELECT created_at FROM leaderboard
                WHERE ip_address = $1 
                AND difficulty = 'Daily Challenge'
                AND created_at >= $2;
            `;
            const checkResult = await client.query(checkQuery, [clientIP, startOfTodayUTC]);

            if (checkResult.rows.length > 0) {
                client.release();
                console.log(`🛑 Daily Challenge Submission Blocked (Fallback - Global): IP ${clientIP} already submitted today (UTC).`);
                return res.status(403).json({ 
                    success: false, 
                    message: "អ្នកបានរក្សាទុកពិន្ទុសម្រាប់ Daily Challenge ម្តងរួចហើយ សម្រាប់ថ្ងៃនេះ។" 
                });
            }
        }

        // 2. INSERT SCORE (including IP address)
        const insertQuery = `
            INSERT INTO leaderboard(username, score, difficulty, ip_address)
            VALUES($1, $2, $3, $4);
        `;
        const values = [username.trim().substring(0, 25), score, difficulty, clientIP];
        await client.query(insertQuery, values);
        
        client.release();

        res.status(201).json({ success: true, message: "Score saved successfully." });

    } catch (err) {
        console.error("❌ Score submission error:", err.message);
        res.status(500).json({ success: false, message: "Failed to save score due to server error." });
    }
});


// Leaderboard Retrieval API (No change)
app.get('/api/leaderboard/top', async (req, res) => {
    try {
        const client = await pool.connect();
        const query = `
            SELECT username, score, difficulty
            FROM leaderboard;
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
        return process.exit(1); 
    }
    if (!process.env.GEMINI_API_KEY) {
        console.error("🛑 WARNING: GEMINI_API_KEY is missing. Problem generation will fail.");
    }
    
    try {
        await initializeDatabase();
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`⏰ Daily Challenge Reset Time: Midnight UTC (00:00:00)`);
        });
    } catch (error) {
        console.error("🛑 Server failed to start due to Database initialization error. Check DATABASE_URL and permissions.");
        process.exit(1);
    }
}

startServer();
