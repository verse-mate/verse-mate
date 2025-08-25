# VerseMate - Application Architecture & Implementation Guide

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture Overview](#architecture-overview)
3. [Backend Implementation](#backend-implementation)
4. [Frontend Implementation](#frontend-implementation)
5. [Database Schema](#database-schema)
6. [AI Integration](#ai-integration)
7. [Development Workflow](#development-workflow)
8. [Deployment Strategy](#deployment-strategy)

## Project Overview

**VerseMate** is a comprehensive Bible reading platform with AI-driven translations and commentary. The application enables users to read the Bible with intelligent explanations, engage in contextual conversations about specific chapters, and track their reading progress.

### Core Features
- Bible reading with multiple explanation types (summary, verse-by-verse, detailed)
- AI-powered contextual chat about Bible chapters
- User authentication and session management
- Reading progress tracking and bookmarks
- Rating system for AI-generated explanations
- Email verification and password reset workflows

## Architecture Overview

### Technology Stack
- **Runtime**: Bun (replaces Node.js/npm)
- **Monorepo Structure**: Apps and shared packages
- **Backend**: Elysia (Bun-native web framework) on port 3001
- **Frontend**: Next.js 14 with React 18 on port 3000
- **Database**: PostgreSQL with Kysely ORM
- **Cache/Queue**: Redis for sessions and background jobs
- **API Communication**: Eden (type-safe Elysia client)
- **Authentication**: Custom JWT-like sessions
- **AI Integration**: OpenAI GPT-5 for Bible explanations and chat
- **Email Service**: Mailgun for transactional emails

### Project Structure

```
/apps/
├── backend/                 # Elysia API server
└── frontend-next/          # Next.js web application

/packages/
├── backend-api/            # Eden client SDK for frontend-backend communication
├── backend-base/           # Core backend modules (auth, bible, chat, queue)
├── database/              # Kysely ORM models, migrations, seeds
├── emails/                # React Email components
├── frontend-base/         # Shared UI components and utilities
└── frontend-envs/         # Frontend environment configuration
```

## Backend Implementation

### 🏗️ Core Architecture

The backend is built on **Elysia** with a sophisticated plugin-based architecture that enables modular, scalable, and type-safe API development.

#### Main App Structure
```typescript
const app = new Elysia()
  .use(authPlugin)      // Authentication routes and middleware
  .use(userPlugin)      // User management
  .use(biblePlugin)     // Bible content and AI features
  .use(cors())          // Cross-origin resource sharing
  .use(swagger())       // API documentation
```

#### Shared Plugin Foundation
Provides foundational services to all other plugins:
- **Database Connection**: Kysely-based PostgreSQL connection
- **Redis Cache**: Session management and caching
- **JWT Service**: Token generation and validation
- **Email Queue**: Background email processing
- **Graceful Shutdown**: Proper resource cleanup

### 🔐 Authentication System

#### Key Features
- **JWT-based Sessions**: Custom implementation using `@elysiajs/jwt`
- **Password Hashing**: Bun's native bcrypt implementation
- **Token Management**: Redis-based token storage with TTL
- **Email Verification**: UUID-based verification links
- **Password Reset**: Secure reset flow with time-limited tokens

#### Authentication Flow
1. **Signup**: Hash password → Store user → Send verification email → Generate JWT
2. **Login**: Validate credentials → Generate JWT → Store in Redis
3. **Protected Routes**: Bearer token validation → JWT verification → User context injection
4. **Logout**: Remove token from Redis cache
5. **Session Management**: Redis-based session storage with automatic expiration

#### Security Features
- Bcrypt password hashing with configurable salt rounds
- JWT tokens with configurable expiration
- Redis-based token blacklisting for logout
- Email verification requirement
- Rate limiting through environment configuration

### 📖 Bible Service Implementation

#### Core Services
- **BibleService**: Business logic for Bible content management
- **BibleRepository**: Data access layer with type-safe queries
- **PromptService**: AI prompt management and system configuration

#### Bible Content Management
- **Hierarchical Structure**: Testament → Book → Chapter → Verse
- **Metadata Support**: Genres, subtitles, cross-references
- **Progress Tracking**: User reading progress and bookmarks
- **Multi-version Support**: Structured for multiple Bible translations

#### AI-Powered Explanations
Three explanation types with different prompting strategies:

```typescript
const explanationTypes = {
  summary: "250-word chapter summaries with theological themes",
  byline: "Verse-by-verse detailed analysis", 
  detailed: "500+ word in-depth theological commentary"
}
```

**AI Integration Process**:
1. **Context Assembly**: Gather full chapter text and metadata
2. **Prompt Engineering**: Type-specific prompts for different explanation styles
3. **GPT-5 Generation**: OpenAI API calls with structured prompts
4. **Content Storage**: Markdown-formatted explanations in database
5. **Lazy Loading**: Generate explanations on-demand when requested

#### Rating System
- **User Ratings**: 1-5 star rating system for explanations
- **Aggregated Metrics**: Average ratings and total user participation
- **Update Logic**: Handle rating creation and updates

### 💬 Chat/AI Integration

#### Conversation Management
- **Context-Aware Chat**: AI responses limited to specific Bible chapters
- **Message History**: Persistent conversation threads
- **Auto-Generated Titles**: GPT-5 generates conversation titles
- **Chat Grouping**: Organize conversations by time periods (today, yesterday, last 7 days)

#### AI Chat Flow
1. **New Conversation**: User asks question about a chapter
2. **Context Building**: Assemble full chapter content as context
3. **AI Processing**: GPT-5 generates contextual response
4. **Message Storage**: Save both user and AI messages
5. **Title Generation**: AI creates descriptive conversation title
6. **History Management**: Group and organize conversation history

#### Chat Features
- **Chapter-Scoped Conversations**: AI responses constrained to chapter context
- **Role-Based Messages**: User vs Assistant message tracking
- **Conversation Status**: Active/disabled conversation management
- **Bulk Operations**: Delete conversations and message cleanup

### 🗄️ Database Architecture

#### Repository Pattern Implementation
Each domain has dedicated repositories with type-safe query builders:

**BibleRepository**:
- Testament/book/chapter/verse queries
- Explanation storage and retrieval
- User progress tracking
- Rating system queries

**ChatRepository**:
- Conversation management
- Message history queries
- Chat grouping and organization
- User-specific chat filtering

#### Key Database Patterns
- **Type Safety**: Kysely provides compile-time SQL validation
- **Connection Management**: Singleton pattern with automatic cleanup
- **Query Optimization**: Efficient joins and indexing strategies
- **Transaction Support**: ACID compliance for complex operations

### 📧 Background Job System

#### Email Notification Consumer
- **Mailgun Integration**: Production email delivery
- **Environment Switching**: Development vs production email handling
- **Template Support**: React Email components for rich HTML emails
- **Error Handling**: Comprehensive error logging and recovery

#### Email Types
- **Verification Emails**: Account activation links
- **Password Reset**: Secure password reset workflows
- **System Notifications**: Future extensibility for user notifications

### 🔧 Key Technical Patterns

#### Dependency Injection
```typescript
// Services injected into plugin state
.state((state) => ({
  ...state,
  bibleService: new BibleService(state.db, new BibleRepository(state.db)),
  chatService: new ChatService(new ChatRepository(state.db), new BibleRepository(state.db))
}))
```

#### Error Handling
- **Structured Errors**: Enum-based error codes
- **Safe Promise Wrapper**: Utility for handling async operations
- **Validation**: Elysia's built-in type validation with custom DTOs

#### Type Safety
- **End-to-End Types**: Database models → Services → API → Frontend
- **Eden Client**: Automatically generated client SDK from backend types
- **DTO Pattern**: Structured data transfer objects for API boundaries

#### Performance Optimizations
- **Redis Caching**: Session data and frequent queries
- **Lazy Loading**: AI explanations generated on-demand
- **Connection Pooling**: Efficient database connection management
- **Async Processing**: Background jobs for non-blocking operations

### 🚀 API Design Principles

#### RESTful Routes with Semantic Grouping
- `/auth/*` - Authentication endpoints
- `/bible/*` - Bible content and AI features  
- `/user/*` - User management

#### Request/Response Patterns
- **Consistent DTOs**: Structured input validation
- **Type-Safe Responses**: Predictable response formats
- **Error Standards**: Uniform error response structure

#### Security Middleware
- **Bearer Token Guards**: Protect sensitive endpoints
- **CORS Configuration**: Cross-origin security
- **Rate Limiting**: Configurable request throttling

## Frontend Implementation

### 🎯 Next.js Architecture

The frontend is built with Next.js 14 using the App Router pattern, with heavy reliance on shared components from the `frontend-base` package.

#### Key Components
- **App Router**: Modern Next.js routing with React Server Components
- **Shared UI Library**: Comprehensive component system in `frontend-base`
- **Type-Safe API**: Eden client for seamless backend communication
- **CSS Modules**: Scoped styling with TypeScript definitions
- **Dynamic Imports**: Code splitting for optimal performance

#### Frontend Structure
```typescript
// Main layout with environment initialization
export default function RootLayout({ children }) {
  const envValues = {
    apiUrl: process.env.API_URL ?? "http://localhost:3000",
    askVerseMate: process.env.NEXT_PUBLIC_ASK_VERSE_MATE === "true"
  };
  
  return (
    <MainPage.QueryProvider>
      <BrowserRouter>{children}</BrowserRouter>
    </MainPage.QueryProvider>
  );
}
```

### 🔗 API Communication

#### Eden Client Integration
```typescript
// Type-safe API client
import { api } from '@vm/backend-api'

// Automatic type inference from backend
const response = await api.bible.books.get()
const userSession = await api.auth.session.get()
```

#### Features
- **Automatic Type Inference**: Backend types automatically available in frontend
- **Error Handling**: Centralized error handling with automatic redirects
- **Request Interceptors**: Auth token management and CORS handling

## Database Schema

### Core Tables

#### User Management
- **user**: User accounts, credentials, verification status
- **user_progress**: Reading progress tracking

#### Bible Content
- **genres**: Bible book classifications
- **books**: Bible books with testament information
- **chapters**: Chapter organization
- **verses**: Individual verse content
- **subtitles**: Chapter section headers

#### AI Features
- **explanations**: AI-generated commentary and explanations
- **explanation_ratings**: User ratings for explanations
- **prompts**: System prompts for AI generation

#### Chat System
- **conversations**: Chat threads linked to Bible chapters
- **messages**: Individual messages with role (user/assistant)

#### System Tables
- **favorites**: User bookmarks and favorites
- **kysely_migration**: Database migration tracking

### Key Relationships
- Books → Chapters → Verses (hierarchical Bible structure)
- Chapters → Explanations (AI-generated content)
- Users → Conversations → Messages (chat system)
- Users → Ratings (explanation feedback)

## AI Integration

### OpenAI GPT-5 Integration

#### Explanation Generation
```typescript
// Dynamic prompt generation based on explanation type
const getExplanationTypePrompt = (type: ExplanationTypeEnum, bookName: string, chapterNumber: number) => {
  switch (type) {
    case ExplanationTypeEnum.summary:
      return {
        prompt: `Summarize ${bookName} ${chapterNumber} in ~250 words with theological themes...`,
        temperature: 0.3
      };
    case ExplanationTypeEnum.byline:
      return {
        prompt: `Provide verse-by-verse explanation of ${bookName} ${chapterNumber}...`,
        temperature: 0.2
      };
    case ExplanationTypeEnum.detailed:
      return {
        prompt: `In-depth analysis of ${bookName} ${chapterNumber} with 500+ words...`,
        temperature: 0.1
      };
  }
};
```

#### Chat Context Building
```typescript
// Chapter-scoped AI responses
const bookAsContext = `
  Book: ${book.bookId}
  Book Name: ${book.name}
  Testament: ${testament}
  Genre: ${book.genre.n}
  Chapters: ${book.chapters.map(chapter => 
    `Chapter: ${chapter.chapterNumber}
     Verses: ${chapter.verses.map(verse => 
       `Verse ${verse.verseNumber}: ${verse.text}`
     ).join('')}`
  ).join('')}
`;
```

### AI Features
- **Context-Aware Responses**: AI limited to specific Bible chapter content
- **Multiple Explanation Types**: Different AI prompting strategies
- **Conversation Memory**: Persistent chat history with context
- **Auto-Generated Titles**: AI creates descriptive conversation names

## Development Workflow

### Essential Commands

#### Initial Setup
```bash
make install  # Docker, env files, dependencies, migrations, seeds
```

#### Development
```bash
bun dev       # Run both backend (3001) and frontend (3000)
```

#### Code Quality
```bash
bun lint      # Biome linter
bun format    # Code formatting
bun tsc       # TypeScript checking
bun stylelint # CSS linting
```

#### Database Operations
```bash
cd packages/database && bun run migrate  # Run migrations
cd packages/database && bun run seed     # Seed database
```

### Code Style Guidelines
- **2-space indentation**
- **Biome for formatting and linting**
- **TypeScript strict mode**
- **Organized imports (enforced by Biome)**
- **CSS Modules with TypeScript definitions**

### Development Patterns
- **Repository Pattern**: Data access separation
- **Service Layer**: Business logic encapsulation
- **Plugin Architecture**: Modular Elysia setup
- **Type-Safe APIs**: End-to-end type safety
- **Component Composition**: Shared UI library usage

## Deployment Strategy

### Environment Configuration
- **Backend**: `apps/backend/.env`
- **Frontend**: `apps/frontend-next/.env` 
- **Database**: `packages/database/.env`

### Infrastructure Requirements
- **PostgreSQL Database**: Primary data storage
- **Redis Instance**: Caching and session management
- **Mailgun Account**: Email delivery service
- **OpenAI API Key**: AI functionality

### Container Support
- **Docker Compose**: Local development setup
- **Dockerfile**: Individual app containerization
- **Cloudflare Workers**: Frontend deployment target
- **Database Migrations**: Automated schema management

### Production Considerations
- **Environment Variables**: Secure configuration management
- **Database Connection Pooling**: Efficient resource usage
- **Redis Caching Strategy**: Session and query optimization
- **Error Logging**: Comprehensive monitoring setup
- **API Rate Limiting**: Protection against abuse
- **CORS Configuration**: Security and access control

---

This architecture documentation provides a comprehensive overview of VerseMate's implementation, serving as a reference for development, maintenance, and future enhancements.