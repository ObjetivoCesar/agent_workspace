const melaminaVisionService = require('./melaminaVisionService');
const melaminaAudioService = require('./melaminaAudioService');
const fs = require('fs');
const path = require('path');

class MelaminaOrderProcessor {
  constructor() {
    this.ordersDir = path.join(__dirname, '../../orders');
    this.ensureOrdersDirectory();
  }

  ensureOrdersDirectory() {
    if (!fs.existsSync(this.ordersDir)) {
      fs.mkdirSync(this.ordersDir, { recursive: true });
      console.log("📁 Directorio de pedidos creado:", this.ordersDir);
    }
  }

  async processOrder(payload) {
    try {
      console.log("🏭 Iniciando procesamiento de pedido de melamina...");
      
      const orderId = this.generateOrderId();
      const orderStartTime = new Date();
      
      let processedData = null;
      let processingMethod = null;
      
      // Determinar método de procesamiento basado en el tipo
      if (payload.type === 'image' && payload.filePath) {
        console.log("📸 Procesando pedido desde imagen...");
        processingMethod = 'imagen';
        processedData = await melaminaVisionService.extractMeasurements(payload.filePath);
      } else if (payload.type === 'audio' && payload.filePath) {
        console.log("🎤 Procesando pedido desde audio...");
        processingMethod = 'audio';
        processedData = await melaminaAudioService.processAudioMeasurements(payload.filePath);
      } else if (payload.type === 'text' && payload.text) {
        console.log("📝 Procesando pedido desde texto...");
        processingMethod = 'texto';
        processedData = await melaminaAudioService.extractMeasurementsFromText(payload.text);
      } else {
        throw new Error("Tipo de entrada no válido o falta información requerida");
      }

      // Crear estructura completa del pedido
      const order = {
        id: orderId,
        fecha_creacion: orderStartTime.toISOString(),
        cliente: {
          user_id: payload.user_id || 'anonimo',
          canal: payload.channel || 'web',
          informacion_adicional: payload.customer_info || {}
        },
        entrada: {
          tipo: processingMethod,
          archivo_original: payload.originalName || null,
          texto_original: payload.text || null,
          mimetype: payload.mimetype || null
        },
        medidas: processedData,
        estado: this.determineOrderStatus(processedData),
        tiempo_procesamiento: new Date() - orderStartTime,
        version: "1.0"
      };

      // Guardar pedido
      await this.saveOrder(order);
      
      // Calcular cotización básica si las medidas están completas
      if (order.estado === 'completado') {
        order.cotizacion = this.calculateBasicQuote(processedData);
      }

      console.log(`✅ Pedido ${orderId} procesado en ${order.tiempo_procesamiento}ms`);
      
      return order;

    } catch (error) {
      console.error("❌ Error procesando pedido de melamina:", error);
      throw new Error(`Failed to process melamina order: ${error.message}`);
    }
  }

  determineOrderStatus(processedData) {
    if (!processedData || !processedData.medidas || processedData.medidas.length === 0) {
      return 'fallido';
    }
    
    if (processedData.requiere_revision || processedData.calidad_extraccion === 'baja') {
      return 'requiere_revision';
    }
    
    if (processedData.calidad_extraccion === 'media') {
      return 'revision_opcional';
    }
    
    return 'completado';
  }

  calculateBasicQuote(measurementsData) {
    try {
      console.log("💰 Calculando cotización básica...");
      
      // Precios por m² según tipo (estos son ejemplos, deberían venir de configuración)
      const preciosPorTipo = {
        'D': 45000, // Precio por m² en pesos chilenos (ejemplo)
        'H': 48000,
        'L': 42000,
        'default': 40000
      };
      
      const descuentosPorVolumen = [
        { minM2: 10, descuento: 0.05 },  // 5% descuento por más de 10m²
        { minM2: 20, descuento: 0.10 },  // 10% descuento por más de 20m²
        { minM2: 50, descuento: 0.15 }   // 15% descuento por más de 50m²
      ];

      let costoTotal = 0;
      let detalleLineas = [];

      measurementsData.medidas.forEach((medida, index) => {
        if (medida.ancho > 0 && medida.alto > 0 && medida.cantidad > 0) {
          const areaLinea = (medida.ancho * medida.alto * medida.cantidad) / 10000; // cm² a m²
          const precioM2 = preciosPorTipo[medida.tipo] || preciosPorTipo.default;
          const costoLinea = areaLinea * precioM2;
          
          costoTotal += costoLinea;
          
          detalleLineas.push({
            linea: medida.linea,
            descripcion: `${medida.cantidad} pzs ${medida.ancho}x${medida.alto}cm ${medida.tipo || 'STD'}`,
            area_m2: Math.round(areaLinea * 100) / 100,
            precio_m2: precioM2,
            subtotal: Math.round(costoLinea)
          });
        }
      });

      // Aplicar descuento por volumen
      let descuentoAplicado = 0;
      const areaTotalM2 = measurementsData.resumen.area_total_m2;
      
      for (const descuento of descuentosPorVolumen.reverse()) {
        if (areaTotalM2 >= descuento.minM2) {
          descuentoAplicado = descuento.descuento;
          break;
        }
      }

      const montoDescuento = costoTotal * descuentoAplicado;
      const totalConDescuento = costoTotal - montoDescuento;

      const cotizacion = {
        detalle_lineas: detalleLineas,
        resumen: {
          subtotal: Math.round(costoTotal),
          descuento_porcentaje: descuentoAplicado * 100,
          monto_descuento: Math.round(montoDescuento),
          total: Math.round(totalConDescuento),
          area_total_m2: areaTotalM2,
          total_piezas: measurementsData.resumen.total_piezas
        },
        condiciones: {
          moneda: "CLP",
          validez_dias: 15,
          incluye_instalacion: false,
          tiempo_entrega_dias: 7
        },
        fecha_cotizacion: new Date().toISOString()
      };

      console.log(`💰 Cotización calculada: $${cotizacion.resumen.total.toLocaleString()} CLP`);
      
      return cotizacion;

    } catch (error) {
      console.error("❌ Error calculando cotización:", error);
      return {
        error: "No se pudo calcular la cotización automáticamente",
        detalle_error: error.message
      };
    }
  }

