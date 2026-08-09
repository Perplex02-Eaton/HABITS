#!/bin/bash
# hermes-tasks.sh — Hermes ↔ HABITS bridge
# Gestiona tareas en la tabla hermes_tasks de Supabase

SUPABASE_URL="https://rwyqefehgelmcrrbvbmu.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3eXFlZmVoZ2VsbWNycmJ2Ym11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMDQ0NTAsImV4cCI6MjEwMTY4MDQ1MH0.WTPrkC9oMveMLxCCi2RvGFNRM8T7H4wi6Y3O5xMxSRY"
HEADERS=(-H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json")

case "$1" in
  add)
    # Usage: hermes-tasks.sh add '{"title":"...","due_date":"2026-08-10",...}'
    curl -s "$SUPABASE_URL/rest/v1/hermes_tasks" "${HEADERS[@]}" \
      -H "Prefer: return=representation" -X POST -d "$2"
    ;;
  list)
    # Usage: hermes-tasks.sh list [pending|done|all]
    FILTER="${2:-pending}"
    if [ "$FILTER" = "all" ]; then
      curl -s "$SUPABASE_URL/rest/v1/hermes_tasks?select=*&order=due_date.asc" "${HEADERS[@]}"
    else
      curl -s "$SUPABASE_URL/rest/v1/hermes_tasks?select=*&status=eq.$FILTER&order=due_date.asc" "${HEADERS[@]}"
    fi
    ;;
  done)
    # Usage: hermes-tasks.sh done <id>
    curl -s "$SUPABASE_URL/rest/v1/hermes_tasks?id=eq.$2" "${HEADERS[@]}" \
      -X PATCH -d '{"status":"done"}'
    ;;
  delete)
    # Usage: hermes-tasks.sh delete <id>
    curl -s "$SUPABASE_URL/rest/v1/hermes_tasks?id=eq.$2" "${HEADERS[@]}" -X DELETE
    ;;
  *)
    echo "Usage: hermes-tasks.sh [add|list|done|delete] [args]"
    ;;
esac
