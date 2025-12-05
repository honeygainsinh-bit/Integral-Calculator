/**
 * =========================================================================================
 * PROJECT: MATH QUIZ PRO BACKEND API
 * VERSION: 3.0.0 (Enterprise Stable)
 * AUTHOR: You & Gemini
 * DESCRIPTION: 
 * - Backend សម្រាប់ល្បែងគណិតវិទ្យា
 * - ភ្ជាប់ជាមួយ PostgreSQL Database
 * - ប្រើប្រាស់ Google Gemini AI សម្រាប់បង្កើតលំហាត់
 * - បង្កើត Certificate តាមរយៈ Imgix URL Transformation (No Crash)
 * - Admin Panel សម្រាប់គ្រប់គ្រងសំណើ
 * =========================================================================================
 */

// --- 1. LOAD DEPENDENCIES (នាំចូល Library ចាំបាច់) ---
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

// --- 2. SERVER CONFIGURATION (កំណត់រចនាសម្ព័ន្ធ) ---
const app = express();
const port = process.env.PORT || 3000;
const MODEL_NAME = "gemini-2.5-flash"; // AI Model

// សម្រាប់ការតាមដានស្ថិតិ (In-memory stats)
let totalPlays = 0;
const uniqueVisitors = new Set();

// Middleware Setup
app.set('trust proxy', 1); // ចាំបាច់សម្រាប់ Render/Heroku
app.use(cors()); // អនុញ្ញាតអោយ Web ផ្សេងៗហៅ API បាន
app.use(express.json()); // អាចអាន JSON Body បាន

