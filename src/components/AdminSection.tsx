/**
 * AdminSection Component
 * Controles de administración: importar base, cerrar mes
 * Solo visible para usuarios con rol admin
 * Diseño: sección con borde superior, controles neutrales
 */

"use client";

import { useState } from "react";
import { importBaseMonth } from "@/lib/api";

interface AdminSectionProps {
  isAdmin: boolean;
  isLocked: boolean;
  monthKey: string;
  onMonthClosed?: () => void;
}

export default function AdminSection({
  isAdmin,
  isLocked,
  monthKey,
  onMonthClosed,
}: AdminSectionProps) {
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  if (!isAdmin) {
    return null;
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    console.log("📁 Archivo seleccionado:", file?.name);
    
    if (!file) {
      console.log("❌ No hay archivo");
      return;
    }

    // Validar CSV
    if (!file.name.endsWith(".csv")) {
      setImportError("El archivo debe ser un CSV válido");
      console.log("❌ No es CSV");
      return;
    }

    console.log("⏳ Iniciando importación...");
    setImportLoading(true);
    setImportError(null);
    setImportSuccess(false);

    try {
      const text = await file.text();
      const lines = text.split("\n");

      // Validar formato (esperamos al menos header + 1 panel)
      if (lines.length < 2) {
        throw new Error("El archivo debe contener al menos un panel");
      }

      const header = lines[0].trim().toLowerCase();
      if (!header.includes("codigo") && !header.includes("código")) {
        throw new Error("El CSV debe tener las columnas: Municipio, Código Parada, Facturación");
      }

      // Parsear paneles
      const panels = lines.slice(1).filter(line => line.trim()).map((line, index) => {
        // Soportar delimitadores: coma, tabulador o punto y coma
        const parts = line.includes("\t") 
          ? line.split("\t") 
          : line.includes(";") 
            ? line.split(";") 
            : line.split(",");
        
        const [municipio, codigo, tarifa] = parts.map(s => s.trim());
        
        // Validar que tenemos datos
        if (!municipio || !codigo || !tarifa) {
          console.warn(`⚠️ Línea ${index + 2} incompleta:`, line);
          return null;
        }
        
        // Limpiar el código (quitar espacios extra, normalizar)
        const codigoClean = codigo.trim();
        
        // Limpiar el valor de tarifa (quitar €, espacios, etc.)
        const tarifaClean = tarifa.replace(/[€\s]/g, "").replace(",", ".");
        const tarifaNum = parseFloat(tarifaClean);
        
        if (isNaN(tarifaNum)) {
          console.warn(`⚠️ Tarifa inválida en línea ${index + 2}:`, tarifa);
          return null;
        }
        
        // Calcular días del mes (FIJO: base 30 días)
        const [year, month] = monthKey.split("-").map(Number);
        const diasMes = 30; // Base fija para todos los meses
        
        // Generar ID único (municipio + código, sanitizado)
        const municipioId = `${municipio.substring(0, 20)}_${codigoClean}`.replace(/[^a-zA-Z0-9_-]/g, "_");
        
        return {
          codigo: codigoClean,
          municipioId: municipioId,
          municipioNombre: municipio,
          tarifaBaseMes: 37.70, // Tarifa estándar 2025 (CSV contiene importe del mes, no tarifa)
          ubicacion: municipio,
          tipo: "PIV",
          fechaAlta: `${monthKey}-30`, // Fecha 30 del mes
          diasFacturables: diasMes,
          importeAFacturar: tarifaNum,
        };
      }).filter(p => p !== null);

      if (panels.length === 0) {
        throw new Error("No se encontraron paneles válidos en el archivo");
      }

      console.log(`📊 Importando ${panels.length} paneles...`);

      // Llamar a la Cloud Function
      const result = await importBaseMonth({ monthKey, data: panels });

      console.log("✅ Importación exitosa:", result);
      setImportSuccess(true);
      
      // Recargar página después de 2 segundos para ver los datos
      setTimeout(() => {
        window.location.reload();
      }, 2000);
      
      // Limpiar input
      e.target.value = "";
    } catch (err: any) {
      console.error("❌ Error en importación:", err);
      setImportError(err.message || "Error al importar el archivo");
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div
      style={{
        marginTop: "32px",
        paddingTop: "24px",
        borderTop: "1px solid #EAEAEA",
      }}
    >
      <h2
        style={{
          fontSize: "16px",
          fontWeight: 600,
          color: "#000",
          marginBottom: "16px",
        }}
      >
        Administración
      </h2>

      {/* Lock indicator */}
      {isLocked && (
        <div
          style={{
            padding: "12px 16px",
            marginBottom: "16px",
            fontSize: "14px",
            color: "#595959",
            backgroundColor: "#F7F7F7",
            border: "1px solid #EAEAEA",
            borderRadius: "2px",
          }}
        >
          Este mes está cerrado. No se pueden realizar cambios.
        </div>
      )}

      {/* Import base month */}
      <div style={{ marginBottom: "16px" }}>
        <label
          style={{
            display: "block",
            fontSize: "14px",
            fontWeight: 500,
            color: isLocked ? "#A3A3A3" : "#000",
            marginBottom: "8px",
          }}
        >
          Importar base del mes
        </label>

        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
          }}
        >
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            disabled={importLoading || isLocked}
            style={{
              fontSize: "14px",
              color: isLocked ? "#A3A3A3" : "#595959",
              cursor: isLocked ? "not-allowed" : "pointer",
            }}
          />

          {importLoading && (
            <span
              style={{
                fontSize: "12px",
                color: "#595959",
              }}
            >
              Importando...
            </span>
          )}
        </div>

        {importError && (
          <div
            style={{
              marginTop: "8px",
              padding: "8px 12px",
              fontSize: "12px",
              color: "#595959",
              backgroundColor: "#F7F7F7",
              border: "1px solid #EAEAEA",
              borderRadius: "2px",
            }}
          >
            {importError}
          </div>
        )}

        {importSuccess && (
          <div
            style={{
              marginTop: "8px",
              padding: "8px 12px",
              fontSize: "12px",
              color: "#595959",
              backgroundColor: "#F7F7F7",
              border: "1px solid #EAEAEA",
              borderRadius: "2px",
            }}
          >
            Importación completada con éxito
          </div>
        )}

        <p
          style={{
            marginTop: "8px",
            fontSize: "12px",
            color: "#A3A3A3",
          }}
        >
          Formato CSV: Municipio, Código Parada, Facturación (con o sin encabezado)
        </p>
      </div>

      {/* Close month (manual trigger opcional - closeMonthJob se ejecuta automáticamente) */}
      <div>
        <label
          style={{
            display: "block",
            fontSize: "14px",
            fontWeight: 500,
            color: "#000",
            marginBottom: "8px",
          }}
        >
          Cerrar mes
        </label>

        <p
          style={{
            fontSize: "12px",
            color: "#A3A3A3",
            marginBottom: "8px",
          }}
        >
          El cierre automático se ejecuta el día 1 de cada mes a las 02:00 AM.
          Una vez cerrado, no se pueden crear ni modificar eventos.
        </p>

        {isLocked ? (
          <p
            style={{
              fontSize: "12px",
              color: "#595959",
              backgroundColor: "#F7F7F7",
              padding: "8px 12px",
              border: "1px solid #EAEAEA",
              borderRadius: "2px",
            }}
          >
            Este mes está cerrado. No se puede ejecutar el cierre manualmente.
          </p>
        ) : (
          <p
            style={{
              fontSize: "12px",
              color: "#595959",
              backgroundColor: "#F7F7F7",
              padding: "8px 12px",
              border: "1px solid #EAEAEA",
              borderRadius: "2px",
            }}
          >
            Este mes aún no está cerrado. El cierre se realizará automáticamente.
          </p>
        )}
      </div>
    </div>
  );
}
