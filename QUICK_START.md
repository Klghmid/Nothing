# 🚀 Terminal Social App - Quick Start Guide

## What You've Got

A complete social media web application that combines:
- **Twitter-like posts** with real-time updates
- **Telegram-like messaging** between users
- **Terminal green theme** with matrix-style effects
- **Admin panel** for monitoring and management
- **100% local data storage** - everything stays on your machine

## 🎯 How to Run (Super Easy!)

### Option 1: One-Click Start (Recommended)
```bash
# On Linux/Mac:
./start.sh

# On Windows:
start.bat
```

### Option 2: Manual Start
```bash
# 1. Install everything
npm run install-all

# 2. Start the app
npm run dev
```

## 🌐 Access Your App

- **Main App:** http://localhost:3000
- **Admin Panel:** http://localhost:5000/admin

## 🔑 Default Login

**Admin Account:**
- Username: `admin`
- Password: `admin123`

**Regular Users:**
- Register new accounts through the main app

## ✨ What You Can Do

### As a Regular User:
1. **Register/Login** - Create your account
2. **Create Posts** - Share your thoughts (Twitter-style)
3. **Send Messages** - Chat with other users (Telegram-style)
4. **Real-time Updates** - See new posts and messages instantly

### As an Admin:
1. **Monitor Everything** - View all posts and messages
2. **Manage Users** - Ban/unban users
3. **Delete Content** - Remove inappropriate posts/messages
4. **View Statistics** - See user activity and system stats

## 🎨 Features Highlights

- **Terminal Aesthetic** - Green matrix theme with glitch effects
- **Real-time Updates** - No page refresh needed
- **Mobile Friendly** - Works on phones and tablets
- **Local Storage** - All data stays on your computer
- **Admin Controls** - Full moderation capabilities

## 🛠️ Technical Stuff

- **Frontend:** React with TypeScript
- **Backend:** Node.js with Express
- **Database:** SQLite (local file)
- **Real-time:** WebSocket connections
- **Ports:** 3000 (frontend), 5000 (backend)

## 🚨 Troubleshooting

**App won't start?**
```bash
# Kill any processes using the ports
lsof -ti:3000 | xargs kill -9
lsof -ti:5000 | xargs kill -9

# Then try again
npm run dev
```

**Database issues?**
- Delete `social_app.db` file
- Restart the app (database will recreate)

**Dependencies problems?**
```bash
rm -rf node_modules client/node_modules
npm run install-all
```

## 🎉 You're All Set!

Your terminal social media app is ready to use! All data is stored locally on your machine, so you have complete control and privacy.

Enjoy your matrix-style social networking experience! 🚀