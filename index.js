/**
 * ==========================================
 *  BRAINTEST MATH QUIZ - PRO SERVER
 *  Updated: Standard English Certificate & Font Fix
 * ==========================================
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg'); 
const { registerFont, createCanvas, loadImage } = require('canvas');
const fs = require('fs'); 

const app = express();
const port = process.env.PORT || 3000;

// ==========================================
// 1. CONFIGURATION & FONT LOADING (FIXED)
// ==========================================

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 👇 FONT SYSTEM: ដោះស្រាយបញ្ហាអក្សរតូច
let fontFamily = 'Arial'; // Default fallback (ធានាថាអក្សរមិនតូច)
const customFontName = 'CertificateFont';
const fontPath = path.join(__dirname, 'public', 'font.ttf');

try {
    if (fs.existsSync(fontPath)) {
        registerFont(fontPath, { family: customFontName });
        fontFamily = customFontName; // បើមាន file ត្រឹមត្រូវ ប្រើ Font នេះ
        console.log(`✅ FONT SYSTEM: Loaded custom font from ${fontPath}`);
    } else {
        console.warn(`⚠️ FONT SYSTEM: Could not find 'font.ttf'. Using System Arial.`);
    }
} catch (error) {
    console.error("⚠️ FONT ERROR:", error.message);
}

// 🤖 AI CONFIGURATION
const MODEL_NAME = "gemini-2.0-flash"; // Or gemini-1.5-flash
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 📊 VARIABLES
let totalPlays = 0;           

// ==========================================
// 2. DATABASE CONNECTION
// ==========================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initializeDatabase() {
    try {
        const client = await pool.connect();
        // Table for Leaderboard
        await client.query(`
            CREATE TABLE IF NOT EXISTS leaderboard (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                score INTEGER NOT NULL,
                difficulty VARCHAR(20) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // Table for Certificate Requests
        await client.query(`
            CREATE TABLE IF NOT EXISTS certificate_requests (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                score INTEGER NOT NULL,
                status VARCHAR(20) DEFAULT 'Pending',
                request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ DATABASE: Connected & Tables Verified.");
        client.release();
    } catch (err) {
        console.error("❌ DATABASE ERROR:", err.message);
    }
}

// ==========================================
// 3. ROUTES & API
// ==========================================

// 🏠 Home
app.get('/', (req, res) => {
    res.send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px; background: #111; color: #fff;">
            <h1>🚀 BrainTest Backend Online</h1>
            <p>Font System Status: <strong>${fontFamily === customFontName ? "Custom Font Active" : "Using Fallback Arial"}</strong></p>
            <a href="/admin/requests" style="color: #4ade80;">Go to Admin Panel</a>
        </div>
    `);
});

// 🤖 Generate Problem
const limiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, 
    max: 20, 
    message: { error: "Limit exceeded" } 
});

app.post('/api/generate-problem', limiter, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "No prompt" });
        
        totalPlays++;
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent(prompt);
        res.json({ text: result.response.text() });
    } catch (error) {
        res.status(500).json({ error: "AI Error" });
    }
});

// 🏆 Leaderboard & Requests
app.post('/api/leaderboard/submit', async (req, res) => { /* ... Skip for brevity, same as before ... */ });
app.get('/api/leaderboard/top', async (req, res) => { /* ... Skip for brevity, same as before ... */ });

// 📩 Submit Certificate Request
app.post('/api/submit-request', async (req, res) => {
    const { username, score } = req.body;
    if (!username || !score) return res.status(400).json({ success: false });

    try {
        const client = await pool.connect();
        await client.query(
            'INSERT INTO certificate_requests (username, score, request_date) VALUES ($1, $2, NOW())', 
            [username, score]
        );
        client.release();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 👮‍♂️ Admin Panel
app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
        client.release();
        
        let rows = result.rows.map(row => `
            <tr>
                <td style="padding:10px; border-bottom:1px solid #ddd;">${row.username}</td>
                <td style="padding:10px; border-bottom:1px solid #ddd; font-weight:bold; color:${row.score>500?'green':'red'}">${row.score}</td>
                <td style="padding:10px; border-bottom:1px solid #ddd;">
                    <a href="/admin/generate-cert/${row.id}" target="_blank" style="background:#2563eb; color:white; padding:5px 10px; text-decoration:none; border-radius:4px;">🖨️ Print</a>
                </td>
            </tr>
        `).join('');

        res.send(`
            <html><body style="font-family:sans-serif; padding:40px; max-width:800px; margin:0 auto;">
                <h1>Certificate Requests</h1>
                <table style="width:100%; border-collapse:collapse;">
                    <tr style="background:#f3f4f6; text-align:left;"><th>Name</th><th>Score</th><th>Action</th></tr>
                    ${rows}
                </table>
            </body></html>
        `);
    } catch (err) { res.send("Error: " + err.message); }
});

