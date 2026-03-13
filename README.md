# 🍞 BBAlert — Tasas ElToque

[![Versión](https://img.shields.io/github/v/release/ersus93/eltoque-extension?include_prereleases&style=flat-square)](https://github.com/ersus93/eltoque-extension/releases)
[![Licencia](https://img.shields.io/github/license/ersus93/eltoque-extension?style=flat-square)](LICENSE)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/bitbread-alerts-tasas-eltoque?style=flat-square)](https://chromewebstore.google.com/detail/bitbread-alerts-tasas-eltoque)
[![Firefox Add-ons](https://img.shields.io/firefox/addon/eltoque-tasas?style=flat-square)](https://addons.mozilla.org/addon/eltoque-tasas/)
[![Estado del build](https://img.shields.io/github/actions/workflow/status/ersus93/eltoque-extension/release.yml?style=flat-square)](https://github.com/ersus93/eltoque-extension/actions)

> Extensión de navegador para consultar las tasas de cambio del mercado informal cubano. Accede rápidamente escribiendo `et` en la barra de direcciones.

BBAlert es una extensión no oficial que muestra en tiempo real las tasas de cambio del mercado informal cubano (TRMI) publicadas por [eltoque.com](https://eltoque.com/tasas-de-cambio-cuba). Diseñada para ser rápida, configurable y discreta.

---

## ✨ Características

### 📊 Visualización en Tiempo Real
- **Popup interactivo** — Muestra todas las tasas con indicadores de cambio (↑ ↓ —)
- **Ticker animado** — Barra de scrolling horizontal o vertical con las monedas
- **Nueva pestaña personalizada** — Widget de tasas al abrir una nueva pestaña
- **Overlay en páginas** — Muestra el ticker flotando sobre cualquier sitio web

### ⚡ Acceso Rápido
- **Omnibox** — Escribe `et` en la barra de direcciones para acceso instantáneo
  - `et` → Ver todas las monedas
  - `et USD` → Ir directo al dólar
- **Badge dinámico** — El ícono de la extensión rota entre monedas
- **Notificaciones** — Alertas cuando una moneda cambia significativamente

### 🎨 Personalización
- **Tema claro/oscuro/automático**
- **Colores personalizables** para cambios positivos/negativos
- **Modo compacto** para mostrar más información
- **Configuración de velocidad** del ticker
- **Selección de monedas** a mostrar y orden personalizado

### 🔧 Configuración Avanzada
- Intervalo de actualización configurable (5 min - 4 horas)
- API key opcional pararate-limit de la API
- Posición, altura y opacidad del overlay
- Control de rotación del ícono en la barra del navegador

---

## 🚀 Instalación

### Navegadores Soportados
| Navegador | Instalación |
|-----------|-------------|
| Chrome | [Chrome Web Store](https://chromewebstore.google.com/detail/bitbread-alerts-tasas-eltoque) |
| Edge | Compatible con extensiones de Chrome |
| Firefox | [Firefox Add-ons](https://addons.mozilla.org/addon/eltoque-tasas/) |
| Brave | Compatible con extensiones de Chrome |
| Opera | Compatible con extensiones de Chrome |

### Instalación Manual (Desarrollo)

```bash
# Clonar el repositorio
git clone https://github.com/ersus93/eltoque-extension.git
cd eltoque-extension

# Chrome / Edge / Brave
# 1. Abre chrome://extensions
# 2. Activa "Modo de desarrollador"
# 3. Clic en "Cargar descomprimida"
# 4. Selecciona la carpeta del proyecto

# Firefox
# 1. Abre about:debugging#/runtime/this-firefox
# 2. Clic en "Cargar complemento temporal..."
# 3. Selecciona manifest.json
```

---

## 📁 Estructura del Proyecto

```
eltoque-extension/
├── manifest.json          # Manifest V3 - configuración de la extensión
├── LICENSE                # Licencia MIT
├── README.md              # Este archivo
├── .gitignore             # Configuración de Git
├── icons/                 # Íconos de la extensión
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── background.js      # Service Worker - API, alarmas, notificaciones
    ├── content.js         # Script inyectado en páginas (overlay)
    ├── content.css        # Estilos del overlay
    ├── popup.html         # Interfaz del popup
    ├── popup.js           # Lógica del popup
    ├── popup.css          # Estilos del popup
    ├── options.html       # Página de configuración
    ├── options.js        # Lógica de configuración
    ├── options.css       # Estilos de opciones
    ├── newtab.html        # Página de nueva pestaña
    └── newtab.js          # Lógica de nueva pestaña
```

---

## 🔌 API y Fuentes de Datos

### API Principal
- **URL**: `https://tasas.eltoque.com/v1/trmi`
- **Fuente**: El Toque - Mercado Informal de Divisas
- **Frecuencia**: Actualización automática configurable (default: 30 min)

### APIs Secundarias (Respaldo)
- `https://api.binance.com`
- `https://api.binance.us`

### Monedas Soportadas
| Código | Nombre | Símbolo |
|--------|--------|---------|
| USD | Dólar estadounidense | $ |
| EUR | Euro | € |
| MLC | Moneda Libremente Convertible | ₱ |
| BTC | Bitcoin | ₿ |
| USDT | Tether | ₮ |
| TRX | TRON | ⚡ |

---

## ⚙️ Desarrollo

### Requisitos
- Node.js 18+
- npm 9+

### Scripts Disponibles

```bash
# Instalar dependencias
npm install

# Build de producción
npm run build

# Build de desarrollo con watch
npm run dev

# Validar extensión
npm run lint
```

### Ramas del Repositorio

| Rama | Propósito |
|------|-----------|
| `main` | Código estable publicado |
| `dev` | Desarrollo de nuevas funcionalidades |

**Flujo de trabajo:**
1. Las nuevas funcionalidades se desarrollan en `dev`
2. Se crea un Pull Request hacia `main`
3. Después de revisión y pruebas, se hace merge a `main`
4. Se publica una nueva versión desde `main`

---

## 📜 Licencia

Este proyecto está bajo la **Licencia MIT**. Consulta el archivo [LICENSE](LICENSE) para más detalles.

```
Copyright (c) 2026 BitBread - El Toque Extension (No Oficial)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
```

---

## ⚠️ Disclaimer

Esta es una **extensión no oficial** y no está afiliada, patrocinada ni respaldada por [eltoque.com](https://eltoque.com) ni por ningún medio de comunicación cubano. Los datos mostrados son obtenidos directamente de la API pública de tasas.eltoque.com.

Esta extensión es solo para fines informativos. No constituye asesoramiento financiero ni debe utilizarse para toma de decisiones financieras.

---

## 🔗 Enlaces Útiles

- [Sitio web de El Toque](https://eltoque.com)
- [API de Tasas](https://tasas.eltoque.com)
- [Chrome Web Store](https://chromewebstore.google.com/detail/bitbread-alerts-tasas-eltoque)
- [Firefox Add-ons](https://addons.mozilla.org/addon/eltoque-tasas/)
- [Reportar un problema](https://github.com/ersus93/eltoque-extension/issues)

---

<div align="center">

🍞 **Hecho con ☕ para Cuba**

</div>
