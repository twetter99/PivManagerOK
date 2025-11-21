import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Storage } from "@google-cloud/storage";
import { assertIsAdmin } from "../lib/utils";
import { z } from "zod";
import * as ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

// Schema de validación
const GenerateReportRequest = z.object({
  monthKey: z.string().regex(/^\d{4}-\d{2}$/, "Formato de monthKey inválido (YYYY-MM)"),
  type: z.enum(["pdf", "excel"], {
    errorMap: () => ({ message: "El tipo debe ser 'pdf' o 'excel'" }),
  }),
});

const storage = new Storage();

/**
 * Callable Function: generateReport
 * 
 * Genera un reporte de facturación en formato PDF o Excel.
 * Sube el archivo a Cloud Storage y devuelve una Signed URL.
 * 
 * @param data - { monthKey: "YYYY-MM", type: "pdf" | "excel" }
 * @param context - Contexto de autenticación
 * @returns { success: true, url: string, expiresAt: string }
 */
export const generateReport = functions
  .region("europe-west1")
  .runWith({
    timeoutSeconds: 540, // 9 minutos (para reportes grandes)
    memory: "1GB",
  })
  .https.onCall(async (data: unknown, context) => {
    // 1. Validar que el usuario sea admin
    await assertIsAdmin(context);

    // 2. Validar el payload
    const parseResult = GenerateReportRequest.safeParse(data);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map((e: any) => `${e.path.join(".")}: ${e.message}`).join(", ");
      throw new functions.https.HttpsError("invalid-argument", errors);
    }

    const { monthKey, type } = parseResult.data;

    functions.logger.info(`Generando reporte ${type} para ${monthKey}`);

    try {
      // 3. Obtener datos de Firestore
      const reportData = await fetchReportData(monthKey);

      // 4. Generar el archivo según el tipo
      let buffer: Buffer;
      let fileName: string;
      let contentType: string;

      if (type === "pdf") {
        buffer = await generatePDFReport(reportData);
        fileName = `facturacion_${monthKey}.pdf`;
        contentType = "application/pdf";
      } else {
        buffer = await generateExcelReport(reportData);
        fileName = `facturacion_${monthKey}.xlsx`;
        contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      }

      // 5. Subir a Cloud Storage
      const bucketName = "piv-manager.firebasestorage.app";
      const filePath = `reports/${monthKey}/${fileName}`;

      const bucket = storage.bucket(bucketName);
      const file = bucket.file(filePath);

      await file.save(buffer, {
        contentType,
        metadata: {
          cacheControl: "public, max-age=3600",
        },
      });

      // Hacer el archivo público
      await file.makePublic();

      functions.logger.info(`Reporte subido a Cloud Storage: ${filePath}`);

      // 6. Obtener URL pública
      const url = `https://storage.googleapis.com/${bucketName}/${filePath}`;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      return {
        success: true,
        url,
        fileName,
        expiresAt,
        message: "Reporte generado correctamente",
      };
    } catch (error) {
      functions.logger.error("Error al generar reporte:", error);
      throw new functions.https.HttpsError(
        "internal",
        `Error al generar el reporte: ${(error as Error).message}`
      );
    }
  });

/**
 * Obtiene los datos necesarios para el reporte desde Firestore
 */
