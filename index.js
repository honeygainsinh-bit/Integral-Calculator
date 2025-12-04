// =============================================================
// MATH QUIZ PRO - FULL CANVAS DESIGN (REQUIRES RENDER.YAML FIX)
// =============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg'); 

// ✅ 1. នាំយក Canvas មកប្រើ
const { registerFont, createCanvas, loadImage } = require('canvas');

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// ✅ 2. FONT REGISTRATION (SAFE BLOCK)
try {
    const fontPath = path.join(__dirname, 'public', 'Moul.ttf');
    registerFont(fontPath, { family: 'Moul' });
    console.log("✅ Font 'Moul' registered.");
} catch (e) {
    console.warn("⚠️ Font registration skipped.");
}

const MODEL_NAME = "gemini-2.5-flash"; 
let totalPlays = 0;           
const uniqueVisitors = new Set();
app.use((req, res, next) => { console.log(`[${new Date().toLocaleTimeString('en-US')}] 📡 ${req.method} ${req.path}`); next(); });

// DATABASE SETUP
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function initializeDatabase() {
    try {
        if (!process.env.DATABASE_URL) return;
        const client = await pool.connect();
        await client.query(`CREATE TABLE IF NOT EXISTS leaderboard (id SERIAL PRIMARY KEY, username VARCHAR(25) NOT NULL, score INTEGER NOT NULL, difficulty VARCHAR(15) NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);`);
        await client.query(`CREATE TABLE IF NOT EXISTS certificate_requests (id SERIAL PRIMARY KEY, username VARCHAR(50) NOT NULL, score INTEGER NOT NULL, status VARCHAR(20) DEFAULT 'Pending', request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);`);
        console.log("✅ Database tables ready.");
        client.release();
    } catch (err) { console.error("❌ Database Init Error:", err.message); }
}

// ... (Routes like /stats, /api/generate-problem, /leaderboard, /submit-request are the same) ...
const limiter = rateLimit({ windowMs: 8 * 60 * 60 * 1000, max: 10, message: { error: "Rate limit exceeded" }, keyGenerator: (req) => req.ip, skip: (req) => req.ip === process.env.OWNER_IP });
app.use(express.static(path.join(__dirname, 'public'))); 
app.get('/', (req, res) => { res.status(200).send(`Server is Online 🟢`); });
// ... (The rest of API routes are omitted for brevity, assuming you have them) ...

app.get('/admin/requests', async (req, res) => {
    // ... (Admin Panel HTML is the same) ...
});

// ==========================================
// 🎨 3. GENERATE CERTIFICATE (HIGH FIDELITY DESIGN)
// ==========================================
app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Not Found");
        const { username, score, request_date } = result.rows[0];
        const englishDate = new Date(request_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        // Canvas Setup (2000x1414)
        const width = 2000; 
        const height = 1414;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // ✅ BACKGROUND: SOLID WHITE
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        // ==========================================
        // TEXT RENDERING (USING ALL EFFECTS)
        // ==========================================
        ctx.textAlign = 'center';

        // Title
        ctx.font = '45px Arial, sans-serif'; 
        ctx.fillStyle = '#334155';
        ctx.fillText("This Certificate of Achievement is Proudly Presented to", width / 2, 450); 

        // Name (GOLD EFFECT)
        const gradient = ctx.createLinearGradient(width/2 - 250, 0, width/2 + 250, 0);
        gradient.addColorStop(0, "#854d0e");   
        gradient.addColorStop(0.5, "#fde047"); 
        gradient.addColorStop(1, "#854d0e");   
        
        ctx.shadowColor = "rgba(180, 83, 9, 0.6)"; 
        ctx.shadowBlur = 10;
        ctx.font = 'bold 150px Arial, sans-serif'; 
        ctx.fillStyle = gradient;
        ctx.fillText(username.toUpperCase(), width / 2, 650);
        
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;

        // Content
        ctx.font = '40px Arial, sans-serif';
        ctx.fillStyle = '#1e293b'; 
        ctx.fillText(`For outstanding achievement in the Math Quiz Pro challenge.`, width / 2, 780);

        // Score
        ctx.font = 'bold 50px Arial, sans-serif';
        ctx.fillStyle = '#b91c1c'; 
        ctx.fillText(`Final Score: ${score}`, width / 2, 870);

        // Body Lines
        ctx.fillStyle = '#1e293b'; 
        ctx.font = '35px Arial, sans-serif'; 
        const lineHeight = 65; 
        let startY = 1000;
        ctx.fillText("This recognition serves as evidence of the student's exceptional dedication,", width / 2, startY);
        ctx.fillText("perseverance, and solid fundamental knowledge acquired through rigorous practice.", width / 2, startY + lineHeight);
        
        // Wishing
        ctx.fillStyle = '#15803d'; 
        ctx.fillText("We wish you continued success in your academic journey and future endeavors.", width / 2, startY + (lineHeight * 2) + 15);

        // Date & Footer
        ctx.fillStyle = '#64748b'; 
        ctx.font = 'bold 30px Arial, sans-serif'; 
        ctx.fillText(`Issued on: ${englishDate}`, width / 2, 1280);

        ctx.font = 'bold 30px "Courier New", monospace';
        ctx.fillStyle = '#0369a1'; 
        
        ctx.beginPath();
        ctx.moveTo(width / 2 - 180, 1315);
        ctx.lineTo(width / 2 + 180, 1315);
        ctx.strokeStyle = '#94a3b8'; 
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillText("Website: braintest.fun", width / 2, 1360); 

        // Output
        const buffer = canvas.toBuffer('image/png');
        res.set('Content-Type', 'image/png');
        res.send(buffer);

    } catch (err) {
        // បើគាំង យើងត្រឡប់ទៅ HTML វិញ ដើម្បីកុំឱ្យ user ឃើញពណ៌ខ្មៅ
        console.error("Gen Cert Failed. Returning HTML fallback.", err);
        res.send(`<div style="font-size: 20px; color: red;">Error: Cannot generate high-fidelity image. Server dependency missing.</div>`);
    }
});

// START SERVER
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
    initializeDatabase();
});
