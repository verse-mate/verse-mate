# Replace Remaining t.Any() Types - Lite Summary

Complete the type safety migration by replacing 32 remaining t.Any() instances with proper TypeBox schemas, ensuring full type safety across all API endpoints for Eden Treaty clients and accurate OpenAPI documentation.

## Key Points
- Replace 11 t.Any() instances in Bible plugin with proper schemas for books, chat history, conversations, ratings, and reading progress
- Replace 21 t.Any() instances in Admin plugin with proper schemas for users, batches, explanations, prompts, and analytics
- Implement in phases by complexity: Simple (20), Medium (8), Complex (2), with 2 intentionally dynamic types documented
