const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (route) =>
      route.request().url().startsWith("http://127.0.0.1:5179/")
        ? route.continue()
        : route.abort(),
    );
    await page.goto("http://127.0.0.1:5179/");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem(
        "bgn.adds.v1",
        JSON.stringify([
          {
            kind: "one",
            email: "synthetic@example.org",
            name: "Synthetic signup",
            source: "Test fixture",
          },
        ]),
      );
      localStorage.setItem(
        "bgn.contacts.v1",
        JSON.stringify([
          {
            name: "Synthetic venue",
            email: "host@example.org",
            phone: "@synthetic-host",
            notes: "SYNTHETIC DATA ONLY. " + "x".repeat(300),
            tag: "Venue",
            ts: 1,
          },
        ]),
      );
      localStorage.setItem(
        "bgn.meeple.origin.v1",
        "https://synthetic.tailnet.ts.net:9443",
      );
    });
    await page.getByRole("button", { name: /Send to Meeple/ }).click();
    await page.getByText("2 existing records not yet sent").waitFor();
    await page.screenshot({
      path: "/tmp/meeple-preview-mobile.png",
      fullPage: true,
    });
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll(".meeple-content *")]
        .filter(
          (el) =>
            el.getBoundingClientRect().right > 390.5 ||
            (el.tagName !== "INPUT" && el.scrollWidth > el.clientWidth + 1),
        )
        .map((el) => ({
          tag: el.tagName,
          cls: el.className,
          right: el.getBoundingClientRect().right,
        })),
    );
    assert.deepEqual(overflow, [], "mobile contents must not overflow");
    await page.locator(".meeple-content").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.screenshot({
      path: "/tmp/meeple-records-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("checkbox", { name: "Send signup: Synthetic signup" })
      .check();
    await page
      .getByRole("button", { name: "Send 1 selected record", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Retry same batch", exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("bgn.adds.v1")).length,
      ),
      1,
    );
    await page.screenshot({
      path: "/tmp/meeple-unknown-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        mobile390: true,
        preview: true,
        browserSendBlocked: true,
        originalsRetained: true,
        pageErrors: errors,
        screenshots: [
          "/tmp/meeple-preview-mobile.png",
          "/tmp/meeple-unknown-mobile.png",
        ],
      }),
    );
    await page.evaluate(() => localStorage.clear());
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
