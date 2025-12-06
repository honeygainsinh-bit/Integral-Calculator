/**
 * =========================================================================================
 * PROJECT: MATH QUIZ PRO BACKEND API
 * VERSION: 3.2.0 (SECURE & AUTO-SUM EDITION)
 * UPDATE: ដោះស្រាយបញ្ហាឈ្មោះស្ទួន និង ការពារការបន្លំពិន្ទុ (Anti-Cheat)
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
const MODEL_NAME = "gemini-1.5-flash"; // AI Model (អាចប្រើ gemini-2.5-flash ក៏បាន)

// សម្រាប់ការតាមដានស្ថិតិ (In-memory stats)
let totalPlays = 0;
const uniqueVisitors = new Set();

// Middleware Setup
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

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
        <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
            <h1 style="color: #16a34a;">Math Quiz API 🟢 (Secure v3.2)</h1>
            <p style="color: #64748b;">ប្រព័ន្ធគ្រប់គ្រងទិន្នន័យ និងបង្កើតវិញ្ញាបនបត្រស្វ័យប្រវត្តិ</p>
            <div style="margin-top: 30px;">
                <a href="/admin/requests" style="background: #0284c7; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                    👮‍♂️ ចូលទៅកាន់ Admin Panel
                </a>
            </div>
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

// B. ដាក់ពិន្ទុចូល Leaderboard (SECURE & AUTO-SUM LOGIC)
app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;

    // 1. Check Data Format
    if (!username || score === undefined || !difficulty) {
        return res.status(400).json({ success: false, message: "ទិន្នន័យមិនត្រឹមត្រូវ!" });
    }

    // 2. SECURITY RULES (ច្បាប់សុវត្ថិភាព)
    const RULES = {
        'easy': 5,
        'medium': 10,
        'hard': 15,
        'very hard': 20
    };

    const level = difficulty.toLowerCase().trim();
    const allowedScore = RULES[level];

    // 3. HACK PROTECTION CHECK (ការត្រួតពិនិត្យការបន្លំ)
    // បើកម្រិតមិនមានក្នុង Rules ឬ ពិន្ទុដែលផ្ញើមកខុសពីច្បាប់កំណត់ -> BLOCK
    if (!allowedScore || score !== allowedScore) {
        console.warn(`⛔ FRAUD DETECTED: IP=${req.ip}, User=${username}, Diff=${difficulty}, SentScore=${score}`);
        return res.status(403).json({ 
            success: false, 
            message: `⚠️ ការព្រមាន: ពិន្ទុមិនត្រឹមត្រូវតាមកម្រិតលំបាក! (អនុញ្ញាតត្រឹម: ${allowedScore})` 
        });
    }

    // 4. DATABASE LOGIC (បូកពិន្ទុ ឬ បង្កើតថ្មី)
    try {
        const client = await pool.connect();

        // ពិនិត្យមើលឈ្មោះចាស់
        const checkUser = await client.query('SELECT * FROM leaderboard WHERE username = $1', [username]);

        if (checkUser.rows.length > 0) {
            // A. មានឈ្មោះចាស់ -> UPDATE (យកពិន្ទុចាស់ + ពិន្ទុថ្មី)
            await client.query(
                // ប្រើ $1 ជាពិន្ទុដែលបានអនុញ្ញាត (allowedScore)
                'UPDATE leaderboard SET score = score + $1, difficulty = $2 WHERE username = $3',
                [allowedScore, difficulty, username.substring(0, 50)] // កាត់ឈ្មោះខ្លីបំផុត
            );
            console.log(`🔄 UPDATED: ${username} (+${allowedScore} points)`);
        } else {
            // B. អត់មានឈ្មោះ -> INSERT (បង្កើតថ្មី)
            await client.query(
                'INSERT INTO leaderboard(username, score, difficulty) VALUES($1, $2, $3)', 
                [username.substring(0, 50), allowedScore, difficulty]
            );
            console.log(`✅ CREATED: ${username} (First Score: ${allowedScore})`);
        }

        client.release();
        res.status(200).json({ success: true, message: "រក្សាទុកដោយជោគជ័យ" });

    } catch (err) {
        console.error("DB Error:", err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// C. ទាញយកពិន្ទុពី Leaderboard
app.get('/api/leaderboard/top', async (req, res) => {
    try {
        const client = await pool.connect();
        // យក Top 100 អ្នកពិន្ទុខ្ពស់បំផុត
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

// --- 7. ROUTES: ADMIN PANEL ---

app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pool.connect();
        // ទាញយកទិន្នន័យ (រៀបតាមថ្មីទៅចាស់)
        const result = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
        client.release();

        let html = `
        <!DOCTYPE html>
        <html lang="km">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Admin Dashboard</title>
            <style>
                body { font-family: sans-serif; background: #f3f4f6; padding: 20px; margin: 0; }
                .container { max-width: 1000px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); overflow: hidden; }
                .header { background: #1e293b; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
                table { width: 100%; border-collapse: collapse; }
                th { background: #3b82f6; color: white; padding: 15px; text-align: left; }
                td { padding: 12px 15px; border-bottom: 1px solid #e2e8f0; }
                .actions { display: flex; gap: 5px; }
                .btn { border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: bold; color: white; text-decoration: none; }
                .btn-print { background: #3b82f6; }
                .btn-delete { background: #ef4444; }
                .score-high { color: #16a34a; font-weight: bold; }
                .score-low { color: #dc2626; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>👮‍♂️ Admin Control</h1>
                    <span>Total Requests: ${result.rows.length}</span>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 50px;">ID</th>
                            <th>👤 Username</th>
                            <th style="width: 100px;">Score</th>
                            <th style="width: 150px;">Date</th>
                            <th style="width: 150px;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>`;

        if (result.rows.length === 0) {
            html += `<tr><td colspan="5" style="text-align:center; padding:30px;">🚫 មិនទាន់មានសំណើ។</td></tr>`;
        } else {
            result.rows.forEach(row => {
                const scoreClass = row.score >= 500 ? 'score-high' : 'score-low';
                html += `
                    <tr id="row-${row.id}">
                        <td>#${row.id}</td>
                        <td>${row.username}</td>
                        <td class="${scoreClass}">${row.score}</td>
                        <td>${new Date(row.request_date).toLocaleDateString('en-GB')}</td>
                        <td>
                            <div class="actions">
                                <a href="/admin/generate-cert/${row.id}" target="_blank" class="btn btn-print">🖨️ Print</a>
                                <button onclick="deleteRequest(${row.id})" class="btn btn-delete">🗑️ លុប</button>
                            </div>
                        </td>
                    </tr>`;
            });
        }
        
        html += `
                    </tbody>
                </table>
            </div>

            <script>
                async function deleteRequest(id) {
                    if (!confirm("⚠️ តើអ្នកពិតជាចង់លុបឈ្មោះនេះមែនទេ?")) return;
                    try {
                        const response = await fetch('/admin/delete-request/' + id, { method: 'DELETE' });
                        if (response.ok) {
                            const row = document.getElementById('row-' + id);
                            row.style.backgroundColor = "#fee2e2"; 
                            setTimeout(() => row.remove(), 300);
                        } else {
                            alert("បរាជ័យក្នុងការលុប។");
                        }
                    } catch (err) {
                        alert("Error communicating with server.");
                    }
                }
            </script>
        </body>
        </html>`;
        
        res.send(html);
    } catch (err) {
        console.error("Admin Panel Error:", err);
        res.status(500).send("Server Error");
    }
});

// DELETE REQUEST
app.delete('/admin/delete-request/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const client = await pool.connect();
        const result = await client.query('DELETE FROM certificate_requests WHERE id = $1', [id]);
        client.release();

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "រកមិនឃើញ ID" });
        }
        console.log(`🗑️ Deleted Request ID: ${id}`);
        res.json({ success: true, message: "លុបបានជោគជ័យ" });
    } catch (err) {
        console.error("Delete Error:", err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// --- 8. CERTIFICATE GENERATION LOGIC (IMGIX ENGINE) ---

app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const id = req.params.id;
        
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Error: Request ID not found.");

        const { username, score } = result.rows[0];

        const dateObj = new Date();
        const formattedDate = dateObj.toLocaleDateString('en-US', { 
            day: 'numeric', month: 'long', year: 'numeric' 
        });

        const formalMessage = `With immense pride and recognition of your intellectual brilliance, we bestow this award upon you. Your outstanding performance demonstrates a profound mastery of mathematics and a relentless spirit of excellence. Presented by: braintest.fun`;

        const BASE_IMGIX_URL = process.env.EXTERNAL_IMAGE_API;
        if (!BASE_IMGIX_URL) return res.status(500).send("Server Config Error: Missing Image API URL.");

        // 4. ការសាងសង់ URL
        const encodedUsername = encodeURIComponent(username.toUpperCase());

        const secondaryBlock = 
            `Score: ${score}%0A%0A` + 
            `Date Issued: ${formattedDate}%0A%0A%0A` +
            `${formalMessage}`;
        const encodedSecondaryBlock = encodeURIComponent(secondaryBlock);


        const finalUrl = BASE_IMGIX_URL + 
            `&txt-align=center&txt-size=110&txt-color=FFD700&txt=${encodedUsername}&txt-fit=max&w=1800` +
            `&mark-align=center&mark-size=35&mark-color=FFFFFF&mark-y=850&mark-txt=${encodedSecondaryBlock}&mark-w=1600&mark-fit=max`;

        console.log(`✅ Certificate Generated Successfully! Redirecting...`);
        res.redirect(finalUrl);

    } catch (err) {
        console.error("❌ Certificate Generation Error:", err.message);
        res.status(500).send(`Error Generating Certificate: ${err.message}`);
    }
});

// --- 9. START SERVER (ចាប់ផ្តើមដំណើរការ) ---

async function startServer() {
    if (!process.env.DATABASE_URL) {
        console.error("🛑 CRITICAL ERROR: DATABASE_URL is missing in .env");
        return;
    }

    await initializeDatabase();

    app.listen(port, () => {
        console.log(`\n===================================================`);
        console.log(`🚀 MATH QUIZ PRO SERVER IS RUNNING! (SECURE v3.2)`);
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
