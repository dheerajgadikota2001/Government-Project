import { GitCompare, GitFork, GitMerge, GitPullRequest } from "lucide-react";

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
      "Forked the repository to create a new branch for development.",
    icon: GitFork,
    id: 1,
    title: "Forked Repository",
  },
  {
    date: "10 minutes ago",
    description:
      "Submitted PR #342 with new feature implementation. Waiting for code review from team leads.",
    icon: GitPullRequest,
    id: 2,
    title: "Pull Request Submitted",
  },
  {
    date: "5 minutes ago",
    description:
      "Received comments on PR. Minor adjustments needed in error handling and documentation.",
    icon: GitCompare,
    id: 3,
    title: "Comparing Branches",
  },
  {
    description:
      "Merged the feature branch into the main branch. Ready for deployment.",
    icon: GitMerge,
    id: 4,
    title: "Merged Branch",
  },
];

export default function Component() {
  return (
    <Timeline defaultValue={3}>
      {items.map((item) => (
        <TimelineItem
          className="group-data-[orientation=vertical]/timeline:ms-10"
          key={item.id}
          step={item.id}
        >
          <TimelineHeader>
            <TimelineSeparator className="group-data-[orientation=vertical]/timeline:-left-7 group-data-[orientation=vertical]/timeline:h-[calc(100%-1.5rem-0.25rem)] group-data-[orientation=vertical]/timeline:translate-y-6.5" />
            <TimelineTitle className="mt-0.5">{item.title}</TimelineTitle>
            <TimelineIndicator className="group-data-[orientation=vertical]/timeline:-left-7 flex size-6 items-center justify-center border-none bg-primary/10 group-data-completed/timeline-item:bg-primary group-data-completed/timeline-item:text-primary-foreground">
              <item.icon size={14} />
            </TimelineIndicator>
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
