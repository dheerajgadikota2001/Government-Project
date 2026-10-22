"use client";

import {
  type Column,
  type ColumnDef,
  columnOrderingFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  flexRender,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import {
  ArrowLeftToLineIcon,
  ArrowRightToLineIcon,
  EllipsisIcon,
  PinOffIcon,
} from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  name: string;
  email: string;
  location: string;
  flag: string;
  status: "Active" | "Inactive" | "Pending";
  balance: number;
  department: string;
  role: string;
  joinDate: string;
  lastActive: string;
  performance: "Good" | "Very Good" | "Excellent" | "Outstanding";
};

const features = tableFeatures({
  columnOrderingFeature,
  columnPinningFeature,
  columnSizingFeature,
  columnResizingFeature,
  columnVisibilityFeature,
});

// Helper function to compute pinning styles for columns
const getPinningStyles = (
  column: Column<typeof features, Item, unknown>,
): CSSProperties => {
  const isPinned = column.getIsPinned();
  return {
    insetInlineEnd:
      isPinned === "end" ? `${column.getAfter("end")}px` : undefined,
    insetInlineStart:
      isPinned === "start" ? `${column.getStart("start")}px` : undefined,
    position: isPinned ? "sticky" : "relative",
    width: column.getSize(),
    zIndex: isPinned ? 1 : 0,
  };
};

const columns: ColumnDef<typeof features, Item>[] = [
  {
    accessorKey: "name",
    cell: ({ row }) => (
      <div className="truncate font-medium">{row.getValue("name")}</div>
    ),
    header: "Name",
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "location",
    cell: ({ row }) => (
      <div className="truncate">
        <span className="text-lg leading-none">{row.original.flag}</span>{" "}
        {row.getValue("location")}
      </div>
    ),
    header: "Location",
  },
  {
    accessorKey: "status",
    header: "Status",
  },
  {
    accessorKey: "balance",
    cell: ({ row }) => {
      const amount = Number.parseFloat(row.getValue("balance"));
      const formatted = new Intl.NumberFormat("en-US", {
        currency: "USD",
        style: "currency",
      }).format(amount);
      return formatted;
    },
    header: "Balance",
  },
  {
    accessorKey: "department",
    header: "Department",
  },
  {
    accessorKey: "role",
    header: "Role",
  },
  {
    accessorKey: "joinDate",
    header: "Join Date",
  },
  {
    accessorKey: "lastActive",
    header: "Last Active",
  },
  {
    accessorKey: "performance",
    header: "Performance",
  },
];

export default function Component() {
  const [data, setData] = useState<Item[]>([]);

  useEffect(() => {
    async function fetchPosts() {
      const res = await fetch(
        "https://raw.githubusercontent.com/origin-space/origin-images/refs/heads/main/users-01_fertyx.json",
      );
      const data = await res.json();
      setData(data.slice(0, 5)); // Limit to 5 items
    }
    fetchPosts();
  }, []);

  const table = useTable(
    {
      columnResizeMode: "onChange",
      columns,
      data,
      features,
    },
    (state) => ({
      columnPinning: state.columnPinning,
      columnSizing: state.columnSizing,
    }),
  );

  return (
    <div>
      <Table
        className="table-fixed border-separate border-spacing-0 [&_td]:border-border [&_tfoot_td]:border-t [&_th]:border-border [&_th]:border-b [&_tr:not(:last-child)_td]:border-b [&_tr]:border-none"
        style={{
          width: table.getTotalSize(),
        }}
      >
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow className="bg-muted/50" key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const { column } = header;
                const isPinned = column.getIsPinned();
                const isLastStartPinned =
                  isPinned === "start" && column.getIsLastColumn("start");
                const isFirstEndPinned =
                  isPinned === "end" && column.getIsFirstColumn("end");

                return (
                  <TableHead
                    className="relative h-10 truncate border-t data-pinned:bg-muted/90 data-pinned:backdrop-blur-xs [&:not([data-pinned]):has(+[data-pinned])_div.cursor-col-resize:last-child]:opacity-0 [&[data-last-col=start]_div.cursor-col-resize:last-child]:opacity-0 [&[data-pinned=end]:last-child_div.cursor-col-resize:last-child]:opacity-0 [&[data-pinned=end][data-last-col=end]]:border-s [&[data-pinned=start][data-last-col=start]]:border-e [&[data-pinned][data-last-col]]:border-border"
                    colSpan={header.colSpan}
                    data-last-col={
                      isLastStartPinned
                        ? "start"
                        : isFirstEndPinned
                          ? "end"
                          : undefined
                    }
                    data-pinned={isPinned || undefined}
                    key={header.id}
                    style={{ ...getPinningStyles(column) }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </span>
                      {/* Pin/Unpin column controls with enhanced accessibility */}
                      {!header.isPlaceholder &&
                        header.column.getCanPin() &&
                        (header.column.getIsPinned() ? (
                          <Button
                            aria-label={`Unpin ${header.column.columnDef.header as string} column`}
                            className="-mr-1 size-7 shadow-none"
                            onClick={() => header.column.pin(false)}
                            size="icon"
                            title={`Unpin ${header.column.columnDef.header as string} column`}
                            variant="ghost"
                          >
                            <PinOffIcon
                              aria-hidden="true"
                              className="opacity-60"
                              size={16}
                            />
                          </Button>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                aria-label={`Pin options for ${header.column.columnDef.header as string} column`}
                                className="-mr-1 size-7 shadow-none"
                                size="icon"
                                title={`Pin options for ${header.column.columnDef.header as string} column`}
                                variant="ghost"
                              >
                                <EllipsisIcon
                                  aria-hidden="true"
                                  className="opacity-60"
                                  size={16}
                                />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => header.column.pin("start")}
                              >
                                <ArrowLeftToLineIcon
                                  aria-hidden="true"
                                  className="opacity-60"
                                  size={16}
                                />
                                Stick to start
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => header.column.pin("end")}
                              >
                                <ArrowRightToLineIcon
                                  aria-hidden="true"
                                  className="opacity-60"
                                  size={16}
                                />
                                Stick to end
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ))}
                      {header.column.getCanResize() && (
                        <div
                          {...{
                            className:
                              "absolute top-0 h-full w-4 cursor-col-resize user-select-none touch-none -right-2 z-10 flex justify-center before:absolute before:w-px before:inset-y-0 before:bg-border before:-translate-x-px",
                            onDoubleClick: () => header.column.resetSize(),
                            onMouseDown: header.getResizeHandler(),
                            onTouchStart: header.getResizeHandler(),
                          }}
                        />
                      )}
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  const { column } = cell;
                  const isPinned = column.getIsPinned();
                  const isLastStartPinned =
                    isPinned === "start" && column.getIsLastColumn("start");
                  const isFirstEndPinned =
                    isPinned === "end" && column.getIsFirstColumn("end");

                  return (
                    <TableCell
                      className="truncate data-pinned:bg-background/90 data-pinned:backdrop-blur-xs [&[data-pinned=end][data-last-col=end]]:border-s [&[data-pinned=start][data-last-col=start]]:border-e [&[data-pinned][data-last-col]]:border-border"
                      data-last-col={
                        isLastStartPinned
                          ? "start"
                          : isFirstEndPinned
                            ? "end"
                            : undefined
                      }
                      data-pinned={isPinned || undefined}
                      key={cell.id}
                      style={{ ...getPinningStyles(column) }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  );
                })}
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
        Pinnable columns made with{" "}
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
