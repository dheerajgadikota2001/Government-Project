"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  type Cell,
  type ColumnDef,
  columnOrderingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createSortedRowModel,
  flexRender,
  type Header,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ChevronDownIcon, ChevronUpIcon, GripVerticalIcon } from "lucide-react";
import { type CSSProperties, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
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
};

const features = tableFeatures({
  columnOrderingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    text: sortFn_text,
  },
});

const columns: ColumnDef<typeof features, Item>[] = [
  {
    accessorKey: "name",
    cell: ({ row }) => (
      <div className="truncate font-medium">{row.getValue("name")}</div>
    ),
    header: "Name",
    id: "name",
    sortDescFirst: false,
    sortUndefined: "last",
  },
  {
    accessorKey: "email",
    header: "Email",
    id: "email",
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
    id: "location",
  },
  {
    accessorKey: "status",
    header: "Status",
    id: "status",
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
    id: "balance",
  },
];

const initialColumnOrder = columns.map((column) => column.id as string);

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
      enableSortingRemoval: false,
      features,
      initialState: {
        columnOrder: initialColumnOrder,
      },
    },
    (state) => ({
      columnOrder: state.columnOrder,
      sorting: state.sorting,
    }),
  );

  // reorder columns after drag & drop
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      table.setColumnOrder((columnOrder) => {
        const oldIndex = columnOrder.indexOf(active.id as string);
        const newIndex = columnOrder.indexOf(over.id as string);
        return arrayMove(columnOrder, oldIndex, newIndex); //this is just a splice util
      });
    }
  }

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {}),
  );

  return (
    <DndContext
      collisionDetection={closestCenter}
      id={useId()}
      modifiers={[restrictToHorizontalAxis]}
      onDragEnd={handleDragEnd}
      sensors={sensors}
    >
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow className="bg-muted/50" key={headerGroup.id}>
              <SortableContext
                items={table.state.columnOrder}
                strategy={horizontalListSortingStrategy}
              >
                {headerGroup.headers.map((header) => (
                  <DraggableTableHeader header={header} key={header.id} />
                ))}
              </SortableContext>
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <SortableContext
                    items={table.state.columnOrder}
                    key={cell.id}
                    strategy={horizontalListSortingStrategy}
                  >
                    <DragAlongCell cell={cell} key={cell.id} />
                  </SortableContext>
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
        Draggable columns made with{" "}
        <a
          className="underline hover:text-foreground"
          href="https://tanstack.com/table"
          rel="noopener noreferrer"
          target="_blank"
        >
          TanStack Table
        </a>{" "}
        and{" "}
        <a href="https://dndkit.com/" rel="noopener noreferrer" target="_blank">
          dnd kit
        </a>
      </p>
    </DndContext>
  );
}

const DraggableTableHeader = ({
  header,
}: {
  header: Header<typeof features, Item, unknown>;
}) => {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: header.column.id,
  });

  const style: CSSProperties = {
    opacity: isDragging ? 0.8 : 1,
    position: "relative",
    transform: CSS.Translate.toString(transform),
    transition,
    whiteSpace: "nowrap",
    width: header.column.getSize(),
    zIndex: isDragging ? 1 : 0,
  };

  return (
    <TableHead
      aria-sort={
        header.column.getIsSorted() === "asc"
          ? "ascending"
          : header.column.getIsSorted() === "desc"
            ? "descending"
            : "none"
      }
      className="relative h-10 border-t before:absolute before:inset-y-0 before:start-0 before:w-px before:bg-border first:before:bg-transparent"
      ref={setNodeRef}
      style={style}
    >
      <div className="flex items-center justify-start gap-0.5">
        <Button
          className="-ml-2 size-7 shadow-none"
          size="icon"
          variant="ghost"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVerticalIcon
            aria-hidden="true"
            className="opacity-60"
            size={16}
          />
        </Button>
        <span className="grow truncate">
          {header.isPlaceholder
            ? null
            : flexRender(header.column.columnDef.header, header.getContext())}
        </span>
        <Button
          className="group -mr-1 size-7 shadow-none"
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
          size="icon"
          variant="ghost"
        >
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
            <ChevronUpIcon
              aria-hidden="true"
              className="shrink-0 opacity-0 group-hover:opacity-60"
              size={16}
            />
          )}
        </Button>
      </div>
    </TableHead>
  );
};

const DragAlongCell = ({
  cell,
}: {
  cell: Cell<typeof features, Item, unknown>;
}) => {
  const { isDragging, setNodeRef, transform, transition } = useSortable({
    id: cell.column.id,
  });

  const style: CSSProperties = {
    opacity: isDragging ? 0.8 : 1,
    position: "relative",
    transform: CSS.Translate.toString(transform),
    transition,
    width: cell.column.getSize(),
    zIndex: isDragging ? 1 : 0,
  };

  return (
    <TableCell className="truncate" ref={setNodeRef} style={style}>
      {flexRender(cell.column.columnDef.cell, cell.getContext())}
    </TableCell>
  );
};
