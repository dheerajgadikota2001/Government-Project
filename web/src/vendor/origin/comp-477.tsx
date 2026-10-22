"use client";

import {
  type ColumnDef,
  columnVisibilityFeature,
  flexRender,
  rowSelectionFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
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
};

const features = tableFeatures({
  columnVisibilityFeature,
  rowSelectionFeature,
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
    accessorKey: "name",
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue("name")}</div>
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
      <div>
        <span className="text-lg leading-none">{row.original.flag}</span>{" "}
        {row.getValue("location")}
      </div>
    ),
    header: "Location",
  },
  {
    accessorKey: "status",
    cell: ({ row }) => (
      <Badge
        className={cn(
          row.getValue("status") === "Inactive" &&
            "bg-muted-foreground/60 text-primary-foreground",
        )}
      >
        {row.getValue("status")}
      </Badge>
    ),
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
      return <div className="text-right">{formatted}</div>;
    },
    header: () => <div className="text-right">Balance</div>,
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
      columns,
      data,
      features,
    },
    (state) => ({ rowSelection: state.rowSelection }),
  );

  return (
    <div>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow className="hover:bg-transparent" key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
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
        <TableFooter className="bg-transparent">
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={5}>Total</TableCell>
            <TableCell className="text-right">
              {new Intl.NumberFormat("en-US", {
                currency: "USD",
                style: "currency",
              }).format(data.reduce((total, item) => total + item.balance, 0))}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
      <p className="mt-4 text-center text-muted-foreground text-sm">
        Basic data table made with{" "}
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
