// =========================================================================
// ឯកសារកម្ម: MATH QUIZ PRO BACKEND SERVER (FINAL VERSION)
// គោលបំណង: គ្រប់គ្រង API, Database, និង Image Generation ខាងក្រៅ (Imgix)
// =========================================================================

// --- 1. REQUIRE DEPENDENCIES (LIBRARY) ---
Require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg'); 
const axios = require('axios'); // ✅ Library សម្រាប់ Call API ខាងក្រៅ (Imgix)

// --- 2. INITIALIZATION & CONFIGURATION ---
const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

const MODEL_NAME = "gemini-2.5-flash"; 

// វ៉ារ្យ៉ាបសម្រាប់ការតាមដានស្ថិតិ
let totalPlays = 0;           
const uniqueVisitors = new Set();

// Middleware: Log Request នីមួយៗ
app.use((req, res, next) => {
    const timestamp = new Date().toLocaleTimeString('km-KH');
    console.log(`[${timestamp}] 📡 REQUEST: ${req.method} ${req.path}`);
    next();
});

// =========================================================================
// 3. DATABASE CONFIGURATION & INITIALIZATION (PostgreSQL)
// =========================================================================

// បង្កើត Pool Connection ទៅកាន់ PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

/**
 * @description: មុខងារចាប់ផ្តើម Database និងធានាថា Tables សំខាន់ៗមានវត្តមាន។
 */
async function initializeDatabase() {
    console.log("... ⚙️ កំពុងចាប់ផ្តើម Database ...");
    try {
        const client = await pool.connect();
        
        // បង្កើត Table Leaderboard (សម្រាប់ដាក់ពិន្ទុអ្នកលេង)
        await client.query(`
            CREATE TABLE IF NOT EXISTS leaderboard (
                id SERIAL PRIMARY KEY,
                username VARCHAR(25) NOT NULL,
                score INTEGER NOT NULL,
                difficulty VARCHAR(15) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // បង្កើត Table Certificate Requests (សម្រាប់រក្សាសំណើ Certificate)
        await client.query(`
            CREATE TABLE IF NOT EXISTS certificate_requests (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                score INTEGER NOT NULL,
                status VARCHAR(20) DEFAULT 'Pending',
                request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("✅ Database initialized: Tables ready.");
        client.release();
    } catch (err) {
        console.error("❌ Database initialization error:", err.message);
    }
}

// =========================================================================
// 4. RATE LIMITER & STATIC ROUTES
// =========================================================================

// កំណត់ Rate Limit (កំណត់ត្រឹម 10 សំណើ/8 ម៉ោង)
const limiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, 
    max: 10, 
    message: { error: "Rate limit exceeded", message: "⚠️ អស់ចំនួនកំណត់ហើយ (10ដង/ថ្ងៃ)!" },
    keyGenerator: (req) => req.ip,
    skip: (req) => req.ip === process.env.OWNER_IP
});

// បើក File Public (Static)
app.use(express.static(path.join(__dirname, 'public'))); 

// Home Route (ពិនិត្យមើល Server Status)
app.get('/', (req, res) => {
    res.status(200).send(`
        <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
            <h1 style="color: #22c55e;">Server is Online 🟢</h1>
            <p>Math Quiz Pro Backend</p>
            <div style="margin-top: 20px; padding: 10px; background: #f0f9ff; display: inline-block; border-radius: 8px;">
                <a href="/admin/requests" style="text-decoration: none; color: #0284c7; font-weight: bold;">👮‍♂️ ចូលមើលសំណើសុំ (Admin)</a>
            </div>
        </div>
    `);
});

// =========================================================================
// 5. CORE API ROUTES (AI, Stats, Leaderboard)
// =========================================================================

// Stats Route
app.get('/stats', (req, res) => {
    res.json({ total_plays: totalPlays, unique_players: uniqueVisitors.size });
});

// Gemini AI Route (Generate Math Problem)
app.post('/api/generate-problem', limiter, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "Prompt required" });

        totalPlays++;
        uniqueVisitors.add(req.ip);

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent(prompt);
        res.json({ text: result.response.text() });

    } catch (error) {
        console.error("Gemini Error:", error.message);
        res.status(500).json({ error: "AI Generation Failed" });
    }
});

