import { Box, Paper } from "@mui/material";
import { DataGrid, GridToolbarQuickFilter, GridToolbarContainer, GridToolbarColumnsButton, GridToolbarDensitySelector, GridToolbarExport } from "@mui/x-data-grid";
import EmptyState from "./EmptyState";

function DefaultToolbar() {
  return (
    <GridToolbarContainer sx={{ p: 1, gap: 1, borderBottom: "1px solid", borderColor: "divider" }}>
      <GridToolbarQuickFilter debounceMs={200} sx={{ flex: 1, minWidth: 200 }} />
      <GridToolbarColumnsButton />
      <GridToolbarDensitySelector />
      <GridToolbarExport />
    </GridToolbarContainer>
  );
}

/**
 * Thin wrapper around MUI X DataGrid with sensible SaaS defaults.
 * Props passthrough — all DataGrid props are supported via ...rest.
 */
export default function DataTable({
  rows = [],
  columns = [],
  loading = false,
  height = 560,
  toolbar = true,
  emptyText = "No records found",
  getRowId,
  pageSizeOptions = [25, 50, 100],
  initialPageSize = 25,
  density = "standard",
  ...rest
}) {
  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <Box sx={{ height, width: "100%" }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          getRowId={getRowId}
          density={density}
          disableRowSelectionOnClick
          pageSizeOptions={pageSizeOptions}
          initialState={{
            pagination: { paginationModel: { pageSize: initialPageSize, page: 0 } },
          }}
          slots={{
            toolbar: toolbar ? DefaultToolbar : undefined,
            noRowsOverlay: () => (
              <Box sx={{ height: "100%", display: "grid", placeItems: "center" }}>
                <EmptyState title={emptyText} />
              </Box>
            ),
          }}
          {...rest}
        />
      </Box>
    </Paper>
  );
}