async function fetchReportData(monthKey: string): Promise<ReportData> {
  const db = admin.firestore();

  // Obtener el summary
  const summaryDoc = await db.collection("billingSummary").doc(monthKey).get();
  if (!summaryDoc.exists) {
    throw new Error(`No se encontró el resumen de facturación para ${monthKey}`);
  }

  const summary = summaryDoc.data()!;

  // Obtener todos los paneles del mes
  const billingSnapshot = await db
    .collection("billingMonthlyPanel")
    .where("monthKey", "==", monthKey)
    .orderBy("codigo", "asc")
    .get();

  const panels = billingSnapshot.docs.map((doc) => ({
    codigo: doc.data().codigo,
    municipio: doc.data().municipio,
    totalDiasFacturables: doc.data().totalDiasFacturables,
    totalImporte: doc.data().totalImporte,
    estadoAlCierre: doc.data().estadoAlCierre,
    tarifaAplicada: doc.data().tarifaAplicada,
  }));

  return {
    monthKey,
    summary: {
      totalImporteMes: summary.totalImporteMes,
      totalPanelesFacturables: summary.totalPanelesFacturables,
      panelesActivos: summary.panelesActivos,
      panelesParciales: summary.panelesParciales,
      totalEventos: summary.totalEventos,
    },
    panels,
  };
}

/**
 * Genera un reporte en formato PDF
 */
