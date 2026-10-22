import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const programmingLanguages = [
  {
    developer: "Brendan Eich",
    extension: ".js",
    id: "1",
    latestVersion: "ES2021",
    name: "JavaScript",
    paradigm: "Multi-paradigm",
    popularity: "High",
    releaseYear: "1995",
    typing: "Dynamic",
  },
  {
    developer: "Guido van Rossum",
    extension: ".py",
    id: "2",
    latestVersion: "3.10",
    name: "Python",
    paradigm: "Multi-paradigm",
    popularity: "High",
    releaseYear: "1991",
    typing: "Dynamic",
  },
  {
    developer: "James Gosling",
    extension: ".java",
    id: "3",
    latestVersion: "17",
    name: "Java",
    paradigm: "Object-oriented",
    popularity: "High",
    releaseYear: "1995",
    typing: "Static",
  },
  {
    developer: "Bjarne Stroustrup",
    extension: ".cpp",
    id: "4",
    latestVersion: "C++20",
    name: "C++",
    paradigm: "Multi-paradigm",
    popularity: "High",
    releaseYear: "1985",
    typing: "Static",
  },
  {
    developer: "Yukihiro Matsumoto",
    extension: ".rb",
    id: "5",
    latestVersion: "3.0",
    name: "Ruby",
    paradigm: "Multi-paradigm",
    popularity: "Low",
    releaseYear: "1995",
    typing: "Dynamic",
  },
];

export default function Component() {
  return (
    <div>
      <div className="overflow-hidden rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="h-9 py-2">Name</TableHead>
              <TableHead className="h-9 py-2">Release Year</TableHead>
              <TableHead className="h-9 py-2">Developer</TableHead>
              <TableHead className="h-9 py-2">Typing</TableHead>
              <TableHead className="h-9 py-2">Paradigm</TableHead>
              <TableHead className="h-9 py-2">Extension</TableHead>
              <TableHead className="h-9 py-2">Latest Version</TableHead>
              <TableHead className="h-9 py-2">Popularity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {programmingLanguages.map((language) => (
              <TableRow key={language.id}>
                <TableCell className="py-2 font-medium">
                  {language.name}
                </TableCell>
                <TableCell className="py-2">{language.releaseYear}</TableCell>
                <TableCell className="py-2">{language.developer}</TableCell>
                <TableCell className="py-2">{language.typing}</TableCell>
                <TableCell className="py-2">{language.paradigm}</TableCell>
                <TableCell className="py-2">{language.extension}</TableCell>
                <TableCell className="py-2">{language.latestVersion}</TableCell>
                <TableCell className="py-2">{language.popularity}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-4 text-center text-muted-foreground text-sm">
        Dense table
      </p>
    </div>
  );
}
