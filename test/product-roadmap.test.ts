import { readFile } from "node:fs/promises";

const plannedMilestones = [
  "Milestone 18: Desktop Presence and Command Center",
  "Milestone 19: Voice Interruption and Responsiveness",
  "Milestone 20: Proactive Attention Engine",
  "Milestone 21: Computer Context and Allowlisted Control",
  "Milestone 22: Home Assistant Smart-Home Integration",
  "Milestone 23: Real Communications",
  "Milestone 24: Personal Knowledge Library",
  "Milestone 25: Approval-Based Adaptive Memory",
] as const;

describe("product roadmap", () => {
  it("gates expansion on the September reliability and daily-use plan", async () => {
    const roadmap = await readFile("docs/06-implementation-roadmap.md", "utf8");
    const section = (title: string) => {
      const heading = `## ${title}\n`;
      expect(roadmap).toContain(heading);
      return roadmap.split(heading)[1]!.split("\n## ")[0]!;
    };

    const reliability = section("Milestone 18.1: Daily-Use Reliability");
    for (const requirement of [
      "compaction failure",
      "read-only briefing",
      "Today",
      "CI",
      "microphone",
      "single-process",
    ]) {
      expect(reliability).toContain(requirement);
    }
    const voice = section(plannedMilestones[1]);
    expect(voice).toContain("150 ms");
    expect(voice).toContain("300 ms");
    expect(voice).toContain("1.5 seconds");
    expect(voice).toContain("confirmation expiry");
    expect(voice).toContain("typed draft");
    const attention = section(plannedMilestones[2]);
    expect(attention).toContain("attention inbox");
    expect(attention).toContain("morning routine");
    expect(section(plannedMilestones[6])).toContain("meeting preparation");
    expect(section("Delivery Priorities and Daily-Use Evidence")).toContain(
      "30-day",
    );
  });

  it("documents the ordered post-Milestone-17 plan and North Star", async () => {
    const [archive, roadmap, vision] = await Promise.all([
      readFile("docs/09-implemented-milestones.md", "utf8"),
      readFile("docs/06-implementation-roadmap.md", "utf8"),
      readFile("docs/01-product-vision.md", "utf8"),
    ]);

    let previousIndex = -1;
    for (const milestone of plannedMilestones) {
      const heading = `## ${milestone}`;
      const index = roadmap.indexOf(heading);
      expect(index, `${heading} should be present`).toBeGreaterThan(
        previousIndex,
      );
      previousIndex = index;
    }

    expect(roadmap).toContain("## Product North Star");
    expect(vision).toContain("## Product North Star");
    expect(archive).toContain(
      "## Milestone 17: Daily Briefings and Scheduled Delivery",
    );
    expect(roadmap).not.toContain("## Future Considerations");
    expect(roadmap).not.toContain("intentionally unnumbered");
  });

  it("keeps repository-facing roadmap summaries aligned", async () => {
    const [agents, readme] = await Promise.all([
      readFile("AGENTS.md", "utf8"),
      readFile("README.md", "utf8"),
    ]);

    for (const document of [agents, readme]) {
      expect(document).toContain("Milestones 18 through 25");
      expect(document).toContain("desktop presence");
      expect(document).toContain("adaptive memory");
    }
  });
});
