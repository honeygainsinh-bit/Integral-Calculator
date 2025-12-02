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

        // =========================================================
        // 🔥 LOGIC ថ្មី៖ ជំរុញ AI តាមកម្រិតស្តង់ដារ (Graduated Boosting)
        // =========================================================
        let finalPrompt = prompt;
        const lowerCasePrompt = prompt.toLowerCase();
        
        // 1. Level: IMO / Very Hard (Most Extreme Boost - មិនរាប់ tokens)
        if (lowerCasePrompt.includes('imo gold') || lowerCasePrompt.includes('unsolvable') || lowerCasePrompt.includes('extremely hard')) {
            const boostingInstruction = "\n\nCRITICAL BOOST: GENERATE A STANDARD IMO-LEVEL PROBLEM. Ensure this problem is abstract, requiring deep, non-standard mathematical insight and advanced concepts beyond typical curriculum. The problem MUST be intended to be virtually unsolvable for a high school student. Maximize mathematical complexity, abstraction, and the obscurity of the solution path. DO NOT simplify the mathematics. Use complex LaTeX formatting and avoid obvious solutions.";
            finalPrompt = prompt + boostingInstruction;
            console.log(`🔥🔥 IMO (Very Hard) Boost Applied for: ${req.ip}`);
        
        // 2. Level: Hard (Strong Boost - មិនរាប់ tokens)
        } else if (lowerCasePrompt.includes('imo shortlist') || lowerCasePrompt.includes('hard') || lowerCasePrompt.includes('very difficult')) {
            const boostingInstruction = "\n\nCRITICAL BOOST: Ensure this problem is a standard highly difficult problem, requiring multi-step problem-solving, abstract thinking, and concepts from the highest level of the standard curriculum. Make the calculation complex and the solution path obscured. Use challenging LaTeX formatting.";
            finalPrompt = prompt + boostingInstruction;
            console.log(`🔥 Hard Difficulty Boost Applied for: ${req.ip}`);

        // 3. Level: Medium (Moderate Boost - ផ្តោតលើការសន្សំ Tokens)
        } else if (lowerCasePrompt.includes('medium') || lowerCasePrompt.includes('intermediate')) {
            const boostingInstruction = "\n\nCRITICAL BOOST: Ensure this problem is a standard moderately difficult problem, requiring careful application of standard formulas and tricky, multi-part calculations (2+ steps). The problem should require two or more clear steps to solve. **Keep the overall problem structure as concise as possible to save tokens.** Use slightly complex LaTeX.";
            finalPrompt = prompt + boostingInstruction;
            console.log(`✨ Medium Difficulty (Token Optimized) Boost Applied for: ${req.ip}`);
        
        // 4. Level: Easy (Standard Baccalaureate G12 - ផ្តោតខ្លាំងបំផុតលើការសន្សំ Tokens)
        } else if (lowerCasePrompt.includes('easy') || lowerCasePrompt.includes('standard')) {
            const boostingInstruction = "\n\nCRITICAL BOOST: Ensure this problem is the simplest standard Baccalaureate (G12) problem possible, requiring direct application of a single formula. The calculation must be extremely simple and straightforward. **STRICTLY MINIMIZE ALL TEXT LENGTH AND LATEX COMPLEXITY IN BOTH THE QUESTION AND OPTIONS TO SAVE TOKENS.** The problem text must be clear and concise.";
            finalPrompt = prompt + boostingInstruction;
            console.log(`💡 Easy Difficulty (Maximum Token Optimized) Boost Applied for: ${req.ip}`);
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
