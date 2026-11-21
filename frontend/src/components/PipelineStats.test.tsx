import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { STATS } from "../test/fixtures";
import { PipelineStats } from "./PipelineStats";

describe("PipelineStats", () => {
  it("shows the funnel with counts and rates from the history-based stats", () => {
    render(<PipelineStats stats={STATS} />);
    expect(screen.getByRole("region", { name: "Your pipeline" })).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText(/50%/)).toBeInTheDocument();
    expect(screen.getByText(/10%/)).toBeInTheDocument();
  });

  it("scales each bar to its share of everything sent", () => {
    render(<PipelineStats stats={STATS} />);
    expect(screen.getByTestId("bar-applied").style.getPropertyValue("--share")).toBe("100");
    expect(screen.getByTestId("bar-interview").style.getPropertyValue("--share")).toBe("50");
    expect(screen.getByTestId("bar-offer").style.getPropertyValue("--share")).toBe("10");
  });

  it("describes the weekly chart for screen readers", () => {
    render(<PipelineStats stats={STATS} />);
    expect(screen.getByRole("img", { name: /applications sent in the last 8 weeks/i })).toBeInTheDocument();
  });

  it("invites the first application when there is nothing to show", () => {
    render(<PipelineStats stats={{ ...STATS, total: 0 }} />);
    expect(screen.getByText(/Add your first application/)).toBeInTheDocument();
    expect(screen.queryByTestId("bar-applied")).not.toBeInTheDocument();
  });

  it("labels example numbers as examples", () => {
    render(<PipelineStats stats={STATS} sample />);
    expect(screen.getByText(/Example numbers/)).toBeInTheDocument();
  });
});
