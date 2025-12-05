/**
 * =========================================================================================
 * PROJECT: MATH QUIZ PRO BACKEND API
 * VERSION: 3.2.3 (Enterprise Stable - FINAL CODE SOLUTION)
 * DESCRIPTION: 
 * - Backend សម្រាប់ល្បែងគណិតវិទ្យា
 * - ភ្ជាប់ជាមួយ PostgreSQL Database
 * - ប្រើប្រាស់ Google Gemini AI សម្រាប់បង្កើតលំហាត់
 * - បង្កើត Certificate តាមរយៈ Imgix URL Transformation (FIXED 3-Layer Standard Layout)
 * - Admin Panel សម្រាប់គ្រប់គ្រងសំណើ (បន្ថែមមុខងារលុប និងកែ UI)
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
            <p style="margin-top: 50px; font-size: 0.9rem; color: #94a3b8;">Server Status: Stable v3.2.3</p>
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

// --- 7. ROUTES: ADMIN PANEL (ផ្ទាំងគ្រប់គ្រង - UPDATED) ---

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
                @import url('https://fonts.googleapis.com/css2?family=Hanuman:wght@400;700&family=Poppins:wght@400;600&display=swap');
                body { font-family: 'Poppins', 'Hanuman', sans-serif; background: #f3f4f6; padding: 20px; margin: 0; }
                .container { max-width: 1000px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); overflow: hidden; }
                .header { background: #1e293b; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
                .header h1 { margin: 0; font-size: 1.5rem; }
                
                table { width: 100%; border-collapse: collapse; }
                th { background: #3b82f6; color: white; padding: 15px; text-align: left; font-size: 0.85rem; text-transform: uppercase; }
                td { padding: 12px 15px; border-bottom: 1px solid #e2e8f0; color: #334155; vertical-align: middle; }
                tr:hover { background: #f8fafc; }
                
                /* Name Cell Style - ដាក់ឈ្មោះ និងប៊ូតុងនៅជាមួយគ្នា */
                .name-cell {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 15px;
                }
                .username-text { font-weight: 700; color: #1e293b; font-size: 1rem; }
                
                /* Action Buttons Group */
                .actions { display: flex; gap: 5px; }

                .btn {
                    border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer;
                    font-size: 0.8rem; font-weight: bold; color: white; text-decoration: none;
                    transition: all 0.2s; display: flex; align-items: center;
                }
                .btn:hover { transform: scale(1.05); }
                
                /* Print Button (Green/Blue) */
                .btn-print { background: #3b82f6; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3); }
                
                /* Delete Button (Red) */
                .btn-delete { background: #ef4444; box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3); }

                .score-high { color: #16a34a; font-weight: bold; }
                .score-low { color: #dc2626; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>👮‍♂️ Admin Control</h1>
                    <span>Total: ${result.rows.length}</span>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 50px;">ID</th>
                            <th>👤 Username & Actions (ឈ្មោះ & ប៊ូតុង)</th>
                            <th style="width: 100px;">Score</th>
                            <th style="width: 150px;">Date</th>
                        </tr>
                    </thead>
                    <tbody>`;

        if (result.rows.length === 0) {
            html += `<tr><td colspan="4" style="text-align:center; padding:30px;">🚫 មិនទាន់មានសំណើ។</td></tr>`;
        } else {
            result.rows.forEach(row => {
                const scoreClass = row.score >= 500 ? 'score-high' : 'score-low';
                html += `
                    <tr id="row-${row.id}">
                        <td>#${row.id}</td>
                        <td>
                            <div class="name-cell">
                                <span class="username-text">${row.username}</span>
                                <div class="actions">
                                    <a href="/admin/generate-cert/${row.id}" target="_blank" class="btn btn-print" title="Print Certificate">
                                        🖨️ Print
                                    </a>
                                    <button onclick="deleteRequest(${row.id})" class="btn btn-delete" title="Delete User">
                                        🗑️ លុប
                                    </button>
                                </div>
                            </div>
                        </td>
                        <td class="${scoreClass}">${row.score}</td>
                        <td>${new Date(row.request_date).toLocaleDateString('en-GB')}</td>
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
                        const result = await response.json();

                        if (result.success) {
                            // Highlight red before delete
                            const row = document.getElementById('row-' + id);
                            row.style.backgroundColor = "#fee2e2"; 
                            setTimeout(() => row.remove(), 300); // Remove row from table
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

// --- NEW ROUTE: DELETE REQUEST (លុបសំណើ) ---
app.delete('/admin/delete-request/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const client = await pool.connect();
        const result = await client.query('DELETE FROM certificate_requests WHERE id = $1', [id]);
        client.release();

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "រកមិនឃើញ ID នេះទេ" });
        }

        console.log(`🗑️ Deleted Request ID: ${id}`);
        res.json({ success: true, message: "លុបបានជោគជ័យ" });
    } catch (err) {
        console.error("Delete Error:", err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// --- 8. CERTIFICATE GENERATION LOGIC (IMGIX ENGINE - FIXED 3-LAYER LAYOUT & TIMES NEW ROMAN FONT) ---

/**
 * Route: /admin/generate-cert/:id
 * Description: បង្កើត URL រូបភាពដោយប្រើ Imgix សម្រាប់លិខិតសរសើរ
 * ⚠️ FIXED: Layer 3 uses mark-1- to avoid conflict with Layer 2 (mark-)
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

        // A. សារជូនពរភាសាអង់គ្លេស (Long and Standardized Message)
        const formalMessage = 
            `With immense pride and recognition of your intellectual brilliance, we bestow this official Master Certificate upon you. Your outstanding performance demonstrates a profound mastery of mathematics and a relentless spirit of excellence. Your accomplishment is truly noteworthy.`;
        const encodedFormalMessage = encodeURIComponent(formalMessage);
        
        // B. ប្លុកព័ត៌មាន Footer (Score, Date, Website/Branding)
        const footerBlock = 
            `Score Achieved: ${score}%0A` + 
            `Date Issued: ${formattedDate}%0A%0A` +
            `Presented by: braintest.fun`; // បញ្ជាក់ Website ឲ្យច្បាស់
        const encodedFooterBlock = encodeURIComponent(footerBlock);


        // 3. ពិនិត្យមើល Environment Variable 
        const BASE_IMGIX_URL = process.env.EXTERNAL_IMAGE_API;
        if (!BASE_IMGIX_URL) {
             console.error("❌ MISSING CONFIG: EXTERNAL_IMAGE_API is not set.");
             return res.status(500).send("Server Config Error: Missing Image API URL.");
        }

        // 4. ការសាងសង់ URL (Constructing the Final URL - 3 Layers)
        const encodedUsername = encodeURIComponent(username.toUpperCase());

        const finalUrl = BASE_IMGIX_URL + 
            // Layer 1: ឈ្មោះ (txt-y=400) - Standard Text Layer
            `&txt-align=center&txt-size=120&txt-color=FFD700&txt=${encodedUsername}&txt-fit=max&w=1800&txt-y=400&txt-font=Times New Roman,bold` + 
            
            // Layer 2: សារជូនពរស្តង់ដារ (mark-y=600) - Primary Mark Layer
            `&mark-align=center&mark-size=35&mark-color=FFFFFF&mark-y=600&mark-txt=${encodedFormalMessage}&mark-w=1600&mark-fit=max&mark-font=Times New Roman` +
            
            // Layer 3: Footer Block (mark-1-y=900) - Secondary Mark Layer (FIXED PARAMETER)
            `&mark-1-w=1000&mark-1-align=center&mark-1-size=30&mark-1-color=FFD700&mark-1-y=900&mark-1-txt=${encodedFooterBlock}&mark-1-fit=max&mark-1-font=Times New Roman`;

        // 5. បញ្ជូនលទ្ធផល (Redirect)
        console.log(`✅ Certificate Generated Successfully! Redirecting...`);
        // 🚨 នេះគឺជាបន្ទាត់ Debug ដ៏សំខាន់! សូមពិនិត្យមើលក្នុង Log!
        console.log(`🔎 FINAL IMGIX URL (Check for Data): ${finalUrl}`);
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
