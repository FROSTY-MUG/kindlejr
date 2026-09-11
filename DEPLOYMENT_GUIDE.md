# Production Deployment Guide: Kindle Jr 5.0 Platform

Complete guide to deploy the **Kindle Jr 5.0 Assessment Platform** on **Railway** (Backend) and **Vercel** (Frontend).

---

## Environment Variable Checklist

| Platform | Variable | Value Example |
|---|---|---|
| **Railway** | `FIREBASE_PROJECT_ID` | `kindle-jr-5-prod` |
| **Railway** | `GOOGLE_SHEETS_CREDENTIALS_BASE64` | `eyJ0eXBlIjoic2Vyd...` |
| **Railway** | `GOOGLE_SHEET_ID` | `1BxiMVs0XRA5nFMdKvB...` |
| **Vercel** | `NEXT_PUBLIC_API_URL` | `https://<service>.up.railway.app/api` |

---

## Step 1: Push Code to GitHub

Run the following terminal commands from the root directory (`c:\Users\Aryan\Desktop\Kindle jr`):

```bash
git init
git add .
git commit -m "feat: kindle jr 5.0 production release with 3D canvas and railway backend"
git branch -M main
git remote add origin https://github.com/<your-username>/kindle-jr-5.git
git push -u origin main
```

---

## Step 2: Deploy Go Backend on Railway

1. Go to **Railway Dashboard** → **New Project** → **Deploy from GitHub repo**.
2. Select your `kindle-jr-5` repository.
3. In the project settings, navigate to **General** → set **Root Directory** to `/backend`.
4. Go to **Variables** and inject the production keys:
   - `FIREBASE_PROJECT_ID`: `your-firebase-project-id`
   - `GOOGLE_SHEETS_CREDENTIALS_BASE64`: `eyJ0eXBlIjoic2Vyd...`
   - `GOOGLE_SHEET_ID`: `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms`
5. Go to **Settings** → **Networking** → Click **Generate Domain** (e.g., `kindle-backend.up.railway.app`).
6. Save the generated domain for the frontend setup.

---

## Step 3: Deploy Next.js Frontend on Vercel

1. Go to **Vercel Dashboard** → **Add New** → **Project** → Import `kindle-jr-5`.
2. Set **Root Directory** to `frontend`.
3. In **Environment Variables**, add:
   - `NEXT_PUBLIC_API_URL`: `https://kindle-backend.up.railway.app/api`
4. Click **Deploy**.
