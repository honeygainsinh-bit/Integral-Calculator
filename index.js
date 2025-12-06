/**
 * =========================================================================================
 * PROJECT: MATH QUIZ PRO BACKEND API
 * VERSION: 8.0.0 (FINAL FIX: Atomic SQL Aggregation)
 * DESCRIPTION: 
 * - ប្រើ Atomic SQL Command សម្រាប់បូកពិន្ទុដើម្បីលុបបំបាត់កំហុស Data Type/Concatenation។
 * - ធានារក្សាមុខងារ Admin Panel (View & Delete)។
 * =========================================================================================
 */

// #########################################################################################
// 1. LOAD DEPENDENCIES AND CONFIGURATION
// #########################################################################################

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;
const MODEL_NAME = "gemini-2.5-flash"; 

let totalPlays = 0;
const uniqueVisitors = new Set();

// --- MAP សម្រាប់គណនាពិន្ទុត្រឹមត្រូវ (Server-Side Score Validation) ---
const DIFFICULTY_POINTS = {
    'Easy': 5,
    'Medium': 10,
    'Hard': 15,
    'Very Hard': 20
};

// --- MIDDLEWARE SETUP ---
app.set('trust proxy', 1); 
app.use(cors()); 
app.use(express.json()); 

app.use((req, res, next) => {
    const timestamp = new Date().toLocaleTimeString('km-KH');
    console.log(`[${timestamp}] 📡 REQUEST: ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});

// #########################################################################################
// 2. DATABASE CONNECTION & INITIALIZATION
// #########################################################################################

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } 
});

async function initializeDatabase() {
    console.log("... ⚙️ កំពុងពិនិត្យ Database Tables ...");
    try {
        const client = await pool.connect();

        await client.query(`
            CREATE TABLE IF NOT EXISTS leaderboard (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                score INTEGER NOT NULL,
                difficulty VARCHAR(20) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS certificate_requests (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) NOT NULL,
                score INTEGER NOT NULL,
                user_ip VARCHAR(45),
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

// --- RATE LIMITER ---
const aiLimiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, 
    max: 10, 
    message: { error: "Rate limit exceeded" },
    keyGenerator: (req) => req.ip, 
    skip: (req) => req.ip === process.env.OWNER_IP 
});

app.use(express.static(path.join(__dirname, 'public')));

// #########################################################################################
// 3. CORE API FUNCTIONALITY
// #########################################################################################

// Home Route
app.get('/', (req, res) => {
    res.status(200).send(`
        <h1 style="color: #16a34a; text-align:center; margin-top:50px;">Math Quiz API 🟢</h1>
        <p style="text-align:center;"><a href="/admin/requests">Go to Admin Panel</a></p>
    `);
});

// A. GENERATE PROBLEM (AI)
app.post('/api/generate-problem', aiLimiter, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "No prompt provided" });

        totalPlays++;
        uniqueVisitors.add(req.ip);

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent(prompt);
        
        console.log(`🤖 AI Generated Problem for IP: ${req.ip}`);
        res.json({ text: result.response.text() });

    } catch (error) {
        console.error("❌ Gemini API Error:", error.message);
        res.status(500).json({ error: "AI Generation Failed" });
    }
});

// B. SUBMIT SCORE (ATOMIC SQL AGGREGATION FIX)
app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, difficulty } = req.body; 
    
    // 1. Server គណនាពិន្ទុត្រឹមត្រូវ
    const pointsToAdd = DIFFICULTY_POINTS[difficulty] || 0;

    if (pointsToAdd === 0 || !username) { 
        return res.status(400).json({ success: false, message: "Invalid Difficulty or Data." });
    }

    const cleanUsername = username.trim().substring(0, 50);

    try {
        const client = await pool.connect();

        // ជំហានទី ១: ព្យាយាម UPDATE ជួរដែលមានស្រាប់ (Atomic Addition)
        const updateRes = await client.query(
            'UPDATE leaderboard SET score = score + $1, difficulty = $2 WHERE username = $3 RETURNING id',
            [pointsToAdd, difficulty, cleanUsername]
        );

        if (updateRes.rows.length > 0) {
            // ✅ ករណីមានឈ្មោះហើយ: UPDATE បានជោគជ័យ
             console.log(`🔄 ATOMIC UPDATE Score for ${cleanUsername}: +${pointsToAdd}`);
        } else {
            // ✅ ករណីឈ្មោះថ្មី: មិនមានជួរដេកត្រឡប់មកវិញទេ ដូច្នេះត្រូវ INSERT
            await client.query(
                'INSERT INTO leaderboard(username, score, difficulty) VALUES($1, $2, $3)', 
                [cleanUsername, pointsToAdd, difficulty]
            );
             console.log(`✨ NEW User Added: ${cleanUsername} with score ${pointsToAdd}`);
        }

        client.release();
        res.status(200).json({ success: true, message: "Score saved successfully" });

    } catch (err) {
        console.error("DB Error:", err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// C. GET LEADERBOARD
app.get('/api/leaderboard/top', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT username, score, difficulty FROM leaderboard ORDER BY score DESC LIMIT 100');
        client.release();
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false, message: "Fetch Error" });
    }
});

