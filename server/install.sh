#!/bin/bash
# Script de instalación para ElToque Rate Fetcher
# Ejecución: sudo ./install.sh

set -e

echo "========================================="
echo "ElToque Rate Fetcher - Instalación"
echo "========================================="

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Variables
INSTALL_DIR="/opt/eltoque-rate-fetcher"
OUTPUT_FILE="/var/www/rates.json"
SERVICE_USER="www-data"

# Verificar que se ejecuta como root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Error: Ejecutar como root (sudo)${NC}"
  exit 1
fi

# Verificar Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}Error: Node.js no está instalado${NC}"
  exit 1
fi

echo -e "${YELLOW}Versión de Node.js:$(node --version)${NC}"

# Crear directorio de instalación
echo "Creando directorio de instalación..."
mkdir -p $INSTALL_DIR
mkdir -p $(dirname $OUTPUT_FILE)

# Copiar archivos
echo "Copiando archivos..."
cp -r . $INSTALL_DIR/ 2>/dev/null || true

# Instalar dependencias
echo "Instalando dependencias..."
cd $INSTALL_DIR
npm install --production

# Ajustar permisos
echo "Ajustando permisos..."
chown -R $SERVICE_USER:$SERVICE_USER $INSTALL_DIR
chown -R $SERVICE_USER:$SERVICE_USER $(dirname $OUTPUT_FILE)
chmod +x $INSTALL_DIR/rate-fetcher.js

# Copiar archivos systemd
echo "Configurando systemd..."
cp $INSTALL_DIR/systemd/rate-fetcher.service /etc/systemd/system/
cp $INSTALL_DIR/systemd/rate-fetcher.timer /etc/systemd/system/

# Recargar systemd
systemctl daemon-reload

# Habilitar e iniciar timer
systemctl enable rate-fetcher.timer
systemctl start rate-fetcher.timer

# Ejecutar una vez para generar datos iniciales
echo "Generando datos iniciales..."
sudo -u $SERVICE_USER node $INSTALL_DIR/rate-fetcher.js

echo ""
echo -e "${GREEN}========================================="
echo "Instalación completada!"
echo -e "=========================================${NC}"
echo ""
echo "Archivos systemd:"
echo "  - /etc/systemd/system/rate-fetcher.service"
echo "  - /etc/systemd/system/rate-fetcher.timer"
echo ""
echo "Datos generados en: $OUTPUT_FILE"
echo ""
echo "Comandos útiles:"
echo "  Ver estado:    systemctl status rate-fetcher.timer"
echo "  Ver logs:      journalctl -u rate-fetcher -f"
echo "  Forzar ejecución: systemctl start rate-fetcher.service"
echo "  Detener timer:    systemctl stop rate-fetcher.timer"
