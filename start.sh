#!/bin/bash

echo "🚀 Starting Terminal Social App..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js and npm are installed"
echo ""

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ] || [ ! -d "client/node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm run install-all
    echo ""
fi

echo "🎯 Starting the application..."
echo ""
echo "📱 Main App: http://localhost:3000"
echo "🛡️  Admin Panel: http://localhost:5000/admin"
echo "🔑 Admin Login: admin / admin123"
echo ""
echo "Press Ctrl+C to stop the application"
echo ""

# Start the application
npm run dev