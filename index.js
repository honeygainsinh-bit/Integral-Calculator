require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
// 🔥 ថ្មី៖ ប្រើ OpenAI Library ជំនួស GoogleGenerativeAI
const OpenAI = require('openai'); 
const rateLimit = require('express-rate-limit');

// ==========================================
// 1. SETUP & CONFIG
// ==========================================

// 🔥 ថ្មី៖ ពិនិត្យមើលសោ API របស់ OpenAI
if (!process.env.OPENAI_API_KEY) { 
    console.error("❌ FATAL: OPENAI_API_KEY មិនត្រូវបានកំណត់នៅក្នុង .env ទេ។");
    process.exit(1); 
}

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1); 
app.use(cors());
app.use(express.json());

// 🔥 ថ្មី៖ កំណត់ Model របស់ OpenAI
const MODEL_NAME = "gpt-3.5-turbo"; 
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "default_secret"; 

// 🔥 ថ្មី៖ បង្កើត Client របស់ OpenAI (ប្រសើរជាងបង្កើតវាខាងក្នុង route ម្តងៗ)
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Tracking Variables
let totalPlays = 0;           
const uniqueVisitors = new Set();
// ... (Middleware Log Request គឺនៅដដែល) ...

// [លុបកូដ Middleware: Log Request ព្រោះវាដដែល]

// ==========================================
// 2. RATE LIMITER (នៅដដែល)
// ==========================================
// ... (កូដ Rate Limiter គឺនៅដដែល) ...
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

// [លុបកូដ STATIC FILES & ONLINE CHECK ព្រោះវាដដែល]

// ==========================================
// 4. API ROUTES
// ==========================================

// Middleware: 🔒 ការពារ API (សម្រាប់តែ /stats)
const protectStats = (req, res, next) => {
    const key = req.headers['x-admin-key'];
    if (key && key === ADMIN_API_KEY) {
        return next();
    }
    res.status(401).json({ error: "Access Denied", message: "🔒 សូមផ្តល់ X-Admin-Key ដែលត្រឹមត្រូវ។" });
};

// Check Stats (នៅដដែល)
app.get('/stats', protectStats, (req, res) => {
    res.json({
        status: "Online",
        total_plays: totalPlays,
        unique_players: uniqueVisitors.size,
        owner_ip_configured: process.env.OWNER_IP ? "Yes" : "No",
        admin_key_configured: process.env.ADMIN_API_KEY ? "Yes" : "No"
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

        // 🔥 ថ្មី៖ ការហៅទៅកាន់ OpenAI Chat Completions API
        const completion = await openai.chat.completions.create({
            model: MODEL_NAME,
            // 💡 ប្រើ System Role ដើម្បីកំណត់រចនាសម្ព័ន្ធ output
            messages: [
                { 
                    role: "system", 
                    content: `You are an expert problem generator. Always respond strictly in the requested JSON format: 
                    {"question": "The question text", "answer": "The correct answer", "difficulty": "Easy, Medium, or Hard"}` 
                },
                { role: "user", content: prompt },
            ],
            // 🔥 ថ្មី៖ បើក JSON Mode សម្រាប់ GPT-3.5 Turbo
            response_format: { type: "json_object" }, 
        });

        const responseText = completion.choices[0].message.content;
        
        // ដោយសារយើងប្រើ JSON mode វានឹងដំណើរការជានិច្ច 
        const responseJson = JSON.parse(responseText); 

        res.json(responseJson); 

    } catch (error) {
        console.error("❌ Error:", error.message);
        console.error("   Failed Prompt:", req.body.prompt); 
        res.status(500).json({ 
            error: "Internal Server Error", 
            message: "មានបញ្ហាក្នុងការបង្កើតមាតិកា AI។",
            details: error.message 
        });
    }
});

app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});