// Submit Score to Leaderboard
app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;
    if (!username || typeof score !== 'number' || score <= 0 || username.trim().length < 3) {
        return res.status(400).json({ success: false, message: "Invalid data." });
    }
    try {
        const client = await pool.connect();
        await client.query('INSERT INTO leaderboard(username, score, difficulty) VALUES($1, $2, $3)', 
            [username.trim().substring(0, 25), score, difficulty]);
        client.release();
        res.status(201).json({ success: true, message: "Score saved." });
    } catch (err) {
        res.status(500).json({ success: false, message: "DB Error" });
    }
});

// Get Top Leaderboard Scores
app.get('/api/leaderboard/top', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT username, score, difficulty FROM leaderboard ORDER BY score DESC LIMIT 1000');
        client.release();
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false, message: "DB Error" });
    }
});

// =========================================================================
// 6. CERTIFICATE REQUESTS & ADMIN VIEW
// =========================================================================

// API ទទួលសំណើ Certificate
app.post('/api/submit-request', async (req, res) => {
    const { username, score } = req.body;
    
    if (!username || score === undefined || score === null) {
        return res.status(400).json({ success: false, message: "Missing username or score" });
    }

    try {
        const client = await pool.connect();
        await client.query('INSERT INTO certificate_requests (username, score, request_date) VALUES ($1, $2, NOW())', [username, score]);
        client.release();
        console.log(`📩 Certificate Request: ${username} (Score: ${score})`);
        res.json({ success: true });
    } catch (err) {
        console.error("Submit Request Error:", err.message);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// Admin Panel HTML View (បង្ហាញប៊ូតុងបង្កើត Certificate)
app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
        client.release();

        let html = `
        <!DOCTYPE html>
        <html lang="km">
        <head>
            <title>Admin - សំណើសុំ</title>
            <style>
                body { font-family: sans-serif; padding: 20px; background: #f1f5f9; }
                h1 { color: #1e3a8a; }
                table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; }
                th, td { padding: 15px; border-bottom: 1px solid #e2e8f0; text-align: left; }
                th { background: #3b82f6; color: white; }
                tr:hover { background: #f8fafc; }
                .btn-gen { 
                    background: #2563eb; color: white; text-decoration: none; 
                    padding: 8px 12px; border-radius: 6px; font-weight: bold; font-size: 0.9rem;
                    display: inline-flex; align-items: center; gap: 5px;
                }
            </style>
        </head>
        <body>
            <h1>👮‍♂️ Admin Panel - បញ្ជីឈ្មោះអ្នកស្នើសុំ</h1>
            <table>
                <thead>
                    <tr>
                        <th>#ID</th>
                        <th>ឈ្មោះ (Username)</th>
                        <th>ពិន្ទុ (Score)</th>
                        <th>កាលបរិច្ឆេទ</th>
                        <th>សកម្មភាព</th> </tr>
                </thead>
                <tbody>`;

        if (result.rows.length === 0) {
            html += `<tr><td colspan="5" style="text-align:center; padding: 20px; color: gray;">មិនទាន់មានសំណើថ្មីៗទេ។</td></tr>`;
        } else {
            result.rows.forEach(row => {
                const isHighScore = row.score >= 500;
                html += `
                    <tr>
                        <td>${row.id}</td>
                        <td style="font-weight:bold; color: #334155;">${row.username}</td>
                        <td style="color:${isHighScore ? '#16a34a' : '#dc2626'}; font-weight:bold;">${row.score}</td>
                        <td>${new Date(row.request_date).toLocaleDateString('km-KH')}</td>
                        <td>
                            <a href="/admin/generate-cert/${row.id}" target="_blank" class="btn-gen">🌐 មើល Design</a> </td>
                    </tr>`;
            });
        }
        html += `</tbody></table></body></html>`;
        res.send(html);
    } catch (err) {
        res.status(500).send("Error loading admin panel.");
    }
});


// =========================================================================
// 7. EXTERNAL IMAGE GENERATION LOGIC (IMGIX VIA AXIOS)
// =========================================================================

