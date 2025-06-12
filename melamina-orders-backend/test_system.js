const melaminaOrderProcessor = require('./src/services/melaminaOrderProcessor');
const path = require('path');

async function testMelaminaSystem() {
  console.log("🧪 Iniciando prueba del sistema de pedidos de melamina...\n");
  
  try {
    // Simular un payload con la imagen de ejemplo
    const testPayload = {
      user_id: "carpintero_test",
      channel: "web",
      type: "image",
      filePath: path.join(__dirname, "../user_input_files/Diseño sin título (16).png"),
      originalName: "lista_medidas_ejemplo.png",
      mimetype: "image/png"
    };
    
    console.log("📋 Payload de prueba:", JSON.stringify(testPayload, null, 2));
    console.log("\n🏭 Procesando pedido...");
    
    const result = await melaminaOrderProcessor.processOrder(testPayload);
    
    console.log("\n✅ RESULTADO DEL PROCESAMIENTO:");
    console.log("=====================================");
    console.log(`ID del Pedido: ${result.id}`);
    console.log(`Estado: ${result.estado}`);
    console.log(`Tiempo de procesamiento: ${result.tiempo_procesamiento}ms`);
    
    if (result.medidas) {
      console.log(`\n📏 MEDIDAS EXTRAÍDAS:`);
      console.log(`Total de líneas: ${result.medidas.medidas.length}`);
      console.log(`Total de piezas: ${result.medidas.resumen.total_piezas}`);
      console.log(`Área total: ${result.medidas.resumen.area_total_m2} m²`);
      console.log(`Calidad de extracción: ${result.medidas.calidad_extraccion}`);
      console.log(`Requiere revisión: ${result.medidas.requiere_revision ? 'Sí' : 'No'}`);
      
      console.log(`\n📋 DETALLE DE MEDIDAS:`);
      result.medidas.medidas.forEach((medida, index) => {
        console.log(`  ${index + 1}. ${medida.cantidad} pzs ${medida.ancho}x${medida.alto}cm ${medida.tipo || ''}`);
        if (medida.observaciones) {
          console.log(`     Observaciones: ${medida.observaciones}`);
        }
      });
    }
    
    if (result.cotizacion && !result.cotizacion.error) {
      console.log(`\n💰 COTIZACIÓN:`);
      console.log(`Subtotal: $${result.cotizacion.resumen.subtotal.toLocaleString()} CLP`);
      if (result.cotizacion.resumen.descuento_porcentaje > 0) {
        console.log(`Descuento (${result.cotizacion.resumen.descuento_porcentaje}%): -$${result.cotizacion.resumen.monto_descuento.toLocaleString()} CLP`);
      }
      console.log(`TOTAL: $${result.cotizacion.resumen.total.toLocaleString()} CLP`);
      console.log(`Tiempo de entrega: ${result.cotizacion.condiciones.tiempo_entrega_dias} días`);
    }
    
    console.log("\n🎉 Prueba completada exitosamente!");
    
  } catch (error) {
    console.error("❌ Error en la prueba:", error.message);
    console.error("Stack trace:", error.stack);
  }
}

// Prueba adicional con datos de texto simulado
async function testWithTextInput() {
  console.log("\n\n🧪 Iniciando prueba con entrada de texto...\n");
  
  try {
    const testPayload = {
      user_id: "carpintero_test_texto",
      channel: "web", 
      type: "text",
      text: "Necesito cortar: 2 piezas de 10 por 135 tipo D, 1 pieza de 32 por 43, 2 piezas de 180 por 52, 3 piezas de 70 por 49 tipo H"
    };
    
    console.log("📋 Payload de prueba (texto):", JSON.stringify(testPayload, null, 2));
    console.log("\n🏭 Procesando pedido...");
    
    const result = await melaminaOrderProcessor.processOrder(testPayload);
    
    console.log("\n✅ RESULTADO DEL PROCESAMIENTO (TEXTO):");
    console.log("=========================================");
    console.log(`ID del Pedido: ${result.id}`);
    console.log(`Estado: ${result.estado}`);
    
    if (result.medidas) {
      console.log(`\n📏 MEDIDAS EXTRAÍDAS:`);
      console.log(`Total de piezas: ${result.medidas.resumen.total_piezas}`);
      console.log(`Área total: ${result.medidas.resumen.area_total_m2} m²`);
      
      result.medidas.medidas.forEach((medida, index) => {
        console.log(`  ${index + 1}. ${medida.cantidad} pzs ${medida.ancho}x${medida.alto}cm ${medida.tipo || ''}`);
      });
    }
    
    if (result.cotizacion && !result.cotizacion.error) {
      console.log(`\n💰 TOTAL: $${result.cotizacion.resumen.total.toLocaleString()} CLP`);
    }
    
  } catch (error) {
    console.error("❌ Error en la prueba de texto:", error.message);
  }
}

// Ejecutar pruebas
if (require.main === module) {
  (async () => {
    await testMelaminaSystem();
    await testWithTextInput();
    
    console.log("\n📊 Para ver estadísticas completas:");
    console.log("    const stats = await melaminaOrderProcessor.getOrderStats();");
    console.log("    console.log(stats);");
    
    process.exit(0);
  })();
}

module.exports = {
  testMelaminaSystem,
  testWithTextInput
};
