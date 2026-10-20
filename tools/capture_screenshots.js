async (page) => {
  const output = "csct-public-images/";
  const expected = "/6-SampleData/customer-success-control-tower-demo.html";
  if (!page.url().split(/[?#]/)[0].endsWith(expected)) { throw new Error("Capture only the fictional demo page"); }
  const sample = await page.evaluate(() => window.csctFindings());
  if (sample.mode !== "demo" || sample.cases.some((c) => !c.caseId.startsWith("261008999900"))) {
    throw new Error("Screenshot fixture is not the independently invented demo");
  }
  const originalTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  const shots = [];
  const capture = async (name) => {
    await page.locator("#scroll").evaluate((el) => el.scrollTop = 0);
    await page.waitForTimeout(250);
    await page.screenshot({ path: output + name + ".png", scale: "css" });
    shots.push(name);
  };
  const go = async (tab) => { await page.locator('#nav [data-tab="' + tab + '"]').click(); };
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => document.documentElement.dataset.theme = "light");
    await go("tower"); await capture("control-tower");
    await go("queue"); await capture("action-queue");
    await page.locator(".case-table tr[data-case]").first().click(); await capture("case-detail");
    // Close a case by hand to show the confirmation and the closed list, then move it back so the fixture is unchanged.
    await page.locator('button[data-case-state="closed"]').click(); await page.waitForTimeout(400); await capture("manual-close");
    await page.keyboard.press("Escape");
    await page.locator('.view-switch [data-goto="closed"]').click(); await capture("closed-cases");
    await page.locator(".history tr[data-case]").first().click();
    await page.locator('button[data-case-state="open"]').click(); await page.waitForTimeout(400); await page.keyboard.press("Escape");
    await go("attention"); await capture("attention-center");
    await page.locator(".watch-case").first().click(); await capture("follow-up-detail"); await page.keyboard.press("Escape");
    await go("advisory"); await capture("advisory-review");
    await go("acct"); await capture("account-360");
    await go("voice"); await capture("customer-voice");
    await go("esc"); await capture("escalations");
    await go("brief"); await capture("manager-brief");
    await go("model"); await capture("risk-model");
    await page.evaluate(() => document.documentElement.dataset.theme = "dark");
    await go("tower"); await capture("dark-theme");
    await page.setViewportSize({ width: 640, height: 900 });
    await page.evaluate(() => document.documentElement.dataset.theme = "light");
    await go("acct"); await capture("account-360-narrow");
    return { screenshots: shots, fixture: "mailbox.sample.json", syntheticOnly: true };
  } finally {
    await page.evaluate((theme) => document.documentElement.dataset.theme = theme, originalTheme);
    await page.setViewportSize({ width: 0, height: 0 });
  }
}
