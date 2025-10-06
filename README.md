# Terminal Social App

A unique social media web application that combines Twitter and Telegram features with a terminal-inspired green theme. All data is stored locally on your machine with a comprehensive admin panel for monitoring and management.

## Features

### 🚀 Core Features
- **Twitter-like Posts**: Create and view posts with real-time updates
- **Telegram-like Messaging**: Direct messaging between users
- **Terminal Theme**: Green matrix-style interface with glitch effects
- **Real-time Updates**: WebSocket-powered live updates
- **Local Data Storage**: All data stored in SQLite database on your machine
- **Admin Panel**: Complete monitoring and management system

### 🛡️ Admin Features
- **User Management**: View all users, ban/unban accounts
- **Content Moderation**: Delete posts and messages
- **System Statistics**: Real-time stats dashboard
- **Message Monitoring**: View all private messages
- **Post Management**: Monitor and delete posts

### 🎨 UI Features
- **Terminal Aesthetic**: Green-on-black matrix theme
- **Responsive Design**: Works on desktop and mobile
- **Glitch Effects**: Authentic terminal feel
- **Real-time Notifications**: Live updates without refresh
- **Smooth Animations**: Terminal-style transitions

## Quick Start

### Prerequisites
- Node.js (version 14 or higher)
- npm (comes with Node.js)

### Installation

1. **Install all dependencies:**
   ```bash
   npm run install-all
   ```

2. **Start the application:**
   ```bash
   npm run dev
   ```

3. **Access the application:**
   - Main App: http://localhost:3000
   - Admin Panel: http://localhost:5000/admin

### Default Admin Credentials
- **Username:** admin
- **Password:** admin123

## Usage Guide

### For Regular Users

1. **Register/Login:**
   - Visit http://localhost:3000
   - Click "REGISTER" to create a new account
   - Or use existing credentials to login

2. **Creating Posts:**
   - Switch to "POSTS" tab
   - Type your message in the text area
   - Click "POST" to share

3. **Messaging:**
   - Switch to "MESSAGES" tab
   - Select a user from the sidebar
   - Type and send messages

### For Administrators

1. **Access Admin Panel:**
   - Login with admin credentials
   - Click "ADMIN" button in header
   - Or visit http://localhost:5000/admin directly

2. **User Management:**
   - View all registered users
   - Ban/unban users as needed
   - Monitor user activity

3. **Content Moderation:**
   - Review all posts and messages
   - Delete inappropriate content
   - Monitor system statistics

## Technical Details

### Architecture
- **Frontend:** React with TypeScript
- **Backend:** Node.js with Express
- **Database:** SQLite (local file storage)
- **Real-time:** Socket.io for live updates
- **Authentication:** JWT tokens

### Database Schema
- **Users:** User accounts and admin status
- **Posts:** Twitter-like posts with likes/retweets
- **Messages:** Direct messages between users
- **Groups:** Group messaging (future feature)
- **Likes:** Post interaction tracking

### File Structure
```
terminal-social-app/
├── server/
│   └── index.js          # Express server and API
├── client/
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── contexts/     # React contexts
│   │   └── App.tsx       # Main app component
│   └── public/           # Static assets
├── uploads/              # File uploads (auto-created)
├── social_app.db         # SQLite database (auto-created)
└── package.json          # Dependencies and scripts
```

## API Endpoints

### Authentication
- `POST /api/register` - User registration
- `POST /api/login` - User login

### Posts
- `GET /api/posts` - Get all posts
- `POST /api/posts` - Create new post

### Messages
- `GET /api/messages/:userId` - Get messages with user
- `POST /api/messages` - Send message

### Admin
- `GET /api/admin/users` - Get all users
- `GET /api/admin/posts` - Get all posts
- `GET /api/admin/messages` - Get all messages
- `DELETE /api/admin/posts/:id` - Delete post
- `DELETE /api/admin/messages/:id` - Delete message
- `PUT /api/admin/users/:id/ban` - Ban/unban user

## Customization

### Changing the Theme
Edit `client/src/App.css` to modify colors:
- Primary green: `#00ff00`
- Secondary green: `#00aa00`
- Background: `#0a0a0a`

### Adding Features
- New API endpoints in `server/index.js`
- New React components in `client/src/components/`
- Database schema changes in server initialization

## Troubleshooting

### Common Issues

1. **Port already in use:**
   ```bash
   # Kill process on port 5000
   lsof -ti:5000 | xargs kill -9
   ```

2. **Database locked:**
   - Stop the server
   - Delete `social_app.db`
   - Restart server (database will recreate)

3. **Dependencies issues:**
   ```bash
   # Clean install
   rm -rf node_modules client/node_modules
   npm run install-all
   ```

### Development Mode
- Frontend runs on port 3000 with hot reload
- Backend runs on port 5000 with nodemon
- Database file: `social_app.db` in project root

### Production Mode
```bash
# Build frontend
npm run build

# Start production server
npm start
```

## Security Notes

- Default admin password should be changed in production
- JWT secret should be changed in production
- File uploads are stored in `uploads/` directory
- All data is stored locally on your machine

## License

MIT License - Feel free to modify and use for your projects!

## Support

This is a complete, self-contained social media application. All data stays on your local machine, making it perfect for:
- Personal use
- Learning projects
- Internal team communication
- Offline social networking

Enjoy your terminal social experience! 🚀