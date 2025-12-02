require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// ==========================================
// 1. CONFIGURATION (កំណត់ប្រព័ន្ធ)
// ==========================================

// សំខាន់ណាស់សម្រាប់ Render ដើម្បីស្គាល់ IP ពិតរបស់អ្នកប្រើ
app.set('trust proxy', 1); 

app.use(cors());
app.use(express.json());

// កំណត់ AI Model (តាមដែលអ្នកស្នើសុំ)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL_NAME = "gemini-2.5-flash"; 

// ==========================================
// 2. TRACKING SYSTEM (ប្រព័ន្ធតាមដាន)
// ==========================================
// ទិន្នន័យនេះនឹង Reset ទៅ 0 វិញរាល់ពេល Server Restart (Free Tier Render តែងតែ Restart)
let totalPlays = 0;           // ចំនួនដងដែលគេចុចលេងសរុប
const uniqueVisitors = new Set(); // បញ្ជី IP ដែលធ្លាប់ចូល (រាប់មនុស្ស)
const startTime = new Date(); // ម៉ោងដែល Server ចាប់ផ្តើម

// Middleware: Log រាល់ការចូលមកកាន់ Server (បង្ហាញក្នុង Console)
app.use((req, res, next) => {
    const ip = req.ip;
    const time = new Date().toLocaleTimeString('km-KH');
    console.log(`[${time}] 📡 Request form IP: ${ip} | Path: ${req.path}`);
    next();
});

// ==========================================
// 3. RATE LIMITER (កំណត់ចំនួនលេង)
// ==========================================
// 10 ដង ក្នុងរយៈពេល 8 ម៉ោង
const limiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, // 8 ម៉ោង (គិតជា ms)
    max: 10, // អតិបរមា 10 ដង
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "Rate limit exceeded",
        message: "⚠️ អ្នកបានប្រើប្រាស់អស់ចំនួនកំណត់ហើយ (10ដង ក្នុង 8ម៉ោង)។ សូមសម្រាកសិន!"
    },
    // Function ចាប់ IP ឱ្យច្បាស់
    keyGenerator: (req, res) => {
        return req.ip; 
    },
    // Handler ពេលគេ Spam លើសកំណត់
    handler: (req, res, next, options) => {
        console.log(`⛔ Blocked IP: ${req.ip} (Too many requests)`);
        res.status(options.statusCode).send(options.message);
    }
});

// ==========================================
// 4. API ROUTES (ផ្លូវចូល)
// ==========================================

// A. សម្រាប់មើលស្ថិតិអ្នកលេង (Admin Check)
// ចូលតាម: https://your-url.onrender.com/stats
app.get('/stats', (req, res) => {
    res.json({
        server_status: "Online 🟢",
        model_used: MODEL_NAME,
        total_games_generated: totalPlays,  // ចំនួនល្បែងដែលបានបង្កើត
        total_unique_players: uniqueVisitors.size, // ចំនួនមនុស្សប្លែកគ្នា
        uptime_since: startTime.toLocaleString('km-KH'),
        message: "ទិន្នន័យនេះនឹងបាត់ទៅវិញពេល Server Restart (In-Memory)"
    });
});

// B. កន្លែងបង្កើតលំហាត់ (Main Game Logic)
app.post('/api/generate-problem', limiter, async (req, res) => {
    try {
        const { prompt } = req.body;
        const userIp = req.ip;

        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        // --- TRACKING LOGIC ---
        totalPlays++;
        uniqueVisitors.add(userIp);
        console.log(`✅ Generating Problem... (Total: ${totalPlays} | User: ${userIp})`);

        // --- AI GENERATION ---
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        res.json({ text });

    } catch (error) {
        console.error("❌ Error Generating Content:", error.message);
        
        // ករណី Model ឈ្មោះខុស ឬមិនទាន់មាន
        if (error.message.includes("Not Found") || error.message.includes("404")) {
            res.status(500).json({ error: "Model 'gemini-2.5-flash' not found. Please check API availability." });
        } else {
            res.status(500).json({ error: "Internal Server Error", details: error.message });
        }
    }
});

// Start Server
app.listen(port, () => {
    console.log(`🚀 Server is running on port ${port}`);
    console.log(`🔥 Rate Limit: 10 requests / 8 hours`);
    console.log(`🤖 Model: ${MODEL_NAME}`);
});
