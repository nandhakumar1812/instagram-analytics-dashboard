const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;
const APIFY_ACTOR = process.env.APIFY_ACTOR || 'apify~instagram-profile-scraper';

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files if frontend directory exists
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        tokenConfigured: Boolean(process.env.APIFY_API_TOKEN),
        timestamp: new Date().toISOString()
    });
});

// Instagram profile analysis proxy endpoint
const handleAnalyze = async (req, res) => {
    const token = process.env.APIFY_API_TOKEN;
    if (!token) {
        return res.status(500).json({
            error: {
                message: 'Server Error: APIFY_API_TOKEN is not configured in backend/.env'
            }
        });
    }

    const { usernames, resultsLimit } = req.body || {};

    if (!usernames || (!Array.isArray(usernames) && typeof usernames !== 'string')) {
        return res.status(400).json({
            error: {
                message: 'Invalid request: "usernames" array is required.'
            }
        });
    }

    const unList = Array.isArray(usernames) ? usernames : [usernames];
    const cleanList = unList.map(u => String(u).trim().replace(/^@/, '')).filter(Boolean);

    if (!cleanList.length) {
        return res.status(400).json({
            error: {
                message: 'No valid usernames provided.'
            }
        });
    }

    const limit = Math.min(Math.max(parseInt(resultsLimit, 10) || 12, 1), 50);

    const apifyUrl = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;

    try {
        console.log(`[Proxy] Fetching profiles for: [${cleanList.join(', ')}], limit: ${limit}`);

        const response = await fetch(apifyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                usernames: cleanList,
                resultsLimit: limit
            }),
            signal: AbortSignal.timeout(120000)
        });

        if (!response.ok) {
            let errorDetail = `Apify returned HTTP ${response.status} (${response.statusText})`;
            try {
                const errJson = await response.json();
                if (errJson && errJson.error && errJson.error.message) {
                    errorDetail = errJson.error.message;
                }
            } catch {
                // If not JSON, use default status text
            }
            console.error(`[Apify Error] ${errorDetail}`);
            return res.status(response.status).json({
                error: { message: errorDetail }
            });
        }

        const datasetItems = await response.json();
        console.log(`[Proxy Success] Received ${Array.isArray(datasetItems) ? datasetItems.length : 0} items from Apify`);
        return res.json(datasetItems);

    } catch (err) {
        console.error('[Proxy Request Failed]:', err.message);
        if (err.name === 'TimeoutError' || err.name === 'AbortError') {
            return res.status(504).json({
                error: { message: 'The request to Apify timed out. Instagram took too long to respond.' }
            });
        }
        return res.status(500).json({
            error: { message: err.message || 'Internal Server Error while communicating with Apify.' }
        });
    }
};

// Route handlers for analysis (support both paths)
app.post('/api/instagram/analyze', handleAnalyze);
app.post('/api/scrape', handleAnalyze);

// Fallback to index.html for frontend routing if served via Express
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
        if (err) next();
    });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`===================================================`);
        console.log(`  Instagram Analytics Server running on port ${PORT}`);
        console.log(`  Dashboard URL: http://localhost:${PORT}`);
        console.log(`  Token configured: ${process.env.APIFY_API_TOKEN ? 'YES (Secure in .env)' : 'NO (Missing)'}`);
        console.log(`===================================================`);
    });
}

module.exports = app;