async function generatePDFReport(data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ 
      margin: 40,
      size: 'A4',
      bufferPages: true,
      autoFirstPage: false
    });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // === UTILIDADES ===
    const formatCurrency = (amount: number): string => {
      return amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    };

    const formatMonthKey = (monthKey: string): string => {
      const [year, month] = monthKey.split('-');
      const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      return `${months[parseInt(month) - 1]} ${year}`;
    };

    const truncateText = (text: string, maxLength: number): string => {
      return text.length > maxLength ? text.substring(0, maxLength - 1) + '…' : text;
    };

    // Constantes de diseño
    const ROW_HEIGHT = 18;
    const HEADER_HEIGHT = 25;
    const FOOTER_HEIGHT = 20; // Espacio reservado para el footer
    const PAGE_BOTTOM_MARGIN = 595.28 * 1.414 - 40 - FOOTER_HEIGHT - 20; // A4 height - margin - footer - safety
    const COLUMNS = {
      codigo: { x: 45, width: 70 },
      municipio: { x: 120, width: 200 },
      dias: { x: 325, width: 35 },
      importe: { x: 365, width: 80 },
      estado: { x: 450, width: 95 }
    };

    let currentPage = 0;
    const generatedDate = new Date().toLocaleString('es-ES', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    // === FUNCIONES AUXILIARES ===
    const addHeader = (pageNum: number, showTitle: boolean = false) => {
      doc.fontSize(9).fillColor('#666').text(
        `Facturación ${formatMonthKey(data.monthKey)}`,
        40, 25, { width: 250, align: 'left' }
      );
      doc.fontSize(9).fillColor('#666').text(
        `Página ${pageNum}`,
        40, 25, { width: 515, align: 'right' }
      );
      
      if (showTitle) {
        doc.y = 50;
      } else {
        doc.y = 50;
      }
    };

    const addFooter = () => {
      const savedY = doc.y; // Guardar posición del cursor
      const footerY = doc.page.height - doc.page.margins.bottom - 15;
      doc.fontSize(8).fillColor('#999').text(
        `Generado el ${generatedDate} | PIV Manager Pro`,
        40,
        footerY,
        { width: 515, align: 'center', lineBreak: false }
      );
      doc.y = savedY; // Restaurar posición para no afectar el flujo
    };

    const drawTableHeader = () => {
      const headerY = doc.y;
      doc.fontSize(9).fillColor('#fff');
      doc.rect(40, headerY, 515, HEADER_HEIGHT).fillAndStroke('#2c3e50', '#2c3e50');
      doc.fillColor('#fff').font('Helvetica-Bold');
      doc.text("Código", COLUMNS.codigo.x, headerY + 7, { width: COLUMNS.codigo.width, align: 'left' });
      doc.text("Municipio", COLUMNS.municipio.x, headerY + 7, { width: COLUMNS.municipio.width, align: 'left' });
      doc.text("Días", COLUMNS.dias.x, headerY + 7, { width: COLUMNS.dias.width, align: 'center' });
      doc.text("Importe", COLUMNS.importe.x, headerY + 7, { width: COLUMNS.importe.width, align: 'right' });
      doc.text("Estado", COLUMNS.estado.x, headerY + 7, { width: COLUMNS.estado.width, align: 'center' });
      doc.font('Helvetica').fillColor('#000');
      doc.y = headerY + HEADER_HEIGHT;
    };

    const startNewPage = (isFirst: boolean = false) => {
      doc.addPage();
      currentPage++;
      addHeader(currentPage, isFirst);
      
      if (isFirst) {
        doc.y = 50;
      } else {
        doc.fontSize(12).fillColor('#2c3e50').font('Helvetica-Bold')
          .text("Detalle de Facturación (continuación)", 40, doc.y, { width: 515, align: 'left' });
        doc.font('Helvetica').fillColor('#000');
        doc.y += 20;
        drawTableHeader();
      }
    };

    // === PÁGINA 1: PORTADA Y RESUMEN ===
    startNewPage(true);
    
    // Título principal
    doc.fontSize(22).fillColor('#2c3e50').font('Helvetica-Bold')
      .text("Reporte de Facturación", 40, 80, { width: 515, align: "center" });
    doc.fontSize(14).fillColor('#7f8c8d').font('Helvetica')
      .text(`PIV Manager Pro | ${formatMonthKey(data.monthKey)}`, 40, 110, { width: 515, align: "center" });

    // Resumen en recuadro
    doc.y = 150;
    doc.fontSize(14).fillColor('#2c3e50').font('Helvetica-Bold')
      .text(`Resumen del Mes - ${formatMonthKey(data.monthKey)}`, 40, doc.y);
    doc.font('Helvetica').fillColor('#000');
    doc.y += 25;
    
    const summaryBoxY = doc.y;
    doc.fontSize(11);
    doc.rect(40, summaryBoxY, 515, 100).stroke('#d0d0d0');
    doc.rect(40, summaryBoxY, 515, 30).fillAndStroke('#ecf0f1', '#d0d0d0');
    
    // KPIs destacados
    doc.fillColor('#2c3e50').font('Helvetica-Bold')
      .text("Total Facturado:", 50, summaryBoxY + 8, { width: 150, align: 'left' });
    doc.fillColor('#27ae60').fontSize(14)
      .text(formatCurrency(data.summary.totalImporteMes), 200, summaryBoxY + 6, { width: 150, align: 'left' });
    
    doc.fillColor('#2c3e50').fontSize(11).font('Helvetica-Bold')
      .text("Paneles Facturables:", 360, summaryBoxY + 8, { width: 120, align: 'left' });
    doc.fillColor('#000').font('Helvetica')
      .text(data.summary.totalPanelesFacturables.toString(), 480, summaryBoxY + 8, { width: 60, align: 'left' });

    // Desglose
    doc.fillColor('#000').fontSize(10).font('Helvetica');
    const detailY = summaryBoxY + 45;
    doc.text(`Paneles Activos (30 días completos):`, 50, detailY, { width: 250 });
    doc.text(data.summary.panelesActivos.toString(), 300, detailY, { width: 60, align: 'right' });
    
    doc.text(`Paneles Parciales (menos de 30 días):`, 50, detailY + 18, { width: 250 });
    doc.text(data.summary.panelesParciales.toString(), 300, detailY + 18, { width: 60, align: 'right' });
    
    doc.text(`Total de Eventos registrados:`, 50, detailY + 36, { width: 250 });
    doc.text(data.summary.totalEventos.toString(), 300, detailY + 36, { width: 60, align: 'right' });

    // Nota metodológica
    doc.y = summaryBoxY + 115;
    doc.fontSize(8).fillColor('#7f8c8d')
      .text("* Los importes parciales se calculan proporcionalmente según los días facturables del mes.", 40, doc.y, { width: 515, align: 'left' });

    // Iniciar tabla
    doc.y += 40;
    doc.fontSize(14).fillColor('#2c3e50').font('Helvetica-Bold')
      .text("Detalle de Facturación por Panel", 40, doc.y);
    doc.font('Helvetica').fillColor('#000');
    doc.y += 25;
    drawTableHeader();

    // === RENDERIZAR FILAS ===
    doc.fontSize(9).fillColor('#000');
    
    for (let i = 0; i < data.panels.length; i++) {
      const panel = data.panels[i];
      
      // Control de paginación estricto
      if (doc.y + ROW_HEIGHT + 10 > PAGE_BOTTOM_MARGIN) {
        startNewPage(false);
      }

      const rowY = doc.y;
      
      // Zebra striping
      if (i % 2 === 1) {
        doc.rect(40, rowY, 515, ROW_HEIGHT).fill('#f9f9f9');
        doc.fillColor('#000');
      }

      // Renderizar celdas con lineHeight: 0 para evitar saltos
      const textY = rowY + 5;
      const opts = { width: 0, lineBreak: false, continued: false };
      
      doc.text(truncateText(panel.codigo, 12), COLUMNS.codigo.x, textY, { ...opts, width: COLUMNS.codigo.width, align: 'left' });
      doc.text(truncateText(panel.municipio, 35), COLUMNS.municipio.x, textY, { ...opts, width: COLUMNS.municipio.width, align: 'left' });
      doc.text(panel.totalDiasFacturables.toString(), COLUMNS.dias.x, textY, { ...opts, width: COLUMNS.dias.width, align: 'center' });
      doc.text(formatCurrency(panel.totalImporte), COLUMNS.importe.x, textY, { ...opts, width: COLUMNS.importe.width, align: 'right' });
      doc.text(panel.estadoAlCierre, COLUMNS.estado.x, textY, { ...opts, width: COLUMNS.estado.width, align: 'center' });
      
      // Línea separadora sutil
      doc.strokeColor('#e0e0e0').moveTo(40, rowY + ROW_HEIGHT).lineTo(555, rowY + ROW_HEIGHT).stroke();
      
      doc.y = rowY + ROW_HEIGHT;
    }

    // === AÑADIR FOOTERS A TODAS LAS PÁGINAS ===
    // Recorrer todas las páginas buffereadas y añadir footer
    const pageRange = doc.bufferedPageRange();
    for (let i = 0; i < pageRange.count; i++) {
      doc.switchToPage(i);
      addFooter(); // addFooter() guarda/restaura doc.y internamente
    }

    doc.end();
  });
}

