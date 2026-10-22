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
    date: "15 minutes ago",
    description:
      "Submitted PR #342 with new feature implementation. Waiting for code review from team leads.",
    id: 1,
    title: "Pull Request Submitted",
  },
  {
    date: "10 minutes ago",
    description:
      "Automated tests and build process initiated. Running unit tests and code quality checks.",
    id: 2,
    title: "CI Pipeline Started",
  },
  {
    date: "5 minutes ago",
    description:
      "Received comments on PR. Minor adjustments needed in error handling and documentation.",
    id: 3,
    title: "Code Review Feedback",
  },
  {
    description:
      "Implemented requested changes and pushed updates to feature branch. Awaiting final approval.",
    id: 4,
    title: "Changes Pushed",
  },
];

export default function Component() {
  return (
    <Timeline defaultValue={3}>
      {items.map((item) => (
        <TimelineItem key={item.id} step={item.id}>
          <TimelineHeader>
            <TimelineSeparator />
            <TimelineTitle className="-mt-0.5">{item.title}</TimelineTitle>
            <TimelineIndicator />
          </TimelineHeader>
          <TimelineContent>
            {item.description}
            <TimelineDate className="mt-2 mb-0">{item.date}</TimelineDate>
          </TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
  );
}
