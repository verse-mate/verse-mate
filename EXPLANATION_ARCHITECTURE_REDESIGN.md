# Architecture Redesign: Line-by-Line Bible Explanations

## 1. Problem Statement

The current implementation for generating line-by-line Bible explanations has a significant architectural flaw. The backend sends a prompt to the AI model requesting an explanation for a specific chapter *without* providing the actual Bible text for that chapter as context.

This leads to two primary issues:

1.  **Inaccuracy:** The AI model relies on its internal, "memorized" knowledge of the Bible. This can lead to it quoting verses that are incorrect, incomplete, or from a different translation than the one the user has selected.
2.  **Inefficiency:** When the AI does quote verses, it uses a large number of output tokens to generate text that we already have available in our local Bible data source. This increases API costs unnecessarily.

## 2. Goals and Objectives

The goal of this redesign is to create a more accurate, efficient, and reliable system for generating line-by-line explanations.

-   **Accuracy:** Ensure that all Bible verses displayed in the explanation are sourced directly from our own trusted Bible JSON data, matching the user's selected translation.
-   **Cost-Effectiveness:** Reduce AI API costs by minimizing the number of tokens the model generates. The model should output verse *references*, not the full verse *text*.
-   **Maintainability:** Create a clear and decoupled process where the AI is responsible for commentary and the backend is responsible for data hydration.

## 3. Proposed Architecture

The proposed solution is to shift the responsibility of providing verse text from the AI to our backend. The backend will instruct the AI to return placeholders for Bible verses, which it will then replace with the actual text from our Bible data source.

### Data Flow

Here is the step-by-step data flow for the new system:

1.  **Backend: AI Prompt Modification**
    -   The backend constructs the prompt for the AI model.
    -   A crucial instruction will be added to the system prompt/user prompts, telling the AI how to format verse references.
    -   **New Instruction Example:** "When you quote a Bible verse, you MUST use the format `{verse:BOOK CHAPTER:VERSE}`. For example, to quote Genesis 1:1, you must write `{verse:Genesis 1:1}`. Do NOT write out the text of the verse yourself."

2.  **AI Model: Generate Response**
    -   The AI receives the prompt and generates the line-by-line explanation.
    -   Following the instructions, its output will contain placeholders instead of full verse text.
    -   **Example AI Raw Output:** 
        ## Genesis 1:1
        > {verse:Genesis 1:1}

        ### Summary
        This opening declares that God is the uncaused origin of all reality, inaugurating time, space, and matter. The Hebrew uses **bara** — to create by God’s sovereign initiative — signaling divine activity that brings into existence what did not exist before (Hebrews 11:3). The subject is **Elohim**, the majestic, personal God who stands before and above the universe (Psalm 90:2). This verse grounds the biblical worldview of God’s absolute sovereignty and establishes that creation exists by His will and for His glory (Revelation 4:11; John 1:1–3).

3.  **Backend: Post-Processing and Verse Hydration**
    -   The backend receives the raw, placeholder-filled response from the AI.
    -   It uses a regular expression (e.g., `/{verse:([^}]+)}/g`) to find all verse placeholders.
    -   For each placeholder found, it extracts the biblical reference (e.g., "Genesis 1:1").
    -   It uses our internal Bible JSON data service to look up the full text for that specific verse reference.
    -   It replaces the placeholder (e.g., `{verse:John 3:16}`) with the actual verse text (e.g., "For God so loved the world...").

4.  **Backend: Send Final Response**
    -   The backend sends the fully "hydrated" and complete explanation text to the database.

5.  **Frontend: Display Explanation**
    -   The frontend receives the final, complete text and displays it to the user.

### Simple Data Flow Diagram

```
[Frontend] -> Request Explanation(John 3) -> [Backend]
                                                 |
                                                 v
           [AI Model] <- Prompt w/ Formatting Rules <- [Backend]
               |
               v
[Backend] <- Raw Text with {verse:John 3:16} placeholders
    |
    v
[Verse Hydration Service] -> Looks up "John 3:16" in Bible JSON
    |
    v
[Backend] -> Sends fully formed text to Frontend
    |
    v
[Frontend] -> Displays final explanation to user
```

## 4. Components to be Modified

-   **AI Prompting Service (Backend):** The system and user prompts for the line-by-line explanation feature need to be updated to include the new verse placeholder formatting rules.
-   **Explanation Post-Processing Service (Backend):** A new function or service needs to be created. This service will be responsible for parsing the AI's output, finding all verse placeholders, calling the `BibleDataService` to get the verse text, and performing the replacement. Most likely the replace will be after it's stored in the database, so we can use it on already existing explanations.
-   **Bible Data Service (Backend):** This service likely already exists under a form or another. It will be used by the new post-processing service to retrieve verse text based on a reference string.

## 5. Advantages of this Approach

-   **Guaranteed Accuracy:** Verse text is always sourced from our ground truth data.
-   **Significant Cost Reduction:** The token count for AI-generated responses will be drastically lower.
-   **Single Source of Truth:** The Bible JSON remains the single source of truth for biblical text, simplifying maintenance.

## 6. Potential Risks and Considerations

-   **AI Formatting Adherence:** The AI might not always perfectly adhere to the `{verse:REFERENCE}` format. The post-processing service should be resilient to minor variations if possible, or gracefully fail (e.g., leave the placeholder in the text) if a reference is malformed.
-   **Verse Reference Parsing:** The Bible data service needs a robust parser that can handle different book abbreviations or formats if the AI generates them (e.g., "1 Cor" vs. "1 Corinthians"). The prompt should strongly encourage a specific format.
