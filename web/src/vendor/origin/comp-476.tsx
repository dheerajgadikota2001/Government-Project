import { CheckIcon, MonitorIcon, SmartphoneIcon, XIcon } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const items = [
  {
    desktop: [
      { name: "Chrome", supported: true, version: "115" },
      { name: "Edge", supported: true, version: "115" },
      { name: "Firefox", supported: false, version: "111" },
      { name: "Opera", supported: true, version: "101" },
      { name: "Safari", supported: false, version: "No" },
    ],
    feature: "scroll-timeline",
    mobile: [
      { name: "Chrome Android", supported: true, version: "115" },
      { name: "Firefox Android", supported: false, version: "No" },
      { name: "Opera Android", supported: true, version: "77" },
      { name: "Safari iOS", supported: false, version: "No" },
      { name: "Samsung Internet", supported: true, version: "23" },
    ],
  },
  {
    desktop: [
      { name: "Chrome", supported: true, version: "115" },
      { name: "Edge", supported: true, version: "115" },
      { name: "Firefox", supported: false, version: "114" },
      { name: "Opera", supported: true, version: "101" },
      { name: "Safari", supported: false, version: "No" },
    ],
    feature: "view-timeline",
    mobile: [
      { name: "Chrome Android", supported: true, version: "115" },
      { name: "Firefox Android", supported: false, version: "No" },
      { name: "Opera Android", supported: true, version: "77" },
      { name: "Safari iOS", supported: false, version: "No" },
      { name: "Samsung Internet", supported: true, version: "23" },
    ],
  },
  {
    desktop: [
      { name: "Chrome", supported: true, version: "127" },
      { name: "Edge", supported: true, version: "127" },
      { name: "Firefox", supported: false, version: "3" },
      { name: "Opera", supported: true, version: "113" },
      { name: "Safari", supported: true, version: "16.4" },
    ],
    feature: "font-size-adjust",
    mobile: [
      { name: "Chrome Android", supported: true, version: "127" },
      { name: "Firefox Android", supported: true, version: "4" },
      { name: "Opera Android", supported: true, version: "84" },
      { name: "Safari iOS", supported: true, version: "16.4" },
      { name: "Samsung Internet", supported: false, version: "No" },
    ],
  },
];

export default function Component() {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-y-0 *:border-border hover:bg-transparent [&>:not(:last-child)]:border-r">
          <TableCell />
          <TableHead className="border-b text-center" colSpan={5}>
            <MonitorIcon aria-hidden="true" className="inline-flex" size={16} />
            <span className="sr-only">Desktop browsers</span>
          </TableHead>
          <TableHead className="border-b text-center" colSpan={5}>
            <SmartphoneIcon
              aria-hidden="true"
              className="inline-flex"
              size={16}
            />
            <span className="sr-only">Mobile browsers</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableHeader>
        <TableRow className="*:border-border hover:bg-transparent [&>:not(:last-child)]:border-r">
          <TableCell />
          {items[0].desktop.map((browser) => (
            <TableHead
              className="h-auto py-3 align-bottom text-foreground"
              key={browser.name}
            >
              <span className="relative left-[calc(50%-.5rem)] block rotate-180 whitespace-nowrap leading-4 [text-orientation:sideways] [writing-mode:vertical-rl]">
                {browser.name}
              </span>
            </TableHead>
          ))}
          {items[0].mobile.map((browser) => (
            <TableHead
              className="h-auto py-3 align-bottom text-foreground"
              key={browser.name}
            >
              <span className="relative left-[calc(50%-.5rem)] block rotate-180 whitespace-nowrap leading-4 [text-orientation:sideways] [writing-mode:vertical-rl]">
                {browser.name}
              </span>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow
            className="*:border-border [&>:not(:last-child)]:border-r"
            key={item.feature}
          >
            <TableHead className="font-medium text-foreground">
              {item.feature}
            </TableHead>
            {[...item.desktop, ...item.mobile].map((browser, index) => (
              <TableCell
                className="space-y-1 text-center"
                key={`${browser.name}-${index}`}
              >
                {browser.supported ? (
                  <CheckIcon
                    aria-hidden="true"
                    className="inline-flex stroke-emerald-600"
                    size={16}
                  />
                ) : (
                  <XIcon
                    aria-hidden="true"
                    className="inline-flex stroke-red-600"
                    size={16}
                  />
                )}
                <span className="sr-only">
                  {browser.supported ? "Supported" : "Not supported"}
                </span>
                <div className="font-medium text-muted-foreground text-xs">
                  {browser.version}
                </div>
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
