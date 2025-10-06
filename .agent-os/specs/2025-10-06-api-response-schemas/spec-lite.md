# API Response Schemas - Lite Summary

Add explicit response type schemas to all API endpoints (auth, bible, user, admin) using Elysia's response property to generate complete OpenAPI documentation. Implement standardized error handling with global error handler and custom error classes for consistent error responses across the API.

## Key Points
- Complete OpenAPI documentation with response schemas for all endpoints
- Standardized error handling with custom error classes (UnauthorizedError, ForbiddenError, NotFoundError, ValidationError)
- Maintain Eden Treaty compatibility and type inference for frontend integration
