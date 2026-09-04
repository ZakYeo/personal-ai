import { readFile } from "node:fs/promises";

const plannedMilestones = [
  "Milestone 17: Daily Briefings and Scheduled Delivery",
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
  it("documents the ordered post-Milestone-16 plan and North Star", async () => {
    const [roadmap, vision] = await Promise.all([
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
    expect(roadmap).not.toContain("## Future Considerations");
    expect(roadmap).not.toContain("intentionally unnumbered");
  });

  it("keeps repository-facing roadmap summaries aligned", async () => {
    const [agents, readme] = await Promise.all([
      readFile("AGENTS.md", "utf8"),
      readFile("README.md", "utf8"),
    ]);

    for (const document of [agents, readme]) {
      expect(document).toContain("Milestones 17 through 25");
      expect(document).toContain("desktop presence");
      expect(document).toContain("adaptive memory");
    }
  });
});
