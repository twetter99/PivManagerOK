/**
 * FiltersBar Component
 * Búsqueda y filtros para la tabla de paneles
 * Diseño horizontal compacto, neutro
 */

"use client";

interface FiltersBarProps {
  searchQuery: string;
  statusFilter: string;
  onSearchChange: (search: string) => void;
  onStatusFilterChange: (status: string) => void;
}

export default function FiltersBar({
  searchQuery,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
}: FiltersBarProps) {

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // No hacemos trim aquí para permitir búsquedas mientras se escribe
    onSearchChange(e.target.value);
  };

  const handleStatusChange = (status: string) => {
    onStatusFilterChange(status);
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        padding: "16px 0",
        borderBottom: "1px solid #EAEAEA",
        marginBottom: "16px",
      }}
    >
      {/* Búsqueda */}
      <div style={{ flex: 1, maxWidth: "400px" }}>
        <input
          type="text"
          placeholder="Buscar por código o municipio..."
          value={searchQuery}
          onChange={handleSearchChange}
          style={{
            width: "100%",
            padding: "8px 12px",
            fontSize: "14px",
            fontWeight: 400,
            color: "#000",
            backgroundColor: "#FFF",
            border: "1px solid #D9D9D9",
            borderRadius: "2px",
            outline: "none",
            transition: "border-color 150ms",
          }}
          onFocus={(e) => {
            e.target.style.borderColor = "#595959";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = "#D9D9D9";
          }}
        />
      </div>

      {/* Filtros de estado */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          marginLeft: "16px",
        }}
      >
        <span
          style={{
            fontSize: "12px",
            fontWeight: 500,
            color: "#595959",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginRight: "4px",
          }}
        >
          Estado
        </span>
        {["all", "ACTIVO", "PARCIAL"].map((status) => (
          <button
            key={status}
            onClick={() => handleStatusChange(status)}
            style={{
              padding: "6px 12px",
              fontSize: "12px",
              fontWeight: 500,
              color: statusFilter === status ? "#000" : "#595959",
              backgroundColor:
                statusFilter === status ? "#F7F7F7" : "transparent",
              border: "1px solid #D9D9D9",
              borderRadius: "2px",
              cursor: "pointer",
              transition: "all 150ms",
              outline: "none",
            }}
            onMouseEnter={(e) => {
              if (statusFilter !== status) {
                e.currentTarget.style.backgroundColor = "#F7F7F7";
              }
            }}
            onMouseLeave={(e) => {
              if (statusFilter !== status) {
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
          >
            {status === "all" ? "Todos" : status === "PARCIAL" ? "Parciales" : status}
          </button>
        ))}
      </div>
    </div>
  );
}
