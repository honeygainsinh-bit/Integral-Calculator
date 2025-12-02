Require('dotenv').config();
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
// 🔥🔥🔥 រចនាសម្ព័ន្ធថ្មី៖ កំណត់កម្រិតលំបាកក្នុង Object
// ការប្រើប្រាស់ឃ្លាកាត់ៗដើម្បីសន្សំ Tokens
// ==========================================

const difficultyBoosts = {
    // 1. IMO / Very Hard (Token Optimized)
    imo_very_hard: {
        keywords: ['imo gold', 'unsolvable', 'extremely hard'],
        log: '🔥🔥 IMO (Very Hard) Boost Applied',
        // ខ្លីបំផុត៖ ផ្តោតលើ IMO, Abstraction, Unsolvable, Complex LaTeX
        instruction: "\n\nCRITICAL BOOST: Generate standard IMO-level problem. Abstract/Non-standard insight required. Goal: Virtually unsolvable for G12. Maximize complexity and obscure path. Use complex LaTeX. MINIMIZE ALL UNNECESSARY TEXT.",
    },
    // 2. Hard (Token Optimized)
    hard: {
        keywords: ['imo shortlist', 'hard', 'very difficult'],
        log: '🔥 Hard Difficulty Boost Applied',
        // ខ្លីបំផុត៖ ផ្តោតលើ Multi-step, Obscure, Complex Calculation
        instruction: "\n\nCRITICAL BOOST: Generate standard HARD problem. Multi-step/Abstract thinking required. Complex calculation. Obscure solution path. Use challenging LaTeX. MINIMIZE ALL UNNECESSARY TEXT.",
    },
    // 3. Medium (Token Optimized)
    medium: {
        keywords: ['medium', 'intermediate'],
        log: '✨ Medium Difficulty (Token Optimized) Boost Applied',
        instruction: "\n\nCRITICAL BOOST: Ensure this problem is a standard moderately difficult problem, requiring careful application of standard formulas and tricky, multi-part calculations (2+ steps). The problem should require two or more clear steps to solve. **Keep the overall problem structure as concise as possible to save tokens.** Use slightly complex LaTeX.",
    },
    // 4. Easy (Maximum Token Optimized)
    easy: {
        keywords: ['easy', 'standard'],
        log: '💡 Easy Difficulty (Maximum Token Optimized) Boost Applied',
        instruction: "\n\nCRITICAL BOOST: Ensure this problem is the simplest standard Baccalaureate (G12) problem possible, requiring direct application of a single formula. The calculation must be extremely simple and straightforward. **STRICTLY MINIMIZE ALL TEXT LENGTH AND LATEX COMPLEXITY IN BOTH THE QUESTION AND OPTIONS TO SAVE TOKENS.** The problem text must be clear and concise.",
    }
};

// ==========================================
// 2. RATE LIMITER
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
// 3. STATIC FILES & ONLINE CHECK
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

        totalPlays++;
        uniqueVisitors.add(req.ip);

        // =========================================================
        // 🔥 LOGIC ថ្មី៖ ដំណើរការដោយស្វ័យប្រវត្តិពី Object ខាងលើ
        // =========================================================
        let finalPrompt = prompt;
        const lowerCasePrompt = prompt.toLowerCase();
        
        // វិលជុំ (Iterate) តាមកម្រិតលំបាកដែលបានកំណត់
        for (const level in difficultyBoosts) {
            const boost = difficultyBoosts[level];
            
            // ពិនិត្យមើលថាតើ Prompt មានពាក្យគន្លឹះសម្រាប់កម្រិតនេះឬអត់
            if (boost.keywords.some(keyword => lowerCasePrompt.includes(keyword))) {
                finalPrompt = prompt + boost.instruction;
                console.log(`${boost.log} for: ${req.ip}`);
                break; // បញ្ឈប់ការវិលជុំនៅពេលរកឃើញការផ្គូផ្គងដំបូង
            }
        }
        // =========================================================

        // AI Generation
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const result = await model.generateContent(finalPrompt); 
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
