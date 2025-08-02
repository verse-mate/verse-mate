-- Drop existing notes table if it exists
DROP TABLE IF EXISTS notes CASCADE;

-- Create notes table with correct schema
CREATE TABLE notes (
    note_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    book_name VARCHAR(100) NOT NULL,
    chapter_number INTEGER NOT NULL,
    translation VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create index for efficient querying
CREATE INDEX notes_user_book_chapter_translation_idx 
ON notes (user_id, book_name, chapter_number, translation);

-- Confirm table creation
SELECT 'Notes table created successfully' as status;
