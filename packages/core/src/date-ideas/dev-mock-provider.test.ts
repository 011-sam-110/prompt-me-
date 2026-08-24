import { describe, expect, it } from "vitest";
import { DevMockDateIdeaGeneratorProvider } from "./dev-mock-provider";

describe("DevMockDateIdeaGeneratorProvider", () => {
  it("returns exactly two ideas, each with a non-empty rationale", async () => {
    const provider = new DevMockDateIdeaGeneratorProvider();
    const output = await provider.generate({
      transcriptsA: ["I love hiking and terrible puns."],
      transcriptsB: ["Coffee snob, plays the violin badly."],
      sharedGeohashCell: "gcpvj",
    });

    expect(output.ideas).toHaveLength(2);
    for (const idea of output.ideas) {
      expect(idea.ideaText.length).toBeGreaterThan(0);
      expect(idea.rationale.length).toBeGreaterThan(0);
    }
  });

  it("is unmistakably fake — every idea and rationale carries a [DEV MOCK] marker", async () => {
    const provider = new DevMockDateIdeaGeneratorProvider();
    const output = await provider.generate({ transcriptsA: [], transcriptsB: [], sharedGeohashCell: null });

    for (const idea of output.ideas) {
      expect(idea.ideaText).toContain("[DEV MOCK]");
      expect(idea.rationale).toContain("[DEV MOCK]");
    }
  });

  it("is deterministic — ignores the actual input content", async () => {
    const provider = new DevMockDateIdeaGeneratorProvider();
    const a = await provider.generate({ transcriptsA: ["x"], transcriptsB: ["y"], sharedGeohashCell: "abc12" });
    const b = await provider.generate({ transcriptsA: [], transcriptsB: [], sharedGeohashCell: null });
    expect(a).toEqual(b);
  });
});
