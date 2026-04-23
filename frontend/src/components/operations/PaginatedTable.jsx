import { useMemo, useState, useEffect } from "react";
import {
  Box, Paper, Stack, TablePagination, CircularProgress,
} from "@mui/material";

/**
 * Client-side paginated HTML table shared by the Outlet Operations reports.
 *
 * The reports return the full result set in one payload (each one already
 * caps the server-side query), so the pagination here is purely visual —
 * it slices the `rows` array before rendering. Keeping it dumb avoids a
 * backend round-trip when the user flips pages and keeps the existing
 * filter/date-range controls the single source of truth.
 *
 * `columns` is the shape already used by these reports:
 *   { header, align: "left" | "right", render: (row, i) => ReactNode }
 */
export default function PaginatedTable({
  columns,
  rows,
  loading = false,
  emptyText = "No rows",
  defaultPageSize = 25,
  pageSizeOptions = [10, 25, 50, 100],
  getRowKey,
  rowStyle,
}) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  // Reset to page 0 whenever the row set changes (new filter/date range).
  useEffect(() => { setPage(0); }, [rows]);

  const total = rows?.length ?? 0;
  const sliced = useMemo(() => {
    if (!rows) return [];
    const start = page * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <Box sx={{ overflowX: "auto" }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "rgba(0,0,0,0.04)", textAlign: "left" }}>
                {columns.map((c, i) => (
                  <th
                    key={c.key || c.header || i}
                    style={{
                      padding: "8px 12px",
                      textAlign: c.align || "left",
                      whiteSpace: c.nowrap ? "nowrap" : "normal",
                      width: c.width,
                    }}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sliced.map((row, i) => {
                const key = getRowKey ? getRowKey(row, i + page * pageSize) : i + page * pageSize;
                return (
                  <tr
                    key={key}
                    style={{ borderTop: "1px solid rgba(0,0,0,0.06)", ...(rowStyle?.(row) || {}) }}
                  >
                    {columns.map((c, j) => (
                      <td
                        key={c.key || c.header || j}
                        style={{
                          padding: "6px 12px",
                          textAlign: c.align || "left",
                          fontVariantNumeric: c.align === "right" ? "tabular-nums" : "normal",
                          fontFamily: c.mono ? "monospace" : "inherit",
                          ...(c.cellStyle?.(row) || {}),
                        }}
                      >
                        {c.render(row, i + page * pageSize)}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {total === 0 && (
                <tr>
                  <td colSpan={columns.length} style={{ padding: 24, textAlign: "center", color: "rgba(0,0,0,0.5)" }}>
                    {emptyText}
                  </td>
                </tr>
              )}
            </tbody>
          </Box>
        )}
      </Box>

      {total > 0 && (
        <Stack direction="row" justifyContent="flex-end">
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={pageSize}
            onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
            rowsPerPageOptions={pageSizeOptions}
            labelRowsPerPage="Rows:"
            sx={{ ".MuiTablePagination-toolbar": { minHeight: 44 } }}
          />
        </Stack>
      )}
    </Paper>
  );
}
