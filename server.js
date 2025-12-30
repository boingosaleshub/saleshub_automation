const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');

const app = express();
const PORT = process.env.PORT || 3001;

// ============== CORS CONFIGURATION ==============
const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['POST', 'GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============== UTILITY ENDPOINTS ==============

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
    res.json({
        service: 'Boingo Playwright Automation',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            health: 'GET /health',
            ooklaAutomate: 'POST /api/automate'
        }
    });
});

// ============== HELPER FUNCTIONS ==============

function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function humanWait(page, baseMs) {
    const variation = baseMs * (0.1 + Math.random() * 0.2);
    const actualDelay = Math.floor(baseMs + (Math.random() > 0.5 ? variation : -variation * 0.3));
    await page.waitForTimeout(Math.max(actualDelay, 80));
}

async function humanTypeLocator(locator, text, page) {
    await locator.click();
    await page.waitForTimeout(randomDelay(80, 150));
    for (const char of text) {
        await locator.type(char, { delay: 0 });
        await page.waitForTimeout(randomDelay(30, 70));
    }
}

async function humanClick(page, locator) {
    const box = await locator.boundingBox();
    if (box) {
        const targetX = box.x + box.width / 2 + randomDelay(-5, 5);
        const targetY = box.y + box.height / 2 + randomDelay(-3, 3);
        await page.mouse.move(targetX, targetY, { steps: randomDelay(2, 3) });
        await page.waitForTimeout(randomDelay(30, 80));
    }
    await locator.click();
}

async function shortWait(page) {
    await page.waitForTimeout(randomDelay(200, 400));
}

async function mediumWait(page) {
    await page.waitForTimeout(randomDelay(500, 900));
}

async function longWait(page) {
    await page.waitForTimeout(randomDelay(1200, 2000));
}

// ============== SCREENSHOT HELPER FUNCTIONS ==============

async function selectView(page, viewName) {
    console.log(`  Selecting ${viewName}...`);

    // Try up to 3 times
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            if (attempt > 1) {
                console.log(`    Attempt ${attempt}/3...`);
                await page.waitForTimeout(1000);
            }

            // Find dropdown
            let dropdown = page.locator('div.v-filterselect:has(img[src*="inandoutdoor"])').first();
            if (await dropdown.count() === 0) {
                dropdown = page.locator('div.v-filterselect.map-cb').first();
            }
            if (await dropdown.count() === 0) {
                dropdown = page.locator('div.v-filterselect').first();
            }

            await dropdown.waitFor({ state: 'visible', timeout: 10000 });

            // Click dropdown button
            const button = dropdown.locator('div.v-filterselect-button');
            await button.click({ force: true });
            await page.waitForTimeout(800);

            // Wait for options list
            await page.waitForSelector('#VAADIN_COMBOBOX_OPTIONLIST', {
                state: 'visible',
                timeout: 8000
            });

            // Wait a bit for options to fully render
            await page.waitForTimeout(300);

            // Try multiple ways to find the option
            let option = null;

            // Method 1: Find span with exact text inside td
            option = page.locator(`#VAADIN_COMBOBOX_OPTIONLIST td span:has-text("${viewName}")`).first();
            if (await option.count() === 0) {
                // Method 2: Find td that contains span with text
                option = page.locator(`#VAADIN_COMBOBOX_OPTIONLIST td:has(span:has-text("${viewName}"))`).first();
            }
            if (await option.count() === 0) {
                // Method 3: Case-insensitive span match
                option = page.locator(`#VAADIN_COMBOBOX_OPTIONLIST span`).filter({ hasText: new RegExp(viewName, 'i') }).first();
            }
            if (await option.count() === 0) {
                // Method 4: Partial match on first word
                const partialName = viewName.split(' ')[0]; // "Indoor", "Outdoor"
                option = page.locator(`#VAADIN_COMBOBOX_OPTIONLIST span`).filter({ hasText: new RegExp(partialName, 'i') }).first();
            }

            if (await option.count() === 0) {
                throw new Error(`Could not find option "${viewName}" in dropdown`);
            }

            await option.waitFor({ state: 'visible', timeout: 5000 });

            // Click the parent td if we found a span
            const tagName = await option.evaluate(el => el.tagName.toLowerCase());
            if (tagName === 'span') {
                const parentTd = option.locator('..');
                await parentTd.click({ force: true });
            } else {
                await option.click({ force: true });
            }

            console.log(`    ✓ ${viewName} selected`);

            // Wait for map to update
            await page.waitForTimeout(2000);
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
            await page.waitForTimeout(1000);

            return true;

        } catch (error) {
            console.log(`    Attempt ${attempt} failed: ${error.message}`);

            // Close any open dropdowns before retry
            try {
                await page.keyboard.press('Escape');
                await page.waitForTimeout(500);
            } catch (e) { }

            if (attempt === 3) {
                console.error(`    ✗ Failed to select ${viewName} after 3 attempts`);
                return false;
            }
        }
    }

    return false;
}

