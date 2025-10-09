/**
 * Type inference test for Eden Treaty
 * This file checks if types are properly inferred from the backend
 */

import { treaty } from "@elysiajs/eden";
import type { App } from "../../../apps/backend/src/index";

// Direct test without the custom fetcher
const testApi = treaty<App>("http://localhost:3001");

// Test: Check if routes are typed
type ApiStructure = typeof testApi;

// Extract bible routes type
type BibleRoutes = ApiStructure["bible"];

// Check if books route exists and is typed
type BooksRoute = BibleRoutes["books"];

// Test actual response by extracting the return type
type BooksGetResponse = ReturnType<BooksRoute["get"]>;

// This should resolve to a Promise with typed data
type AwaitedBooksResponse = Awaited<BooksGetResponse>;

// If this shows 'any', we have a problem
type BooksData = AwaitedBooksResponse extends { data: infer D } ? D : never;

// Check auth routes
type AuthRoutes = ApiStructure["auth"];
type LoginRoute = AuthRoutes["login"];
type LoginPostResponse = ReturnType<LoginRoute["post"]>;

// Export for inspection - hover over these in your IDE to see the types
export type TEST_ApiStructure = ApiStructure;
export type TEST_BooksData = BooksData;
export type TEST_AwaitedBooksResponse = AwaitedBooksResponse;
