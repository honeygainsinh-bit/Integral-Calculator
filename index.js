require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// សំខាន់សម្រាប់ Render ដើម្បីចាប់ IP អ្នកប្រើអោយត្រូវ
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

// 1. Setup Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 2. Setup Rate Limit (១ IP លេងបាន ១០ ដង ក្នុង ៨ ម៉ោង)
const limiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, // 8 ម៉ោង (គិតជា milliseconds)
    max: 10, // អតិបរមា 10 ដង
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "Rate limit exceeded",
        message: "⚠️ អ្នកបានប្រើប្រាស់អស់ចំនួនកំណត់ហើយ (10ដង ក្នុង 8ម៉ោង)។"
    },
    // Function ចាប់ IP អោយច្បាស់ពេលនៅលើ Server Render
    keyGenerator: (req, res) => {
        return req.ip; 
    }
});

// 3. API Route
app.post('/api/generate-problem', limiter, async (req, res) => {
    try {
        const { prompt } = req.body;

        if (!prompt) return res.status(400).json({ error: "Prompt is required" });

        // ប្រើឈ្មោះ Model តាមអ្នកស្នើសុំ
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        res.json({ text });

    } catch (error) {
        console.error("API Error:", error);
        // បើសិនជាឈ្មោះ model ខុស ឬ API មានបញ្ហា
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error.message 
        });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