// ==========================================
// 4. CERTIFICATE GENERATOR (PROFESSIONAL ENGLISH)
// ==========================================
app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Not Found");

        const { username, score, request_date } = result.rows[0];
        const dateStr = new Date(request_date).toLocaleDateString('en-US', { 
            year: 'numeric', month: 'long', day: 'numeric' 
        });

        // 🎨 Canvas Setup
        const width = 2000; 
        const height = 1414;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Background
        try {
            const image = await loadImage(path.join(__dirname, 'public', 'certificate-template.png'));
            ctx.drawImage(image, 0, 0, width, height);
        } catch (e) {
            ctx.fillStyle = '#111827'; // Dark fallback
            ctx.fillRect(0,0, width, height);
        }

        ctx.textAlign = 'center';

        // ----------------------------------------------------
        // ✍️ TEXT CONTENT (STANDARD ENGLISH & PRAISING)
        // ----------------------------------------------------

        // 1. MAIN TITLE
        ctx.fillStyle = '#FFFFFF'; 
        ctx.font = `bold 110px "${fontFamily}"`; 
        ctx.fillText("CERTIFICATE", width / 2, 320);

        ctx.fillStyle = '#FACC15'; // Gold
        ctx.font = `bold 40px "${fontFamily}"`; 
        ctx.letterSpacing = "10px";
        ctx.fillText("OF EXCELLENCE", width / 2, 390);
        ctx.letterSpacing = "0px";

        // 2. PRESENTATION LINE
        ctx.fillStyle = '#CBD5E1'; // Light Grey
        ctx.font = `italic 35px "${fontFamily}"`; 
        ctx.fillText("This prestigious award is proudly presented to", width / 2, 520);

        // 3. RECIPIENT NAME (Gradient Gold)
        ctx.save();
        const gradient = ctx.createLinearGradient(width/2 - 400, 0, width/2 + 400, 0);
        gradient.addColorStop(0, "#CA8A04");
        gradient.addColorStop(0.5, "#FEF9C3"); // Bright center
        gradient.addColorStop(1, "#CA8A04");
        ctx.fillStyle = gradient;
        
        ctx.shadowColor = "rgba(250, 204, 21, 0.6)";
        ctx.shadowBlur = 25;
        
        // Auto-resize name if too long
        let nameFontSize = 150;
        if (username.length > 15) nameFontSize = 100;
        ctx.font = `bold ${nameFontSize}px "${fontFamily}"`; 
        
        ctx.fillText(username.toUpperCase(), width / 2, 680);
        ctx.restore();

        // Underline
        ctx.beginPath();
        ctx.moveTo(width/2 - 300, 720);
        ctx.lineTo(width/2 + 300, 720);
        ctx.strokeStyle = '#FACC15';
        ctx.lineWidth = 3;
        ctx.stroke();

        // 4. PRAISING BODY TEXT (Standard Professional English)
        ctx.fillStyle = '#E2E8F0'; // Off-white
        ctx.font = `40px "${fontFamily}"`;
        
        // Line 1
        ctx.fillText("For demonstrating outstanding mathematical acuity and", width / 2, 850);
        // Line 2
        ctx.fillText("unwavering dedication. Your exceptional performance in the", width / 2, 910);
        // Line 3
        ctx.fillText("Advanced Mathematics Challenge stands as a testament", width / 2, 970);
        // Line 4
        ctx.fillText("to your intellectual prowess and commitment to excellence.", width / 2, 1030);

        // 5. SCORE DISPLAY
        ctx.fillStyle = '#F87171'; // Light Red/Pink
        ctx.font = `bold 55px "${fontFamily}"`;
        ctx.fillText(`ACHIEVEMENT SCORE: ${score}`, width / 2, 1160);

        // 6. FOOTER
        const footerY = 1300;
        ctx.fillStyle = '#FFFFFF';
        
        // Left: Admin
        ctx.font = `bold 30px "${fontFamily}"`;
        ctx.fillText("CHHEANG SINHSINH", 500, footerY);
        ctx.fillStyle = '#94A3B8';
        ctx.font = `italic 24px "${fontFamily}"`;
        ctx.fillText("Founder & Administrator", 500, footerY + 40);

        // Center: Date
        ctx.fillStyle = '#CBD5E1';
        ctx.font = `30px "${fontFamily}"`;
        ctx.fillText(dateStr, width / 2, footerY + 20);

        // Right: Verification
        ctx.fillStyle = '#60A5FA'; // Blue
        ctx.font = `bold 30px "${fontFamily}"`;
        ctx.fillText("braintest.fun", 1500, footerY);
        ctx.fillStyle = '#94A3B8';
        ctx.font = `italic 24px "${fontFamily}"`;
        ctx.fillText("Official Verification", 1500, footerY + 40);

        // Final Output
        const buffer = canvas.toBuffer('image/png');
        res.set('Content-Type', 'image/png');
        res.send(buffer);

    } catch (err) {
        console.error("CERT ERROR:", err);
        res.status(500).send("Error generating certificate");
    }
});

// Start Server
async function startServer() {
    if (!process.env.DATABASE_URL) {
        console.error("🛑 DATABASE_URL missing");
        process.exit(1);
    }
    await initializeDatabase();
    app.listen(port, () => {
        console.log(`🚀 Server running on port ${port}`);
        console.log(`📂 Font System: ${fontFamily}`);
    });
}

startServer();
