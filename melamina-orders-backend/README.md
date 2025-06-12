# Sistema de Automatización de Pedidos de Melamina

Backend especializado para automatizar el procesamiento de pedidos de melamina enchapada utilizando inteligencia artificial. Procesa imágenes de listas manuscritas y audios con medidas dictadas por carpinteros, extrayendo automáticamente las especificaciones y generando cotizaciones.

## 🚀 Características Principales

- **Procesamiento de Imágenes**: Extracción automática de medidas desde listas manuscritas usando GPT-4 Vision
- **Transcripción de Audio**: Conversión de audios con medidas dictadas usando Whisper AI
- **Análisis Inteligente**: Interpretación contextual de formatos diversos (ej: "2 piezas de 10 por 135 tipo D")
- **Cotización Automática**: Cálculo de precios con descuentos por volumen
- **API RESTful**: Endpoints completos para gestión de pedidos
- **Tiempo Real**: Actualizaciones SSE para seguimiento en vivo
- **Múltiples Formatos**: Exportación en JSON, CSV y TXT

## 📋 Casos de Uso

### Entrada Soportada:
- **Imágenes**: Listas manuscritas con medidas (formatos: JPG, PNG)
- **Audio**: Dictados de carpinteros con especificaciones (formatos: MP3, WAV, M4A)
- **Texto**: Especificaciones directas en formato texto

### Salida Generada:
- Medidas estructuradas y validadas
- Cotizaciones automáticas con descuentos
- Reportes de calidad y observaciones
- Historial completo de pedidos

## 🛠️ Instalación

### Prerrequisitos
- Node.js >= 18.0.0
- Cuenta OpenAI con acceso a GPT-4 Vision y Whisper
- Cuenta Cloudinary para almacenamiento de imágenes
- Redis (opcional, para cache y colas)

### Configuración

1. **Clonar y configurar el proyecto:**
```bash
git clone [url-del-repositorio]
cd melamina-orders-backend
npm install
```

2. **Configurar variables de entorno:**
```bash
cp .env.melamina.example .env
```

3. **Editar `.env` con tus credenciales:**
```env
OPENAI_API_KEY=sk-your-openai-api-key-here
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

4. **Ejecutar el servidor:**
```bash
# Desarrollo
npm run dev

# Producción
npm start
```

## 🔗 API Endpoints

### Webhook Principal
```http
POST /webhook
Content-Type: multipart/form-data

# Ejemplo con imagen
{
  "user_id": "carpintero123",
  "channel": "web",
  "type": "image",
  "image": [archivo_imagen]
}

# Ejemplo con audio
{
  "user_id": "carpintero123", 
  "channel": "web",
  "type": "audio",
  "audio": [archivo_audio]
}
```

### Gestión de Pedidos
```http
# Obtener pedido específico
GET /orders/{orderId}

# Listar pedidos
GET /orders?limit=20&cliente_id=carpintero123

# Estadísticas
GET /orders/stats/summary

