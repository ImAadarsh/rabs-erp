#!/bin/bash
# Clear Next.js cache and rebuild
echo "Clearing Next.js cache..."
rm -rf .next
rm -rf node_modules/.cache
echo "Cache cleared. Restart your dev server with: npm run dev"
