import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/vendor/origin/timeline";

const items = [
  {
    action: "opened a new issue",
    date: "15 minutes ago",
    description:
      "I'm having trouble with the new component library. It's not rendering properly.",
    id: 1,
    image: "/origin/avatar-40-01.jpg",
    title: "Hannah Kandell",
  },
  {
    action: "commented on",
    date: "10 minutes ago",
    description:
      "Hey Hannah, I'm having trouble with the new component library. It's not rendering properly.",
    id: 2,
    image: "/origin/avatar-40-02.jpg",
    title: "Chris Tompson",
  },
  {
    action: "assigned you to",
    date: "5 minutes ago",
    description:
      "The new component library is not rendering properly. Can you take a look?",
    id: 3,
    image: "/origin/avatar-40-03.jpg",
    title: "Emma Davis",
  },
  {
    action: "closed the issue",
    date: "2 minutes ago",
    description: "The issue has been fixed. Please review the changes.",
    id: 4,
    image: "/origin/avatar-40-05.jpg",
    title: "Alex Morgan",
  },
];

export default function Component() {
  return (
    <Timeline>
      {items.map((item) => (
        <TimelineItem
          className="group-data-[orientation=vertical]/timeline:ms-10 group-data-[orientation=vertical]/timeline:not-last:pb-8"
          key={item.id}
          step={item.id}
        >
          <TimelineHeader>
            <TimelineSeparator className="group-data-[orientation=vertical]/timeline:-left-7 group-data-[orientation=vertical]/timeline:h-[calc(100%-1.5rem-0.25rem)] group-data-[orientation=vertical]/timeline:translate-y-6.5" />
            <TimelineTitle className="mt-0.5">
              {item.title}{" "}
              <span className="font-normal text-muted-foreground text-sm">
                {item.action}
              </span>
            </TimelineTitle>
            <TimelineIndicator className="group-data-[orientation=vertical]/timeline:-left-7 flex size-6 items-center justify-center border-none bg-primary/10 group-data-completed/timeline-item:bg-primary group-data-completed/timeline-item:text-primary-foreground">
              <img
                alt={item.title}
                className="size-6 rounded-full"
                src={item.image}
              />
            </TimelineIndicator>
          </TimelineHeader>
          <TimelineContent className="mt-2 rounded-lg border px-4 py-3 text-foreground">
            {item.description}
            <TimelineDate className="mt-1 mb-0">{item.date}</TimelineDate>
          </TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
  );
}
