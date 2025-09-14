# 💰 Prestamype Analyzer (WIP)

Una extensión de Chrome que analiza y evalúa oportunidades de inversión en Prestamype.com con un sistema inteligente de scoring.

## 🚀 Características

- **Extracción automática** de datos de oportunidades de inversión
- **Sistema de scoring inteligente** basado en múltiples factores
- **Análisis personalizado** según tu presupuesto y preferencias de riesgo
- **Interfaz moderna** con resultados claros y recomendaciones
- **Análisis de modales** para información detallada de inversores

## 🛠️ Instalación

### Método 1: Instalación Manual (Desarrolladores)

1. Descarga o clona este repositorio
2. Abre Chrome y ve a `chrome://extensions/`
3. Activa el "Modo de desarrollador" en la esquina superior derecha
4. Haz click en "Cargar extensión sin empaquetar"
5. Selecciona la carpeta del proyecto

### Método 2: Desde Chrome Web Store (Próximamente)
La extensión estará disponible en Chrome Web Store próximamente.

## 📋 Uso

1. **Navega a Prestamype.com** y accede a la página de oportunidades de inversión
2. **Haz click en el icono** de la extensión en la barra de herramientas
3. **Configura tus preferencias**:
   - Presupuesto disponible
   - Rentabilidad mínima deseada
   - Nivel máximo de riesgo aceptable
4. **Haz click en "Analizar Página"** para obtener el análisis
5. **Revisa los resultados** ordenados por score de recomendación

## 🧮 Sistema de Scoring

El sistema evalúa cada oportunidad basándose en:

### Factores de Evaluación (100 puntos máximo)

- **Rentabilidad (40%)**: Comparación con tu rentabilidad mínima
- **Riesgo (25%)**: Evaluación según tu tolerancia al riesgo
- **Liquidez/Plazo (15%)**: Preferencia por plazos más cortos
- **Progreso de financiación (10%)**: Estado de la recaudación
- **Accesibilidad (10%)**: Inversión mínima y disponibilidad presupuestaria

### Bonificaciones y Penalizaciones

- **+10%** si cumple todos los criterios (presupuesto, rentabilidad, riesgo)
- **-20%** si no cumple rentabilidad mínima
- **-30%** si supera el riesgo aceptable
- **-10%** si excede el presupuesto disponible

## 🎯 Interpretación de Resultados

### Scores de Recomendación

- **80-100 puntos**: 🟢 **Muy recomendada** - Excelente oportunidad
- **60-79 puntos**: 🟡 **Recomendada con reservas** - Buena opción con algunos aspectos a considerar
- **0-59 puntos**: 🔴 **No recomendada** - No cumple criterios importantes

### Niveles de Riesgo

- **A**: Riesgo muy bajo
- **B**: Riesgo bajo  
- **C**: Riesgo medio
- **D**: Riesgo alto
- **E**: Riesgo muy alto

## 🔧 Configuración

La extensión guarda automáticamente tu configuración:

- **Presupuesto**: Cantidad disponible para invertir
- **Rentabilidad mínima**: Porcentaje mínimo esperado
- **Riesgo máximo**: Nivel más alto de riesgo que aceptas

## 📊 Funcionalidades Avanzadas

### Análisis de Modales
- Extrae información adicional de los modales de detalle
- Datos de inversores y garantías
- Documentación disponible
- Fechas importantes

### Almacenamiento Local
- Guarda el último análisis realizado
- Mantiene historial de configuraciones
- Datos persistentes entre sesiones

## 🛡️ Privacidad y Seguridad

- **No recopila datos personales**
- **Funciona solo en Prestamype.com**
- **Almacenamiento local únicamente**
- **Código abierto y auditable**

## 🔄 Actualizaciones

La extensión se actualiza automáticamente cuando esté disponible en Chrome Web Store. Para instalaciones manuales, descarga la versión más reciente del repositorio.

## 🐛 Solución de Problemas

### La extensión no funciona
- Verifica que estés en prestamype.com
- Recarga la página y vuelve a intentar
- Comprueba que la página esté completamente cargada

### No se encuentran oportunidades
- Asegúrate de estar en la página principal de oportunidades
- Verifica que haya oportunidades visibles en la tabla
- Comprueba la consola del navegador para errores

### Error de conexión
- Recarga la página de Prestamype
- Desactiva y reactiva la extensión
- Verifica que no hay bloqueadores de contenido activos

## 📝 Changelog

### v1.0.0 (Actual)
- Lanzamiento inicial
- Sistema de scoring completo
- Análisis de oportunidades básicas
- Interfaz de usuario moderna
- Análisis de modales
- Manejo de errores robusto

## 🤝 Contribuir

Si encuentras bugs o quieres sugerir mejoras:

1. Abre un issue en el repositorio
2. Describe el problema o sugerencia
3. Incluye pasos para reproducir (si es un bug)

## ⚠️ Disclaimer

Esta extensión es una herramienta de análisis únicamente. No constituye asesoramiento financiero. Siempre realiza tu propia investigación antes de invertir.

---

**Desarrollado con ❤️ para la comunidad de inversores de Prestamype**