#!/bin/bash
# Quick database inspection commands

DB="docker exec postgres psql -U postgres_user -d postgres_db -c"

case "$1" in
  "tables")
    echo "📋 All Tables:"
    $DB "\dt"
    ;;
  "books")
    echo "📚 Books (first 10):"
    $DB "SELECT book_id, name, testament FROM books ORDER BY book_id LIMIT 10;"
    ;;
  "intros")
    echo "📖 Book Introductions:"
    $DB "SELECT book_id, author, language_code, is_active FROM book_introductions;"
    ;;
  "chapters")
    if [ -z "$2" ]; then
      echo "Usage: ./db-inspect.sh chapters <book_id>"
      exit 1
    fi
    echo "📑 Chapters for book $2:"
    $DB "SELECT chapter_id FROM chapters WHERE book_id=$2 ORDER BY chapter_id;"
    ;;
  "users")
    echo "👥 Users:"
    $DB "SELECT id, email, name, created_at FROM \"user\" LIMIT 10;"
    ;;
  "shell")
    echo "🐚 Opening PostgreSQL shell..."
    docker exec -it postgres psql -U postgres_user -d postgres_db
    ;;
  *)
    echo "VerseMate Database Inspector"
    echo ""
    echo "Usage: ./db-inspect.sh <command> [args]"
    echo ""
    echo "Commands:"
    echo "  tables              - List all tables"
    echo "  books               - Show first 10 books"
    echo "  intros              - Show book introductions"
    echo "  chapters <book_id>  - Show chapters for a book"
    echo "  users               - Show users"
    echo "  shell               - Open interactive PostgreSQL shell"
    echo ""
    echo "Examples:"
    echo "  ./db-inspect.sh tables"
    echo "  ./db-inspect.sh books"
    echo "  ./db-inspect.sh chapters 1"
    ;;
esac
