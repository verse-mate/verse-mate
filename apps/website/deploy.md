# VerseMate Website Deployment Guide

## Development Setup

1. **Environment Variables**: Copy `.env.example` to `.env.local` and configure:
   ```bash
   cp .env.example .env.local
   ```

2. **Development Server**:
   ```bash
   cd apps/website
   bun dev  # Runs on localhost:3002
   ```

## Production Deployment

### Option 1: Cloudflare Pages (Recommended)

1. **Build Configuration**:
   - Build command: `cd apps/website && bun run build`
   - Build output directory: `apps/website/out`
   - Node.js version: 20

2. **Environment Variables** (set in Cloudflare Pages dashboard):
   ```
   NEXT_PUBLIC_WEBSITE_URL=https://versemate.org
   NEXT_PUBLIC_APP_URL=https://app.versemate.org
   NEXT_PUBLIC_ENABLE_ANALYTICS=true
   NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
   ```

3. **Custom Domain Setup**:
   - Add custom domain: `versemate.org`
   - Add custom domain: `www.versemate.org`

### Option 2: Vercel

1. **Vercel Configuration**:
   ```json
   {
     "buildCommand": "cd apps/website && bun run build",
     "outputDirectory": "apps/website/out",
     "installCommand": "bun install",
     "framework": "nextjs"
   }
   ```

2. **Environment Variables** (set in Vercel dashboard):
   ```
   NEXT_PUBLIC_WEBSITE_URL=https://versemate.org
   NEXT_PUBLIC_APP_URL=https://app.versemate.org
   NEXT_PUBLIC_ENABLE_ANALYTICS=true
   NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
   ```

### Option 3: Manual Deployment

1. **Build the site**:
   ```bash
   cd apps/website
   bun run build
   ```

2. **Upload the `out` directory** to your static hosting provider.

## Post-Deployment Checklist

- [ ] Verify all images load correctly
- [ ] Test cross-domain navigation (Login button → app.versemate.org)
- [ ] Test all internal navigation links
- [ ] Verify SEO meta tags are present
- [ ] Test mobile responsiveness
- [ ] Verify analytics tracking is working
- [ ] Test form submissions (if any)
- [ ] Run Lighthouse audit for performance

## DNS Configuration

```
# A Records
versemate.org         → [Cloudflare Pages IP]
www.versemate.org     → [Cloudflare Pages IP]

# Or CNAME Records
versemate.org         → versemate-org.pages.dev
www.versemate.org     → versemate-org.pages.dev
```

## Performance Optimizations

- Static site generation (SSG) enabled
- Image optimization configured
- CSS optimization enabled
- Proper caching headers for assets