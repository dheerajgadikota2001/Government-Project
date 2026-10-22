import {
  Timeline,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/vendor/origin/timeline";

const items = [
  {
    date: "Mar 15, 2024",
    id: 1,
    title: "Project Kickoff",
  },
  {
    date: "Mar 22, 2024",
    id: 2,
    title: "Design Phase",
  },
  {
    date: "Apr 5, 2024",
    id: 3,
    title: "Development Sprint",
  },
  {
    date: "Apr 19, 2024",
    id: 4,
    title: "Testing & Deployment",
  },
  {
    date: "May 3, 2024",
    id: 5,
    title: "User Training",
  },
  {
    date: "May 17, 2024",
    id: 6,
    title: "Project Handover",
  },
];

export default function Component() {
  return (
    <Timeline defaultValue={3}>
      {items.map((item) => (
        <TimelineItem
          className="even:group-data-[orientation=vertical]/timeline:[&_[data-slot=timeline-indicator]]:-right-6 even:group-data-[orientation=vertical]/timeline:[&_[data-slot=timeline-separator]]:-right-6 w-[calc(50%-1.5rem)] odd:ms-auto even:text-right even:group-data-[orientation=vertical]/timeline:ms-0 even:group-data-[orientation=vertical]/timeline:me-8 even:group-data-[orientation=vertical]/timeline:[&_[data-slot=timeline-indicator]]:left-auto even:group-data-[orientation=vertical]/timeline:[&_[data-slot=timeline-indicator]]:translate-x-1/2 even:group-data-[orientation=vertical]/timeline:[&_[data-slot=timeline-separator]]:left-auto even:group-data-[orientation=vertical]/timeline:[&_[data-slot=timeline-separator]]:translate-x-1/2"
          key={item.id}
          step={item.id}
        >
          <TimelineHeader>
            <TimelineSeparator />
            <TimelineDate>{item.date}</TimelineDate>
            <TimelineTitle>{item.title}</TimelineTitle>
            <TimelineIndicator />
          </TimelineHeader>
        </TimelineItem>
      ))}
    </Timeline>
  );
}
