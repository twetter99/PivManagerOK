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
 * Genera un reporte en formato Excel
 */
async function generateExcelReport(data: ReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Facturación");

  // Título
  worksheet.mergeCells("A1:F1");
  worksheet.getCell("A1").value = "Reporte de Facturación PIV Manager Pro";
  worksheet.getCell("A1").font = { size: 16, bold: true };
  worksheet.getCell("A1").alignment = { horizontal: "center" };

  worksheet.mergeCells("A2:F2");
  worksheet.getCell("A2").value = `Mes: ${data.monthKey}`;
  worksheet.getCell("A2").font = { size: 12 };
  worksheet.getCell("A2").alignment = { horizontal: "center" };

  // Resumen
  worksheet.getRow(4).values = ["Resumen del Mes"];
  worksheet.getCell("A4").font = { bold: true };

  worksheet.getRow(5).values = ["Total Facturado:", `${data.summary.totalImporteMes.toFixed(2)} €`];
  worksheet.getRow(6).values = ["Paneles Facturables:", data.summary.totalPanelesFacturables];
  worksheet.getRow(7).values = ["Paneles Activos (≥30 días):", data.summary.panelesActivos];
  worksheet.getRow(8).values = ["Paneles Parciales (<30 días):", data.summary.panelesParciales];
  worksheet.getRow(9).values = ["Total de Eventos:", data.summary.totalEventos];

  // Tabla de paneles
  worksheet.getRow(11).values = ["Detalle por Panel"];
  worksheet.getCell("A11").font = { bold: true };

  // Encabezados
  worksheet.getRow(12).values = ["Código", "Municipio", "Días", "Importe", "Estado", "Tarifa"];
  worksheet.getRow(12).font = { bold: true };
  worksheet.getRow(12).alignment = { horizontal: "center" };

  // Datos
  let rowIndex = 13;
  for (const panel of data.panels) {
    worksheet.getRow(rowIndex).values = [
      panel.codigo,
      panel.municipio,
      panel.totalDiasFacturables,
      panel.totalImporte,
      panel.estadoAlCierre,
      panel.tarifaAplicada,
    ];
    rowIndex++;
  }

  // Ajustar anchos de columna
  worksheet.columns = [
    { width: 20 },
    { width: 30 },
    { width: 10 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
  ];

  // Generar el buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
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
