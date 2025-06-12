const axios = require("axios")
const FormData = require("form-data")
const fs = require("fs")
const path = require("path")
const { OpenAI } = require("openai");

class MelaminaAudioService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY
    this.baseURL = "https://api.openai.com/v1/audio/transcriptions"
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async processAudioMeasurements(audioPathOrUrl) {
    if (!this.apiKey) {
      throw new Error("OpenAI API key not configured")
    }

    try {
      console.log("🎤 Iniciando procesamiento de audio con medidas de melamina");
      
      // Paso 1: Transcribir el audio
      const transcription = await this.transcribeAudio(audioPathOrUrl);
      console.log("📝 Transcripción obtenida:", transcription);
      
      // Paso 2: Procesar la transcripción para extraer medidas
      const measurementsData = await this.extractMeasurementsFromText(transcription);
      
      // Paso 3: Limpiar archivo temporal si es local
      if (!audioPathOrUrl.startsWith("http")) {
        try {
          if (fs.existsSync(audioPathOrUrl)) {
            fs.unlinkSync(audioPathOrUrl);
            console.log("🗑️ Archivo de audio local eliminado:", audioPathOrUrl);
          }
        } catch (deleteError) {
          console.warn("⚠️ No se pudo eliminar el archivo de audio:", deleteError);
        }
      }
      
      return {
        transcripcion_original: transcription,
        ...measurementsData
      };
      
    } catch (error) {
      console.error("❌ Error procesando audio de medidas:", error);
      
      // Limpiar archivo en caso de error
      if (!audioPathOrUrl.startsWith("http")) {
        try {
          if (audioPathOrUrl && fs.existsSync(audioPathOrUrl)) {
            fs.unlinkSync(audioPathOrUrl);
          }
        } catch (deleteError) {
          console.warn("⚠️ Error limpiando archivo de audio:", deleteError);
        }
      }
      
      throw new Error(`Failed to process audio measurements: ${error.message}`);
    }
  }

  async transcribeAudio(audioPathOrUrl) {
    try {
      let audioStream;
      let filename = "audio.mp3";

      if (audioPathOrUrl.startsWith("http://") || audioPathOrUrl.startsWith("https://")) {
        console.log(`🎵 Descargando audio desde URL: ${audioPathOrUrl}`);
        const audioResponse = await axios.get(audioPathOrUrl, {
          responseType: "stream",
          timeout: 60000,
        });
        audioStream = audioResponse.data;
      } else {
        console.log(`🎵 Usando archivo de audio local: ${audioPathOrUrl}`);
        if (!fs.existsSync(audioPathOrUrl)) {
          throw new Error(`Audio file not found: ${audioPathOrUrl}`);
        }
        audioStream = fs.createReadStream(audioPathOrUrl);
        filename = path.basename(audioPathOrUrl);
      }

      const formData = new FormData();
      formData.append("file", audioStream, {
        filename: filename,
        contentType: "audio/mpeg",
      });
      formData.append("model", "whisper-1");
      
      // Prompt especializado para transcripción de medidas
      const transcriptionPrompt = `El siguiente audio contiene medidas de cortes de melamina dictadas por un carpintero. 
      Las medidas suelen seguir el formato: cantidad, ancho por alto, tipo de enchapado. 
      Ejemplo: "2 piezas de 10 por 135 tipo D". 
      Transcribe con precisión todos los números y especificaciones técnicas.`;
      
      formData.append("prompt", transcriptionPrompt);

      console.log("🤖 Enviando audio a Whisper API...");

      const transcriptionResponse = await axios.post(this.baseURL, formData, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...formData.getHeaders(),
        },
        timeout: 90000,
      });

      const transcription = transcriptionResponse.data.text;
      console.log(`✅ Transcripción completada: "${transcription}"`);

      return transcription;
    } catch (error) {
      console.error("❌ Error en transcripción de audio:", error.response?.data || error.message);

      if (error.response?.status === 401) {
        throw new Error("Invalid OpenAI API key");
      } else if (error.response?.status === 429) {
        throw new Error("OpenAI API rate limit exceeded");
      } else if (error.code === "ECONNABORTED") {
        throw new Error("Audio transcription timeout");
      } else if (error.code === "ENOENT") {
        throw new Error(`Audio file not found: ${audioPathOrUrl}`);
      }

      throw new Error(`Audio transcription failed: ${error.message}`);
    }
  }

  async extractMeasurementsFromText(transcription) {
    try {
      console.log("🧠 Procesando transcripción para extraer medidas estructuradas...");
      
      const prompt = `Eres un experto en carpintería especializado en interpretar dictados de medidas de cortes de melamina.

TEXTO A PROCESAR: "${transcription}"

INSTRUCCIONES:
1. Analiza el texto transcrito en busca de medidas de cortes
2. Identifica patrones como: cantidad + dimensiones + tipo
3. Convierte formatos hablados a estructura técnica
4. Maneja variaciones de lenguaje natural (ej: "por" = "x", "piezas" = cantidad)

FORMATO DE RESPUESTA JSON:
{
  "medidas": [
    {
      "linea": 1,
      "cantidad": 2,
      "ancho": 10,
      "alto": 135,
      "tipo": "D",
      "texto_original": "2 piezas de 10 por 135 tipo D",
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
  "requiere_revision": false,
  "origen": "audio"
}

REGLAS DE CONVERSIÓN:
- "por" → "x" (ej: "10 por 20" = "10 x 20")
- "piezas", "unidades", "cortes" → cantidad
- "centímetros", "cm" → mantener en cm
- "metros", "m" → convertir a cm (ej: 1.35m = 135cm)
- "tipo", "enchapado", "acabado" seguido de letra → tipo
- Si no se especifica tipo, usar ""
- Si algún número no está claro, marcar con "?" y observaciones

EJEMPLOS DE CONVERSIÓN:
- "2 piezas de 10 por 135" → cantidad: 2, ancho: 10, alto: 135
- "cinco cortes de un metro veinte por ochenta centímetros" → cantidad: 5, ancho: 120, alto: 80
- "tres de diez por quince tipo D" → cantidad: 3, ancho: 10, alto: 15, tipo: "D"

Procesa el texto y devuelve ÚNICAMENTE el JSON estructurado:`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.1,
      });

      const rawResponse = response.choices[0].message.content;
      console.log("📋 Respuesta de procesamiento de texto:", rawResponse);
      
      try {
        const parsedData = JSON.parse(rawResponse);
        const validatedData = this.validateAndEnhanceMeasurements(parsedData);
        return validatedData;
      } catch (parseError) {
        console.error("❌ Error parseando JSON de procesamiento de texto:", parseError);
        
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
        
        // Fallback: crear estructura básica
        return {
          medidas: [],
          resumen: {
            total_piezas: 0,
            area_total_m2: 0,
            tipos_encontrados: [],
            observaciones_generales: "Error procesando transcripción. Texto original: " + transcription
          },
          calidad_extraccion: "baja",
          requiere_revision: true,
          origen: "audio",
          texto_crudo: rawResponse
        };
      }
      
    } catch (error) {
      console.error("❌ Error extrayendo medidas del texto:", error);
      throw new Error(`Failed to extract measurements from text: ${error.message}`);
    }
  }

  validateAndEnhanceMeasurements(data) {
    try {
      console.log("🔍 Validando y mejorando datos extraídos de audio...");
      
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
        if (medida.tipo && medida.tipo !== "?" && medida.tipo !== "") {
          tiposEncontrados.add(medida.tipo);
        }
        
        // Asegurar campos requeridos
        if (!medida.linea) medida.linea = index + 1;
        if (!medida.texto_original) medida.texto_original = "";
        if (!medida.observaciones) medida.observaciones = "";
      });
      
      // Actualizar resumen
      data.resumen.total_piezas = totalPiezas;
      data.resumen.area_total_m2 = Math.round(areaTotalM2 * 100) / 100;
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
      
      // Marcar origen y timestamps
      data.origen = "audio";
      data.fecha_procesamiento = new Date().toISOString();
      
      console.log(`✅ Validación de audio completada: ${data.medidas.length} medidas, ${totalPiezas} piezas, ${areaTotalM2}m²`);
      
      return data;
      
    } catch (error) {
      console.error("❌ Error validando medidas de audio:", error);
      return data;
    }
  }

  validateNumeric(value, defaultValue = 0) {
    if (typeof value === 'number' && !isNaN(value) && value >= 0) {
      return value;
    }
    if (typeof value === 'string') {
      // Limpiar texto y convertir números escritos
      let cleanValue = value.toLowerCase()
        .replace(/uno/g, '1')
        .replace(/dos/g, '2')
        .replace(/tres/g, '3')
        .replace(/cuatro/g, '4')
        .replace(/cinco/g, '5')
        .replace(/seis/g, '6')
        .replace(/siete/g, '7')
        .replace(/ocho/g, '8')
        .replace(/nueve/g, '9')
        .replace(/diez/g, '10')
        .replace(/veinte/g, '20')
        .replace(/treinta/g, '30')
        .replace(/cuarenta/g, '40')
        .replace(/cincuenta/g, '50')
        .replace(/sesenta/g, '60')
        .replace(/setenta/g, '70')
        .replace(/ochenta/g, '80')
        .replace(/noventa/g, '90')
        .replace(/cien/g, '100');
      
      const parsed = parseFloat(cleanValue.replace(/[^\d.]/g, ''));
      if (!isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }
    return defaultValue;
  }
}

module.exports = new MelaminaAudioService();
