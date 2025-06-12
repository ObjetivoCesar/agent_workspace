const express = require("express")
const router = express.Router()
const melaminaOrderProcessor = require("../services/melaminaOrderProcessor")
const rateLimit = require("express-rate-limit")

// Rate limiting para endpoints de pedidos
const ordersLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 50, // límite de 50 peticiones por ventana
  message: "Too many order requests from this IP, please try again later"
})

// Obtener un pedido específico por ID
router.get("/:orderId", ordersLimiter, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required" });
    }
    
    console.log(`📋 Solicitando pedido: ${orderId}`);
    
    const order = await melaminaOrderProcessor.getOrder(orderId);
    
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    res.json({
      success: true,
      order: order
    });
    
  } catch (error) {
    console.error("❌ Error obteniendo pedido:", error);
    res.status(500).json({
      error: "Failed to get order",
      message: error.message
    });
  }
});

// Obtener lista de pedidos (con filtros opcionales)
router.get("/", ordersLimiter, async (req, res) => {
  try {
    const { limit = 20, cliente_id } = req.query;
    
    console.log(`📋 Solicitando lista de pedidos: limit=${limit}, cliente=${cliente_id || 'todos'}`);
    
    const orders = await melaminaOrderProcessor.getOrdersIndex(parseInt(limit), cliente_id);
    
    res.json({
      success: true,
      orders: orders,
      count: orders.length
    });
    
  } catch (error) {
    console.error("❌ Error obteniendo lista de pedidos:", error);
    res.status(500).json({
      error: "Failed to get orders list",
      message: error.message
    });
  }
});

// Obtener estadísticas de pedidos
router.get("/stats/summary", ordersLimiter, async (req, res) => {
  try {
    console.log("📊 Solicitando estadísticas de pedidos");
    
    const stats = await melaminaOrderProcessor.getOrderStats();
    
    if (!stats) {
      return res.status(500).json({ error: "Failed to calculate stats" });
    }
    
    res.json({
      success: true,
      stats: stats,
      generated_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("❌ Error obteniendo estadísticas:", error);
    res.status(500).json({
      error: "Failed to get order statistics",
      message: error.message
    });
  }
});

// Endpoint para reprocessar un pedido (en caso de mejoras en el sistema)
router.post("/:orderId/reprocess", ordersLimiter, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    console.log(`🔄 Solicitando reprocesamiento de pedido: ${orderId}`);
    
    const existingOrder = await melaminaOrderProcessor.getOrder(orderId);
    
    if (!existingOrder) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    // Solo permitir reprocesar si el archivo original está disponible
    if (!existingOrder.entrada.archivo_original) {
      return res.status(400).json({ 
        error: "Cannot reprocess: original file not available" 
      });
    }
    
    // Recrear payload original
    const originalPayload = {
      type: existingOrder.entrada.tipo === 'imagen' ? 'image' : 
            existingOrder.entrada.tipo === 'audio' ? 'audio' : 'text',
      user_id: existingOrder.cliente.user_id,
      channel: existingOrder.cliente.canal,
      filePath: existingOrder.entrada.archivo_original,
      originalName: existingOrder.entrada.archivo_original,
      mimetype: existingOrder.entrada.mimetype
    };
    
    // Reprocesar
    const reprocessedOrder = await melaminaOrderProcessor.processOrder(originalPayload);
    
    res.json({
      success: true,
      message: "Order reprocessed successfully",
      original_order_id: orderId,
      new_order: reprocessedOrder
    });
    
  } catch (error) {
    console.error("❌ Error reprocesando pedido:", error);
    res.status(500).json({
      error: "Failed to reprocess order",
      message: error.message
    });
  }
});

// Endpoint para exportar pedido en diferentes formatos
router.get("/:orderId/export", ordersLimiter, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { format = 'json' } = req.query;
    
    const order = await melaminaOrderProcessor.getOrder(orderId);
    
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    switch (format.toLowerCase()) {
      case 'json':
        res.json(order);
        break;
        
      case 'csv':
        const csv = generateOrderCSV(order);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="pedido-${orderId}.csv"`);
        res.send(csv);
        break;
        
      case 'txt':
        const txt = generateOrderText(order);
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="pedido-${orderId}.txt"`);
        res.send(txt);
        break;
        
      default:
        res.status(400).json({ error: "Unsupported format. Use: json, csv, txt" });
    }
    
  } catch (error) {
    console.error("❌ Error exportando pedido:", error);
    res.status(500).json({
      error: "Failed to export order",
      message: error.message
    });
  }
});

// Funciones auxiliares para exportación
function generateOrderCSV(order) {
  let csv = "Linea,Cantidad,Ancho_cm,Alto_cm,Tipo,Area_m2,Observaciones\n";
  
  if (order.medidas && order.medidas.medidas) {
    order.medidas.medidas.forEach(medida => {
      const area = (medida.ancho * medida.alto * medida.cantidad) / 10000;
      csv += `${medida.linea},${medida.cantidad},${medida.ancho},${medida.alto},"${medida.tipo || ''}",${area.toFixed(4)},"${medida.observaciones || ''}"\n`;
    });
  }
  
  return csv;
}

function generateOrderText(order) {
  let txt = `PEDIDO DE MELAMINA\n`;
  txt += `==================\n\n`;
  txt += `ID: ${order.id}\n`;
  txt += `Fecha: ${new Date(order.fecha_creacion).toLocaleString()}\n`;
  txt += `Cliente: ${order.cliente.user_id}\n`;
  txt += `Canal: ${order.cliente.canal}\n`;
  txt += `Estado: ${order.estado}\n\n`;
  
  if (order.medidas && order.medidas.medidas) {
    txt += `MEDIDAS:\n`;
    txt += `---------\n`;
    order.medidas.medidas.forEach(medida => {
      txt += `${medida.linea}. ${medida.cantidad} pzs ${medida.ancho}x${medida.alto}cm`;
      if (medida.tipo) txt += ` ${medida.tipo}`;
      if (medida.observaciones) txt += ` (${medida.observaciones})`;
      txt += `\n`;
    });
    
    txt += `\nRESUMEN:\n`;
    txt += `--------\n`;
    txt += `Total piezas: ${order.medidas.resumen.total_piezas}\n`;
    txt += `Área total: ${order.medidas.resumen.area_total_m2} m²\n`;
    txt += `Tipos: ${order.medidas.resumen.tipos_encontrados.join(', ')}\n`;
  }
  
  if (order.cotizacion && !order.cotizacion.error) {
    txt += `\nCOTIZACIÓN:\n`;
    txt += `-----------\n`;
    txt += `Total: $${order.cotizacion.resumen.total.toLocaleString()} ${order.cotizacion.condiciones.moneda}\n`;
    txt += `Tiempo entrega: ${order.cotizacion.condiciones.tiempo_entrega_dias} días\n`;
  }
  
  return txt;
}

module.exports = router;
