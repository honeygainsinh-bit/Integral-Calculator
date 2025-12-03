import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import sqlite3 from 'sqlite3';
// ត្រូវប្រាកដថា package នេះត្រូវបានដំឡើងត្រឹមត្រូវក្នុង package.json
import { GoogleGenAI } from '@google/genai'; 

// --- ការកំណត់រចនាសម្ព័ន្ធមូលដ្ឋាន ---
const app = express();
// ប្រើ Port ពី Environment Variable (សម្រាប់ Render) ឬ 3000
const PORT = process.env.PORT || 3000; 

// Middleware
app.use(cors());
app.use(bodyParser.json());

// --- Database (SQLite) Setup ---
// បង្កើតឬភ្ជាប់ទៅ database
const db = new sqlite3.Database('./math_game.db', (err) => {
    if (err) {
        console.error('❌ Error opening database:', err.message);
    } else {
        console.log('✅ Connected to the SQLite database.');
        // បង្កើតតារាង scores ប្រសិនបើវាមិនទាន់មាន
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

// --- Gemini AI Setup ---
// ប្រើ Environment Variable ឈ្មោះ GEMINI_API_KEY
if (!process.env.GEMINI_API_KEY) {
    console.warn("⚠️ WARNING: GEMINI_API_KEY is not set. AI functionality will not work.");
}
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI(process.env.GEMINI_API_KEY) : null;
const model = "gemini-2.5-flash"; // ប្រើ model សម្រាប់ដំណើរការលឿន

// ===========================================
// --- Endpoints សម្រាប់ API ---
// ===========================================

// --- 1. Endpoint សម្រាប់បង្កើតសំណួរគណិតវិទ្យា (AI) ---
app.post('/api/generate-question', async (req, res) => {
    if (!ai) {
        // បើគ្មាន Key គឺមិនអាចដំណើរការ AI បានទេ
        return res.status(503).json({ success: false, message: "AI service unavailable. GEMINI_API_KEY not set on server." });
    }

    const { difficulty, type } = req.body; 
    
    // Prompt ដើម្បីបង្ខំឱ្យ AI បញ្ចេញ JSON ខ្មែរ
    const prompt = `Generate a single ${type} math question suitable for ${difficulty} level, specifically designed for a quiz game. 
    The question must be in Cambodian language (Khmer).
    The response MUST be a pure JSON object in this format: 
    { "question": "The question text here in Khmer.", "answer": "The correct answer as a number or simple text." }
    Do not include any extra text, comments, or formatting outside the JSON object.`;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                // ប្រើ responseMimeType ដើម្បីបង្ខំឱ្យ AI បញ្ចេញ JSON
                responseMimeType: "application/json",
            }
        });

        const jsonText = response.text.trim();
        const data = JSON.parse(jsonText);
        
        res.json({ success: true, question: data.question, answer: data.answer });

    } catch (error) {
        console.error("❌ Gemini API Error:", error);
        res.status(500).json({ success: false, message: "Failed to generate question from AI.", details: error.message });
    }
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
    // SQL Query ថ្មីដែលប្រើ SUM() និង GROUP BY ដើម្បីសរុបពិន្ទុឈ្មោះដូចគ្នា
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
        
        // ប្រើ total_score ដែលបាន SUM សម្រាប់ Leaderboard
        const leaderboard = rows.map(row => ({
            username: row.username,
            // ប្តូរឈ្មោះពី total_score ត្រឡប់ទៅ score វិញសម្រាប់ Client 
            score: row.total_score 
        }));
        
        res.json(leaderboard);
    });
});


// --- Start Server ---
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
