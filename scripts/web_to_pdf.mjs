import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const [url, outputPath] = process.argv.slice(2);

if (!url || !outputPath) {
  console.error("Usage: node scripts/web_to_pdf.mjs <url> <output.pdf>");
  process.exit(1);
}

function resolveChromeBinary() {
  const absoluteCandidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];

  for (const candidate of absoluteCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  for (const candidate of ["google-chrome", "chromium", "chromium-browser"]) {
    const result = spawnSync("which", [candidate], { encoding: "utf8" });
    if (result.status === 0) {
      return result.stdout.trim();
    }
  }

  return null;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = Math.max(400, Math.floor(window.innerHeight * 0.8));

      const timer = setInterval(() => {
        const scrollHeight = document.documentElement.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 250);
    });
  });
}

async function waitForImages(page) {
  await page.evaluate(async () => {
    const imageElements = Array.from(document.images);

    await Promise.all(
      imageElements.map(async (img) => {
        if (img.loading === "lazy") {
          img.loading = "eager";
        }

        if ("decoding" in img) {
          img.decoding = "sync";
        }

        if (img.complete) {
          return;
        }

        await new Promise((resolve) => {
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          setTimeout(done, 5000);
        });
      })
    );
  });
}

const chromeBinary = resolveChromeBinary();
const absoluteOutputPath = resolve(outputPath);

if (!chromeBinary) {
  console.error("Google Chrome or Chromium not found.");
  process.exit(1);
}

mkdirSync(dirname(absoluteOutputPath), { recursive: true });

const popupRemovalScript = `
  (() => {
    const textHints = [
      "subscribe",
      "sign in",
      "sign up",
      "newsletter",
      "enter your email",
      "discover more",
      "ahead of ai",
      "start writing",
      "log in",
      "join now",
      "create account",
      "already have an account"
    ];

    const selectorHints = [
      '[role="dialog"]',
      '[aria-modal="true"]',
      '[data-testid*="popup"]',
      '[data-testid*="modal"]',
      '[class*="modal"]',
      '[class*="Modal"]',
      '[class*="popup"]',
      '[class*="Popup"]',
      '[class*="overlay"]',
      '[class*="Overlay"]',
      '[id*="modal"]',
      '[id*="popup"]',
      'iframe[src*="substack.com"]'
    ];

    const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim().toLowerCase();

    const removeNode = (node) => {
      if (!node || !node.parentElement) {
        return;
      }
      node.remove();
    };

    const maybeClose = (node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      const label = normalize(
        node.getAttribute("aria-label") ||
        node.getAttribute("title") ||
        node.textContent
      );
      if (["close", "dismiss", "no thanks", "not now", "skip"].some((hint) => label.includes(hint))) {
        node.click();
      }
    };

    for (const node of document.querySelectorAll('button, [role="button"], a')) {
      maybeClose(node);
    }

    for (const selector of selectorHints) {
      for (const node of document.querySelectorAll(selector)) {
        removeNode(node);
      }
    }

    for (const node of document.querySelectorAll("body *")) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }

      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const text = normalize(node.innerText || node.textContent);
      const area = rect.width * rect.height;
      const viewportArea = window.innerWidth * window.innerHeight;
      const isFloating = ["fixed", "sticky"].includes(style.position);
      const hasPopupText = textHints.some((hint) => text.includes(hint));
      const hasInput = !!node.querySelector('input[type="email"], input[name*="email"], input[placeholder*="mail" i]');
      const coversViewport = viewportArea > 0 && area / viewportArea > 0.2;
      const highZIndex = Number.parseInt(style.zIndex || "0", 10) >= 50;

      if (isFloating && highZIndex && (coversViewport || hasPopupText || hasInput)) {
        removeNode(node);
      }
    }

    const cleanupStyles = document.createElement("style");
    cleanupStyles.textContent = \`
      html, body {
        overflow: auto !important;
        position: static !important;
      }
      body::before,
      body::after {
        display: none !important;
      }
      [class*="modal"],
      [class*="popup"],
      [class*="overlay"],
      [id*="modal"],
      [id*="popup"],
      [data-testid*="modal"],
      [data-testid*="popup"] {
        display: none !important;
        visibility: hidden !important;
      }
    \`;
    document.head.appendChild(cleanupStyles);
  })();
`;

const browser = await puppeteer.launch({
  executablePath: chromeBinary,
  headless: true,
  args: [
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
  ],
});

let exitCode = 0;

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 2200, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(4000);
  await autoScroll(page);
  await waitForImages(page);
  await sleep(1500);
  await page.evaluate(popupRemovalScript);
  await sleep(1000);
  await page.emulateMediaType("screen");
  await page.pdf({
    path: absoluteOutputPath,
    format: "A4",
    printBackground: true,
    margin: {
      top: "12mm",
      right: "10mm",
      bottom: "12mm",
      left: "10mm",
    },
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  exitCode = 1;
} finally {
  await browser.close();
}

process.exit(exitCode);
