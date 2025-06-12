# Proyecto: Sistema de Automatización de Pedidos de Melamina

## Objetivo
Desarrollar una aplicación basada en el backend chat-aggregator-backend-v2 para automatizar el procesamiento de pedidos de melamina enchapada que reciben los carpinteros mediante fotos de listas manuscritas o audios con medidas.

## Análisis del Proyecto Actual
**Fortalezas identificadas:**
- ✅ Backend completo con Express.js
- ✅ Sistema de procesamiento de imágenes con GPT-4 Vision
- ✅ Transcripción de audio con OpenAI Whisper
- ✅ Integración con Cloudinary para almacenamiento
- ✅ Sistema de colas con Redis
- ✅ Upload de archivos con Multer
- ✅ SSE para respuestas en tiempo real
- ✅ Rate limiting y validaciones de seguridad

**Funcionalidad a desarrollar:**
- Extracción automática de medidas de listas manuscritas
- Procesamiento de audios con especificaciones de cortes
- Generación de cotizaciones estructuradas
- Interface web optimizada para carpinteros/vendedores

## Plan de Desarrollo

### [x] PASO 1: Análisis y Adaptación del Backend Existente → Sistema PASO
**Objetivo:** Modificar el proyecto actual para enfocarlo en el procesamiento específico de pedidos de melamina
- Clonar y configurar el proyecto base
- Adaptar el servicio de visión para extraer medidas específicas
- Optimizar prompts de OpenAI para reconocimiento de listas de medidas
- Crear modelos de datos específicos para pedidos de melamina
- Adaptar validaciones para tipos de mensaje específicos

### [ ] PASO 2: Desarrollo del Procesador de Medidas Inteligente → Sistema PASO
**Objetivo:** Crear lógica especializada para interpretar y estructurar las medidas extraídas
- Desarrollar parser para formatos comunes (cantidad x ancho x alto + tipo)
- Implementar validaciones de medidas y formatos
- Crear sistema de corrección automática de errores comunes
- Integrar cálculos de área total y optimización de cortes
- Generar estructuras de datos normalizadas para cotizaciones

### [ ] PASO 3: Interface Web Completa para Pedidos → Desarrollo Web PASO
**Objetivo:** Construir interface web optimizada inspirada en la app de Manus pero específica para medidas
- Crear formulario intuitivo para upload de fotos/audios
- Desarrollar preview en tiempo real de medidas extraídas
- Implementar editor manual para correcciones
- Integrar calculadora de precios automática
- Crear sistema de exportación de cotizaciones (PDF/WhatsApp)

### [ ] PASO 4: Optimización y Funcionalidades Avanzadas → Sistema PASO
**Objetivo:** Agregar funcionalidades avanzadas y optimizaciones para uso profesional
- Implementar historial de pedidos por cliente
- Crear templates de medidas frecuentes
- Agregar validación cruzada imagen vs audio
- Implementar notificaciones automáticas
- Optimizar tiempos de procesamiento
- Crear sistema de backup y logs detallados

## Entregable Final
Sistema web completo que automatice:
1. **Recepción**: Upload de fotos/audios por carpinteros
2. **Procesamiento**: Extracción automática de medidas con IA
3. **Validación**: Preview y corrección manual si necesario
4. **Cotización**: Generación automática de precios y especificaciones
5. **Comunicación**: Envío estructurado al cliente via WhatsApp/PDF

## Tecnologías a Utilizar
- **Backend**: Express.js (base existente) + nuevos servicios especializados
- **IA**: OpenAI GPT-4 Vision + Whisper (ya configurados)
- **Frontend**: React.js con interfaz optimizada para móviles
- **Storage**: Cloudinary (ya configurado)
- **Base de datos**: Redis + archivo JSON para persistencia
- **Deploy**: Manteniendo infraestructura actual de César
