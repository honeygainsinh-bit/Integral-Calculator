// =========================================================================
// ឯកសារកម្ម: MATH QUIZ PRO BACKEND SERVER (FINAL STABLE VERSION)
// ជំនួស AXIOS ដោយ Native FETCH (ដើម្បីដោះស្រាយ Dependency Install Error)
// =========================================================================

// --- 1. REQUIRE DEPENDENCIES (LIBRARY) ---
Require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg'); 
// 🚫 លុប require('axios') ចេញ

// ... (Your configuration and database setup remains the same) ...
// ... (Your API routes and Admin view remains the same) ...

// =========================================================================
// 7. EXTERNAL IMAGE GENERATION LOGIC (IMGIX VIA NATIVE FETCH)
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

        // 1. រៀបចំទិន្នន័យសម្រាប់ Imgix
        const dateObj = new Date();
        const formattedDate = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        
        const encodedUsername = encodeURIComponent(username.toUpperCase());
        const scoreText = encodeURIComponent(`Score: ${score}`);
        const dateText = encodeURIComponent(`Date Issued: ${formattedDate}`);
        
        const encouragementText = encodeURIComponent(`This distinguished certificate serves as an enduring testament to your exceptional intellectual acuity and unwavering dedication. May your scholarly pursuits reach new pinnacles. Presented by: braintest.fun`); 

        // 2. កំណត់ Base URL ពី Environment Variable (សំខាន់បំផុត)
        const EXTERNAL_API_ENDPOINT = process.env.EXTERNAL_IMAGE_API;
        if (!EXTERNAL_API_ENDPOINT) {
             console.error("❌ CRITICAL: EXTERNAL_IMAGE_API is missing.");
             return res.status(500).send("Error: EXTERNAL_IMAGE_API environment variable is not set.");
        }
        
        // 3. កសាង Full Dynamic Imgix URL
        // Note: The Imgix URL construction is the same, as the parameters are correct.
        const finalImgixUrl = EXTERNAL_API_ENDPOINT + 
            `&txt-align=center` + `&txt-size=100` + `&txt-color=FFD700` + `&txt=${encodedUsername}` +
            `&txt-fit=max` + `&w=2000` + `&h=1414` +
            `&mark-align=center` + `&mark-size=50` + `&mark-color=FF4500` + `&mark-x=0` + `&mark-y=850` + `&mark-txt=${scoreText}` +
            `&mark-align=center` + `&mark-size=35` + `&mark-color=CCCCCC` + `&mark-x=0` + `&mark-y=1150` + `&mark-txt=${dateText}` +
            `&mark-align=center` + `&mark-size=30` + `&mark-color=FFFFFF` + `&mark-x=0` + `&mark-y=1300` + `&mark-txt=${encouragementText}`;

        // 4. Redirect ទៅកាន់ Imgix URL (Fetch មិនត្រូវបានប្រើសម្រាប់ការ Redirect ទេ)
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

// ... (Your startServer function remains the same) ...