# Exportar pedido
GET /orders/{orderId}/export?format=csv
```

### Actualizaciones en Tiempo Real
```http
# Conexión SSE
GET /webhook/sse/{userId}?channel=web
```

## 📊 Ejemplo de Respuesta

### Procesamiento Exitoso:
```json
{
  "id": "MEL-1699123456789-ABC",
  "fecha_creacion": "2024-06-13T04:52:00.000Z",
  "cliente": {
    "user_id": "carpintero123",
    "canal": "web"
  },
  "medidas": {
    "medidas": [
      {
        "linea": 1,
        "cantidad": 2,
        "ancho": 10,
        "alto": 135,
        "tipo": "D",
        "texto_original": "2 = 10 x 135 D"
      }
    ],
    "resumen": {
      "total_piezas": 2,
      "area_total_m2": 0.27,
      "tipos_encontrados": ["D"]
    },
    "calidad_extraccion": "alta",
    "requiere_revision": false
  },
  "cotizacion": {
    "resumen": {
      "total": 12150,
      "area_total_m2": 0.27,
      "total_piezas": 2
    },
    "condiciones": {
      "moneda": "CLP",
      "tiempo_entrega_dias": 7
    }
  }
}
```

## 🧠 Inteligencia Artificial

### Procesamiento de Imágenes
- **Modelo**: GPT-4 Vision (gpt-4o-mini)
- **Funcionalidad**: Extracción de texto y estructura de medidas
- **Formatos soportados**: Listas manuscritas, tablas, notas técnicas

### Procesamiento de Audio
- **Transcripción**: OpenAI Whisper (whisper-1)
- **Interpretación**: GPT-4 para conversión de lenguaje natural a datos estructurados
- **Manejo**: Números escritos y hablados, variaciones de formato

### Validación Inteligente
- Conversión automática de unidades (metros ↔ centímetros)
- Detección de errores comunes
- Clasificación de calidad de extracción
- Sugerencias de revisión automática

## 💰 Sistema de Cotización

### Precios Configurables:
```env
PRECIO_MELAMINA_D=45000    # Tipo D: $45,000/m²
PRECIO_MELAMINA_H=48000    # Tipo H: $48,000/m²
PRECIO_MELAMINA_L=42000    # Tipo L: $42,000/m²
PRECIO_MELAMINA_DEFAULT=40000  # Estándar: $40,000/m²
```

### Descuentos por Volumen:
- 5% descuento por más de 10m²
- 10% descuento por más de 20m²
- 15% descuento por más de 50m²

## 📁 Estructura del Proyecto

```
melamina-orders-backend/
├── src/
│   ├── config/          # Configuraciones (Redis, etc.)
│   ├── routes/          # Endpoints API
│   │   ├── webhook.js   # Endpoint principal de procesamiento
│   │   ├── orders.js    # Gestión de pedidos
│   │   └── health.js    # Health checks
│   ├── services/        # Lógica de negocio
│   │   ├── melaminaVisionService.js     # Procesamiento de imágenes
│   │   ├── melaminaAudioService.js      # Procesamiento de audio
│   │   ├── melaminaOrderProcessor.js    # Lógica principal de pedidos
│   │   ├── messageProcessor.js          # Coordinador de mensajes
│   │   └── sseManager.js               # Tiempo real
│   └── server.js        # Servidor principal
├── orders/              # Almacenamiento de pedidos
├── uploads/             # Archivos temporales
└── logs/               # Archivos de log
```

## 🔧 Configuración Avanzada

### Redis (Opcional)
```env
REDIS_URL=redis://localhost:6379
```
Mejora rendimiento con cache y gestión de colas.

### Límites de Rate Limiting
```env
RATE_LIMIT_WINDOW_MS=900000      # 15 minutos
RATE_LIMIT_MAX_REQUESTS=100      # 100 requests por ventana
```

### Limpieza Automática
```env
CLEANUP_TEMP_FILES_HOURS=24      # Limpiar archivos temporales cada 24h
CLEANUP_ORDER_FILES_DAYS=30      # Mantener pedidos por 30 días
```

## 🚀 Deploy

### Render/Heroku
```bash
# Variables de entorno requeridas:
OPENAI_API_KEY
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
NODE_ENV=production
PORT=10000
```

### Docker
```dockerfile
# Dockerfile incluido
docker build -t melamina-orders .
docker run -p 10000:10000 --env-file .env melamina-orders
```

## 📈 Monitoreo

### Health Check
```http
GET /health
```

### Estadísticas
```http
GET /orders/stats/summary
```
Proporciona métricas de pedidos procesados, áreas totales, valores cotizados, etc.

## 🔒 Seguridad

- Rate limiting por IP
- Validación de archivos (tipo y tamaño)
- Sanitización de datos de entrada
- Limpieza automática de archivos temporales
- Headers de seguridad con Helmet

## 🤝 Contribuir

1. Fork del proyecto
2. Crear rama de feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crear Pull Request

## 📄 Licencia

MIT License - ver `LICENSE` file para detalles.

## 📞 Soporte

Para soporte técnico o consultas comerciales, contactar al equipo de desarrollo.

---

**Desarrollado por César para automatización inteligente de pedidos de melamina** 🏗️🤖