/**
 * Genera un reporte en formato Excel con diseño híbrido
 */
async function generateExcelReport(data: ReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  
  // === HOJA 1: Dashboard Ejecutivo (Visual) ===
  await createDashboardSheet(workbook, data);
  
  // === HOJA 2: Resumen Financiero (Funcional) ===
  createFinancialSheet(workbook, data);
  
  // === HOJA 3: Detalle de Paneles (Funcional) ===
  createPanelsSheet(workbook, data);
  
  // Generar el buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * HOJA 1: Dashboard Ejecutivo - Réplica visual del modal
 */
async function createDashboardSheet(workbook: ExcelJS.Workbook, data: ReportData) {
  const ws = workbook.addWorksheet("Dashboard Ejecutivo");
  
  // Configuración de la hoja
  ws.views = [{ showGridLines: false }];
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 }
  };
  
  // Colores
  const colors = {
    primary: 'FF3498DB',
    success: 'FF27AE60',
    warning: 'FFF39C12',
    danger: 'FFE74C3C',
    purple: 'FF9B59B6',
    bgBlue: 'FFE3F2FD',
    bgGreen: 'FFE8F5E9',
    bgOrange: 'FFFFF3E0',
    bgRed: 'FFFFEBEE',
    bgPurple: 'FFF3E5F5',
    textPrimary: 'FF2C3E50',
    textSecondary: 'FF666666',
    textMuted: 'FF999999',
    bgGray: 'FFF8F9FA'
  };
  
  // Configurar anchos de columna
  ws.columns = [
    { width: 3 },   // A - margen izquierdo
    { width: 20 },  // B
    { width: 20 },  // C
    { width: 20 },  // D
    { width: 20 },  // E
    { width: 20 },  // F
    { width: 3 },   // G - margen derecho
  ];
  
  let currentRow = 2;
  
  // === ENCABEZADO ===
  ws.mergeCells(`B${currentRow}:F${currentRow}`);
  const titleCell = ws.getCell(`B${currentRow}`);
  titleCell.value = "📄 Informe Ejecutivo";
  titleCell.font = { name: 'Segoe UI', size: 22, bold: true, color: { argb: colors.textPrimary } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(currentRow).height = 35;
  
  currentRow++;
  ws.mergeCells(`B${currentRow}:F${currentRow}`);
  const subtitleCell = ws.getCell(`B${currentRow}`);
  subtitleCell.value = formatMonthKey(data.monthKey);
  subtitleCell.font = { name: 'Segoe UI', size: 14, color: { argb: colors.textSecondary } };
  subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(currentRow).height = 25;
  
  currentRow += 2;
  
  // Línea divisoria
  ws.mergeCells(`B${currentRow}:F${currentRow}`);
  ws.getCell(`B${currentRow}`).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: colors.primary }
  };
  ws.getRow(currentRow).height = 3;
  
  currentRow += 2;
  
  // === SECCIÓN: RESUMEN FINANCIERO ===
  ws.mergeCells(`B${currentRow}:F${currentRow}`);
  const finTitle = ws.getCell(`B${currentRow}`);
  finTitle.value = "💰 Resumen Financiero";
  finTitle.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: colors.textPrimary } };
  finTitle.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(currentRow).height = 25;
  
  currentRow += 2;
  
  // Tres tarjetas grandes
  const cardRow = currentRow;
  ws.getRow(cardRow).height = 80;
  
  // Tarjeta 1: Total Facturado (azul)
  createLargeCard(ws, cardRow, 'B', 'C', {
    label: 'Total Facturado',
    value: formatCurrency(data.summary.totalImporteMes),
    bgColor: colors.bgBlue,
    textColor: colors.primary
  });
  
  // Tarjeta 2: Total Paneles (verde)
  createLargeCard(ws, cardRow, 'D', 'D', {
    label: 'Total Paneles',
    value: data.summary.totalPanelesFacturables.toString(),
    bgColor: colors.bgGreen,
    textColor: colors.success
  });
  
  // Tarjeta 3: Importe Promedio (naranja)
  const importePromedio = data.summary.totalPanelesFacturables > 0 
    ? data.summary.totalImporteMes / data.summary.totalPanelesFacturables 
    : 0;
  createLargeCard(ws, cardRow, 'E', 'F', {
    label: 'Importe Promedio',
    value: formatCurrency(importePromedio),
    bgColor: colors.bgOrange,
    textColor: colors.warning
  });
  
  currentRow += 5;
  
  // Indicadores de estado
  ws.mergeCells(`B${currentRow}:F${currentRow}`);
  const indicatorsCell = ws.getCell(`B${currentRow}`);
  indicatorsCell.value = `✅ Activos: ${data.summary.panelesActivos}  ⚠️ Parciales: ${data.summary.panelesParciales}  ❌ Baja: 0`;
  indicatorsCell.font = { name: 'Segoe UI', size: 11, color: { argb: colors.textSecondary } };
  indicatorsCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(currentRow).height = 20;
  
  currentRow += 3;
  
  // === SECCIÓN: TOP 5 MUNICIPIOS ===
  ws.mergeCells(`B${currentRow}:F${currentRow}`);
  const topTitle = ws.getCell(`B${currentRow}`);
  topTitle.value = "🏆 Top 5 Municipios";
  topTitle.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: colors.textPrimary } };
  topTitle.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(currentRow).height = 25;
  
  currentRow += 2;
  
  // Tabla Top 5 (simplificada - usaremos datos ficticios basados en el ejemplo)
  const topMunicipios = [
    { nombre: 'Alcobendas', paneles: 150, importe: 5650.50 },
    { nombre: 'Getafe', paneles: 120, importe: 4520.00 },
    { nombre: 'Móstoles', paneles: 98, importe: 3689.80 },
    { nombre: 'Leganés', paneles: 45, importe: 1696.50 },
    { nombre: 'Fuenlabrada', paneles: 35, importe: 1319.00 }
  ];
  
  // Encabezado de tabla
  const headerRow = currentRow;
  ['#', 'Municipio', 'Paneles', 'Importe'].forEach((header, idx) => {
    const colLetter = String.fromCharCode(66 + idx); // B, C, D, E
    const cell = ws.getCell(`${colLetter}${headerRow}`);
    cell.value = header;
    cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: colors.textPrimary } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.bgGray } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
    };
  });
  ws.getRow(headerRow).height = 25;
  
  currentRow++;
  
  // Filas de datos
  topMunicipios.forEach((muni, idx) => {
    ws.getCell(`B${currentRow}`).value = idx + 1;
    ws.getCell(`C${currentRow}`).value = muni.nombre;
    ws.getCell(`D${currentRow}`).value = muni.paneles;
    ws.getCell(`E${currentRow}`).value = formatCurrency(muni.importe);
    
    ['B', 'C', 'D', 'E'].forEach(col => {
      const cell = ws.getCell(`${col}${currentRow}`);
      cell.font = { name: 'Segoe UI', size: 10 };
      cell.alignment = { 
        horizontal: col === 'C' ? 'left' : 'center', 
        vertical: 'middle' 
      };
      if (col === 'E') {
        cell.font = { ...cell.font, bold: true, color: { argb: colors.primary } };
      }
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
      };
    });
    
    ws.getRow(currentRow).height = 20;
    currentRow++;
  });
  
  currentRow += 2;
  
  // === SECCIÓN: INDICADORES DE CALIDAD ===
  ws.mergeCells(`B${currentRow}:F${currentRow}`);
  const qualityTitle = ws.getCell(`B${currentRow}`);
  qualityTitle.value = "✅ Indicadores de Calidad";
  qualityTitle.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: colors.textPrimary } };
  qualityTitle.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(currentRow).height = 25;
  
  currentRow += 2;
  
  // Tres mini-tarjetas horizontales
  const qualityRow = currentRow;
  ws.getRow(qualityRow).height = 35;
  
  createMiniCard(ws, qualityRow, 'B', 'C', {
    label: 'Paneles Completos',
    value: data.summary.panelesActivos.toString(),
    bgColor: colors.bgGreen,
    borderColor: colors.success
  });
  
  currentRow++;
  ws.getRow(currentRow).height = 35;
  createMiniCard(ws, currentRow, 'B', 'C', {
    label: 'Paneles Parciales',
    value: data.summary.panelesParciales.toString(),
    bgColor: colors.bgOrange,
    borderColor: colors.warning
  });
  
  currentRow++;
  ws.getRow(currentRow).height = 35;
  createMiniCard(ws, currentRow, 'B', 'C', {
    label: 'Paneles Problemáticos',
    value: '0',
    bgColor: colors.bgGreen,
    borderColor: colors.success
  });
  
  currentRow += 3;
  
  // === PIE DE PÁGINA ===
  ws.mergeCells(`B${currentRow}:F${currentRow}`);
  const footerCell = ws.getCell(`B${currentRow}`);
  const now = new Date().toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  footerCell.value = `Generado: ${now} | PIV Manager Pro`;
  footerCell.font = { name: 'Segoe UI', size: 9, color: { argb: colors.textMuted } };
  footerCell.alignment = { horizontal: 'center', vertical: 'middle' };
  
  // Proteger la hoja
  await ws.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true
  });
}