// Logger Middleware (កត់ត្រារាល់ការហៅចូល)
app.use((req, res, next) => {
    const timestamp = new Date().toLocaleTimeString('km-KH');
    console.log(`[${timestamp}] 📡 REQUEST: ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});

// --- 3. DATABASE CONNECTION (ការភ្ជាប់ទិន្នន័យ) ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // សម្រាប់ Cloud Database
});

/**
 * មុខងារ: initializeDatabase
 * តួនាទី: បង្កើត Table ដោយស្វ័យប្រវត្តិប្រសិនបើវាមិនទាន់មាន
 */
async function initializeDatabase() {
    console.log("... ⚙️ កំពុងពិនិត្យ Database Tables ...");
    try {
        const client = await pool.connect();

        // 1. បង្កើត Table Leaderboard (សម្រាប់ពិន្ទុទូទៅ)
        await client.query(`
            CREATE TABLE IF NOT EXISTS leaderboard (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                score INTEGER NOT NULL,
                difficulty VARCHAR(20) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. បង្កើត Table Certificate Requests (សម្រាប់សំណើលិខិតសរសើរ)
        await client.query(`
            CREATE TABLE IF NOT EXISTS certificate_requests (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) NOT NULL,
                score INTEGER NOT NULL,
                status VARCHAR(20) DEFAULT 'Pending',
                request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("✅ Database System: Online & Ready.");
        client.release();
    } catch (err) {
        console.error("❌ Database Initialization Failed:", err.message);
    }
}

// --- 4. SECURITY: RATE LIMITER (កំណត់ចំនួនប្រើប្រាស់) ---
const aiLimiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, // 8 ម៉ោង
    max: 10, // អនុញ្ញាត ១០ ដង
    message: { 
        error: "Rate limit exceeded", 
        message: "⚠️ សូមអភ័យទោស! អ្នកបានប្រើប្រាស់សិទ្ធិបង្កើតលំហាត់អស់ហើយសម្រាប់ថ្ងៃនេះ។" 
    },
    keyGenerator: (req) => req.ip, // កំណត់តាម IP
    skip: (req) => req.ip === process.env.OWNER_IP // លើកលែងអោយម្ចាស់ Server
});

// Static Files (រូបភាព/HTML ក្នុង Folder public)
app.use(express.static(path.join(__dirname, 'public')));

// --- 5. ROUTES: GENERAL (ផ្លូវទូទៅ) ---

// Home Route
app.get('/', (req, res) => {
    res.status(200).send(`
        <div style="font-family: 'Hanuman', sans-serif; text-align: center; padding-top: 50px; background-color: #f8fafc; height: 100vh;">
            <h1 style="color: #16a34a; font-size: 3rem;">Math Quiz API 🟢</h1>
            <p style="font-size: 1.2rem; color: #64748b;">ប្រព័ន្ធគ្រប់គ្រងទិន្នន័យ និងបង្កើតវិញ្ញាបនបត្រស្វ័យប្រវត្តិ</p>
            <div style="margin-top: 30px;">
                <a href="/admin/requests" style="background: #0284c7; color: white; padding: 15px 30px; text-decoration: none; border-radius: 50px; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    👮‍♂️ ចូលទៅកាន់ Admin Panel
                </a>
            </div>
            <p style="margin-top: 50px; font-size: 0.9rem; color: #94a3b8;">Server Status: Stable v3.0</p>
        </div>
    `);
});

// Stats Route
app.get('/stats', (req, res) => {
    res.json({ 
        status: "active",
        total_plays: totalPlays, 
        unique_visitors: uniqueVisitors.size,
        uptime: process.uptime()
    });
});

// --- 6. ROUTES: API FUNCTIONALITY (មុខងារស្នូល) ---

// A. បង្កើតលំហាត់ដោយប្រើ AI (Gemini)
app.post('/api/generate-problem', aiLimiter, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "ត្រូវការ Prompt ជាចាំបាច់" });

        // Update Stats
        totalPlays++;
        uniqueVisitors.add(req.ip);

        // Call Gemini API
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent(prompt);
        
        console.log(`🤖 AI Generated Problem for IP: ${req.ip}`);
        res.json({ text: result.response.text() });

    } catch (error) {
        console.error("❌ Gemini API Error:", error.message);
        res.status(500).json({ error: "បរាជ័យក្នុងការបង្កើតលំហាត់។ សូមព្យាយាមម្តងទៀត។" });
    }
});

// B. ដាក់ពិន្ទុចូល Leaderboard
app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;
    
    // Validation
    if (!username || typeof score !== 'number' || !difficulty) {
        return res.status(400).json({ success: false, message: "ទិន្នន័យមិនត្រឹមត្រូវ" });
    }

    try {
        const client = await pool.connect();
        await client.query(
            'INSERT INTO leaderboard(username, score, difficulty) VALUES($1, $2, $3)', 
            [username.substring(0, 50), score, difficulty]
        );
        client.release();
        res.status(201).json({ success: true, message: "ពិន្ទុត្រូវបានរក្សាទុក" });
    } catch (err) {
        console.error("DB Error:", err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// C. ទាញយកពិន្ទុពី Leaderboard
app.get('/api/leaderboard/top', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT username, score, difficulty FROM leaderboard ORDER BY score DESC LIMIT 100');
        client.release();
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false, message: "មិនអាចទាញយកទិន្នន័យបាន" });
    }
});

// D. ស្នើសុំ Certificate (Submit Request)
app.post('/api/submit-request', async (req, res) => {
    const { username, score } = req.body;
    
    if (!username || score === undefined) {
        return res.status(400).json({ success: false, message: "ខ្វះឈ្មោះ ឬ ពិន្ទុ" });
    }

    try {
        const client = await pool.connect();
        await client.query(
            'INSERT INTO certificate_requests (username, score, request_date) VALUES ($1, $2, NOW())', 
            [username, score]
        );
        client.release();
        console.log(`📩 New Certificate Request: ${username} - ${score}`);
        res.json({ success: true, message: "សំណើត្រូវបានផ្ញើទៅ Admin" });
    } catch (err) {
        console.error("Submit Request Error:", err.message);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// --- 7. ROUTES: ADMIN PANEL (ផ្ទាំងគ្រប់គ្រង) ---

app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
        client.release();

        // HTML Design ដ៏ស្រស់ស្អាត (Embedded CSS)
        let html = `
        <!DOCTYPE html>
        <html lang="km">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Admin Dashboard - Certificate Center</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Hanuman:wght@400;700&family=Poppins:wght@400;600&display=swap');
                body { font-family: 'Poppins', 'Hanuman', sans-serif; background: #f3f4f6; padding: 20px; margin: 0; }
                .container { max-width: 1000px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); overflow: hidden; }
                .header { background: #1e293b; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
                .header h1 { margin: 0; font-size: 1.5rem; }
                .stats { font-size: 0.9rem; color: #94a3b8; }
                table { width: 100%; border-collapse: collapse; }
                th { background: #3b82f6; color: white; padding: 15px; text-align: left; font-weight: 600; text-transform: uppercase; font-size: 0.85rem; }
                td { padding: 15px; border-bottom: 1px solid #e2e8f0; color: #334155; }
                tr:hover { background: #f8fafc; }
                .score-high { color: #16a34a; font-weight: bold; }
                .score-low { color: #dc2626; font-weight: bold; }
                .btn-action { 
                    background: linear-gradient(135deg, #3b82f6, #2563eb); 
                    color: white; text-decoration: none; padding: 8px 16px; 
                    border-radius: 6px; font-weight: bold; font-size: 0.85rem; 
                    display: inline-flex; align-items: center; gap: 5px; 
                    box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);
                    transition: transform 0.2s;
                }
                .btn-action:hover { transform: translateY(-2px); box-shadow: 0 6px 8px rgba(59, 130, 246, 0.4); }
                .empty-state { text-align: center; padding: 40px; color: #64748b; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>👮‍♂️ Admin Dashboard</h1>
                    <span class="stats">Total Requests: ${result.rows.length}</span>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Username</th>
                            <th>Score</th>
                            <th>Date</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>`;

        if (result.rows.length === 0) {
            html += `<tr><td colspan="5" class="empty-state">🚫 មិនទាន់មានសំណើសុំនៅឡើយទេ។</td></tr>`;
        } else {
            result.rows.forEach(row => {
                const scoreClass = row.score >= 500 ? 'score-high' : 'score-low';
                html += `
                    <tr>
                        <td>#${row.id}</td>
                        <td style="font-weight: 600;">${row.username}</td>
                        <td class="${scoreClass}">${row.score}</td>
                        <td>${new Date(row.request_date).toLocaleDateString('en-GB')}</td>
                        <td>
                            <a href="/admin/generate-cert/${row.id}" target="_blank" class="btn-action">
                                🎨 Generate Design
                            </a>
                        </td>
                    </tr>`;
            });
        }
        html += `</tbody></table></div></body></html>`;
        res.send(html);
    } catch (err) {
        console.error("Admin Panel Error:", err);
        res.status(500).send("<h1>500 Server Error</h1><p>Cannot load admin panel.</p>");
    }
});

// --- 8. CERTIFICATE GENERATION LOGIC (IMGIX ENGINE) ---

/**
 * Route: /admin/generate-cert/:id
 * Description: បង្កើត URL រូបភាពដោយប្រើ Imgix សម្រាប់លិខិតសរសើរ
 * Technology: URL Parameter Encoding (No Canvas required)
 */
app.get('/admin/generate-cert/:id', async (req, res) => {
    console.log(`... 🎨 Starting Certificate Generation for Request ID: ${req.params.id}`);
    
    try {
        const id = req.params.id;
        
        // 1. ទាញយកទិន្នន័យពី Database
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [id]);
        client.release();

        if (result.rows.length === 0) {
            return res.status(404).send("Error: Request ID not found.");
        }

        const { username, score } = result.rows[0];

        // 2. រៀបចំទិន្នន័យសម្រាប់បង្ហាញ (Formatting Data)
        const dateObj = new Date();
        const formattedDate = dateObj.toLocaleDateString('en-US', { 
            day: 'numeric', month: 'long', year: 'numeric' 
        });

        // សារជូនពរភាសាអង់គ្លេស (Professional Text)
        const formalMessage = `With immense pride and recognition of your intellectual brilliance, we bestow this award upon you. Your outstanding performance demonstrates a profound mastery of mathematics and a relentless spirit of excellence. May this achievement serve as a stepping stone to a future filled with boundless success and wisdom. Presented by: braintest.fun`;

        // 3. ពិនិត្យមើល Environment Variable
        // សំខាន់៖ អ្នកត្រូវដាក់ URL ទាំងមូលអោយត្រូវក្នុង EXTERNAL_IMAGE_API
        const BASE_IMGIX_URL = process.env.EXTERNAL_IMAGE_API;
        if (!BASE_IMGIX_URL) {
             console.error("❌ MISSING CONFIG: EXTERNAL_IMAGE_API is not set.");
             return res.status(500).send("Server Config Error: Missing Image API URL.");
        }

        // 4. ការសាងសង់ URL (Constructing the Final URL)
        // យើងនឹងបំបែកវាជាផ្នែកៗដើម្បីងាយស្រួលមើល
        
        // A. ឈ្មោះអ្នកទទួល (Username) - ធំ, ពណ៌មាស, កណ្តាល
        const paramName = `&txt-align=center&txt-size=110&txt-color=FFD700&txt=${encodeURIComponent(username.toUpperCase())}&txt-fit=max&w=1800`;
        
        // B. ពិន្ទុ (Score) - ពណ៌ទឹកក្រូច
        const paramScore = `&mark-align=center&mark-size=60&mark-color=FF4500&mark-y=850&mark-txt=${encodeURIComponent("Score: " + score)}`;
        
        // C. កាលបរិច្ឆេទ (Date) - ពណ៌ប្រផេះ
        const paramDate = `&mark-align=center&mark-size=40&mark-color=BBBBBB&mark-y=1120&mark-txt=${encodeURIComponent("Date Issued: " + formattedDate)}`;
        
        // D. សារជូនពរ (Message) - ពណ៌ស, តូចល្មម
        const paramMsg = `&mark-align=center&mark-size=26&mark-color=FFFFFF&mark-y=1320&mark-txt=${encodeURIComponent(formalMessage)}`;

        // E. បញ្ចូលគ្នា (Merge) - ប្រើ Logic ថ្មីដែលបូកបញ្ចូលគ្នាដើម្បីកុំអោយបាត់
        // ចំណាំ៖ Imgix អាចនឹងត្រូវការវិធីសាស្ត្រមួយដែលមិន overwrite mark. 
        // ដំណោះស្រាយល្អបំផុតគឺយើងប្រើវិធីដែលខ្ញុំបានផ្ដល់ចុងក្រោយគឺ Encode ចូលគ្នា ឬប្រើ Base URL ដែលមាន Layer ត្រឹមត្រូវ។
        // ប៉ុន្តែដើម្បីអោយងាយស្រួលបំផុត យើងប្រើវិធី Redirect ទៅ Base URL ហើយជំនួស Placeholder ។
        
        // សន្មតថាអ្នកបានដាក់ URL វែងក្នុង ENV. យើងនឹងធ្វើការ Replace Placeholder វិញប្រសិនបើអ្នកចង់។
        // ប៉ុន្តែសម្រាប់ស្ថេរភាព យើងនឹងប្រើវិធីផ្គុំ String ដូចខាងក្រោម៖

        // សំខាន់៖ ដោយសារអ្នកមានបញ្ហា "ចេញតែឈ្មោះ" យើងនឹងប្រើវិធីដាក់ Text ទាំងអស់ក្នុង Mark តែមួយ (Multiline)
        const combinedText = `Score: ${score}%0A%0A` + 
                             `Date Issued: ${formattedDate}%0A%0A%0A` +
                             `${formalMessage}`;
        
        const finalUrl = BASE_IMGIX_URL + 
            // Layer 1: ឈ្មោះ (Text Parameter)
            `&txt-align=center&txt-size=110&txt-color=FFD700&txt=${encodeURIComponent(username.toUpperCase())}&txt-fit=max&w=1800` +
            // Layer 2: ព័ត៌មានផ្សេងៗ (Watermark Parameter)
            `&mark-align=center&mark-size=35&mark-color=FFFFFF&mark-y=850&mark-txt=${encodeURIComponent(combinedText)}&mark-w=1600&mark-fit=max`;

        // 5. បញ្ជូនលទ្ធផល (Redirect)
        console.log(`✅ Certificate Generated Successfully! Redirecting...`);
        res.redirect(finalUrl);

    } catch (err) {
        console.error("❌ Certificate Generation Error:", err.message);
        res.status(500).send(`
            <div style="text-align:center; padding:50px; font-family:sans-serif;">
                <h1 style="color:red;">⚠️ Error Generating Certificate</h1>
                <p>Internal Server Error. Please check server logs.</p>
                <p><i>${err.message}</i></p>
            </div>
        `);
    }
});

// --- 9. START SERVER (ចាប់ផ្តើមដំណើរការ) ---

async function startServer() {
    // ពិនិត្យមើលការកំណត់ Database
    if (!process.env.DATABASE_URL) {
        console.error("🛑 CRITICAL ERROR: DATABASE_URL is missing in .env");
        return;
    }

    // ចាប់ផ្តើម Database
    await initializeDatabase();

    // បើក Server
    app.listen(port, () => {
        console.log(`\n===================================================`);
        console.log(`🚀 MATH QUIZ PRO SERVER IS RUNNING!`);
        console.log(`👉 PORT: ${port}`);
        console.log(`👉 ADMIN PANEL: http://localhost:${port}/admin/requests`);
        console.log(`===================================================\n`);
    });
}

// Execute Start Function
startServer();

// =========================================================================================
// END OF FILE
// =========================================================================================
