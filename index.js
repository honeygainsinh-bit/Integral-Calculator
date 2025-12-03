import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import sqlite3 from 'sqlite3';
// 💥 មុខងារ AI ត្រូវបានដកចេញ ដើម្បីដោះស្រាយបញ្ហា Build Failed
// import { GoogleGenAI } from '@google/genai'; 

// --- ការកំណត់រចនាសម្ព័ន្ធមូលដ្ឋាន ---
const app = express();
const PORT = process.env.PORT || 3000; 

// Middleware
app.use(cors());
app.use(bodyParser.json());

// --- Database (SQLite) Setup ---
const db = new sqlite3.Database('./math_game.db', (err) => {
    if (err) {
        console.error('❌ Error opening database:', err.message);
    } else {
        console.log('✅ Connected to the SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            score INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error("❌ Error creating table:", err.message);
            } else {
                console.log("✅ Scores table ready.");
            }
        });
    }
});

// ===========================================
// --- Endpoints សម្រាប់ API ---
// ===========================================

// --- 1. Endpoint សម្រាប់បង្កើតសំណួរគណិតវិទ្យា (ជំនួសដោយ Hardcoded Response) ---
// 💥 Endpoint នេះត្រូវបានកែប្រែដើម្បីឆ្លើយតបថា AI ត្រូវបានបិទ
app.post('/api/generate-question', (req, res) => {
    // ឆ្លើយតបទៅ Client ថា AI ត្រូវបានបិទបណ្តោះអាសន្ន
    return res.status(503).json({ 
        success: false, 
        message: "AI question generation is temporarily disabled due to server dependency issues." 
    });
});

// --- 2. Endpoint សម្រាប់រក្សាទុកពិន្ទុថ្មី ---
app.post('/api/scores', (req, res) => {
    const { username, score } = req.body;

    if (!username || typeof score !== 'number' || score < 0) {
        return res.status(400).json({ success: false, message: "Invalid username or score." });
    }
    
    const safeUsername = username.trim(); 

    const sql = `INSERT INTO scores (username, score) VALUES (?, ?)`;
    db.run(sql, [safeUsername, score], function(err) {
        if (err) {
            console.error("❌ Database Error:", err.message);
            return res.status(500).json({ success: false, message: "Failed to save score." });
        }
        console.log(`✅ A score of ${score} was added for user: ${safeUsername}`);
        res.json({ success: true, message: "Score saved successfully.", id: this.lastID });
    });
});

// --- 3. Endpoint សម្រាប់ទាញយក Leaderboard (សរុបពិន្ទុតាមឈ្មោះ) ---
app.get('/api/leaderboard/top', (req, res) => {
    // SQL Query សម្រាប់សរុបពិន្ទុឈ្មោះដូចគ្នា
    const sql = `
        SELECT 
            username, 
            SUM(score) as total_score 
        FROM 
            scores 
        GROUP BY 
            username 
        ORDER BY 
            total_score DESC 
        LIMIT 10
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error("❌ Database Error:", err.message);
            return res.status(500).json({ success: false, message: "Database query failed." });
        }
        
        const leaderboard = rows.map(row => ({
            username: row.username,
            score: row.total_score 
        }));
        
        res.json(leaderboard);
    });
});


// --- Start Server ---
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
