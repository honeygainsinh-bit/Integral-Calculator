// Dependencies 
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// ==========================================
// 1. SETUP & TRACKING
// ==========================================
app.set('trust proxy', 1); 
app.use(cors());
app.use(express.json());

let totalPlays = 0;           
const uniqueVisitors = new Set();
const MODEL_NAME = "gemini-2.5-flash"; 

// Middleware: Log រាល់ការចូល
app.use((req, res, next) => {
    const ip = req.ip;
    const time = new Date().toLocaleTimeString('km-KH');
    console.log(`[${time}] 📡 Request form IP: ${ip} | Path: ${req.path}`);
    next();
});

// ==========================================
// 2. STATIC FILE FIX (ដំណោះស្រាយ Cannot GET /)
// ==========================================
app.use(express.static(path.join(__dirname, 'public'))); 


// ==========================================
// 3. RATE LIMITER (10 ដង / 8 ម៉ោង)
// ==========================================
const limiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, max: 10,
    message: { error: "Rate limit exceeded", message: "⚠️ អ្នកបានប្រើប្រាស់អស់ចំនួនកំណត់ហើយ (10ដង ក្នុង 8ម៉ោង)។ សូមសម្រាកសិន!" },
    keyGenerator: (req, res) => { return req.ip; }
});

// ==========================================
// 4. API ROUTES
// ==========================================

// A. /stats (Admin Check)
app.get('/stats', (req, res) => {
    res.json({
        server_status: "Online 🟢", model_used: MODEL_NAME,
        total_games_generated: totalPlays, total_unique_players: uniqueVisitors.size
    });
});

// B. /api/generate-problem (Main Logic)
app.post('/api/generate-problem', limiter, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "Prompt is required" });

        // --- TRACKING UPDATE ---
        totalPlays++; uniqueVisitors.add(req.ip);
        console.log(`✅ Generating Problem... (Total: ${totalPlays} | User: ${req.ip})`);

        // --- AI GENERATION ---
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        res.json({ text });

    } catch (error) {
        console.error("❌ Error Generating Content:", error.message);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
});

app.listen(port, () => {
    console.log(`🚀 Server is running on port ${port}`);
});