// D. SUBMIT CERTIFICATE REQUEST
app.post('/api/submit-request', async (req, res) => {
    const { username, score } = req.body;
    const userIP = req.ip; 
    
    if (!username || score === undefined) {
        return res.status(400).json({ success: false, message: "Invalid data" });
    }

    try {
        const client = await pool.connect();
        await client.query(
            'INSERT INTO certificate_requests (username, score, user_ip, request_date) VALUES ($1, $2, $3, NOW())', 
            [username, score, userIP]
        );
        client.release();
        res.json({ success: true, message: "Request Sent" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// #########################################################################################
// 4. ADMIN PANEL FUNCTIONALITY (VIEW IP & DELETE)
// #########################################################################################

app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT *, user_ip FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
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
                .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); overflow: hidden; }
                .header { background: #1e293b; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
                .header h1 { margin: 0; font-size: 1.5rem; }
                
                table { width: 100%; border-collapse: collapse; }
                th { background: #3b82f6; color: white; padding: 15px; text-align: left; font-size: 0.85rem; text-transform: uppercase; }
                td { padding: 12px 15px; border-bottom: 1px solid #e2e8f0; color: #334155; vertical-align: middle; }
                tr:hover { background: #f8fafc; }
                
                .username-text { font-weight: 700; color: #1e293b; font-size: 1rem; }
                
                .btn-delete { 
                    border: none; 
                    background: #ef4444; 
                    box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);
                    padding: 6px 10px; 
                    border-radius: 6px; 
                    cursor: pointer;
                    font-size: 0.8rem; 
                    font-weight: bold; 
                    color: white; 
                    transition: all 0.2s; 
                }
                .btn-delete:hover { transform: scale(1.05); }
                
                .score-high { color: #16a34a; font-weight: bold; }
                .score-low { color: #dc2626; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>👮‍♂️ Admin Control (Certificate Requests)</h1>
                    <span>Total Requests: ${result.rows.length}</span>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 50px;">ID</th>
                            <th>👤 Username</th>
                            <th style="width: 80px;">Score</th>
                            <th style="width: 120px;">🌐 User IP</th>
                            <th style="width: 150px;">Date & Action</th>
                        </tr>
                    </thead>
                    <tbody>`;

        if (result.rows.length === 0) {
            html += `<tr><td colspan="5" style="text-align:center; padding:30px;">🚫 មិនទាន់មានសំណើ។</td></tr>`;
        } else {
            result.rows.forEach(row => {
                const scoreClass = row.score >= 500 ? 'score-high' : 'score-low';
                const formattedDate = new Date(row.request_date).toLocaleDateString('en-GB');

                html += `
                    <tr id="row-${row.id}">
                        <td>#${row.id}</td>
                        <td><span class="username-text">${row.username}</span></td>
                        <td class="${scoreClass}">${row.score}</td>
                        <td>${row.user_ip || 'N/A'}</td> 
                        <td>
                            <span>${formattedDate}</span>
                            <button onclick="deleteRequest(${row.id})" class="btn-delete" title="Delete Request">
                                🗑️ លុប
                            </button>
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
                    if (!confirm("⚠️ តើអ្នកពិតជាចង់លុបសំណើនេះមែនទេ?")) return;

                    try {
                        const response = await fetch('/admin/delete-request/' + id, { method: 'DELETE' });
                        const result = await response.json();

                        if (result.success) {
                            const row = document.getElementById('row-' + id);
                            row.style.backgroundColor = "#fee2e2"; 
                            setTimeout(() => row.remove(), 300);
                        } else {
                            alert("បរាជ័យ: " + result.message);
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

// --- DELETE REQUEST API ---
app.delete('/admin/delete-request/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const client = await pool.connect();
        const result = await client.query('DELETE FROM certificate_requests WHERE id = $1', [id]);
        client.release();

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "Request not found" });
        }

        console.log(`🗑️ Deleted Request ID: ${id}`);
        res.json({ success: true, message: "លុបបានជោគជ័យ" });
    } catch (err) {
        console.error("Delete Error:", err);
        res.status(500).json({ success: false, message: "Server deletion failed" });
    }
});

// #########################################################################################
// 5. START SERVER
// #########################################################################################

async function startServer() {
    // 1. ចាប់ផ្តើម Database Initialization ក្នុងផ្ទៃខាងក្រោយ
    await initializeDatabase(); 

    // 2. បើក Server 
    app.listen(port, () => {
        console.log(`\n===================================================`);
        console.log(`🚀 MATH QUIZ PRO SERVER IS RUNNING! (v8.0)`);
        console.log(`👉 PORT: ${port}`);
        console.log(`👉 ADMIN PANEL: http://localhost:${port}/admin/requests`);
        console.log(`===================================================\n`);
    });
}

// Execute Start Function
startServer();