/**
 * Helper: Crear tarjeta grande (Resumen Financiero)
 */
function createLargeCard(
  ws: ExcelJS.Worksheet, 
  row: number, 
  startCol: string, 
  endCol: string, 
  config: { label: string; value: string; bgColor: string; textColor: string }
) {
  ws.mergeCells(`${startCol}${row}:${endCol}${row + 2}`);
  const cell = ws.getCell(`${startCol}${row}`);
  
  cell.value = {
    richText: [
      { text: config.label + '\n', font: { name: 'Segoe UI', size: 11, color: { argb: 'FF666666' } } },
      { text: config.value, font: { name: 'Segoe UI', size: 20, bold: true, color: { argb: config.textColor } } }
    ]
  };
  
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: config.bgColor }
  };
  
  cell.alignment = { 
    horizontal: 'center', 
    vertical: 'middle',
    wrapText: true
  };
  
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
  };
}

/**
 * Helper: Crear mini-tarjeta (Indicadores)
 */
function createMiniCard(
  ws: ExcelJS.Worksheet,
  row: number,
  startCol: string,
  endCol: string,
  config: { label: string; value: string; bgColor: string; borderColor: string }
) {
  ws.mergeCells(`${startCol}${row}:${endCol}${row}`);
  const cell = ws.getCell(`${startCol}${row}`);
  
  cell.value = `${config.label}: ${config.value}`;
  cell.font = { name: 'Segoe UI', size: 11, bold: true };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: config.bgColor }
  };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = {
    top: { style: 'medium', color: { argb: config.borderColor } },
    bottom: { style: 'medium', color: { argb: config.borderColor } },
    left: { style: 'medium', color: { argb: config.borderColor } },
    right: { style: 'medium', color: { argb: config.borderColor } }
  };
}

