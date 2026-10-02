#!/bin/sh
# AgentC - Script de inicializacao (Linux/POSIX)
# Equivalente portatil do iniciar-agentc.bat para sistemas Unix-like.

set -u

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR" || exit 1

clear
echo "========================================================"
echo "                  INICIANDO AGENTC"
echo "========================================================"
echo "Diretorio: $SCRIPT_DIR"
echo ""

echo "[1/2] Agendando abertura do navegador (http://localhost:5173)..."
(
  sleep 2
  URL="http://localhost:5173"
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 || true
  else
    echo "[aviso] Nenhum comando (xdg-open/open) disponivel para abrir o navegador."
  fi
) &

echo "[2/2] Subindo Servidor Fastify e Frontend Vite..."
echo ""
echo "Pressione Ctrl+C para encerrar os servicos."
echo "========================================================"
echo ""

npm run dev