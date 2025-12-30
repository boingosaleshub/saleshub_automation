# Boingo Playwright Automation

Express.js backend service for browser automation tasks. Currently supports Ookla Cell Analytics screenshot capture.

## 🚀 Quick Start (Local Development)

```bash
# Install dependencies
npm install

# Install Chromium browser
npx playwright install chromium

# Start server
npm start
```

Server runs on `http://localhost:3001`

## 📡 API Endpoints

### Health Check
```
GET /health
```

### Ookla Cell Analytics Automation
```
POST /api/automate
Content-Type: application/json

{
  "address": "123 Main St, New York, NY",
  "carriers": ["AT&T", "Verizon", "T-Mobile"],
  "coverageTypes": ["Indoor", "Outdoor", "Indoor & Outdoor"]
}
```

**Response:**
```json
{
  "success": true,
  "screenshots": [
    {
      "filename": "ookla_INDOOR_123_Main_St_2024-12-30.png",
      "buffer": "base64-encoded-image-data..."
    }
  ]
}
```

## 🐳 Docker

```bash
docker build -t playwright-automation .
docker run -p 3001:3001 -e FRONTEND_URL=http://localhost:3000 playwright-automation
```

## ☁️ Deploy to Render

1. Push this repo to GitHub
2. On Render: New → Web Service
3. Connect GitHub repo
4. Environment: **Docker**
5. Add env variable: `FRONTEND_URL=https://your-vercel-app.vercel.app`

## 📁 Project Structure

```
playwright-automation/
├── server.js      # Express server + Playwright automation
├── package.json   # Dependencies
├── Dockerfile     # Docker config (uses Playwright image)
├── render.yaml    # Render deployment config
└── README.md      # This file
```

## 🔧 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3001 |
| `FRONTEND_URL` | Allowed CORS origin | http://localhost:3000 |

## 📄 License

UNLICENSED - Boingo Wireless Internal Use Only
