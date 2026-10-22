"use client";

import {
  type Column,
  type ColumnDef,
  columnFacetingFeature,
  columnFilteringFeature,
  columnVisibilityFeature,
  createFacetedMinMaxValues,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  filterFn_inNumberRange,
  flexRender,
  metaHelper,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  SearchIcon,
} from "lucide-react";
import { useId, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Item = {
  id: string;
  keyword: string;
  intents: Array<
    "Informational" | "Navigational" | "Commercial" | "Transactional"
  >;
  volume: number;
  cpc: number;
  traffic: number;
  link: string;
};

const features = tableFeatures({
  columnFilteringFeature,
  columnFacetingFeature,
  columnVisibilityFeature,
  facetedMinMaxValues: createFacetedMinMaxValues(),
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  filteredRowModel: createFilteredRowModel(),
  filterFns: {
    includesString: filterFn_includesString,
    inNumberRange: filterFn_inNumberRange,
  },
  columnMeta: metaHelper<{
    filterVariant?: "text" | "range" | "select";
  }>(),
  rowSelectionFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    text: sortFn_text,
  },
});

const columns: ColumnDef<typeof features, Item>[] = [
  {
    cell: ({ row }) => (
      <Checkbox
        aria-label="Select row"
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
      />
    ),
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all"
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      />
    ),
    id: "select",
  },
  {
    accessorKey: "keyword",
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue("keyword")}</div>
    ),
    header: "Keyword",
  },
  {
    accessorKey: "intents",
    cell: ({ row }) => {
      const intents = row.getValue("intents") as string[];
      return (
        <div className="flex gap-1">
          {intents.map((intent) => {
            const styles = {
              Commercial: "bg-amber-400/20 text-amber-500",
              Informational: "bg-indigo-400/20 text-indigo-500",
              Navigational: "bg-emerald-400/20 text-emerald-500",
              Transactional: "bg-rose-400/20 text-rose-500",
            }[intent];

            return (
              <div
                className={cn(
                  "flex size-5 items-center justify-center rounded font-medium text-xs",
                  styles,
                )}
                key={intent}
              >
                {intent.charAt(0)}
              </div>
            );
          })}
        </div>
      );
    },
    enableSorting: false,
    filterFn: (row, id, filterValue) => {
      const rowValue = row.getValue(id);
      return Array.isArray(rowValue) && rowValue.includes(filterValue);
    },
    header: "Intents",
    meta: {
      filterVariant: "select",
    },
  },
  {
    accessorKey: "volume",
    cell: ({ row }) => {
      const volume = Number.parseInt(row.getValue("volume"), 10);
      return new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 1,
        notation: "compact",
      }).format(volume);
    },
    header: "Volume",
    meta: {
      filterVariant: "range",
    },
  },
  {
    accessorKey: "cpc",
    cell: ({ row }) => <div>${row.getValue("cpc")}</div>,
    header: "CPC",
    meta: {
      filterVariant: "range",
    },
  },
  {
    accessorKey: "traffic",
    cell: ({ row }) => {
      const traffic = Number.parseInt(row.getValue("traffic"), 10);
      return new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 1,
        notation: "compact",
      }).format(traffic);
    },
    header: "Traffic",
    meta: {
      filterVariant: "range",
    },
  },
  {
    accessorKey: "link",
    cell: ({ row }) => (
      <a className="inline-flex items-center gap-1 hover:underline" href="#">
        {row.getValue("link")} <ExternalLinkIcon aria-hidden="true" size={12} />
      </a>
    ),
    enableSorting: false,
    header: "Link",
  },
];