  async saveOrder(order) {
    try {
      const orderFile = path.join(this.ordersDir, `${order.id}.json`);
      await fs.promises.writeFile(orderFile, JSON.stringify(order, null, 2), 'utf8');
      console.log("💾 Pedido guardado:", orderFile);
      
      // También mantener un índice de pedidos
      await this.updateOrderIndex(order);
      
    } catch (error) {
      console.error("❌ Error guardando pedido:", error);
      throw error;
    }
  }

  async updateOrderIndex(order) {
    try {
      const indexFile = path.join(this.ordersDir, 'orders_index.json');
      let index = [];
      
      // Cargar índice existente
      if (fs.existsSync(indexFile)) {
        const indexData = await fs.promises.readFile(indexFile, 'utf8');
        index = JSON.parse(indexData);
      }
      
      // Agregar nuevo pedido al índice
      index.push({
        id: order.id,
        fecha_creacion: order.fecha_creacion,
        cliente_id: order.cliente.user_id,
        canal: order.cliente.canal,
        tipo_entrada: order.entrada.tipo,
        estado: order.estado,
        total_piezas: order.medidas?.resumen?.total_piezas || 0,
        area_total_m2: order.medidas?.resumen?.area_total_m2 || 0,
        total_cotizacion: order.cotizacion?.resumen?.total || null
      });
      
      // Mantener solo los últimos 1000 pedidos en el índice
      if (index.length > 1000) {
        index = index.slice(-1000);
      }
      
      // Guardar índice actualizado
      await fs.promises.writeFile(indexFile, JSON.stringify(index, null, 2), 'utf8');
      
    } catch (error) {
      console.warn("⚠️ Error actualizando índice de pedidos:", error);
    }
  }

  async getOrder(orderId) {
    try {
      const orderFile = path.join(this.ordersDir, `${orderId}.json`);
      if (!fs.existsSync(orderFile)) {
        return null;
      }
      
      const orderData = await fs.promises.readFile(orderFile, 'utf8');
      return JSON.parse(orderData);
      
    } catch (error) {
      console.error("❌ Error cargando pedido:", error);
      return null;
    }
  }

  async getOrdersIndex(limit = 50, clienteId = null) {
    try {
      const indexFile = path.join(this.ordersDir, 'orders_index.json');
      if (!fs.existsSync(indexFile)) {
        return [];
      }
      
      const indexData = await fs.promises.readFile(indexFile, 'utf8');
      let index = JSON.parse(indexData);
      
      // Filtrar por cliente si se especifica
      if (clienteId) {
        index = index.filter(order => order.cliente_id === clienteId);
      }
      
      // Ordenar por fecha más reciente y limitar
      return index
        .sort((a, b) => new Date(b.fecha_creacion) - new Date(a.fecha_creacion))
        .slice(0, limit);
        
    } catch (error) {
      console.error("❌ Error cargando índice de pedidos:", error);
      return [];
    }
  }

  generateOrderId() {
    const now = new Date();
    const timestamp = now.getTime();
    const randomSuffix = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `MEL-${timestamp}-${randomSuffix}`;
  }

  async getOrderStats() {
    try {
      const index = await this.getOrdersIndex(1000); // Obtener últimos 1000 pedidos
      
      const stats = {
        total_pedidos: index.length,
        pedidos_por_estado: {},
        pedidos_por_canal: {},
        area_total_procesada: 0,
        piezas_totales_procesadas: 0,
        valor_total_cotizado: 0,
        tiempo_promedio_procesamiento: 0
      };
      
      index.forEach(order => {
        // Contar por estado
        stats.pedidos_por_estado[order.estado] = (stats.pedidos_por_estado[order.estado] || 0) + 1;
        
        // Contar por canal
        stats.pedidos_por_canal[order.canal] = (stats.pedidos_por_canal[order.canal] || 0) + 1;
        
        // Sumar totales
        stats.area_total_procesada += order.area_total_m2 || 0;
        stats.piezas_totales_procesadas += order.total_piezas || 0;
        stats.valor_total_cotizado += order.total_cotizacion || 0;
      });
      
      return stats;
      
    } catch (error) {
      console.error("❌ Error calculando estadísticas:", error);
      return null;
    }
  }
}

module.exports = new MelaminaOrderProcessor();
