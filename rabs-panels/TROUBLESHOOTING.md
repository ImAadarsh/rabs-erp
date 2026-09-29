# Troubleshooting Guide - Next.js 404 Errors

## Quick Fix for 404 Errors

If you're experiencing 404 errors for Next.js static files (`/_next/static/...`), follow these steps:

### 1. Clear Next.js Cache
```bash
npm run clean
# or
rm -rf .next node_modules/.cache
```

### 2. Restart Dev Server
```bash
npm run dev
```

### 3. Clear Browser Cache
- **Chrome/Edge**: Press `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
- Select "Cached images and files"
- Click "Clear data"

### 4. Unregister Service Worker (if needed)
1. Open DevTools (F12)
2. Go to Application tab → Service Workers
3. Click "Unregister" for any registered service workers
4. Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)

## Permanent Solutions Implemented

### ✅ Service Worker Configuration
- Service worker now only registers in **production** mode
- Service worker skips Next.js internal files (`/_next/`)
- Proper cache management with versioning

### ✅ Next.js Configuration
- Optimized build ID generation
- Improved on-demand entry management
- Better static file serving

### ✅ Git Configuration
- `.next` folder is properly ignored (won't be committed)
- `node_modules` is properly ignored
- Build artifacts excluded from version control

## Common Issues & Solutions

### Issue: 404 errors persist after restart
**Solution:**
1. Stop the dev server completely
2. Run `npm run clean`
3. Clear browser cache and service workers
4. Restart with `npm run dev`

### Issue: Service worker caching old files
**Solution:**
1. Unregister service worker in DevTools
2. Clear browser cache
3. Hard refresh the page

### Issue: Build files not generating
**Solution:**
1. Check Node.js version (should be 18+)
2. Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`
3. Clear Next.js cache: `npm run clean`
4. Rebuild: `npm run build`

## Development Best Practices

1. **Always restart dev server after:**
   - Changing `next.config.mjs`
   - Installing new dependencies
   - Experiencing persistent 404 errors

2. **Clear cache when:**
   - Switching branches
   - After git pull with config changes
   - When static files seem outdated

3. **Service Worker:**
   - Only active in production builds
   - Automatically updates every hour
   - Doesn't interfere with Next.js dev server

## File Structure

```
rabs-panels/
├── .next/              # Build output (ignored by git)
├── node_modules/       # Dependencies (ignored by git)
├── public/
│   └── sw.js          # Service worker (only used in production)
├── src/
│   └── components/
│       └── service-worker-registration.tsx
└── next.config.mjs     # Next.js configuration
```

## Still Having Issues?

1. Check Next.js version: `npx next --version`
2. Verify Node.js version: `node --version` (should be 18+)
3. Check for port conflicts (default: 3000)
4. Review browser console for specific error messages
5. Check terminal output for build errors