const items: Item[] = [
  {
    cpc: 2.5,
    id: "1",
    intents: ["Informational", "Navigational"],
    keyword: "react components",
    link: "https://coss.com/origin",
    traffic: 88,
    volume: 2507,
  },
  {
    cpc: 4.75,
    id: "2",
    intents: ["Commercial", "Transactional"],
    keyword: "buy react templates",
    link: "https://coss.com/origin/input",
    traffic: 65,
    volume: 1850,
  },
  {
    cpc: 3.25,
    id: "3",
    intents: ["Informational", "Commercial"],
    keyword: "react ui library",
    link: "https://coss.com/origin/badge",
    traffic: 112,
    volume: 3200,
  },
  {
    cpc: 1.95,
    id: "4",
    intents: ["Transactional"],
    keyword: "tailwind components download",
    link: "https://coss.com/origin/alert",
    traffic: 45,
    volume: 890,
  },
  {
    cpc: 5.5,
    id: "5",
    intents: ["Commercial", "Transactional"],
    keyword: "react dashboard template free",
    link: "https://coss.com/origin/tabs",
    traffic: 156,
    volume: 4100,
  },
  {
    cpc: 1.25,
    id: "6",
    intents: ["Informational"],
    keyword: "how to use react components",
    link: "https://coss.com/origin/table",
    traffic: 42,
    volume: 1200,
  },
  {
    cpc: 6.8,
    id: "7",
    intents: ["Commercial", "Transactional"],
    keyword: "react ui kit premium",
    link: "https://coss.com/origin/avatar",
    traffic: 28,
    volume: 760,
  },
  {
    cpc: 1.8,
    id: "8",
    intents: ["Informational", "Navigational"],
    keyword: "react component documentation",
    link: "https://coss.com/origin",
    traffic: 35,
    volume: 950,
  },
];

export default function Component() {
  const table = useTable(
    {
      columns,
      data: items,
      enableSortingRemoval: false,
      features,
      initialState: {
        sorting: [
          {
            desc: false,
            id: "traffic",
          },
        ],
      },
    },
    (state) => ({
      columnFilters: state.columnFilters,
      rowSelection: state.rowSelection,
      sorting: state.sorting,
    }),
  );

  const keywordColumn = table.getColumn("keyword");
  const intentsColumn = table.getColumn("intents");
  const volumeColumn = table.getColumn("volume");
  const cpcColumn = table.getColumn("cpc");
  const trafficColumn = table.getColumn("traffic");

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Search input */}
        {keywordColumn && (
          <div className="w-44">
            <Filter column={keywordColumn} />
          </div>
        )}
        {/* Intents select */}
        {intentsColumn && (
          <div className="w-36">
            <Filter column={intentsColumn} />
          </div>
        )}
        {/* Volume inputs */}
        {volumeColumn && (
          <div className="w-36">
            <Filter column={volumeColumn} />
          </div>
        )}
        {/* CPC inputs */}
        {cpcColumn && (
          <div className="w-36">
            <Filter column={cpcColumn} />
          </div>
        )}
        {/* Traffic inputs */}
        {trafficColumn && (
          <div className="w-36">
            <Filter column={trafficColumn} />
          </div>
        )}
      </div>

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow className="bg-muted/50" key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead
                    aria-sort={
                      header.column.getIsSorted() === "asc"
                        ? "ascending"
                        : header.column.getIsSorted() === "desc"
                          ? "descending"
                          : "none"
                    }
                    className="relative h-10 select-none border-t"
                    key={header.id}
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <div
                        className={cn(
                          header.column.getCanSort() &&
                            "flex h-full cursor-pointer select-none items-center justify-between gap-2",
                        )}
                        onClick={header.column.getToggleSortingHandler()}
                        onKeyDown={(e) => {
                          // Enhanced keyboard handling for sorting
                          if (
                            header.column.getCanSort() &&
                            (e.key === "Enter" || e.key === " ")
                          ) {
                            e.preventDefault();
                            header.column.getToggleSortingHandler()?.(e);
                          }
                        }}
                        tabIndex={header.column.getCanSort() ? 0 : undefined}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {{
                          asc: (
                            <ChevronUpIcon
                              aria-hidden="true"
                              className="shrink-0 opacity-60"
                              size={16}
                            />
                          ),
                          desc: (
                            <ChevronDownIcon
                              aria-hidden="true"
                              className="shrink-0 opacity-60"
                              size={16}
                            />
                          ),
                        }[header.column.getIsSorted() as string] ?? (
                          <span aria-hidden="true" className="size-4" />
                        )}
                      </div>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                data-state={row.getIsSelected() && "selected"}
                key={row.id}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell className="h-24 text-center" colSpan={columns.length}>
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <p className="mt-4 text-center text-muted-foreground text-sm">
        Data table with filters made with{" "}
        <a
          className="underline hover:text-foreground"
          href="https://tanstack.com/table"
          rel="noopener noreferrer"
          target="_blank"
        >
          TanStack Table
        </a>
      </p>
    </div>
  );
}

