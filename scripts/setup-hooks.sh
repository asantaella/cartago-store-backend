#!/bin/sh
# Configura los git hooks del proyecto.
# Ejecutar después de clonar el repo:  sh scripts/setup-hooks.sh

HOOKS_DIR=$(dirname "$0")/git-hooks
GIT_HOOKS=$(git rev-parse --git-dir)/hooks

echo "🔗 Instalando git hooks desde $HOOKS_DIR..."

for hook in pre-push; do
  if [ -f "$HOOKS_DIR/$hook" ]; then
    cp "$HOOKS_DIR/$hook" "$GIT_HOOKS/$hook"
    chmod +x "$GIT_HOOKS/$hook"
    echo "   ✅ $hook instalado"
  else
    echo "   ⚠️  $hook no encontrado en $HOOKS_DIR"
  fi
done

echo "✅ Hooks instalados correctamente."
