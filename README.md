<div align="center">
  <br/>
  <h1>🤖 HG-TeleFlare</h1>
  <h3><em>The Zero-Config, Self-Bootstrapping Telegram Bot Builder for Cloudflare Workers</em></h3>
  <br/>
  <p align="center">
    <a href="#-features"><strong>✨ Features</strong></a> ·
    <a href="#-quick-start-deploy-in-60-seconds"><strong>🚀 Quick Start</strong></a> ·
    <a href="#-full-deployment-guide-step-by-step"><strong>📖 Full Guide</strong></a> ·
    <a href="#-architecture"><strong>🏗️ Architecture</strong></a> ·
    <a href="#-security"><strong>🔒 Security</strong></a> ·
    <a href="#-api-reference"><strong>📖 API</strong></a>
  </p>
  <br/>

  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![Version](https://img.shields.io/badge/Version-1.0.0-success.svg)]()
  [![Powered by Cloudflare](https://img.shields.io/badge/Powered_by-Cloudflare_Workers-F6821F?logo=cloudflare)](https://workers.cloudflare.com/)
  [![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?logo=javascript&logoColor=black)]()
  [![Deploy](https://img.shields.io/badge/Deploy-Cloudflare-380D4F?logo=cloudflare)](https://dash.cloudflare.com/)
  [![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen)]()
  [![Made with ❤️](https://img.shields.io/badge/Made_with-❤️-red)]()

  <br/>

  **HG-TeleFlare** is a complete, self-contained **micro-SaaS in a single file**. Deploy it on Cloudflare Workers, paste your API token once, and it automatically provisions its own infrastructure — D1 database, KV storage, and dynamic bot workers — all through a beautiful visual dashboard. Build, manage, and deploy Telegram bots **without writing any code**.

  <br/>
</div>

---

## 📋 Table of Contents

- [✨ Features](#-features)
- [🔮 Coming Features (برنامه‌های آینده)](#-coming-features-برنامه‌های-آینده)
- [🚀 Quick Start (Deploy in 60 Seconds)](#-quick-start-deploy-in-60-seconds)
- [📖 Full Deployment Guide (Step-by-Step)](#-full-deployment-guide-step-by-step)
  - [Step 1: Sign Up / Log Into Cloudflare](#step-1-sign-up--log-into-cloudflare)
  - [Step 2: Create a Cloudflare Worker](#step-2-create-a-cloudflare-worker)
  - [Step 3: Open the Worker Editor](#step-3-open-the-worker-editor)
  - [Step 4: Copy the Code from worker.js](#step-4-copy-the-code-from-workerjs)
  - [Step 5: Paste the Code into the Cloudflare Editor](#step-5-paste-the-code-into-the-cloudflare-editor)
  - [Step 6: Save and Deploy](#step-6-save-and-deploy)
  - [Step 7: Create a Cloudflare API Token](#step-7-create-a-cloudflare-api-token)
  - [Step 8: Complete the Setup Wizard](#step-8-complete-the-setup-wizard)
  - [Step 9: Register Your Admin Account](#step-9-register-your-admin-account)
  - [Step 10: Start Building Bots!](#step-10-start-building-bots)
- [📸 Screenshots](#-screenshots)
- [🏗️ Architecture](#️-architecture)
- [📖 API Reference](#-api-reference)
- [🔒 Security](#-security)
- [⚠️ Known Limitations](#️-known-limitations)
- [🌐 Bilingual Support (English / فارسی)](#-bilingual-support-english--فارسی)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)
- [📬 Contact](#-contact)

---

## ✨ Features

| Feature | Description |
|---|---|
| **🤖 Zero-Config Self-Bootstrapping** | Paste a Cloudflare API token, and HG-TeleFlare automatically creates its own **D1 Database** & **KV Storage**, runs schema migrations, and saves the config — no CLI, no manual setup. |
| **🎨 Visual Rule Builder** | Create bots using an intuitive drag-and-drop UI. Map **Triggers** (Commands, Messages, Callbacks, New Members) to **Actions** (Send Message, Send Photo, Show Keyboards, Fetch APIs, Store Data). |
| **⚡ Dynamic Worker Generation** | Click **"Deploy"** and HG-TeleFlare translates your visual rules into optimized, pure-JavaScript code, provisions a child Cloudflare Worker, and sets up the Telegram webhook — **instantly**. |
| **📁 Built-in Media Storage** | Upload images and documents directly in the dashboard. Media is stored securely in Cloudflare KV (up to 15MB per file) and served via a built-in proxy. |
| **🔤 Dynamic Variables** | Personalize bot responses with `{first_name}`, `{username}`, `{last_name}`, `{message}`, and `{chat_id}`. |
| **📊 Real-Time Log Viewer** | A built-in terminal-style UI to monitor your bot's activity, filter by log level (DEBUG / INFO / WARNING / ERROR), and clear logs on demand. |
| **📦 Single-File Deployment** | The entire application — router, API client, dashboard UI, code generator — fits in one `worker.js` file. No build step, no npm dependencies at runtime. |
| **🔄 Rule Reordering** | Drag and drop to reorder rules. Priority is automatically managed. |
| **📋 Rule Duplication** | Clone existing rules to speed up bot configuration. |
| **🔐 JWT Authentication** | Secure admin dashboard with JWT-based auth. First registration automatically creates the admin account. |
| **🌐 Bilingual Meta Tags** | Built-in SEO support for both **English** and **Persian (Farsi)** languages. |

---

## 🔮 Coming Features (برنامه‌های آینده)

> 🌟 **Full Persian (Farsi) Dashboard UI — Coming in the Next Version!**
>
> We're working hard to bring you a **fully translated Persian dashboard** so Iranian developers can use HG-TeleFlare entirely in their native language. Stay tuned! ❤️

Here's what we're planning for upcoming releases:

| Feature | Status |
|---|---|
| **🇮🇷 Full Persian Dashboard UI** — Complete RTL interface with Persian translations for every button, form, and page | 🔜 Next Version |
| **📱 Telegram Mini App Support** — Turn your bots into Telegram Mini Apps | 📋 Planned |
| **🧩 Webhook Integrations** — Connect external services like Google Sheets, Zapier, and more | 📋 Planned |
| **📦 Pre-built Bot Templates** — One-click deploy bots for common use cases (polling, e-commerce, support) | 📋 Planned |
| **📊 Advanced Analytics** — Detailed bot usage stats, user counts, and message trends | 📋 Planned |
| **🌍 Multi-language Bot Responses** — Bots that auto-detect user language and respond accordingly | 📋 Planned |

---

## 🚀 Quick Start (Deploy in 60 Seconds)

HG-TeleFlare requires **no** `npm install`, **no** Wrangler CLI, and **no** local environment. Everything runs on Cloudflare's edge.

### Step 1: Create a Cloudflare Worker

1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Workers & Pages** → **Create application** → **Create Worker**.
3. Give it a name (e.g., `bot-builder-dashboard`).
4. Click **"Edit Code"**.

### Step 2: Paste the Code

1. Open [`worker.js`](./worker.js) from this repository.
2. Select all content and copy it (`Ctrl+A` → `Ctrl+C`).
3. In the Cloudflare editor, select all (`Ctrl+A`) and paste (`Ctrl+V`).
4. Click **"Save and Deploy"**.

### Step 3: Complete the Setup Wizard

1. Visit your Worker's URL (e.g., `https://bot-builder-dashboard.your-subdomain.workers.dev`).
2. The **self-bootstrapping wizard** will guide you through:
   - Creating a Cloudflare API Token (needs `workers`, `d1`, `kv_storage` permissions).
   - Selecting your Cloudflare Account.
   - Automatically provisioning D1 database & KV namespace.
3. Register your **admin account** (first registration is the admin).
4. 🎉 **Done!** Start building bots.

> **v1.0 note:** This release is **paste-and-deploy only**. There is no `package.json`, Wrangler project, or local CLI workflow in this repository. Edit `worker.js` and redeploy from the Cloudflare dashboard.

---

## 📖 Full Deployment Guide (Step-by-Step)

This guide walks you through every single step — from creating a Cloudflare account to deploying your first bot. Follow along even if you've never used Cloudflare before.

---

### Step 1: Sign Up / Log Into Cloudflare

1. Open your browser and go to **[https://dash.cloudflare.com/](https://dash.cloudflare.com/)**.

2. **If you already have an account:** Enter your email and password, then click **"Sign In"**.

3. **If you're new to Cloudflare:**
   - Click **"Create Account"** or **"Sign Up"**.
   - Enter your **email address** and create a **password**.
   - Verify your email by clicking the link sent to your inbox.
   - Complete the onboarding wizard (you can skip adding a domain — we just need Workers).
   - Select the **"Free"** plan — it includes **100,000 Worker requests per day**, which is more than enough.

4. Once logged in, you'll land on the **Cloudflare Dashboard** — this is your control center.

---

### Step 2: Create a Cloudflare Worker

From the dashboard:

1. In the left sidebar, click **"Workers & Pages"**.

2. Click the **"Create application"** button (blue button, top-right).

3. On the next screen, you'll see two options:
   - **"Workers"** — serverless functions (select this).
   - **"Pages"** — full static sites (not this).
   
   Click **"Create Worker"** under the Workers section.

4. You'll now see the **"Create Worker"** form:
   - **Name:** Enter a name for your worker, e.g., `bot-builder-dashboard`.  
     ⚠️ This name becomes part of your URL: `https://bot-builder-dashboard.your-subdomain.workers.dev`.  
     Choose something memorable but unique.
   - Leave the **"HTTP handler"** template selected (it's the default).
   - Click **"Deploy"**.

5. After a few seconds, you'll see a success message: **"Success! Your script is deployed."**

6. Click the **"Edit code"** button to open the built-in code editor.

---

### Step 3: Open the Worker Editor

The Cloudflare **Workers Editor** is a fully online code editor. You'll see:

- A **file tree** on the left showing `worker.js` (the default template).
- A **code editor** in the center with the default template code already loaded.
- A **preview / console** panel at the bottom.
- A **"Save and Deploy"** button at the top.

📝 **Note:** The editor already created a default `worker.js` with a simple "Hello World" script. We're about to replace it with HG-TeleFlare.

---

### Step 4: Copy the Code from worker.js

Now open the `worker.js` file from this repository:

**Option A — Direct download (recommended):**
1. Go to [worker.js on GitHub](https://raw.githubusercontent.com/Hamed-Gharghi/Cloudflare-Telegram-bot-builder/main/worker.js).
2. Right-click → **"Save as..."** to save it to your computer.
3. Open the saved file in any text editor (Notepad, VS Code, etc.).
4. Press `Ctrl+A` (Select All) then `Ctrl+C` (Copy).

**Option B — From your cloned repo:**
```bash
# If you've cloned this repo locally:
cd Cloudflare-Telegram-bot-builder
# Open worker.js in your code editor and copy all content
```

**Option C — Direct copy from this page:**
Scroll up, find the `worker.js` file content, select all, and copy it.

**Option D — Upload directly via Cloudflare editor:**
In the Cloudflare Workers editor, look for the file tree on the left side. Click the **upload icon** (or right-click → **Upload file**) and select the `worker.js` file you downloaded. This replaces the default `worker.js` with our file automatically.

---

### Step 5: Paste or Upload the Code into the Cloudflare Editor

**Option A — Paste (if you copied the text):**
1. Click anywhere inside the code editor.
2. **Select all existing code:** Press `Ctrl+A` (or `Cmd+A` on Mac).
3. **Delete the old code:** Press `Delete` or `Backspace`.
4. **Paste the new code:** Press `Ctrl+V` (or `Cmd+V` on Mac).
5. The editor now contains the full HG-TeleFlare application.

**Option B — Upload (if you saved worker.js to your computer):**
1. In the file tree panel on the left side of the Cloudflare editor, look for the current `worker.js` file.
2. Delete or rename the default `worker.js` (right-click → **Delete** or **Rename**).
3. Click the **Upload** button (usually a cloud icon or a `+` icon) in the file tree.
4. Select your downloaded `worker.js` file from your computer.
5. The file will appear in the file tree with the full HG-TeleFlare code loaded.

**Either way**, you'll see the full application loaded. You should see the file size indicator — it's a single file, no external dependencies needed.

---

### Step 6: Save and Deploy

1. Click the **"Save and Deploy"** button at the top of the editor.

2. Wait for the deployment to complete (usually 5–10 seconds). You'll see:
   ```
   🚀 Deployment complete!
   Your worker has been deployed at:
   https://bot-builder-dashboard.your-subdomain.workers.dev
   ```

3. **Visit your worker URL** — click the link or open a new tab and navigate to it.

4. You should see the **HG-TeleFlare Setup Wizard** page. If you see an error, refresh the page after 30 seconds (new deployments propagate across Cloudflare's edge).

---

### Step 7: Create a Cloudflare API Token

The setup wizard needs a Cloudflare API Token with permissions to create D1 databases, KV namespaces, and Workers. Here's how to create one:

1. **Open a new tab** and go to **[https://dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)**.

2. Click **"Create Token"** (blue button).

3. Under **"Custom token"**, click **"Get started"** (or "Create Custom Token").

4. Configure the token:
   - **Token name:** `HG-TeleFlare Bot Builder` (or any name you like).
   - **Permissions (add these four):**

     | Permission | Item | Access |
     |---|---|---|
     | **Workers** | Workers Scripts | **Edit** |
     | **Workers** | Workers Routes | **Edit** |
     | **D1** | D1 | **Edit** |
     | **Workers KV** | Workers KV Storage | **Edit** |

   - **Account Resources:** Select **"Include"** → your account name → **"All accounts"** (or your specific account).
   - **Client IP Address Filtering:** Leave blank (not needed).
   - **TTL (Time to Live):** Leave as **"No end date"** (or set to a year if you prefer).

5. Click **"Continue to summary"** → review the permissions → click **"Create Token"**.

6. **⚠️ IMPORTANT:** Copy the token immediately!  
   Cloudflare shows it **only once**. It looks like a long string: `abc123def...xyz`.  
   Click the copy icon or select it and press `Ctrl+C`.  
   Save it somewhere safe (a password manager or a temporary text file).

---

### Step 8: Complete the Setup Wizard

Now go back to your Worker URL (the one from Step 6).

1. You'll see the **HG-TeleFlare Setup Wizard** page with a clean UI asking for your Cloudflare credentials.

2. **Step 2.1 — Enter your Cloudflare Account ID:**
   - Your **Account ID** is in the Cloudflare Dashboard URL:  
     `https://dash.cloudflare.com/`**`<your-account-id>`**
   - Or find it on the **Workers & Pages** page — look in the right sidebar under **"Account ID"**.
   - Copy and paste it into the setup wizard.

3. **Step 2.2 — Paste your API Token:**
   - Paste the token you created in Step 7.

4. **Step 2.3 — Select your Account:**
   - The wizard will verify your token and list your Cloudflare accounts.
   - Select your account from the dropdown.

5. Click **"Initialize Platform"**.

6. The wizard will now **automatically**:
   - ✅ Create a **D1 Database** named `telegram-bot-builder-db`
   - ✅ Create a **KV Namespace** named `telegram-bot-builder-session-kv`
   - ✅ Run **database migrations** (create tables: users, bots, rules, media, logs)
   - ✅ **Save the config** to the Worker's secrets (so it persists across reloads)

7. When done, you'll see a green success message: **"Platform is ready!"**

---

### Step 9: Register Your Admin Account

1. After initialization, the wizard will show the **Registration Form**.

2. Fill in your admin credentials:
   - **Username:** Choose a username (e.g., `admin`).
   - **Password:** Must be at least 6 characters.  
     🔐 This is your admin password — choose something strong!

3. Click **"Register"**.

4. You'll be automatically logged in and redirected to the **Dashboard**.

📝 **Note:** Registration is **one-time only**. The first account created is the **admin**. After that, registration is locked for security. Only the admin can log in.

---

### Step 10: Start Building Bots!

You're now inside the **HG-TeleFlare Dashboard**. Here's what to do next:

#### 10.1 — Create a Telegram Bot

1. Open Telegram and search for **[@BotFather](https://t.me/BotFather)**.
2. Send `/newbot` and follow the instructions to create a new bot.
3. **Save the bot token** (looks like `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`).

#### 10.2 — Add Your Bot to HG-TeleFlare

1. In the dashboard, click **"Create Bot"**.
2. Paste your **bot token** from BotFather.
3. Click **"Verify & Add"**. The system will:
   - Verify the token with Telegram.
   - Save your bot with its name and username.

#### 10.3 — Add Rules to Your Bot

1. Click on your bot in the dashboard.
2. Click **"Add Rule"**.
3. Configure a trigger:
   - **Command:** e.g., `/start`
   - **Message:** e.g., "hello"
   - **Callback:** for inline button clicks
   - **New Member:** when someone joins a group
4. Configure an action:
   - **Send Message:** Reply with text (use `{first_name}`, `{username}`, etc.)
   - **Send Photo:** Send an image from your media library
   - **Show Keyboard:** Display custom buttons
   - **Fetch API:** Call an external API and return the response
   - **Store Data:** Save data to KV storage
5. Click **"Save Rule"**.

#### 10.4 — Deploy Your Bot

1. Click the **"Deploy"** button.
2. HG-TeleFlare will:
   - Generate optimized JavaScript code from your rules.
   - Create a new Cloudflare Worker for your bot.
   - Set up the Telegram webhook automatically.
3. **Your bot is live!** 🎉 Test it by sending a message on Telegram.

#### 10.5 — Monitor Your Bot

1. Go back to the bot detail page in the dashboard.
2. Click the **"Logs"** tab to see real-time activity.
3. Filter by log level (DEBUG, INFO, WARNING, ERROR).
4. Clear logs as needed.

---

## 📸 Screenshots

Put your images in the [`docs/screenshots/`](./docs/screenshots/) folder using the filenames below. After you upload them to GitHub, they will show here automatically.

| Preview | What to capture |
|---|---|
| ![Setup Wizard](./docs/screenshots/01-setup-wizard.png) | Setup wizard — API token / account step |
| ![Dashboard](./docs/screenshots/02-dashboard.png) | Main dashboard with your bots list |
| ![Rule Builder](./docs/screenshots/03-rule-builder.png) | Visual rule builder (trigger + action) |

<details>
<summary>How to add screenshots</summary>

1. Deploy HG-TeleFlare and open your Worker URL.
2. Take 3 screenshots (PNG or JPG is fine).
3. Save them locally as:
   - `docs/screenshots/01-setup-wizard.png`
   - `docs/screenshots/02-dashboard.png`
   - `docs/screenshots/03-rule-builder.png`
4. Upload that folder with the rest of the repo.

Until the files exist, GitHub will show broken-image icons — that is expected.

</details>

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Cloudflare Worker                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │              HG-TeleFlare App (worker.js)          │  │
│  │  ┌─────────┐  ┌──────────┐  ┌────────────────┐   │  │
│  │  │  Router  │  │  Dashboard │  │  Bot Code Gen  │   │  │
│  │  │ (Hono)   │  │ (HTML/JS) │  │  (Generator)   │   │  │
│  │  └────┬────┘  └──────────┘  └───────┬────────┘   │  │
│  │       │                              │            │  │
│  │  ┌────▼─────────────────────────────▼────────┐   │  │
│  │  │          CFClient (API Layer)              │   │  │
│  │  └────┬──────────┬──────────┬──────────────┘   │  │
│  └───────┼──────────┼──────────┼──────────────────┘  │
│          │          │          │                      │
│          ▼          ▼          ▼                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐      │
│  │   D1 DB  │ │  KV KV   │ │  Deployed Bots   │      │
│  │ (SQLite)  │ │ (Cache)  │ │  (Child Workers) │      │
│  └──────────┘ └──────────┘ └──────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User** visits the dashboard → **Router** serves SPA HTML.
2. **User** creates rules visually → **Dashboard** sends API requests.
3. **User** clicks "Deploy" → **Bot Code Gen** generates JavaScript code.
4. **CFClient** provisions a new Cloudflare Worker with the bot code.
5. **CFClient** sets up the Telegram webhook → Bot is live!
6. **Bot** receives messages → Processes rules → Sends Telegram API calls.
7. **Bot** logs activity → **Parent Worker** stores logs in D1.

### Storage

| Service | Purpose |
|---|---|
| **D1 (SQLite)** | Relational data — Users, Bots, Rules, Media, Logs |
| **KV** | Binary media storage (images/files), bot session state |
| **Workers** | Dynamic edge execution of deployed bots |

---

## 📖 API Reference

### Authentication

All endpoints except setup, login, register, and media file serving require a `Bearer` JWT token:

```
Authorization: Bearer <jwt-token>
```

### Bot Management

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/bots` | List all bots for authenticated user |
| `POST` | `/api/bots` | Create a new bot (provide `botToken`) |
| `GET` | `/api/bots/:id` | Get bot details with rules |
| `PUT` | `/api/bots/:id` | Update bot token |
| `DELETE` | `/api/bots/:id` | Delete bot and its rules |

### Rule Management

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/bots/:id/rules` | Create a new rule |
| `PUT` | `/api/rules/:id` | Update a rule |
| `DELETE` | `/api/rules/:id` | Delete a rule |
| `POST` | `/api/rules/:id/duplicate` | Duplicate a rule |
| `POST` | `/api/bots/:id/rules/reorder` | Reorder rules (drag-and-drop) |

### Media Management

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/media/upload` | Upload a file (multipart form, max 15MB) |
| `GET` | `/api/bots/:id/media` | List media for a bot |
| `DELETE` | `/api/media/:id` | Delete media (marks affected rules) |
| `PUT` | `/api/media/:id` | Rename media file |
| `GET` | `/api/media/:id/file` | Serve media file |

### Logging

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/bots/:id/logs` | Fetch logs (optional `?level=ERROR&limit=50`) |
| `DELETE` | `/api/bots/:id/logs` | Clear all logs for a bot |
| `GET` | `/api/bots/:id/logs/stats` | Get log statistics |
| `POST` | `/api/logs/:id` | Internal — receive logs from deployed bots |

### Setup & Auth

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/setup/status` | Check if platform is configured |
| `POST` | `/api/setup/init` | Initialize D1, KV, and migrations |
| `POST` | `/api/setup/verify-token` | Verify a Cloudflare API token |
| `POST` | `/api/register` | Register first admin user |
| `POST` | `/api/login` | Login with credentials |

---

## 🔒 Security

- **API Token Storage:** Cloudflare API tokens are stored in Worker secrets (`PLATFORM_CONFIG`), never exposed to clients after initial setup.
- **Password Hashing:** Passwords are hashed with SHA-256 + salt before storage.
- **JWT Authentication:** Dashboard sessions use signed JWTs with 7-day expiry.
- **JWT Secret:** Set a Worker secret named `JWT_SECRET` to a long random value. If you skip this, the app falls back to a built-in default — fine for quick testing, **not** for a public deployment.
- **Auto-Lock:** Admin registration locks after the first user is created — no unauthorized signups.
- **Bot Verification:** Log ingestion endpoints verify the sender's bot token before accepting data.
- **Media Access:** `/api/media/:id/file` is **intentionally public**. Telegram (and browsers) must fetch image/file URLs without a dashboard login. Treat media URLs as unguessable-but-public links; do not upload confidential documents.

See [SECURITY.md](./SECURITY.md) for known limitations and how to report issues.

### Set `JWT_SECRET` (recommended)

1. Cloudflare Dashboard → your Worker → **Settings** → **Variables and Secrets**.
2. Add a secret: name `JWT_SECRET`, value = a long random string.
3. Save / redeploy if prompted.

---

## ⚠️ Known Limitations

| Limitation | Details |
|---|---|
| **Single admin** | Only the first registered user exists; registration locks afterward. |
| **No password reset** | If you lose admin credentials, you must recover via D1 / redeploy. |
| **Media size** | Max **15MB** per file (KV + Base64 overhead). |
| **Cloudflare Free plan** | ~100k Worker requests/day; child bot Workers count toward limits. |
| **Paste-deploy only (v1)** | No local Wrangler workflow in this repo — edit and redeploy `worker.js`. |

Full list: [SECURITY.md](./SECURITY.md).

---

## 🌐 Bilingual Support (English / فارسی)

HG-TeleFlare includes comprehensive SEO metadata in **two languages**:

| Language | Meta Tags | Open Graph |
|---|---|---|
| **English** | ✅ description, keywords, title, author | ✅ og:title, og:description |
| **Persian (فارسی)** | ✅ `lang="fa"` description, keywords | ✅ og:title:fa, og:locale:alternate=fa_IR |

The dashboard HTML includes:
- Bilingual `<meta>` description and keywords tags
- Open Graph tags for both languages
- Twitter Card tags for social sharing
- JSON-LD structured data (Schema.org) for search engines
- Canonical URL reference

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **🐛 Report Bugs:** Open an [Issue](https://github.com/Hamed-Gharghi/Cloudflare-Telegram-bot-builder/issues) with reproduction steps.
2. **💡 Suggest Features:** Open an issue with the `enhancement` label.
3. **🔧 Submit PRs:**
   - Fork the repository.
   - Create a feature branch: `git checkout -b feat/my-feature`.
   - Commit your changes: `git commit -am 'Add cool feature'`.
   - Push: `git push origin feat/my-feature`.
   - Open a Pull Request.

Please ensure your code follows the existing style and includes appropriate comments.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## 📬 Contact

**Hamed Gharghi** — Creator & Maintainer

- GitHub: [@Hamed-Gharghi](https://github.com/Hamed-Gharghi)
- Repository: [Cloudflare-Telegram-bot-builder](https://github.com/Hamed-Gharghi/Cloudflare-Telegram-bot-builder)
- Issues: [Issue Tracker](https://github.com/Hamed-Gharghi/Cloudflare-Telegram-bot-builder/issues)

---

## 🇮🇷 پیام عاشقانه برای ایرانی‌ها <3

<p align="right" dir="rtl">
  <strong>🌈 به خانواده اچ‌جی-تل‌فلر خوش آمدید!</strong>
  <br/><br/>
  سلام به تمام ایرانی‌های عزیز! ❤️
  <br/><br/>
  من <strong>حامد</strong> هستم، سازنده این پروژه. این پروژه با عشق برای شما ساخته شده تا بتونید بدون هیچ دانش فنی، ربات تلگرام خودتون رو بسازید و روی Cloudflare مستقر کنید. 
  <br/><br/>
  <strong>📢 خبر خوب:</strong> در نسخه بعدی، کل داشبورد رو به صورت کاملاً فارسی در اختیارتون قرار می‌دم! 
  دیگه لازم نیست نگران زبان انگلیسی باشید — همه چی کاملاً فارسی و راست‌چین می‌شه. 
  <br/><br/>
  اگر سوالی داشتید یا پیشنهادی برای بهتر شدن پروژه دارید، حتماً توی <a href="https://github.com/Hamed-Gharghi/Cloudflare-Telegram-bot-builder/issues">Issues</a> مطرح کنید. 
  خوشحال می‌شم نظرات شما رو بشنوم!
  <br/><br/>
  با عشق، <strong>حامد</strong> ❤️
</p>

---

### 📋 نسخه فارسی (Persian)

<p align="right" dir="rtl">
  <strong>اچ‌جی-تل‌فلر</strong> یک ابزار مستقل و تمام‌عیار برای Cloudflare Workers است که به شما امکان می‌دهد ربات‌های تلگرام را به صورت بصری و بدون نیاز به نوشتن کد بسازید، مدیریت کنید و منتشر کنید.
</p>

<h3 align="right" dir="rtl">✨ ویژگی‌ها</h3>

<ul dir="rtl" align="right">
  <li><strong>راه‌اندازی خودکار:</strong> با ارائه یک توکن API کلادفلر، به طور خودکار پایگاه داده D1 و فضای ذخیره‌سازی KV ایجاد کرده و آماده استفاده می‌شود.</li>
  <li><strong>سازنده بصری قوانین:</strong> ربات‌های خود را با رابط کاربری کشیدن و رها کردن بسازید. ماشه‌ها (دستورات، پیام‌ها، کاربران جدید) را به اقدامات (ارسال پیام، نمایش کیبورد، درخواست API) متصل کنید.</li>
  <li><strong>تولید خودکار Worker:</strong> با کلیک بر روی دکمه انتشار، کد جاوااسکریپت بهینه شده تولید و بلافاصله در شبکه کلادفلر مستقر می‌شود.</li>
  <li><strong>ذخیره‌سازی رسانه:</strong> تصاویر و فایل‌ها را مستقیماً در داشبورد آپلود کنید.</li>
  <li><strong>ثبت وقایع بلادرنگ:</strong> فعالیت ربات خود را در زمان واقعی نظارت کنید.</li>
</ul>

<h3 align="right" dir="rtl">🚀 شروع سریع</h3>

<ol dir="rtl" align="right">
  <li>به <a href="https://dash.cloudflare.com/">داشبورد کلادفلر</a> بروید و یک Worker جدید ایجاد کنید.</li>
  <li>محتوای فایل <code>worker.js</code> را کپی کرده و در ویرایشگر Worker قرار دهید.</li>
  <li>روی دکمه Deploy کلیک کنید و از wizard راه‌اندازی خودکار پیروی کنید.</li>
  <li>ربات تلگرام خود را بسازید و منتشر کنید! 🎉</li>
</ol>

<h3 align="right" dir="rtl">📄 مجوز</h3>

<p align="right" dir="rtl">
  این پروژه تحت مجوز MIT منتشر شده است.
</p>

---

<div align="center">
  <br/>
  <sub>ساخته شده با ❤️ و ☁️ Cloudflare Workers</sub>
  <br/>
  <br/>
  <sub>
    <a href="#-hg-teleflare">English Version ▲</a> · 
    <a href="#-نسخه-فارسی-persian">نسخه فارسی ▲</a>
  </sub>
  <br/>
  <br/>
</div>
