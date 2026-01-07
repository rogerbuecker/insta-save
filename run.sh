#!/bin/bash
# Run script for Instagram Saved Posts Scraper

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Error: Virtual environment not found"
    echo "Please run ./setup.sh first"
    exit 1
fi

# Activate virtual environment and run the scraper
source venv/bin/activate
python insta_scraper.py