function Filter({
  column,
}: {
  column: Column<typeof features, Item, unknown>;
}) {
  const id = useId();
  const columnFilterValue = column.getFilterValue();
  const { filterVariant } = column.columnDef.meta ?? {};
  const columnHeader =
    typeof column.columnDef.header === "string" ? column.columnDef.header : "";
  const sortedUniqueValues = useMemo(() => {
    if (filterVariant === "range") return [];

    // Get all unique values from the column
    const values = Array.from(column.getFacetedUniqueValues().keys());

    // If the values are arrays, flatten them and get unique items
    const flattenedValues = values.reduce((acc: string[], curr) => {
      if (Array.isArray(curr)) {
        acc.push(...curr);
      } else {
        acc.push(curr);
      }
      return acc;
    }, []);

    // Get unique values and sort them
    return Array.from(new Set(flattenedValues)).sort();
  }, [column, filterVariant]);

  if (filterVariant === "range") {
    return (
      <div className="*:not-first:mt-2">
        <Label>{columnHeader}</Label>
        <div className="flex">
          <Input
            aria-label={`${columnHeader} min`}
            className="flex-1 rounded-e-none [-moz-appearance:_textfield] focus:z-10 [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
            id={`${id}-range-1`}
            onChange={(e) =>
              column.setFilterValue((old: [number, number]) => [
                e.target.value ? Number(e.target.value) : undefined,
                old?.[1],
              ])
            }
            placeholder="Min"
            type="number"
            value={(columnFilterValue as [number, number])?.[0] ?? ""}
          />
          <Input
            aria-label={`${columnHeader} max`}
            className="-ms-px flex-1 rounded-s-none [-moz-appearance:_textfield] focus:z-10 [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
            id={`${id}-range-2`}
            onChange={(e) =>
              column.setFilterValue((old: [number, number]) => [
                old?.[0],
                e.target.value ? Number(e.target.value) : undefined,
              ])
            }
            placeholder="Max"
            type="number"
            value={(columnFilterValue as [number, number])?.[1] ?? ""}
          />
        </div>
      </div>
    );
  }

  if (filterVariant === "select") {
    return (
      <div className="*:not-first:mt-2">
        <Label htmlFor={`${id}-select`}>{columnHeader}</Label>
        <Select
          onValueChange={(value) => {
            column.setFilterValue(value === "all" ? undefined : value);
          }}
          value={columnFilterValue?.toString() ?? "all"}
        >
          <SelectTrigger id={`${id}-select`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {sortedUniqueValues.map((value) => (
              <SelectItem key={String(value)} value={String(value)}>
                {String(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="*:not-first:mt-2">
      <Label htmlFor={`${id}-input`}>{columnHeader}</Label>
      <div className="relative">
        <Input
          className="peer ps-9"
          id={`${id}-input`}
          onChange={(e) => column.setFilterValue(e.target.value)}
          placeholder={`Search ${columnHeader.toLowerCase()}`}
          type="text"
          value={(columnFilterValue ?? "") as string}
        />
        <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-muted-foreground/80 peer-disabled:opacity-50">
          <SearchIcon size={16} />
        </div>
      </div>
    </div>
  );
}
