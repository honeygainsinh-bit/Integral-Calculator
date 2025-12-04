// =========================================================================
// ឯកសារកម្ម: MATH QUIZ PRO BACKEND SERVER (FINAL VERSION)
// គោលបំណង: ធានា Server Stability, Database Management, និង External Image Generation (Imgix)
// =========================================================================

// --- 1. REQUIRE DEPENDENCIES (នាំចូល Library សំខាន់ៗ) ---
Require('dotenv').config(); // សម្រាប់ផ្ទុក Environment Variables ពី .env
const express = require('express'); // Framework ចម្បងសម្រាប់ Server
const cors = require('cors'); // សម្រាប់អនុញ្ញាត Cross-Origin Requests
const path = require('path'); // សម្រាប់គ្រប់គ្រង File Paths
const { GoogleGenerativeAI } = require('@google/generative-ai'); // សម្រាប់មុខងារ AI
const rateLimit = require('express-rate-limit'); // សម្រាប់ការពារការ Call API ច្រើនពេក
const { Pool } = require('pg'); // សម្រាប់ភ្ជាប់ទៅ Database PostgreSQL
const axios = require('axios'); // ✅ នាំចូល Axios សម្រាប់ Call Imgix API (ដំណោះស្រាយ Design)

// --- 2. INITIALIZATION & CONFIGURATION ---
const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1); // ចាំបាច់សម្រាប់ Rate Limiting លើ Render
app.use(cors());
app.use(express.json()); // អាចទទួល JSON ពី Request Body

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

// បង្កើត Pool Connection ទៅកាន់ PostgreSQL (ប្រើ Connection String)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // ចាំបាច់សម្រាប់ Render/Heroku Connections
});

/**
 * @description: មុខងារចាប់ផ្តើម Database និងបង្កើត Tables សំខាន់ៗ។
 */
async function initializeDatabase() {
    console.log("... ⚙️ កំពុងចាប់ផ្តើម Database ...");
    try {
        const client = await pool.connect();
        
        // បង្កើត Table Leaderboard
        await client.query(`
            CREATE TABLE IF NOT EXISTS leaderboard (
                id SERIAL PRIMARY KEY,
                username VARCHAR(25) NOT NULL,
                score INTEGER NOT NULL,
                difficulty VARCHAR(15) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // បង្កើត Table Certificate Requests
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

// ... (API Routes, Admin View code omitted for brevity—they remain the same) ...

// =========================================================================
// 7. EXTERNAL IMAGE GENERATION LOGIC (IMGIX VIA AXIOS)
// =========================================================================

/**
 * @description: មុខងារបង្កើត Certificate ដោយ Call API ទៅកាន់ Imgix (Final Stable Version)
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

        // --- 1. រៀបចំទិន្នន័យសម្រាប់ Imgix ---
        const dateObj = new Date();
        const formattedDate = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        
        const encodedUsername = encodeURIComponent(username.toUpperCase());
        const scoreText = encodeURIComponent(`Score: ${score}`);
        const dateText = encodeURIComponent(`Date Issued: ${formattedDate}`);
        
        // សារលើកតម្កើងសមត្ថភាពខ្ពស់ និង website
        const encouragementText = encodeURIComponent(`This distinguished certificate serves as an enduring testament to your exceptional intellectual acuity and unwavering dedication. May your scholarly pursuits reach new pinnacles. Presented by: braintest.fun`); 

        // 2. កំណត់ Base URL ពី Environment Variable (សំខាន់បំផុត)
        const EXTERNAL_API_ENDPOINT = process.env.EXTERNAL_IMAGE_API;
        if (!EXTERNAL_API_ENDPOINT) {
             console.error("❌ CRITICAL: EXTERNAL_IMAGE_API is missing.");
             return res.status(500).send("Error: EXTERNAL_IMAGE_API environment variable is not set.");
        }
        
        // 3. កសាង Full Dynamic Imgix URL (URL Transformation)
        
        const finalImgixUrl = EXTERNAL_API_ENDPOINT + 
            // Transformation 1: Username (Large, Gold, Center)
            `&txt-align=center` +
            `&txt-size=100` +
            `&txt-color=FFD700` +
            `&txt=${encodedUsername}` +
            `&txt-fit=max` +
            `&w=2000` +
            `&h=1414` +
            
            // Transformation 2: Score 
            `&mark-align=center` +
            `&mark-size=50` +
            `&mark-color=FF4500` +
            `&mark-x=0` +
            `&mark-y=850` +
            `&mark-txt=${scoreText}` +
            
            // Transformation 3: Date 
            `&mark-align=center` +
            `&mark-size=35` +
            `&mark-color=CCCCCC` + 
            `&mark-x=0` +
            `&mark-y=1150` + 
            `&mark-txt=${dateText}` +
            
            // Transformation 4: Encouragement/Source (Longest Message)
            `&mark-align=center` +
            `&mark-size=30` +
            `&mark-color=FFFFFF` + 
            `&mark-x=0` +
            `&mark-y=1300` + 
            `&mark-txt=${encouragementText}`;

        // 4. Redirect ទៅកាន់ Imgix URL
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
 * @description: មុខងារចាប់ផ្តើម Server (Non-blocking) និងភ្ជាប់ Database
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
