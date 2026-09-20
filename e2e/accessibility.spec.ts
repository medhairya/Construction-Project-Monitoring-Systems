/**
 * Phase 5 acceptance — accessibility on the main pages. axe-core is run in the
 * real browser instead of a Lighthouse score, because it names the failing
 * element and can be fixed rather than chased.
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";

const PAGES = [
  { name: "login", path: "/login", user: null },
  { name: "dashboard", path: "/dashboard", user: "u-ministry" },
  { name: "projects", path: "/projects", user: "u-ministry" },
  { name: "inbox", path: "/inbox", user: "u-fin-op" },
  { name: "escalations", path: "/escalations", user: "u-ministry" },
  { name: "create proposal", path: "/projects/new", user: "u-ministry" },
  { name: "admin", path: "/admin", user: "u-admin" },
];

for (const page_ of PAGES) {
  test("no serious accessibility violations: " + page_.name, async ({ page, baseURL }) => {
    if (page_.user) {
      await page.context().addCookies([
        { name: "pwfts_uid", value: page_.user, url: baseURL! },
      ]);
    }
    await page.goto(page_.path);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(
      blocking,
      blocking.map((v) => v.id + ": " + v.nodes[0]?.html?.slice(0, 120)).join("\n"),
    ).toEqual([]);
  });
}