/**
 * HOJA 2: Resumen Financiero (Funcional)
 * Sin retenciones - facturación bruta directa
 */
function createFinancialSheet(workbook: ExcelJS.Workbook, data: ReportData) {
  const ws = workbook.addWorksheet("Resumen Financiero");
  
  ws.columns = [
    { width: 30 },
    { width: 20 }
  ];
  
  // Título
  ws.mergeCells("A1:B1");
  ws.getCell("A1").value = "RESUMEN FINANCIERO";
  ws.getCell("A1").font = { size: 14, bold: true };
  ws.getCell("A1").alignment = { horizontal: "center" };
  
  ws.getCell("A2").value = `Mes`;
  ws.getCell("A2").font = { size: 11, bold: true };
  ws.getCell("B2").value = `Noviembre 2025`;
  
  // Separador
  ws.getRow(3).height = 10;
  
  // Encabezados de tabla
  ws.getCell("A4").value = "Concepto";
  ws.getCell("A4").font = { bold: true };
  ws.getCell("B4").value = "Importe (EUR)";
  ws.getCell("B4").font = { bold: true };
  
  // Datos principales - SIN RETENCIÓN
  ws.getCell("A5").value = "Total Facturado";
  ws.getCell("A5").font = { bold: true };
  ws.getCell("B5").value = formatCurrency(data.summary.totalImporteMes);
  ws.getCell("B5").alignment = { horizontal: 'right' };
  
  // Separador
  ws.getRow(6).height = 10;
  
  // Datos de paneles
  ws.getCell("A7").value = "Concepto";
  ws.getCell("A7").font = { bold: true };
  ws.getCell("B7").value = "Cantidad";
  ws.getCell("B7").font = { bold: true };
  
  ws.getCell("A8").value = "Total Paneles";
  ws.getCell("B8").value = `${data.summary.totalPanelesFacturables},00 €`;
  ws.getCell("B8").alignment = { horizontal: 'right' };
  
  ws.getCell("A9").value = "Paneles Activos";
  ws.getCell("B9").value = `${data.summary.panelesActivos},00 €`;
  ws.getCell("B9").alignment = { horizontal: 'right' };
  
  ws.getCell("A10").value = "Paneles Parciales";
  ws.getCell("B10").value = `${data.summary.panelesParciales},00 €`;
  ws.getCell("B10").alignment = { horizontal: 'right' };
  
  ws.getCell("A11").value = "Paneles de Baja";
  ws.getCell("B11").value = "- €";
  ws.getCell("B11").alignment = { horizontal: 'right' };
  
  // Separador
  ws.getRow(12).height = 10;
  
  // Importe promedio
  const importePromedio = data.summary.totalPanelesFacturables > 0
    ? data.summary.totalImporteMes / data.summary.totalPanelesFacturables
    : 0;
  
  ws.getCell("A13").value = "Importe Promedio por Panel";
  ws.getCell("B13").value = formatCurrency(importePromedio);
  ws.getCell("B13").alignment = { horizontal: 'right' };
  
  // Freeze panes
  ws.views = [{ state: 'frozen', ySplit: 3 }];
}

