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
    balance: "$1,250.00",
    email: "alex.t@company.com",
    id: "1",
    image:
      "https://raw.githubusercontent.com/origin-space/origin-images/refs/heads/main/exp1/avatar-40-02_upqrxi.jpg",
    location: "San Francisco, US",
    name: "Alex Thompson",
    status: "Active",
    username: "@alexthompson",
  },
  {
    balance: "$600.00",
    email: "sarah.c@company.com",
    id: "2",
    image:
      "https://raw.githubusercontent.com/origin-space/origin-images/refs/heads/main/exp1/avatar-40-01_ij9v7j.jpg",
    location: "Singapore",
    name: "Sarah Chen",
    status: "Active",
    username: "@sarahchen",
  },
  {
    balance: "$0.00",
    email: "m.garcia@company.com",
    id: "4",
    image:
      "https://raw.githubusercontent.com/origin-space/origin-images/refs/heads/main/exp1/avatar-40-03_dkeufx.jpg",
    location: "Madrid, Spain",
    name: "Maria Garcia",
    status: "Active",
    username: "@mariagarcia",
  },
  {
    balance: "-$1,000.00",
    email: "d.kim@company.com",
    id: "5",
    image:
      "https://raw.githubusercontent.com/origin-space/origin-images/refs/heads/main/exp1/avatar-40-05_cmz0mg.jpg",
    location: "Seoul, KR",
    name: "David Kim",
    status: "Active",
    username: "@davidkim",
  },
];

export default function Component() {
  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <img
                    alt={item.name}
                    className="rounded-full"
                    height={40}
                    src={item.image}
                    width={40}
                  />
                  <div>
                    <div className="font-medium">{item.name}</div>
                    <span className="mt-0.5 text-muted-foreground text-xs">
                      {item.username}
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell>{item.email}</TableCell>
              <TableCell>{item.location}</TableCell>
              <TableCell>{item.status}</TableCell>
              <TableCell className="text-right">{item.balance}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="mt-4 text-center text-muted-foreground text-sm">
        Table with images
      </p>
    </div>
  );
}
