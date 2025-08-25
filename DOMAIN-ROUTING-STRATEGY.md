# Domain Routing Strategy for VerseMate

## Overview

This document outlines the domain routing strategy for VerseMate, separating the marketing landing page from the main application.

## Domain Structure

### Primary Domains

1. **versemate.org** - Marketing Landing Page
   - **Purpose**: Public-facing marketing website showcasing VerseMate features, mission, and getting users to sign up
   - **Content**: Landing page with sections for Hero, How It Works, Why VerseMate, Global Impact, Get Involved, About, Footer
   - **Technology**: Next.js 15 with static generation for optimal SEO and performance
   - **Location**: `/apps/website/`
   - **Port**: 3002 (development)

2. **app.versemate.org** - Main Application
   - **Purpose**: The actual VerseMate Bible study application for authenticated users
   - **Content**: Bible reading interface, AI translations, user dashboard, study tools
   - **Technology**: Next.js 14 with Elysia backend API
   - **Location**: `/apps/frontend-next/` (frontend) + `/apps/backend/` (API)
   - **Ports**: 3000 (frontend), 3001 (backend API)

## Implementation Strategy

### Development Environment

```bash
# Landing page development
bun dev:website    # Runs website on localhost:3002

# Main app development  
bun dev           # Runs app on localhost:3000 + API on localhost:3001

# All services together
bun dev:all       # Runs all three services concurrently
```

### Production Deployment

#### Option 1: Separate Deployments
- **versemate.org**: Deploy `/apps/website/` to Cloudflare Pages or Vercel
- **app.versemate.org**: Deploy `/apps/frontend-next/` to Cloudflare Workers + `/apps/backend/` to Cloudflare Workers

#### Option 2: Reverse Proxy (Recommended)
Set up a reverse proxy (Cloudflare, NGINX, or Cloudflare Workers) to route requests:

```javascript
// Cloudflare Workers routing logic
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const hostname = url.hostname;
    
    if (hostname === 'versemate.org' || hostname === 'www.versemate.org') {
      // Route to marketing website
      return fetch(`https://versemate-website.pages.dev${url.pathname}`, {
        method: request.method,
        headers: request.headers,
        body: request.body
      });
    }
    
    if (hostname === 'app.versemate.org') {
      // Route to main application
      return fetch(`https://versemate-app.workers.dev${url.pathname}`, {
        method: request.method,
        headers: request.headers,
        body: request.body
      });
    }
    
    // Default redirect to main site
    return Response.redirect('https://versemate.org', 301);
  }
}
```

### DNS Configuration

```
# A Records
versemate.org         → [Landing Page IP/CNAME]
www.versemate.org     → [Landing Page IP/CNAME]
app.versemate.org     → [Main App IP/CNAME]

# CNAME Records (if using Cloudflare/Vercel)
versemate.org         → versemate-website.pages.dev
www.versemate.org     → versemate-website.pages.dev  
app.versemate.org     → versemate-app.workers.dev
```

## Cross-Domain Considerations

### Authentication
- Main app handles all authentication at `app.versemate.org`
- Landing page redirects to `app.versemate.org/login` for sign-in
- Use secure, httpOnly cookies with domain set to `.versemate.org` for shared auth state

### Analytics & Tracking
- Implement unified analytics across both domains
- Use Google Analytics 4 with cross-domain tracking
- Set up conversion tracking from landing page to app sign-ups

### SEO & Marketing
- Landing page optimized for search engines and conversion
- Proper canonical URLs and meta tags
- Schema markup for organization and product information
- Social media preview images and Open Graph tags

## URL Structure

### Landing Page (versemate.org)
```
/                  # Homepage with all sections
/about             # About page (expanded content)
/volunteer         # Volunteer opportunities
/give             # Donation/giving page
/login            # Redirects to app.versemate.org/login
```

### Main Application (app.versemate.org)
```
/                 # Dashboard/Bible reading interface
/login           # Authentication
/create-account  # Registration
/profile         # User profile settings
/study           # Bible study tools
```

## Security Considerations

1. **CORS Configuration**: Configure APIs to only accept requests from authorized domains
2. **CSP Headers**: Implement Content Security Policy headers appropriately for each domain
3. **SSL/TLS**: Ensure both domains use HTTPS with proper certificate management
4. **Session Management**: Secure cookie handling across subdomains

## Maintenance & Monitoring

- Set up monitoring for both domains
- Configure alerts for downtime or performance issues
- Regular security updates and dependency management
- Monitor SEO performance and conversion rates

## Future Considerations

- **Mobile App**: Consider `mobile.versemate.org` or deep linking strategy
- **API Versioning**: Plan for `api.versemate.org` for public API access
- **CDN Strategy**: Optimize asset delivery across domains
- **Internationalization**: Plan for `es.versemate.org`, `fr.versemate.org`, etc.