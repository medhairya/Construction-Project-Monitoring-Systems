/**
 * Phase 5 acceptance — the demo script end to end in a real browser:
 * create -> forward -> approve -> return -> breach -> justify -> chat ->
 * decide -> re-enter. Also checks that no console errors appear on the way.
 */
import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "Demo@1234";
const consoleErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));
});

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/**
 * Personas are switched by their stable seed id. The marker in the top bar is
 * rendered by the server, so waiting for it proves the new session cookie is
 * in effect before the next step runs.
 */
async function switchTo(page: Page, userId: string) {
  await page.getByLabel("Switch demo user").selectOption(userId);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByTestId("current-user-id")).toHaveText(userId);
}

test("the whole file journey, in one run", async ({ page }) => {
  // Start from a clean seed so the run is repeatable.
  await signIn(page, "admin@demo");
  await page.goto("/admin");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // 1 — the Ministry creates a proposal and a Project ID is generated.
  await switchTo(page, "u-ministry");
  await page.goto("/projects/new");
  await page.getByLabel("Project title").fill("Four-lane road, Sanand–Bavla (E2E)");
  await page.getByLabel("Description").fill("Widening to four lanes with two minor bridges.");
  await page.getByRole("button", { name: /Create proposal/ }).click();

  await expect(page.getByText(/Project ID .* has been generated/)).toBeVisible();
  const code = (await page.locator("h1.font-mono").first().innerText()).trim();
  expect(code).toMatch(/^GJ-[A-Z]{2,4}-\d{4}-[A-Z]{3}-\d{4}$/);

  // The Ministry approves stage 1, so the file lands with Finance.
  await page.getByRole("button", { name: "Approve stage" }).click();
  await expect(page.getByText("Stage approved")).toBeVisible();
  await expect(page.getByText("Administrative Approval + Fund Allotment").first()).toBeVisible();

  // 2 — a Finance operator forwards the file between two desks.
  await switchTo(page, "u-fin-op");
  await page.goto("/projects/" + code);
  await page.getByRole("button", { name: "Forward", exact: true }).click();
  await page.getByLabel(/Forward to desk/).selectOption("dk-fin-ao");
  await page.getByRole("button", { name: "Forward file" }).click();
  await expect(page.getByText("File forwarded.")).toBeVisible();

  await page.goto("/projects/" + code + "/movement");
  await expect(page.getByText("Accounts Officer").first()).toBeVisible();

  // 3 — R&B sees only the summary line for those Finance desk movements.
  await switchTo(page, "u-rb-op");
  await page.goto("/projects/" + code + "/movement");
  await expect(page.getByText(/With Finance Department · \d+ days · SLA 21 days/)).toBeVisible();

  // 4 — the Finance head approves; the file moves to Technical Sanction.
  await switchTo(page, "u-fin-head");
  await page.goto("/projects/" + code);
  await page.getByRole("button", { name: "Approve stage" }).click();
  await expect(page.getByText("Stage approved")).toBeVisible();
  await expect(page.getByText("Technical Sanction").first()).toBeVisible();

  // 5 — the R&B head returns it to Administrative Approval.
  await switchTo(page, "u-rb-head");
  await page.goto("/projects/" + code);
  await page.getByRole("button", { name: "Return", exact: true }).click();
  await page.getByLabel("Return to stage").selectOption("ADMIN_APPROVAL");
  await page.getByLabel(/Reason \(mandatory\)/).fill("Estimate uses old SOR rates.");
  await page.getByRole("button", { name: "Return file" }).click();
  await expect(page.getByText(/File returned/)).toBeVisible();
  await expect(page.getByText("2 attempts").first()).toBeVisible();

  // 6 — the demo clock forces the SLA breach.
  await switchTo(page, "u-admin");
  await page.goto("/admin");
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "+7 days" }).click();
  await page.getByRole("button", { name: "Run SLA sweep now" }).click();

  await page.goto("/projects/" + code);
  await expect(page.getByText(/SLA breached at/)).toBeVisible();

  // Movement is frozen while escalated.
  await switchTo(page, "u-fin-op");
  await page.goto("/projects/" + code);
  await expect(page.getByText(/escalated/i).first()).toBeVisible();

  // 7 — the holding officer submits the justification.
  await switchTo(page, "u-fin-head");
  await page.goto("/escalations");
  await page.getByRole("link", { name: code }).click();
  await page.getByRole("button", { name: /Justification/ }).click();
  await page.getByLabel("Cause category").selectOption("DOCUMENTS_PENDING");
  await page
    .getByLabel("Detailed explanation")
    .fill("The revised estimate on SOR 2025 was not received from the division in time.");
  await page.getByLabel("Impact").fill("The tender award slips past the financial year.");
  await page.getByLabel("Proposed fix").fill("The division has been directed to submit in a week.");
  await page.getByLabel("New ETA").fill("2026-12-31");
  await page.getByRole("button", { name: /Submit to the Ministry/ }).click();
  // The form is replaced by the justification now on record.
  await expect(page.getByText("Documents Pending")).toBeVisible();

  // 8 — the Ministry chats on the permanent record.
  await switchTo(page, "u-ministry");
  await page.goto("/escalations");
  await page.getByRole("link", { name: code }).click();
  await page.getByRole("button", { name: /Official chat/ }).click();
  await expect(page.getByText(/logged permanently/)).toBeVisible();
  await page.getByLabel("Message").fill("State the exact date the revised estimate will be on file.");
  await page.getByRole("button", { name: /Post to the official record/ }).click();
  await expect(page.getByText("State the exact date the revised estimate will be on file.")).toBeVisible();

  // 9 — the Ministry decides; the file re-enters with HIGH priority.
  await page.getByRole("button", { name: /Decision/ }).click();
  await page.getByLabel("Decision type").selectOption("ORDER_CHANGES");
  await page.getByLabel("Changes ordered").fill("Revise the estimate on SOR 2025 and resubmit.");
  await page.getByLabel("Reason").fill("The blocking document is now available.");
  await page.getByLabel("New SLA (days)").fill("10");
  await page.getByLabel("Re-entry stage").selectOption("ADMIN_APPROVAL");
  await page.getByLabel("Priority").selectOption("HIGH");
  await page.getByRole("button", { name: /Record decision/ }).click();
  await expect(page.getByText(/A decision is on record/)).toBeVisible();

  // 10 — it is back in the Finance inbox, at the top, marked HIGH priority.
  await switchTo(page, "u-fin-op");
  await page.goto("/inbox");
  const firstRow = page.locator("tbody tr").first();
  await expect(firstRow.getByText(code)).toBeVisible();
  await expect(firstRow.getByText("High priority")).toBeVisible();

  expect(consoleErrors, "console errors: " + consoleErrors.join(" | ")).toEqual([]);
});

test("the passport is usable at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "site.eng@demo");
  await page.goto("/my-sites");
  const link = page.locator("tbody tr a").first();
  await link.click();
  await expect(page.getByRole("heading", { name: /Execution/ })).toBeVisible();

  // No horizontal overflow of the page itself.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  // The mobile menu replaces the sidebar.
  await page.getByLabel("Open menu").click();
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
});
