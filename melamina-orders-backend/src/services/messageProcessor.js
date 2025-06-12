const whisperService = require("./whisperService")
const visionService = require("./visionService")
const melaminaOrderProcessor = require("./melaminaOrderProcessor")
const platformDetector = require("./platformDetector")
const messageBuffer = require("./messageBuffer")
const sseManager = require("./sseManager")
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");

class MessageProcessor {
  async processIncomingMessage(payload) {
    try {
      // Detectar plataforma y extraer datos
      const platformData = platformDetector.detectPlatform(payload)

      if (!platformData) {
        console.log("⚠️  Could not detect platform or extract data")
        return null
      }

      const { channel, user_id, type, content, is_echo } = platformData

      // Filtrar mensajes echo
      if (is_echo) {
        console.log(`🔄 Filtering echo message from ${channel}:${user_id}`)
        return null
      }

      let processedContent = content
      let timerKey = `${channel}_${user_id}`

      // Log para ver el payload recibido
      console.log("Payload recibido en processIncomingMessage:", JSON.stringify(payload, null, 2));

      // Procesar con el sistema especializado de pedidos de melamina
      let orderData = null;
      let processingError = null;

      try {
        // Preprocesar audio si es necesario
        if (type === "audio" && payload.filePath) {
          const ext = path.extname(payload.filePath).toLowerCase();
          if (ext !== '.mp3') {
            const mp3File = payload.filePath.replace(/\.[^/.]+$/, ".mp3");
            await new Promise((resolve, reject) => {
              ffmpeg(payload.filePath)
                .output(mp3File)
                .audioCodec('libmp3lame')
                .on('end', resolve)
                .on('error', reject)
                .run();
            });
            
            // Eliminar archivo original y usar mp3
            if (fs.existsSync(payload.filePath)) fs.unlinkSync(payload.filePath);
            payload.filePath = mp3File;
          }
        }

        // Procesar el pedido de melamina
        console.log("🏭 Procesando pedido de melamina...");
        orderData = await melaminaOrderProcessor.processOrder(payload);
        
        // Determinar contenido procesado basado en el resultado
        if (orderData.estado === 'completado') {
          processedContent = this.formatOrderSummary(orderData);
        } else if (orderData.estado === 'requiere_revision') {
          processedContent = this.formatOrderWithWarnings(orderData);
        } else {
          processedContent = `Error procesando pedido: ${orderData.medidas?.resumen?.observaciones_generales || 'Error desconocido'}`;
        }

        console.log(`✅ Pedido procesado: ${orderData.id} - Estado: ${orderData.estado}`);

        // Enviar actualización en tiempo real via SSE
        if (sseManager) {
          const sseData = {
            tipo: 'pedido_procesado',
            pedido: orderData,
            estado: orderData.estado,
            timestamp: new Date().toISOString()
          };
          sseManager.sendMessage(user_id, channel, JSON.stringify(sseData), "order_update");
        }

      } catch (error) {
        console.error("❌ Error procesando pedido de melamina:", error);
        processingError = error.message;
        processedContent = `Error procesando pedido: ${error.message}`;
        
        // Fallback al procesamiento original si falla el sistema de melamina
        if (type === "audio" && payload.filePath) {
          try {
            processedContent = await whisperService.transcribeAudio(payload.filePath);
            console.log(`📝 Fallback audio transcription: "${processedContent}"`);
          } catch (fallbackError) {
            console.error("❌ Fallback audio transcription failed:", fallbackError);
            processedContent = "[Audio transcription failed]";
          }
        } else if (type === "image" && payload.filePath) {
          try {
            processedContent = await visionService.analyzeImage(payload.filePath);
            console.log(`📝 Fallback image analysis: "${processedContent}"`);
          } catch (fallbackError) {
            console.error("❌ Fallback image analysis failed:", fallbackError);
            processedContent = "[Image analysis failed]";
          }
        }
      }

      const processedMessage = {
        user_id,
        channel,
        type: type === "audio" ? "audio_transcribed" : type === "image" ? "image_analyzed" : type,
        content: processedContent,
        timestamp: new Date().toISOString(),
        original_type: type,
        transcription_done: type === "audio" || type === "image",
        // Información específica del pedido de melamina
        order_data: orderData,
        processing_error: processingError,
        is_melamina_order: orderData !== null
      }

      // Agregar el mensaje al buffer
      await messageBuffer.addMessage(processedMessage)

      // Iniciar el temporizador SOLO si no hay uno activo
      if (!messageBuffer.timers.has(timerKey)) {
        console.log(`⏱️ Starting 20s timer for ${channel}:${user_id} after processing ${type}`);
        messageBuffer.startFlushTimer(timerKey, channel, user_id)
      }

      return processedMessage
    } catch (error) {
      console.error("❌ Error processing message:", error)
      throw error
    }
  }