/**
 * @description: មុខងារបង្កើត Certificate ដោយ Call API ទៅកាន់ Imgix (ដើម្បីជៀសវាង Canvas Error)
 * @param {string} id - Certificate Request ID
 */
app.get('/admin/generate-cert/:id', async (req, res) => {
    console.log("... 🎨 កំពុង Call Imgix API ខាងក្រៅ ...");
    try {
        const id = req.params.id;
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Not Found");
        const { username, score, request_date } = result.rows[0];

        // 1. គណនាកាលបរិច្ឆេទ និងរៀបចំសារ (Final Formal Content)
        const dateObj = new Date();
        const formattedDate = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        
        // ឈ្មោះ និងពិន្ទុដែលត្រូវបាន Encode សម្រាប់ URL
        const encodedUsername = encodeURIComponent(username.toUpperCase());
        const scoreText = encodeURIComponent(`Score: ${score}`);
        const dateText = encodeURIComponent(`Date Issued: ${formattedDate}`);
        
        // សារលើកតម្កើងសមត្ថភាពខ្ពស់ និង website
        const encouragementText = encodeURIComponent(`This distinguished certificate serves as an enduring testament to your exceptional intellectual acuity and unwavering dedication. May your scholarly pursuits reach new pinnacles. Presented by: braintest.fun`); 

        // 2. កំណត់ Base URL ពី Environment Variable
        const EXTERNAL_API_ENDPOINT = process.env.EXTERNAL_IMAGE_API;
        if (!EXTERNAL_API_ENDPOINT) {
             return res.status(500).send("Error: EXTERNAL_IMAGE_API environment variable is not set.");
        }
        
        // 3. កសាង Full Dynamic Imgix URL (បញ្ចូលគ្រប់ Transformation Parameters)
        
        const finalImgixUrl = EXTERNAL_API_ENDPOINT + 
            // Transformation 1: Username (Large, Gold, Center)
            `&txt-align=center` +
            `&txt-size=100` +
            `&txt-color=FFD700` +
            `&txt=${encodedUsername}` +
            `&txt-fit=max` +
            `&w=2000` +
            `&h=1414` +
            
            // Transformation 2: Score (Smaller, Red)
            `&mark-align=center` +
            `&mark-size=50` +
            `&mark-color=FF4500` +
            `&mark-x=0` +
            `&mark-y=850` +
            `&mark-txt=${scoreText}` +
            
            // Transformation 3: Date (Medium size, positioned above the long message)
            `&mark-align=center` +
            `&mark-size=35` +
            `&mark-color=CCCCCC` + 
            `&mark-x=0` +
            `&mark-y=1150` + 
            `&mark-txt=${dateText}` +
            
            // Transformation 4: Encouragement/Source (Longest Message at the very bottom)
            `&mark-align=center` +
            `mark-size=30` +
            `&mark-color=FFFFFF` + 
            `&mark-x=0` +
            `&mark-y=1300` + 
            `&mark-txt=${encouragementText}`;

        // 4. Redirect ទៅកាន់ Imgix URL (Image Delivery)
        console.log(`✅ Image generated. Redirecting to Imgix URL.`);
        res.redirect(finalImgixUrl); 

    } catch (err) {
        console.error("❌ External Generation API Error:", err.message);
        res.status(500).send(`
            <h1>❌ Server Error: Cannot Generate Image</h1>
            <p>សូមផ្ទៀងផ្ទាត់ EXTERNAL_IMAGE_API របស់អ្នក (URL, Key, Parameters)។</p>
        `);
    }
});

// =========================================================================
// 8. START SERVER FUNCTION
// =========================================================================

/**
 * @description: មុខងារចាប់ផ្តើម Server (Non-blocking)
 */
async function startServer() {
    if (!process.env.DATABASE_URL) {
        console.error("🛑 CRITICAL: DATABASE_URL is missing. Cannot start.");
        return;
    }
    // ចាប់ផ្តើម DB មុនពេល Listen
    await initializeDatabase();
    app.listen(port, () => {
        console.log(`🚀 Server running successfully on port ${port}`);
        console.log(`🔗 Admin Panel URL: http://localhost:${port}/admin/requests`);
    });
}

startServer();