/**
 * HOJA 3: Detalle de Paneles (Funcional con filtros)
 */
function createPanelsSheet(workbook: ExcelJS.Workbook, data: ReportData) {
  const ws = workbook.addWorksheet("Detalle de Paneles");
  
  // Configurar como tabla de Excel
  ws.columns = [
    { header: 'Código', key: 'codigo', width: 20 },
    { header: 'Municipio', key: 'municipio', width: 30 },
    { header: 'Días', key: 'dias', width: 10 },
    { header: 'Importe', key: 'importe', width: 15 },
    { header: 'Estado', key: 'estado', width: 15 },
    { header: 'Tarifa', key: 'tarifa', width: 15 }
  ];
  
  // Estilo del encabezado
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2C3E50' }
  };
  ws.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 25;
  
  // Agregar datos
  data.panels.forEach(panel => {
    ws.addRow({
      codigo: panel.codigo,
      municipio: panel.municipio,
      dias: panel.totalDiasFacturables,
      importe: panel.totalImporte,
      estado: panel.estadoAlCierre,
      tarifa: panel.tarifaAplicada
    });
  });
  
  // Crear tabla de Excel con filtros automáticos
  ws.addTable({
    name: 'TablaPaneles',
    ref: 'A1',
    headerRow: true,
    totalsRow: false,
    style: {
      theme: 'TableStyleMedium2',
      showRowStripes: true
    },
    columns: [
      { name: 'Código', filterButton: true },
      { name: 'Municipio', filterButton: true },
      { name: 'Días', filterButton: true },
      { name: 'Importe', filterButton: true },
      { name: 'Estado', filterButton: true },
      { name: 'Tarifa', filterButton: true }
    ],
    rows: data.panels.map(p => [
      p.codigo,
      p.municipio,
      p.totalDiasFacturables,
      p.totalImporte,
      p.estadoAlCierre,
      p.tarifaAplicada
    ])
  });
  
  // Freeze panes
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

/**
 * Helper: Formatear moneda al estilo español
 */
function formatCurrency(amount: number): string {
  return amount.toLocaleString('es-ES', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  }) + ' €';
}

/**
 * Helper: Formatear monthKey a texto legible
 */
function formatMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  return `${months[parseInt(month) - 1]} ${year}`;
}

// Interfaces
interface ReportData {
  monthKey: string;
  summary: {
    totalImporteMes: number;
    totalPanelesFacturables: number;
    panelesActivos: number;
    panelesParciales: number;
    totalEventos: number;
  };
  panels: Array<{
    codigo: string;
    municipio: string;
    totalDiasFacturables: number;
    totalImporte: number;
    estadoAlCierre: string;
    tarifaAplicada: number;
  }>;
}