async function takeScreenshot(page, viewType, sanitizedAddress, timestamp) {
    console.log(`  Taking ${viewType} screenshot...`);
    try {
        // Wait for network to be idle
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
            console.log('    - Network not idle, proceeding anyway...');
        });

        await page.waitForTimeout(2000);

        // Try multiple selectors
        const selectors = [
            '.v-splitpanel-second-container.v-scrollable',
            '.v-splitpanel-second-container',
            '.leaflet-container',
            '.v-ui'
        ];

        let contentArea = null;
        for (const selector of selectors) {
            const element = page.locator(selector).first();
            if (await element.count() > 0) {
                contentArea = element;
                console.log(`    ✓ Using selector: ${selector}`);
                break;
            }
        }

        if (!contentArea) {
            throw new Error('No suitable screenshot element found');
        }

        await contentArea.waitFor({ state: 'visible', timeout: 10000 });
        const buffer = await contentArea.screenshot({
            type: 'png',
            timeout: 30000
        });

        const sizeKB = (buffer.length / 1024).toFixed(2);
        console.log(`    ✓ Screenshot captured: ${sizeKB} KB`);

        return {
            filename: `ookla_${viewType}_${sanitizedAddress}_${timestamp}.png`,
            buffer: buffer.toString('base64'),
            size: sizeKB
        };

    } catch (error) {
        console.log(`    Error with primary method: ${error.message}`);
        console.log('    Trying full-page fallback...');

        try {
            const buffer = await page.screenshot({
                type: 'png',
                clip: { x: 0, y: 50, width: 1280, height: 670 },
                timeout: 30000
            });

            const sizeKB = (buffer.length / 1024).toFixed(2);
            console.log(`    ✓ Fallback screenshot: ${sizeKB} KB`);

            return {
                filename: `ookla_${viewType}_fullpage_${sanitizedAddress}_${timestamp}.png`,
                buffer: buffer.toString('base64'),
                size: sizeKB
            };
        } catch (fallbackError) {
            console.error(`    ✗ Fallback failed: ${fallbackError.message}`);
            throw fallbackError;
        }
    }
}

// ============== OOKLA AUTOMATION ==============

