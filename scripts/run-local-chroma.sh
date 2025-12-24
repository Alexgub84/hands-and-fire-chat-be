#!/bin/bash

# Script to run ChromaDB locally with Docker

set -e

echo "🚀 Starting local ChromaDB instance..."

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

# Check if container already exists and is running
if docker ps --format '{{.Names}}' | grep -q '^chroma-local$'; then
    echo "✅ ChromaDB is already running on port 8000"
    echo "   Container: chroma-local"
    echo "   URL: http://localhost:8000"
    exit 0
fi

# Check if container exists but is stopped
if docker ps -a --format '{{.Names}}' | grep -q '^chroma-local$'; then
    echo "🔄 Starting existing ChromaDB container..."
    docker start chroma-local
    echo "✅ ChromaDB started on port 8000"
    echo "   Container: chroma-local"
    echo "   URL: http://localhost:8000"
    exit 0
fi

# Create and run new container
echo "📦 Creating new ChromaDB container..."
docker run -d \
    --name chroma-local \
    -p 8000:8000 \
    chromadb/chroma:latest

# Wait for ChromaDB to be ready
echo "⏳ Waiting for ChromaDB to be ready..."
sleep 5

echo "✅ ChromaDB is running on port 8000"
echo "   Container: chroma-local"
echo "   URL: http://localhost:8000"
echo ""
echo "To stop: docker stop chroma-local"
echo "To remove: docker rm chroma-local"
echo "To view logs: docker logs -f chroma-local"

