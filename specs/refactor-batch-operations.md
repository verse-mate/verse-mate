# Refactoring Specification for `BatchOperationService`

**Author:** Gemini
**Date:** 2025-10-08

## 1. Overview

This document outlines the plan for refactoring the `BatchOperationService` located in `packages/backend-base/src/admin/services/batch-operations.service.ts`. The current service has grown to over 3,000 lines and violates the Single Responsibility Principle by handling the logic for all batch types.

The proposed refactoring will adopt the **Strategy design pattern** to modularize the code, improve maintainability, and make the system more extensible.

## 2. Problems with the Current Implementation

- **High Coupling:** All batch creation and processing logic is tightly coupled in one massive file.
- **Difficult to Maintain:** Finding and modifying the logic for a specific batch type is cumbersome and error-prone.
- **Poor Readability:** The file's size and complexity make it difficult for developers to understand the flow of data and control.
- **Hard to Extend:** Adding a new batch type requires modifying this already large file, increasing the risk of introducing regressions.

## 3. Proposed Architecture

The core idea is to separate the unique logic for each batch type (the "strategy") from the generic, high-level process of managing batches (the "coordinator").

### 3.1. New File Structure

A new directory, `services/batch-strategies/`, will be created to house the individual strategies.

```
services/
|-- batch-operations.service.ts   // Becomes the "Coordinator"
|-- batch-processing.service.ts   // New service for processing completed batches
|-- batch-strategies/
|   |-- IBatchStrategy.ts         // The common interface for all strategies
|   |-- book-explanation.strategy.ts
|   |-- rephrase.strategy.ts
|   |-- topic-discovery.strategy.ts
|   |-- topic-explanations.strategy.ts
|   |-- topic-references.strategy.ts
|   `-- translate.strategy.ts
```

### 3.2. The `IBatchStrategy` Interface

This interface will define the contract that all strategy classes must adhere to.

```typescript
// file: services/batch-strategies/IBatchStrategy.ts

// Represents a single request to be included in the OpenAI batch file
interface BatchJobRequest {
  custom_id: string;
  method: "POST";
  url: "/v1/responses";
  body: {
    model: string;
    reasoning: { effort: "low" | "medium" | "high" };
    instructions: string;
    input: string;
    max_output_tokens: number;
  };
}

// Interface for all batch strategies
export interface IBatchStrategy {
  /**
   * Generates the array of requests for the OpenAI batch file.
   * @param options - A flexible object containing all necessary data (e.g., bookId, bibleVersion, topicId).
   * @returns A promise that resolves to an array of BatchJobRequest objects.
   */
  generateRequests(options: any): Promise<BatchJobRequest[]>;

  /**
   * Processes a single line of the output file from a completed OpenAI batch.
   * @param result - An object containing the custom_id and the full response from the AI for a single request.
   * @returns A promise that resolves when the processing is complete.
   */
  processResult(result: { custom_id: string; response: any }): Promise<void>;
}
```

### 3.3. The Refactored `BatchOperationService` (Coordinator)

This service will be responsible for the generic parts of **creating** a batch.

- It will have methods like `generateTopicDiscoveryBatch`, `generateBookBatch`, etc.
- However, these methods will be very short. They will:
  1.  Instantiate the appropriate strategy (e.g., `new TopicDiscoveryStrategy()`).
  2.  Call the strategy's `generateRequests(options)` method.
  3.  Take the returned array of requests and handle the generic tasks:
      - Creating the JSONL file content.
      - Uploading the file to OpenAI.
      - Creating the batch via the OpenAI API.
      - Inserting the initial record into the `batch_jobs` table.
      - Adding the job to the `batchMonitoringQueue`.

### 3.4. The New `BatchProcessingService`

This service will be responsible for the generic parts of **processing** a completed batch. The BullMQ worker for the `batchProcessingQueue` will call this service.

- It will have a single main method, `processBatch(batchId, outputFileId)`.
- This method will:
  1.  Download the output file from OpenAI.
  2.  Read the file line by line.
  3.  For each line, it will parse the JSON and inspect the `custom_id`.
  4.  It will use a "factory" or a `switch` statement to determine which strategy to use based on the `custom_id` prefix (e.g., `"topic-discovery-"`, `"rephrase|"`).
  5.  It will instantiate the correct strategy and call its `processResult(lineData)` method.
  6.  After processing all lines, it will perform the final generic tasks:
      - Calculating the total cost of the batch.
      - Updating the `batch_jobs` table with the final status, cost, and token counts.

## 4. Implementation Steps

1.  **Create the `specs` directory and add this file.**
2.  **Create the `services/batch-strategies/` directory.**
3.  **Define and create `IBatchStrategy.ts`.**
4.  **Create the new `BatchProcessingService.ts` file.**
5.  **Refactor one batch type at a time to minimize risk.**
    - Start with `topic-discovery`.
    - Create `topic-discovery.strategy.ts`.
    - Move the relevant logic from `BatchOperationService` into the new strategy file.
    - Update `BatchOperationService` to use the new strategy.
    - Update the `batchProcessingQueue` worker to call the new `BatchProcessingService`.
    - Test thoroughly.
6.  **Repeat Step 5** for each of the other batch types (`topic-references`, `book-explanation`, etc.) until the original `BatchOperationService` is fully refactored.

## 5. Benefits

- **Improved Readability & Maintainability:** Code for each batch type will be isolated and easy to find.
- **Reduced Complexity:** The main services will be simple coordinators, making their logic easy to follow.
- **Enhanced Extensibility:** Adding a new batch type will be as simple as creating a new strategy file, with no changes needed to the core services.
- **Better Testability:** Each strategy can be unit-tested in isolation.