app.post('/api/automate', async (req, res) => {
    let browser;
    const startTime = Date.now();

    try {
        const { address, carriers, coverageTypes } = req.body;

        if (!address) {
            return res.status(400).json({ success: false, error: 'Address is required' });
        }

        console.log('='.repeat(60));
        console.log('Starting Ookla automation');
        console.log('Address:', address);
        console.log('Carriers:', carriers);
        console.log('Coverage types:', coverageTypes);
        console.log('='.repeat(60));

        browser = await chromium.launch({
            headless: true,
            slowMo: 50,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
        });

        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
            ignoreHTTPSErrors: true,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale: 'en-US',
            timezoneId: 'America/New_York',
            geolocation: { longitude: -73.935242, latitude: 40.730610 },
            permissions: ['geolocation'],
        });

        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            window.chrome = { runtime: {} };
        });

        const page = await context.newPage();

        // Step 1: Login
        console.log('Step 1: Navigating to login page...');
        await page.goto('https://cellanalytics.ookla.com/login', {
            waitUntil: 'domcontentloaded',
            timeout: 45000,
        });

        await page.waitForSelector('input[name="username"]', { timeout: 10000 });
        await humanWait(page, 800);

        console.log('Step 2: Filling credentials...');
        const usernameInput = page.locator('input[name="username"]');
        const passwordInput = page.locator('input[name="password"]');

        await humanClick(page, usernameInput);
        await shortWait(page);
        await humanTypeLocator(usernameInput, 'zjanparian', page);
        await humanWait(page, 500);

        await humanClick(page, passwordInput);
        await shortWait(page);
        await humanTypeLocator(passwordInput, 'Boingo2025!', page);
        await humanWait(page, 600);

        console.log('Step 3: Submitting login...');
        const submitButton = page.locator('input[type="submit"], button[type="submit"]');
        await humanClick(page, submitButton);

        try {
            await page.waitForURL('**/cellanalytics.ookla.com/**', { timeout: 30000 });
            console.log('  ✓ Redirected to dashboard');
        } catch (error) {
            console.log('  Navigation wait timeout, checking URL...');
        }

        await longWait(page);

        const currentUrl = page.url();
        if (currentUrl.includes('/login')) {
            await browser.close();
            return res.status(401).json({ success: false, error: 'Login failed' });
        }

        console.log('  ✓ Login successful!');

        // Step 4: Day View
        console.log('Step 4: Changing to Day view...');
        try {
            const layersToggle = page.locator('a.leaflet-control-layers-toggle[title="Layers"]');
            await layersToggle.waitFor({ state: 'attached', timeout: 8000 });
            await layersToggle.hover();
            const dayRadioInput = page.locator('input[type="radio"].leaflet-control-layers-selector[name="leaflet-base-layers"]').nth(3);
            await dayRadioInput.click({ force: true, timeout: 2000 });
            console.log('  ✓ Day view selected');
            await page.mouse.move(100, 100);
        } catch (error) {
            console.log('  Day view switch error, trying alternatives...');
            try {
                await page.evaluate(() => {
                    const radios = document.querySelectorAll('input[type="radio"].leaflet-control-layers-selector');
                    if (radios[3]) radios[3].click();
                });
                console.log('  ✓ Day view selected (via evaluate)');
            } catch (e) {
                console.log('  Note: Could not change to Day view');
            }
        }

        // Step 5: Address
        console.log('Step 5: Entering address:', address);
        const addressInput = page.locator('input[type="text"]').first();
        await addressInput.waitFor({ timeout: 10000 });
        await humanClick(page, addressInput);
        await shortWait(page);
        await addressInput.press('Control+A');
        await page.waitForTimeout(randomDelay(150, 300));
        await humanTypeLocator(addressInput, address, page);
        console.log('  ✓ Address entered');
        await mediumWait(page);
        await addressInput.press('Enter');
        console.log('  ✓ Enter pressed');
        await longWait(page);
        await longWait(page);

        // Step 6: Network Provider
        console.log('Step 6: Opening Network Provider...');
        const networkProviderToggle = page.locator('text=Network Provider').locator('..').locator('span').first();
        await networkProviderToggle.waitFor({ timeout: 30000 });
        await networkProviderToggle.click({ force: true });
        console.log('  ✓ Network Provider section opened');
        await longWait(page);

        // Step 7: Carriers
        const carriersToSelect = carriers || [];
        const allCarriers = { 'AT&T': 'AT&T US', 'Verizon': 'Verizon', 'T-Mobile': 'T-Mobile US' };

        console.log('Step 7: Configuring carriers...');
        for (const [userName, siteName] of Object.entries(allCarriers)) {
            try {
                const carrierLabel = page.locator(`label:has-text("${siteName}")`).first();
                await carrierLabel.waitFor({ state: 'visible', timeout: 5000 });
                const carrierLabelFor = await carrierLabel.getAttribute('for');
                const carrierCheckbox = page.locator(`#${carrierLabelFor}`);
                const isChecked = await carrierCheckbox.isChecked();
                const shouldBeChecked = carriersToSelect.includes(userName);

                if (isChecked !== shouldBeChecked) {
                    await carrierLabel.click();
                    console.log(`  ${shouldBeChecked ? '✓ Checked' : '✗ Unchecked'} ${siteName}`);
                    await shortWait(page);
                }
            } catch (error) {
                console.log(`  Warning: Could not configure ${userName}`);
            }
        }
        await mediumWait(page);

        // Step 8: LTE
        console.log('Step 8: Opening LTE options...');
        const lteToggle = page.locator('text=LTE').locator('..').locator('span').first();
        await lteToggle.waitFor({ timeout: 30000 });
        await lteToggle.click({ force: true });
        console.log('  ✓ LTE section opened');
        await longWait(page);

        // Step 9: RSRP
        console.log('Step 9: Selecting RSRP...');
        try {
            const rsrpRow = page.locator('tr').filter({ has: page.locator('span.v-captiontext:has-text("RSRP")') });
            const rsrpCheckbox = rsrpRow.locator('input[type="checkbox"]').first();
            await rsrpCheckbox.waitFor({ state: 'attached', timeout: 15000 });
            if (!(await rsrpCheckbox.isChecked())) {
                await rsrpCheckbox.check({ force: true });
                console.log('  ✓ RSRP checkbox selected');
            }
            await mediumWait(page);

            const lteRows = page.locator('tr').filter({ has: page.locator('span.v-captiontext:text-matches("RSRQ|SNR|CQI", "i")') });
            const rowCount = await lteRows.count();
            for (let i = 0; i < rowCount; i++) {
                const row = lteRows.nth(i);
                const checkbox = row.locator('input[type="checkbox"]').first();
                try {
                    if (await checkbox.isChecked()) {
                        await checkbox.uncheck({ force: true });
                        await shortWait(page);
                    }
                } catch (e) { }
            }
        } catch (error) {
            console.log('  Error with RSRP selection:', error.message);
        }
        await mediumWait(page);

        // ============== SCREENSHOTS ==============

        const hasIndoor = coverageTypes?.includes('Indoor');
        const hasOutdoor = coverageTypes?.includes('Outdoor');
        const hasIndoorAndOutdoor = coverageTypes?.includes('Indoor & Outdoor');

        const screenshots = [];
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitizedAddress = address.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);

        // Zoom and collapse (do once)
        if (hasIndoor || hasOutdoor || hasIndoorAndOutdoor) {
            console.log('Step 10: Zooming in...');
            try {
                const zoomButton = page.locator('div.v-button.v-widget span.v-icon.FontAwesome').first();
                await zoomButton.waitFor({ state: 'visible', timeout: 10000 });
                await zoomButton.click({ force: true });
                await page.waitForTimeout(800);
                await zoomButton.click({ force: true });
                await page.waitForTimeout(800);
                console.log('  ✓ Zoomed in 2x');
            } catch (e) {
                console.log('  Warning: Could not zoom');
            }

            console.log('Step 11: Collapsing sidebar...');
            try {
                const collapseButton = page.locator('div.v-absolutelayout-wrapper-expand-component div.v-button.v-widget').first();
                await collapseButton.waitFor({ state: 'visible', timeout: 10000 });
                await collapseButton.click({ force: true });
                await page.waitForTimeout(800);
                console.log('  ✓ Sidebar collapsed');
            } catch (e) {
                console.log('  Warning: Could not collapse sidebar');
            }
        }

        // Indoor View
        if (hasIndoor) {
            console.log('Step 12: Indoor View...');
            if (await selectView(page, 'Indoor View')) {
                const screenshot = await takeScreenshot(page, 'INDOOR', sanitizedAddress, timestamp);
                screenshots.push(screenshot);
            } else {
                console.log('  ⚠ Skipping Indoor screenshot - view selection failed');
            }
        }

        // Outdoor View
        if (hasOutdoor) {
            console.log('Step 13: Outdoor View...');

            // Debug: Log available options
            try {
                const dropdown = page.locator('div.v-filterselect').first();
                await dropdown.locator('div.v-filterselect-button').click({ force: true });
                await page.waitForTimeout(1000);
                const spans = await page.locator('#VAADIN_COMBOBOX_OPTIONLIST span').allTextContents();
                console.log('  Available view options:', spans);
                await page.keyboard.press('Escape');
                await page.waitForTimeout(500);
            } catch (e) {
                console.log('  Could not list options:', e.message);
            }

            if (await selectView(page, 'Outdoor View')) {
                const screenshot = await takeScreenshot(page, 'OUTDOOR', sanitizedAddress, timestamp);
                screenshots.push(screenshot);
            } else {
                console.log('  ⚠ Skipping Outdoor screenshot - view selection failed');
            }
        }

        // Indoor & Outdoor View
        if (hasIndoorAndOutdoor) {
            console.log('Step 14: Outdoor & Indoor View...');

            // Try multiple possible names
            const possibleNames = [
                'Outdoor & Indoor',
            ];

            let success = false;
            for (const viewName of possibleNames) {
                if (await selectView(page, viewName)) {
                    success = true;
                    break;
                }
            }

            if (success) {
                const screenshot = await takeScreenshot(page, 'OUTDOOR_INDOOR', sanitizedAddress, timestamp);
                screenshots.push(screenshot);
            } else {
                console.log('  ⚠ Skipping Indoor & Outdoor screenshot - view selection failed');
            }
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log('='.repeat(60));
        console.log(`✓ All steps complete! (${duration}s)`);
        console.log(`Screenshots captured: ${screenshots.length}`);
        console.log(`Total response size: ~${(JSON.stringify(screenshots).length / 1024).toFixed(2)} KB`);
        console.log('='.repeat(60));

        await browser.close();

        return res.json({
            success: true,
            screenshots,
            duration: parseFloat(duration),
            count: screenshots.length
        });

    } catch (error) {
        console.error('Automation error:', error);
        if (browser) await browser.close();
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ============== START SERVER ==============

app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('🚀 Boingo Playwright Automation Backend');
    console.log('='.repeat(60));
    console.log(`   Port: ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   API: POST http://localhost:${PORT}/api/automate`);
    console.log(`   Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
    console.log('='.repeat(60));
});