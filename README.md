# 🤖 HG-TeleFlare 
**The Zero-Config Cloudflare Telegram Bot Builder**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Version: 1.0.0](https://img.shields.io/badge/Version-1.0.0-success.svg)]()
[![Powered by Cloudflare](https://img.shields.io/badge/Powered_by-Cloudflare_Workers-F6821F?logo=cloudflare)](https://workers.cloudflare.com/)

HG-TeleFlare is a complete, self-contained micro-SaaS in a single file. Paste your Cloudflare API token once, and it automatically provisions its own infrastructure to help you build, manage, and deploy dynamic Telegram bots visually—without writing any code.

Designed and built by **Hamed Gharghi**.

---

## ✨ Features

* **Zero-Config Self-Bootstrapping:** Provide a Cloudflare API token, and HG-TeleFlare automatically creates its own **D1 Database** and **KV Storage**, binds them, and sets up database migrations. 
* **Visual Rule Builder:** Create bots using a drag-and-drop UI. Map triggers (Commands, Messages, Callbacks, New Members) to Actions (Send Message, Send Photo, Show Keyboards, Fetch APIs, Store Data).
* **Dynamic Worker Generation:** When you hit "Deploy", HG-TeleFlare translates your visual rules into highly optimized, pure-JavaScript code and deploys a child Cloudflare Worker instantly.
* **Built-in Media Storage:** Upload images and documents directly in the dashboard. Media is stored securely and efficiently using Cloudflare KV.
* **Dynamic Variables:** Personalize bot responses using variables like `{first_name}`, `{username}`, and `{message}`.
* **Log Viewer:** A built-in terminal UI to monitor your bot's activity in real-time.

## 🚀 Quick Start (Deploy in 60 seconds)

HG-TeleFlare requires no `npm install`, no Wrangler CLI configs, and no local environment. 

1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/) and create a new **Worker**.
2. Name it whatever you want (e.g., `bot-builder-dashboard`).
3. Click **"Edit Code"**.
4. Copy the entire contents of `worker.js` from this repository and paste it into the Cloudflare editor.
5. Click **Deploy**.
6. Visit your Worker's URL. The self-bootstrapping wizard will guide you through creating your API token and securing your admin account.

## 🛠 Architecture

HG-TeleFlare acts as both an API gateway and a UI router. It uses a lightweight, custom routing class (inspired by Hono) to serve a dashboard built with vanilla HTML/CSS/JS.

When bots are deployed, they are injected with your defined logic and provisioned onto Cloudflare's Edge network, ensuring sub-50ms response times for all Telegram webhook events. 

* **D1:** Relational data (Users, Bots, Rules, Logs)
* **KV:** Fast binary media storage and bot state memory
* **Workers:** Dynamic edge execution

## 🔒 Security

* All API tokens and passwords are cryptographically hashed or stored in Cloudflare's secure secret environment bindings.
* Admin registration locks automatically after the first user is created.
* Built-in JWT authentication for dashboard access.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
