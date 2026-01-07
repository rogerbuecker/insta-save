#!/bin/bash

echo "Starting Instagram Saved Posts Viewer..."
echo ""
echo "This will start two processes:"
echo "1. Backend API server on http://localhost:3001"
echo "2. Frontend dev server on http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Function to cleanup background processes
cleanup() {
    echo ""
    echo "Shutting down servers..."
    kill $SERVER_PID $DEV_PID 2>/dev/null
    exit 0
}

# Set up trap to catch Ctrl+C
trap cleanup SIGINT SIGTERM

# Start backend server
npm run server &
SERVER_PID=$!

# Wait a bit for server to start
sleep 2

# Start frontend dev server
npm run dev &
DEV_PID=$!

# Wait for both processes
wait
