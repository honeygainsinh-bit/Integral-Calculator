/**
 * =========================================================================================
 * PROJECT: MATH QUIZ PRO BACKEND API
 * VERSION: 5.0.1 (ADMIN PANEL CONFIRMED)
 * DESCRIPTION: 
 * - Admin Panel (View & Delete) ត្រូវបានរក្សាទុក។
 * - Logic បូកពិន្ទុ (Aggregation) គឺដំណើរការត្រឹមត្រូវ។
 * - Imgix / Print Feature ត្រូវបានដកចេញ។
 * =========================================================================================
 */

// 1. LOAD DEPENDENCIES
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

// 2. SERVER CONFIGURATION
const app = express();
const port = process.env.PORT || 3000;
const MODEL_NAME = "gemini-2.5-flash"; 

// Middleware Setup
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString('km-KH')}] 📡 ${req.method} ${req.path}`);
    next();
});

// 3. DATABASE CONNECTION
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } 
});

// Function បង្កើត Table (បើមិនទាន់មាន)
async function initializeDatabase() {
    try {
        const client = await pool.connect();
        
        // Table 1: Leaderboard (សម្រាប់រក្សាទុកពិន្ទុ)
        await client.query(`
            CREATE TABLE IF NOT EXISTS leaderboard (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                score INTEGER NOT NULL,
                difficulty VARCHAR(20) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Table 2: Certificate Requests (សម្រាប់ Admin មើល)
        await client.query(`
            CREATE TABLE IF NOT EXISTS certificate_requests (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) NOT NULL,
                score INTEGER NOT NULL,
                status VARCHAR(20) DEFAULT 'Pending',
                request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("✅ Database Tables are Checked.");
        client.release();
    } catch (err) {
        console.error("❌ Database Init Error:", err.message);
    }
}

// 4. RATE LIMITER
const aiLimiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, 
    max: 10, 
    message: { error: "Rate limit exceeded" },
    keyGenerator: (req) => req.ip,
    skip: (req) => req.ip === process.env.OWNER_IP 
});

app.use(express.static(path.join(__dirname, 'public')));

// =========================================================================
// API ROUTES
// =========================================================================

// Home Route
app.get('/', (req, res) => {
    res.send(`
        <h1 style="color:green; text-align:center; margin-top:50px;">
            Math Quiz API is Online 🟢
        </h1>
        <p style="text-align:center;">Score Aggregation is Active.</p>
    `);
});

// A. AI GENERATE PROBLEM
app.post('/api/generate-problem', aiLimiter, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "No prompt provided" });

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent(prompt);
        
        res.json({ text: result.response.text() });
    } catch (error) {
        console.error("AI Error:", error.message);
        res.status(500).json({ error: "AI Generation Failed" });
    }
});

// B. SUBMIT SCORE (FIXED: បូកពិន្ទុបញ្ចូលគ្នា)
app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;
    
    if (!username || typeof score !== 'number') {
        return res.status(400).json({ success: false, message: "Invalid Data" });
    }

    const cleanUsername = username.trim().substring(0, 50);

    try {
        const client = await pool.connect();

        // ជំហានទី ១: ស្វែងរកឈ្មោះនេះក្នុង Database
        const checkRes = await client.query(
            'SELECT * FROM leaderboard WHERE username = $1', 
            [cleanUsername]
        );

        if (checkRes.rows.length > 0) {
            // ✅ ករណីមានឈ្មោះហើយ: យកពិន្ទុចាស់ + ពិន្ទុថ្មី
            const currentTotal = checkRes.rows[0].score;
            const newTotal = currentTotal + score;
            
            await client.query(
                'UPDATE leaderboard SET score = $1, difficulty = $2 WHERE username = $3',
                [newTotal, difficulty, cleanUsername]
            );
            console.log(`🔄 UPDATED: ${cleanUsername} (New Total: ${newTotal})`);
        } else {
            // ✅ ករណីឈ្មោះថ្មី: បង្កើតថ្មី (Insert)
            await client.query(
                'INSERT INTO leaderboard(username, score, difficulty) VALUES($1, $2, $3)', 
                [cleanUsername, score, difficulty]
            );
            console.log(`✨ INSERTED: ${cleanUsername} (Score: ${score})`);
        }

        client.release();
        res.status(200).json({ success: true, message: "Score saved successfully" });

    } catch (err) {
        console.error("Submit Score Error:", err);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// C. GET LEADERBOARD (Top 100)
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
    if (!username) return res.status(400).json({ success: false });

    try {
        const client = await pool.connect();
        await client.query(
            'INSERT INTO certificate_requests (username, score, request_date) VALUES ($1, $2, NOW())', 
            [username, score]
        );
        client.release();
        res.json({ success: true, message: "Request Sent to Admin" });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// E. ADMIN PANEL (View Requests & Delete Button)
app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pool.connect();
        // ផ្ទាំងនេះសម្រាប់ Admin ពិនិត្យមើលអ្នកដែលស្នើសុំ Certificate
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
                body { font-family: sans-serif; background: #f3f4f6; padding: 20px; }
                .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                h1 { color: #1e293b; text-align: center; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background: #3b82f6; color: white; padding: 12px; text-align: left; }
                td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
                tr:hover { background: #f8fafc; }
                .btn-delete { background: #ef4444; color: white; border: none; padding: 6px 12px; cursor: pointer; border-radius: 4px; }
                .score-high { color: green; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>👮‍♂️ Admin Panel (Certificate Requests)</h1>
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Username</th>
                            <th>Score</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>`;

        if(result.rows.length === 0) {
            html += `<tr><td colspan="4" style="text-align:center;">No requests found.</td></tr>`;
        } else {
            result.rows.forEach(row => {
                const scoreDisplay = row.score >= 10000 ? 'score-high' : '';
                html += `
                    <tr id="row-${row.id}">
                        <td>#${row.id}</td>
                        <td><b>${row.username}</b></td>
                        <td class="${scoreDisplay}">${row.score}</td>
                        <td>
                            <button onclick="deleteRequest(${row.id})" class="btn-delete">🗑️ Remove</button>
                        </td>
                    </tr>`;
            });
        }

        html += `
                    </tbody>
                </table>
            </div>

            <script>
                // This JS runs on the Admin HTML page
                async function deleteRequest(id) {
                    if(!confirm("Are you sure you want to delete this request?")) return;
                    
                    try {
                        const res = await fetch('/admin/delete-request/' + id, { method: 'DELETE' });
                        const data = await res.json();
                        if(data.success) {
                            document.getElementById('row-' + id).remove();
                        } else {
                            alert("Failed to delete: " + data.message);
                        }
                    } catch(e) {
                        alert("Error connecting to server.");
                    }
                }
            </script>
        </body>
        </html>`;
        
        res.send(html);
    } catch (err) {
        console.error(err);
        res.status(500).send("Admin Error");
    }
});

// F. DELETE REQUEST API (Called by the Admin Panel)
app.delete('/admin/delete-request/:id', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('DELETE FROM certificate_requests WHERE id = $1', [req.params.id]);
        client.release();
        
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "Request not found" });
        }
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server deletion failed" });
    }
});

// =========================================================================
// START SERVER (Non-blocking Startup)
// =========================================================================

async function startServer() {
    // 1. Start listening immediately
    app.listen(port, () => {
        console.log(`🚀 Server Running on Port ${port}`);
        console.log(`🔗 Admin Link: http://localhost:${port}/admin/requests`);
    });

    // 2. Connect DB in background
    await initializeDatabase();
}

startServer();
