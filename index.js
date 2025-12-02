require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// ==========================================
// 1. SETUP & CONFIG
// ==========================================
app.set('trust proxy', 1); // សំខាន់សម្រាប់ Render
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
// 2. RATE LIMITER (មាន Rule ពិសេសសម្រាប់ Owner)
// ==========================================
const limiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, // 8 ម៉ោង
    max: 10, // អ្នកធម្មតាបាន 10 ដង
    message: { 
        error: "Rate limit exceeded", 
        message: "⚠️ អ្នកបានប្រើប្រាស់អស់ចំនួនកំណត់ហើយ (10ដង ក្នុង 8ម៉ោង)។ សូមសម្រាកសិន!" 
    },
    keyGenerator: (req) => req.ip,
    
    // 🔥 ពិសេស៖ រំលង (Skip) Rate Limit បើសិនជា IP នោះជា Owner
    skip: (req) => {
        const myIp = process.env.OWNER_IP; // យក IP ពី Render Environment
        if (req.ip === myIp) {
            console.log(`👑 Owner Access Detected: ${req.ip} (Unlimited)`);
            return true; // អនុញ្ញាតអោយកេងបានសេរី
        }
        return false;
    }
});

// ==========================================
// 3. STATIC FILES & ONLINE CHECK
// ==========================================

// បង្ហាញ Game ពី Folder public
app.use(express.static(path.join(__dirname, 'public'))); 

// 🔥 ដំណោះស្រាយ "Cannot GET /"
// បើសិនជាវារក index.html មិនឃើញ វានឹងបង្ហាញអក្សរនេះជំនួសវិញ
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
// 4. API ROUTES
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

        // Update Tracking
        totalPlays++;
        uniqueVisitors.add(req.ip);

        // AI Generation
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        res.json({ text });

    } catch (error) {
        console.error("❌ Error:", error.message);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
});

app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});
