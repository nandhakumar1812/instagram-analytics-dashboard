
# 📊 Instagram Analytics Dashboard (Live Apify Scraper)

A secure, modern, full-stack Instagram analytics dashboard with deterministic AI-style analytics, engagement scoring, profile comparison, format mix breakdown, and live data scraping powered by Apify.

---

## 📁 Project Architecture

```
Instagram Analytics Dashboard
│
├── frontend/
│   ├── index.html        # Clean, modern UI (Bootstrap 5, Chart.js)
│   ├── style.css         # Dark/Light theme styles, badges & animations
│   └── script.js         # Client analytics engine (NO API keys exposed)
│
├── backend/
│   ├── server.js         # Express proxy server (handles Apify API calls)
│   ├── package.json      # Backend dependencies (express, cors, dotenv)
│   ├── .env.example      # Safe template for environment variables
│   └── .env              # Secrets file (ignored by Git)
│
├── .gitignore            # Protects .env & node_modules from Git
└── README.md             # Documentation & deployment guide
```

---

## 🔒 Security Best Practices

- **Zero Client-Side Secrets**: Your `APIFY_API_TOKEN` is stored exclusively on the server in `backend/.env` (and environment variables in production).
- **Protected by `.gitignore`**: Git will never track or upload `.env` to GitHub.
- **CORS-Enabled API**: The Express server exposes `/api/instagram/analyze` with full CORS support.

---

## 🚀 Local Development Setup

### 1. Configure the Environment
In `backend/`, copy `.env.example` to `.env` if you haven't already:
```bash
cd backend
cp .env.example .env
```
Open `backend/.env` and add your real Apify token:
```env
APIFY_API_TOKEN=your_real_apify_token_here
PORT=5000
```

### 2. Install Dependencies & Start the Server
```bash
cd backend
npm install
npm start
```
The server will start at:
👉 **`http://localhost:5000`**

Open `http://localhost:5000` in your web browser. You can enter any public Instagram username (e.g., `cristiano` or `leomessi`) and view live metrics and analysis!

---

## 🌐 Deployment Guide

### Option 1: Vercel Deployment (Recommended — Instant & Zero Sleep)
The project includes `vercel.json` and a serverless entrypoint in `api/index.js`. Vercel automatically deploys the frontend and the Express API in a single project.

1. Go to **[vercel.com](https://vercel.com/)** and sign in with GitHub.
2. Click **Add New…** → **Project**.
3. Select your repository: **`nandhakumar1812/instagram-analytics-dashboard`**.
4. Leave all build settings at default (root directory `/`).
5. Under **Environment Variables**:
   - **Key**: `APIFY_API_TOKEN`
   - **Value**: `[Your Real Apify API Token]`
6. Click **Deploy**.
7. Vercel provides a live URL (e.g., `https://instagram-analytics-dashboard.vercel.app`) with zero cold starts!

---

### Option 2: Render.com / Railway Deployment
1. Go to **[Render.com](https://render.com/)** and click **New +** → **Web Service**.
2. Select your repository: `instagram-analytics-dashboard`.
3. Set **Root Directory** to `backend`.
4. Add environment variable `APIFY_API_TOKEN`.
5. Click **Deploy Web Service**.

---

### Option 2: Split Deployment (Frontend on Vercel / Netlify + Backend on Render)
If you deploy your frontend separately from the backend:
1. Deploy `backend` to Render or Railway with the `APIFY_API_TOKEN` environment variable.
2. In `frontend/index.html`, configure your deployed backend URL by adding this script before `script.js`:
   ```html
   <script>
     window.BACKEND_API_URL = "https://your-backend.onrender.com";
   </script>
   ```
3. Deploy the `frontend/` folder to Vercel or Netlify.

---

## 🛠️ Git & GitHub Publishing Instructions

To ensure no previous secrets remain in Git history:

1. In PowerShell, check your status:
   ```powershell
   git status
   ```
   *(Ensure `backend/.env` is NOT listed under files to be committed)*

2. If you need a completely fresh Git history without old commits:
   ```powershell
   Remove-Item -Recurse -Force .git
   git init
   git branch -M main
   git add .
   git commit -m "Initial secure Instagram analytics dashboard"
   git remote add origin https://github.com/nandhakumar1812/instagram-analytics-dashboard.git
   git push -u origin main --force
   ```

---

## 📄 License
ISC