  formatOrderSummary(orderData) {
    try {
      const medidas = orderData.medidas;
      const cotizacion = orderData.cotizacion;
      
      let summary = `✅ PEDIDO PROCESADO EXITOSAMENTE\n`;
      summary += `📋 ID: ${orderData.id}\n`;
      summary += `📏 ${medidas.resumen.total_piezas} piezas | ${medidas.resumen.area_total_m2}m²\n\n`;
      
      summary += `📝 MEDIDAS EXTRAÍDAS:\n`;
      medidas.medidas.forEach((medida, index) => {
        summary += `${index + 1}. ${medida.cantidad} pzs ${medida.ancho}x${medida.alto}cm`;
        if (medida.tipo) summary += ` ${medida.tipo}`;
        summary += `\n`;
      });
      
      if (cotizacion && !cotizacion.error) {
        summary += `\n💰 COTIZACIÓN:\n`;
        summary += `Subtotal: $${cotizacion.resumen.subtotal.toLocaleString()} CLP\n`;
        if (cotizacion.resumen.descuento_porcentaje > 0) {
          summary += `Descuento (${cotizacion.resumen.descuento_porcentaje}%): -$${cotizacion.resumen.monto_descuento.toLocaleString()} CLP\n`;
        }
        summary += `TOTAL: $${cotizacion.resumen.total.toLocaleString()} CLP\n`;
        summary += `Entrega: ${cotizacion.condiciones.tiempo_entrega_dias} días\n`;
      }
      
      return summary;
    } catch (error) {
      console.error("❌ Error formateando resumen de pedido:", error);
      return `Pedido procesado (ID: ${orderData?.id || 'N/A'}) pero error formateando resumen`;
    }
  }

  formatOrderWithWarnings(orderData) {
    try {
      const medidas = orderData.medidas;
      
      let summary = `⚠️ PEDIDO PROCESADO CON OBSERVACIONES\n`;
      summary += `📋 ID: ${orderData.id}\n`;
      summary += `🔍 Calidad: ${medidas.calidad_extraccion}\n`;
      summary += `📏 ${medidas.resumen.total_piezas} piezas | ${medidas.resumen.area_total_m2}m²\n\n`;
      
      summary += `📝 MEDIDAS EXTRAÍDAS:\n`;
      medidas.medidas.forEach((medida, index) => {
        summary += `${index + 1}. ${medida.cantidad} pzs ${medida.ancho}x${medida.alto}cm`;
        if (medida.tipo) summary += ` ${medida.tipo}`;
        if (medida.observaciones) summary += ` ⚠️`;
        summary += `\n`;
      });
      
      if (medidas.resumen.observaciones_generales) {
        summary += `\n📌 OBSERVACIONES:\n${medidas.resumen.observaciones_generales}\n`;
      }
      
      summary += `\n👀 Por favor revisa las medidas antes de confirmar el pedido.`;
      
      return summary;
    } catch (error) {
      console.error("❌ Error formateando pedido con warnings:", error);
      return `Pedido procesado con observaciones (ID: ${orderData?.id || 'N/A'})`;
    }
  }
}

module.exports = new MessageProcessor()
