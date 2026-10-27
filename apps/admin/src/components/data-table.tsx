import {
  type ColumnDef,
  createColumnHelper,
  type RowData,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// No client-side features: the API filters and paginates, the URL holds the state.
const features = tableFeatures({})

export const columnHelper = <TRow extends RowData>() => createColumnHelper<typeof features, TRow>()

// biome-ignore lint/suspicious/noExplicitAny: ColumnDef's third parameter is the per-column value type
type Columns<TRow extends RowData> = Array<ColumnDef<typeof features, TRow, any>>

export type Pagination = {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

/** shadcn's data-table pattern: TanStack Table for the model, the shadcn Table for the markup. */
export function DataTable<TRow extends RowData>(props: {
  columns: Columns<TRow>
  data: TRow[]
  empty?: string
  pagination?: Pagination
}) {
  const table = useTable({ features, columns: props.columns, data: props.data })
  const pagination = props.pagination
  const pageCount = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={props.columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {props.empty ?? 'No results.'}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{pagination.total} total</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              Previous
            </Button>
            <span>
              Page {pagination.page} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pageCount}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
