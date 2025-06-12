const { OpenAI } = require("openai");
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Configurar Cloudinary
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'du32btjke', 
  api_key: process.env.CLOUDINARY_API_KEY || '479141314328389', 
  api_secret: process.env.CLOUDINARY_API_SECRET || 'VlQghKectWopFqAyZdU1AbY_g84'
});

class MelaminaVisionService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async extractMeasurements(imagePath) {
    let publicId = null;
    try {
      console.log("📏 Procesando lista de medidas de melamina:", imagePath);
      
      // Verificar que el archivo existe
      if (!fs.existsSync(imagePath)) {
        console.error("❌ El archivo de imagen no existe:", imagePath);
        throw new Error("Image file not found");
      }
      
      // Subir imagen a Cloudinary
      console.log("☁️ Subiendo imagen a Cloudinary...");
      const timestamp = new Date().getTime();
      const uploadResult = await cloudinary.uploader.upload(imagePath, {
        folder: "melamina-orders",
        public_id: `order-${timestamp}`,
        tags: ["melamina", "measurements"],
        resource_type: "image"
      });
      
      publicId = uploadResult.public_id;
      const imageUrl = uploadResult.secure_url;
      console.log("✅ Imagen subida a Cloudinary:", imageUrl);
      
      // Prompt especializado para extraer medidas de melamina
      const prompt = `Eres un experto en carpintería especializado en extractar medidas de listas de cortes de melamina.

INSTRUCCIONES:
1. Analiza cuidadosamente la imagen de la lista manuscrita
2. Extrae TODAS las medidas encontradas en formato estructurado
3. Identifica patrones comunes como: cantidad + ancho x alto + tipo
4. Busca indicadores de tipo de enchapado (D, H, L, etc.)
5. Mantén el orden original de la lista

FORMATO DE RESPUESTA JSON:
{
  "medidas": [
    {
      "linea": 1,
      "cantidad": 2,
      "ancho": 10,
      "alto": 135,
      "tipo": "D",
      "texto_original": "2 = 10 x 135 D",
      "observaciones": ""
    }
  ],
  "resumen": {
    "total_piezas": 0,
    "area_total_m2": 0,
    "tipos_encontrados": [],
    "observaciones_generales": ""
  },
  "calidad_extraccion": "alta|media|baja",
  "requiere_revision": false
}

REGLAS IMPORTANTES:
- Si no puedes leer algún número claramente, indica "?" en ese campo
- Convierte todas las medidas a centímetros
- Si encuentras medidas en metros, convierte a centímetros (ej: 1.35m = 135cm)
- Calcula automáticamente el área total en metros cuadrados
- Marca "requiere_revision": true si hay dudas en más del 20% de las medidas
- En "observaciones" indica cualquier problema o duda específica

Procesa la imagen y devuelve ÚNICAMENTE el JSON estructurado:`;

      // Enviar a OpenAI
      console.log("🧠 Enviando imagen a OpenAI para extracción de medidas...");
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { 
                type: "text", 
                text: prompt
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                  detail: "high"
                }
              }
            ]
          }
        ],
        max_tokens: 1500,
        temperature: 0.1, // Baja temperatura para mayor precisión
      });

      console.log("✅ Extracción de medidas completada");
      
      // Limpiar imagen de Cloudinary después de procesarla
      try {
        console.log("🗑️ Eliminando imagen temporal de Cloudinary:", publicId);
        await cloudinary.uploader.destroy(publicId);
        console.log("✅ Imagen temporal eliminada");
      } catch (cloudinaryError) {
        console.warn("⚠️ No se pudo eliminar la imagen de Cloudinary:", cloudinaryError);
      }
      
      // Eliminar archivo local
      try {
        fs.unlinkSync(imagePath);
        console.log("🗑️ Archivo local eliminado:", imagePath);
      } catch (deleteError) {
        console.warn("⚠️ No se pudo eliminar el archivo local:", deleteError);
      }
      
      // Procesar y validar la respuesta JSON
      const rawResponse = response.choices[0].message.content;
      console.log("📋 Respuesta de OpenAI:", rawResponse);
      
      try {
        const parsedData = JSON.parse(rawResponse);
        const validatedData = this.validateAndEnhanceMeasurements(parsedData);
        return validatedData;
      } catch (parseError) {
        console.error("❌ Error parseando JSON de OpenAI:", parseError);
        // Intentar extraer JSON del texto
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsedData = JSON.parse(jsonMatch[0]);
            const validatedData = this.validateAndEnhanceMeasurements(parsedData);
            return validatedData;
          } catch (retryError) {
            console.error("❌ Error en segundo intento de parseo:", retryError);
          }
        }
        
        // Fallback: crear estructura básica con el texto crudo
        return {
          medidas: [],
          resumen: {
            total_piezas: 0,
            area_total_m2: 0,
            tipos_encontrados: [],
            observaciones_generales: "Error procesando respuesta de IA. Texto original: " + rawResponse
          },
          calidad_extraccion: "baja",
          requiere_revision: true,
          texto_crudo: rawResponse
        };
      }
      
    } catch (error) {
      console.error("❌ Error extracting measurements:", error);
      
      // Limpiar recursos en caso de error
      if (publicId) {
        try {
          await cloudinary.uploader.destroy(publicId);
        } catch (cloudinaryError) {
          console.warn("⚠️ Error limpiando Cloudinary:", cloudinaryError);
        }
      }
      
      try {
        if (imagePath && fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      } catch (deleteError) {
        console.warn("⚠️ Error limpiando archivo local:", deleteError);
      }
      
      throw new Error(`Failed to extract measurements: ${error.message}`);
    }
  }

  validateAndEnhanceMeasurements(data) {
    try {
      console.log("🔍 Validando y mejorando datos extraídos...");
      
      // Asegurar estructura básica
      if (!data.medidas) data.medidas = [];
      if (!data.resumen) data.resumen = {};
      
      let totalPiezas = 0;
      let areaTotalM2 = 0;
      let tiposEncontrados = new Set();
      
      // Procesar cada medida
      data.medidas.forEach((medida, index) => {
        // Validar campos numéricos
        medida.cantidad = this.validateNumeric(medida.cantidad, 1);
        medida.ancho = this.validateNumeric(medida.ancho, 0);
        medida.alto = this.validateNumeric(medida.alto, 0);
        
        // Calcular totales
        totalPiezas += medida.cantidad;
        
        if (medida.ancho > 0 && medida.alto > 0) {
          const areaLinea = (medida.ancho * medida.alto * medida.cantidad) / 10000; // cm² a m²
          areaTotalM2 += areaLinea;
        }
        
        // Registrar tipos
        if (medida.tipo && medida.tipo !== "?") {
          tiposEncontrados.add(medida.tipo);
        }
        
        // Asegurar campos requeridos
        if (!medida.linea) medida.linea = index + 1;
        if (!medida.texto_original) medida.texto_original = "";
        if (!medida.observaciones) medida.observaciones = "";
      });
      
      // Actualizar resumen
      data.resumen.total_piezas = totalPiezas;
      data.resumen.area_total_m2 = Math.round(areaTotalM2 * 100) / 100; // 2 decimales
      data.resumen.tipos_encontrados = Array.from(tiposEncontrados);
      
      // Determinar calidad y necesidad de revisión
      const medidas_con_problemas = data.medidas.filter(m => 
        m.ancho === 0 || m.alto === 0 || m.cantidad === 0 || 
        m.tipo === "?" || m.observaciones.includes("?")
      ).length;
      
      const porcentaje_problemas = data.medidas.length > 0 ? 
        (medidas_con_problemas / data.medidas.length) * 100 : 0;
      
      if (porcentaje_problemas > 20) {
        data.calidad_extraccion = "baja";
        data.requiere_revision = true;
      } else if (porcentaje_problemas > 5) {
        data.calidad_extraccion = "media";
        data.requiere_revision = true;
      } else {
        data.calidad_extraccion = "alta";
        data.requiere_revision = false;
      }
      
      // Agregar timestamps
      data.fecha_procesamiento = new Date().toISOString();
      
      console.log(`✅ Validación completada: ${data.medidas.length} medidas, ${totalPiezas} piezas, ${areaTotalM2}m²`);
      
      return data;
      
    } catch (error) {
      console.error("❌ Error validando medidas:", error);
      return data; // Retornar datos originales en caso de error
    }
  }

  validateNumeric(value, defaultValue = 0) {
    if (typeof value === 'number' && !isNaN(value) && value >= 0) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value.replace(/[^\d.]/g, ''));
      if (!isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }
    return defaultValue;
  }

  // Método para limpiar imágenes de pedidos antiguos
  async cleanupOrderImages(maxAgeDays = 7) {
    try {
      console.log("🧹 Iniciando limpieza de imágenes de pedidos antiguos...");
      
      const result = await cloudinary.search
        .expression('resource_type:image AND tags=melamina')
        .sort_by('created_at', 'desc')
        .max_results(500)
        .execute();
      
      if (!result.resources || result.resources.length === 0) {
        console.log("✅ No se encontraron imágenes de pedidos para limpiar");
        return;
      }
      
      const now = new Date();
      const deletePromises = [];
      
      for (const resource of result.resources) {
        const createdAt = new Date(resource.created_at);
        const ageDays = (now - createdAt) / (1000 * 60 * 60 * 24);
        
        if (ageDays > maxAgeDays) {
          console.log(`🗑️ Eliminando imagen antigua (${Math.round(ageDays)} días): ${resource.public_id}`);
          deletePromises.push(cloudinary.uploader.destroy(resource.public_id));
        }
      }
      
      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
        console.log(`✅ Eliminadas ${deletePromises.length} imágenes de pedidos antiguos`);
      }
      
    } catch (error) {
      console.error("❌ Error limpiando imágenes de pedidos:", error);
    }
  }
}

module.exports = new MelaminaVisionService();
